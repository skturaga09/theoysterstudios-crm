import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { MongoServerError, ObjectId, type Db, type Filter, type MongoClient, type UpdateFilter } from "mongodb";
import { z, ZodError, type ZodType } from "zod";
import {
  AddMemberSchema,
  CreateCompanySchema,
  CreateContactSchema,
  CreateDealSchema,
  CreateActivitySchema,
  CreateInvoiceSchema,
  CreateTaskSchema,
  CreditNoteSchema,
  UpdateDraftInvoiceSchema,
  ImportContactRowSchema,
  ImportRequestSchema,
  RecordPaymentSchema,
  RoutingSchema,
  PipelinesSchema,
  UpdateCompanySchema,
  UpdateContactSchema,
  UpdateDealSchema,
  UpdateMemberSchema,
  NotificationPreferencesSchema,
  UpdateTaskSchema,
  IntegrationKeysSchema,
  UpdateConversationSchema,
  SetupProgressSchema,
  WorkspaceSchema,
  FinanceSettingsSchema,
  ScheduleSchema,
  ClientUpdateSchema,
  EnquirySchema,
  CreateQuoteSchema,
  UpdateQuoteSchema,
  CreateExpenseSchema,
  UpdateExpenseSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  TaskCommentSchema,
  TemplatesSchema,
  type Workspace,
} from "@pinnacle/shared/schemas";
import { addDays, planProject, routeLead, type RoutingRule, DEFAULT_FINANCE, DEFAULT_NOTIFICATION_PREFERENCES, DEFAULT_SAC, gstState, invoiceTotals as totalsOf, istDay, type FinanceSettings, accessOf, ROLE_LABEL, roleOf, type Area, DEFAULT_PIPELINES, DEFAULT_TEMPLATES, projectFromDeal, type Templates, formatFull, invoiceTotals, type Business, type InvoiceMath, type Pipelines, type NotificationPreferences } from "@pinnacle/shared";
import { nameFromEmail, SUPPORT_MEMBER, type Member, type Verify } from "./auth";
import type { Doc } from "./db";
import { notify, type Notification, type NotificationPreferencesDoc } from "./notifications";
import { createPaymentLink, handleRazorpayWebhook, validRazorpaySignature, type RazorpayKeys } from "./razorpay";
import { handleWhatsAppWebhook, sendReminder, sendText, type WhatsAppKeys } from "./whatsapp";
import { feedFor, toIcs } from "./calendar";
import { portalView, type PortalLink } from "./portal";
import { deletePhoto, fromDataUrl, savePhoto, type Photo } from "./photos";
import { createCreditNote, createInvoice, financialYear, nextNumber } from "./invoices";
import { createDriveFolder, shareWithDomain, exchangeGoogleCode, googleAccessToken, googleAuthorizeUrl, revokeGoogle, syncGoogle, type GoogleAccount } from "./google";
import { sendInstagram, authorizeUrl, exchangeCode, handleWebhook, newVerifyToken, subscribeMessages, validSignature, type Fetch, type InstagramIntegration, type SetupKeys } from "./instagram";

/** `_id` → `id`, matching the web app's types. */
const out = ({ _id, ...rest }: { _id: string } & object) => ({ id: _id, ...rest });
const conversationOut = ({ _id, externalId: _, lastInboundAt, ...rest }: Doc) => ({
  id: _id,
  ...rest,
  ...(rest.channel === "whatsapp" && lastInboundAt
    ? { windowExpiresAt: new Date(+new Date(String(lastInboundAt)) + 24 * 3_600_000).toISOString() }
    : {}),
});

/**
 * SHA-256 of what a client signs: the quotation's number, parties, items, plan, terms and validity, in a fixed
 * order. The same quotation always gives the same fingerprint; any change gives a different one.
 */
export const quoteFingerprint = (q: Doc) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        q.number, q.companyId, q.business, q.validUntil, q.supply,
        ((q.lines as { desc: string; sac: string; qty: number; ratePaise: number }[]) ?? []).map((l) => [l.desc, l.sac, l.qty, l.ratePaise]),
        ((q.schedule as { label: string; amountPaise: number; dueDate?: string }[]) ?? []).map((m) => [m.label, m.amountPaise, m.dueDate ?? ""]),
        q.terms ?? "",
      ]),
    )
    .digest("hex");

const ListQuery = z.object({
  // shortcut: the web app loads whole collections at sign-in; add paging past a few thousand records.
  limit: z.coerce.number().int().min(1).max(5000).default(5000),
  stage: z.string().optional(),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
  projectId: z.string().optional(),
});

declare module "fastify" {
  interface FastifyRequest {
    member: Member;
  }
}

export function buildApp({
  db,
  client,
  verify,
  supportEmails = [],
  preParsedBody = false,
  fetch: f = globalThis.fetch,
}: {
  db: Db;
  client: MongoClient;
  verify: Verify;
  supportEmails?: string[];
  /** Cloud Functions has already read and parsed the JSON body (into `req.body`) before Fastify sees the request. */
  preParsedBody?: boolean;
  /** For calls to Instagram; tests pass a stand-in. */
  fetch?: Fetch;
}): FastifyInstance {
  const support = new Set(supportEmails.map((e) => e.trim().toLowerCase()));
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    // The web app calls /api/* (Vite proxy locally, Hosting rewrite in prod); routes live at the root.
    rewriteUrl: (req) => req.url!.replace(/^\/api(?=\/|\?|$)/, "") || "/",
  });
  const members = db.collection<Member>("members");
  // Webhook signatures are checked over the exact bytes received, so keep the raw body next to the parsed one.
  app.removeContentTypeParser("application/json");
  if (preParsedBody) {
    // Cloud Functions has parsed the body already and keeps the bytes as `rawBody`.
    app.addContentTypeParser("application/json", (req, _payload, done) => done(null, (req.raw as { body?: unknown }).body));
  } else {
    app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
      (req.raw as { rawBody?: string }).rawBody = body as string;
      try {
        done(null, body === "" ? undefined : JSON.parse(body as string));
      } catch (e) {
        done(Object.assign(e as Error, { statusCode: 400 }), undefined);
      }
    });
  }
  /** Called by Meta or by a browser coming back from Instagram sign-in — no CRM login; each checks its own proof. */
  const PUBLIC = new Set(["/healthz", "/public/enquiry", "/public/enquiry-info", "/integrations/razorpay/webhook", "/integrations/whatsapp/webhook", "/integrations/instagram/webhook", "/integrations/instagram/callback", "/integrations/google/callback", "/public/privacy-info"]);

  /**
   * Every route except /healthz needs a Google sign-in (Firebase ID token) whose verified email is on
   * the team list. Checked per request, so removing someone cuts access immediately.
   */
  app.addHook("onRequest", async (req, reply) => {
    if (PUBLIC.has(req.url.split("?")[0]!) || req.url.startsWith("/public/photos/") || req.url.startsWith("/public/calendar/") || req.url.startsWith("/public/portal/") || req.url.startsWith("/public/sign/")) return;
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    const claims = token ? await verify(token).catch(() => undefined) : undefined;
    if (!claims?.email || !claims.email_verified) return reply.code(401).send({ error: "Sign in with Google" });
    if (support.has(claims.email.toLowerCase())) {
      req.member = SUPPORT_MEMBER;
      return;
    }
    const member = await members.findOne({ email: claims.email.toLowerCase(), status: { $ne: "removed" } });
    if (!member) return reply.code(403).send({ error: "not_on_team", email: claims.email });
    if (roleOf(member.role) !== member.role) {
      // Renames the old Manager / Member roles (both become Sales) the first time that person is seen.
      member.role = roleOf(member.role);
      await members.updateOne({ _id: member._id }, { $set: { role: member.role } });
    }
    req.member = member;
    if (req.url === "/me") {
      // First sign-in activates the invite and fills name/photo from Google.
      const $set: Partial<Member> = { status: "active", lastSignInAt: new Date().toISOString() };
      if (claims.picture) $set.photoURL = claims.picture;
      if (claims.name && member.name === nameFromEmail(member.email)) $set.name = claims.name;
      req.member = (await members.findOneAndUpdate({ _id: member._id }, { $set }, { returnDocument: "after" }))!;
    }
  });
  const adminOnly = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.member.role !== "admin") return reply.code(403).send({ error: "Admins only" });
  };
  /*
   * Roles (the shared ACCESS table, explained in Settings → Team & access). Each area — sales (leads, Inbox,
   * clients, activity), projects (and their tasks), finance (invoices) — is edit, own, view or none per role.
   * Sales "own": change only records you own, never hand them to someone else, and with "Sales sees everyone's
   * leads" off, see only your own deals. Crew "own": only the projects you're on and the tasks given to you.
   * Lists a role can't see come back empty, so the app loads the same way for everyone.
   */
  const access = (req: FastifyRequest, area: Area) => accessOf(req.member.role, area);
  const AREA_NAME: Record<Area, string> = { sales: "leads and clients", projects: "projects", finance: "invoices" };
  const denied = (req: FastifyRequest, area: Area) => `${ROLE_LABEL[roleOf(req.member.role)]} can't change ${AREA_NAME[area]}`;
  /** preHandler: the role must be able to change this area (fully, or — with `own` — their own part of it). */
  const mayChange = (area: Area, own = true) => async (req: FastifyRequest, reply: FastifyReply) => {
    const a = access(req, area);
    if (a !== "edit" && !(own && a === "own")) return reply.code(403).send({ error: denied(req, area) });
  };
  const NOTHING: Filter<Doc> = { _id: { $in: [] as string[] } };
  /** For Sales who can't see others' deals: the ids of the deals they own. Otherwise undefined (no limit). */
  const ownDealIds = async (req: FastifyRequest): Promise<string[] | undefined> => {
    if (access(req, "sales") !== "own" || (await getWorkspace()).membersSeeAllDeals) return undefined;
    return (await db.collection<Doc>("deals").find({ ownerId: req.member._id }, { projection: { _id: 1 } }).toArray()).map((d) => d._id);
  };
  /** Crew: the projects they're on — as manager, in the crew, or with a task of theirs. Otherwise undefined. */
  const crewProjects = async (req: FastifyRequest) => {
    if (access(req, "projects") !== "own") return undefined;
    const me = req.member._id;
    const viaTasks = (await db.collection<Doc>("tasks").find({ assigneeId: me, projectId: { $exists: true } }, { projection: { projectId: 1 } }).toArray()).map((t) => String(t.projectId));
    return db.collection<Doc>("projects").find({ $or: [{ managerId: me }, { "crew.memberId": me }, { _id: { $in: viaTasks } }] }, { projection: { companyId: 1 } }).toArray();
  };
  const isLastAdmin = async (m: Member) => m.role === "admin" && (await members.countDocuments({ role: "admin", status: { $ne: "removed" } })) <= 1;

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: "Invalid input", issues: err.issues });
    if (err instanceof MongoServerError && err.code === 11000) return reply.code(409).send({ error: "Already exists", key: err.keyValue });
    app.log.error(err);
    return reply.code(500).send({ error: "Internal error" });
  });

  app.get("/healthz", async () => ({ ok: true, service: "api", tz: "Asia/Kolkata" }));

  /* ---------- Workspace (one document) ---------- */
  const workspaceCol = db.collection<{ _id: string } & Workspace>("workspace");
  const getWorkspace = async (): Promise<Workspace> => {
    const doc = await workspaceCol.findOne({ _id: "studio" });
    if (!doc) return WorkspaceSchema.parse({ studioName: "The Oyster Studios" });
    const { _id, ...w } = doc;
    return WorkspaceSchema.parse(w); // fills settings added after the document was saved
  };
  app.get("/workspace", getWorkspace);
  app.put("/workspace", { preHandler: adminOnly }, async (req) => {
    const w = WorkspaceSchema.parse(req.body);
    await workspaceCol.replaceOne({ _id: "studio" }, w, { upsert: true });
    return w;
  });

  /* ---------- Integration setup: checklist progress + the keys the client pastes in ---------- */
  const setupCol = db.collection<{ _id: string; done?: string[] } & Record<string, unknown>>("setup");
  app.get("/setup/progress", { preHandler: adminOnly }, async () => ({ done: (await setupCol.findOne({ _id: "progress" }))?.done ?? [] }));
  app.put("/setup/progress", { preHandler: adminOnly }, async (req) => {
    const { done } = SetupProgressSchema.parse(req.body);
    await setupCol.replaceOne({ _id: "progress" }, { done: [...new Set(done)] }, { upsert: true });
    return { done: [...new Set(done)] };
  });
  /** IDs come back so the page can show them; secrets never leave the server — only whether one is saved. */
  const keysView = (k: Record<string, unknown> | null) => ({
    googleClientId: String(k?.googleClientId ?? ""),
    googleClientSecretSaved: !!k?.googleClientSecret,
    instagramAppId: String(k?.instagramAppId ?? ""),
    instagramAppSecretSaved: !!k?.instagramAppSecret,
    metaAppSecretSaved: !!k?.metaAppSecret,
    // Not a secret from admins: they paste it into Meta so Meta can prove it's talking to this CRM.
    webhookVerifyToken: String(k?.webhookVerifyToken ?? ""),
    razorpayKeyId: String(k?.razorpayKeyId ?? ""),
    razorpayKeySecretSaved: !!k?.razorpayKeySecret,
    razorpayWebhookSecretSaved: !!k?.razorpayWebhookSecret,
    whatsappPhoneNumberId: String(k?.whatsappPhoneNumberId ?? ""),
    whatsappTokenSaved: !!k?.whatsappToken,
    whatsappReminderTemplate: String(k?.whatsappReminderTemplate ?? ""),
    whatsappTemplateLanguage: String(k?.whatsappTemplateLanguage ?? ""),
  });
  const getKeys = async () => ((await setupCol.findOne({ _id: "keys" })) ?? {}) as SetupKeys & RazorpayKeys & WhatsAppKeys;
  app.get("/setup/keys", { preHandler: adminOnly }, async () => {
    if (!(await getKeys()).webhookVerifyToken) await setupCol.updateOne({ _id: "keys" }, { $set: { webhookVerifyToken: newVerifyToken() } }, { upsert: true });
    return keysView(await setupCol.findOne({ _id: "keys" }));
  });
  app.put("/setup/keys", { preHandler: adminOnly }, async (req) => {
    // Only the fields typed in change; a blank field keeps what's saved.
    const changes = Object.fromEntries(Object.entries(IntegrationKeysSchema.parse(req.body)).filter(([, v]) => v !== ""));
    if (Object.keys(changes).length) await setupCol.updateOne({ _id: "keys" }, { $set: { ...changes, updatedAt: now(), updatedBy: req.member._id } }, { upsert: true });
    return keysView(await setupCol.findOne({ _id: "keys" }));
  });

  /* ---------- Instagram (the client's own Meta app) ---------- */
  const integrations = db.collection<InstagramIntegration>("integrations");
  const origin = z.string().regex(/^(https:\/\/[a-z0-9.-]+|http:\/\/localhost:\d+)$/i, "Unexpected site address");

  const googleAccounts = db.collection<GoogleAccount>("googleAccounts");
  /** Status of each channel, for the Integrations page and the sidebar. Never includes tokens. */
  app.get("/integrations", async () => {
    const ig = await integrations.findOne({ _id: "instagram" });
    const keys = await getKeys();
    const accounts = await googleAccounts.find({}, { projection: { email: 1, connectedBy: 1, connectedAt: 1, lastSyncAt: 1, error: 1 } }).sort({ email: 1 }).toArray();
    return {
      instagram: ig ? { connected: true, username: ig.username, lastEventAt: ig.lastEventAt, tokenExpiresAt: ig.tokenExpiresAt, connectedAt: ig.connectedAt } : { connected: false },
      razorpay: { ready: !!keys.razorpayKeyId && !!keys.razorpayKeySecret, webhook: !!keys.razorpayWebhookSecret },
      whatsapp: { connected: !!keys.whatsappPhoneNumberId && !!keys.whatsappToken, lastEventAt: (await db.collection<Doc>("integrations").findOne({ _id: "whatsapp" }))?.lastEventAt as string | undefined },
      google: { ready: !!(keys as { googleClientId?: string }).googleClientId && !!(keys as { googleClientSecret?: string }).googleClientSecret, accounts: accounts.map(({ _id: _, ...a }) => a) },
    };
  });

  /* ---------- Google (Gmail + Calendar), the client's own Google Cloud project ---------- */
  /** Anyone on the team connects their own Google account; whoever signs in to enquiry@ connects that one. */
  app.post("/integrations/google/start", async (req, reply) => {
    const site = origin.parse((req.body as { origin?: unknown } | undefined)?.origin);
    const keys = (await getKeys()) as { googleClientId?: string; googleClientSecret?: string };
    if (!keys.googleClientId || !keys.googleClientSecret) return reply.code(409).send({ error: "An admin needs to finish the Google setup first" });
    const state = newVerifyToken();
    await setupCol.insertOne({ _id: `goauth:${state}`, site, memberId: req.member._id, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });
    return { url: googleAuthorizeUrl(keys.googleClientId, `${site}/api/integrations/google/callback`, state) };
  });
  app.get("/integrations/google/callback", async (req, reply) => {
    const q = z.object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() }).parse(req.query);
    const pending = q.state ? await setupCol.findOneAndDelete({ _id: `goauth:${q.state}` }) : null;
    if (!pending || String(pending.expiresAt) < now()) return reply.code(400).type("text/plain").send("This sign-in link has expired. Go back to the CRM and click Connect again.");
    const back = (status: string, detail?: string) => reply.redirect(`${pending.site}/settings/integrations?google=${encodeURIComponent(status)}${detail ? `&detail=${encodeURIComponent(detail)}` : ""}`);
    if (!q.code) return back(q.error === "access_denied" ? "cancelled" : "error");
    try {
      const keys = (await getKeys()) as { googleClientId: string; googleClientSecret: string };
      const got = await exchangeGoogleCode(f, keys, `${pending.site}/api/integrations/google/callback`, q.code);
      await googleAccounts.replaceOne(
        { _id: got.email },
        { email: got.email, refreshToken: got.refreshToken, accessToken: got.accessToken, accessTokenExpiresAt: got.accessTokenExpiresAt, historyId: got.historyId, connectedBy: String(pending.memberId), connectedAt: now() },
        { upsert: true },
      );
      return back("connected", got.email);
    } catch (e) {
      app.log.error(e);
      return back("error", (e as Error).message.slice(0, 160));
    }
  });
  /** Admins can disconnect any account; anyone can disconnect one they connected. Also withdraws Google access. */
  app.delete<{ Params: { email: string } }>("/integrations/google/:email", async (req, reply) => {
    const acct = await googleAccounts.findOne({ _id: req.params.email.toLowerCase() });
    if (!acct) return reply.code(404).send({ error: "Not connected" });
    if (req.member.role !== "admin" && acct.connectedBy !== req.member._id) return reply.code(403).send({ error: "Only an admin or the person who connected it can disconnect it" });
    await revokeGoogle(f, acct.refreshToken);
    await googleAccounts.deleteOne({ _id: acct._id });
    return reply.code(204).send();
  });
  /** Admins: check every connected account now instead of waiting for the next minute. */
  app.post("/integrations/google/sync", { preHandler: adminOnly }, async () => syncGoogle(db, f));
  app.post("/integrations/instagram/start", { preHandler: adminOnly }, async (req, reply) => {
    const site = origin.parse((req.body as { origin?: unknown } | undefined)?.origin);
    const keys = await getKeys();
    if (!keys.instagramAppId || !keys.instagramAppSecret) return reply.code(409).send({ error: "Save the Instagram App ID and secret first" });
    const state = newVerifyToken();
    await setupCol.insertOne({ _id: `oauth:${state}`, site, memberId: req.member._id, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });
    return { url: authorizeUrl(keys.instagramAppId, `${site}/api/integrations/instagram/callback`, state) };
  });
  /** Instagram sends the browser back here after sign-in. The one-time `state` proves the visit started in the CRM. */
  app.get("/integrations/instagram/callback", async (req, reply) => {
    const q = z.object({ code: z.string().optional(), state: z.string().optional(), error_description: z.string().optional() }).parse(req.query);
    const pending = q.state ? await setupCol.findOneAndDelete({ _id: `oauth:${q.state}` }) : null;
    if (!pending || String(pending.expiresAt) < now()) return reply.code(400).type("text/plain").send("This sign-in link has expired. Go back to the CRM and click Connect Instagram again.");
    const back = (status: string) => reply.redirect(`${pending.site}/settings/integrations?setup=meta&instagram=${encodeURIComponent(status)}`);
    if (!q.code) return back(q.error_description ? "cancelled" : "error");
    try {
      const keys = await getKeys();
      const got = await exchangeCode(f, { instagramAppId: keys.instagramAppId!, instagramAppSecret: keys.instagramAppSecret! }, `${pending.site}/api/integrations/instagram/callback`, q.code);
      await subscribeMessages(f, got.token);
      const at = now();
      await integrations.replaceOne(
        { _id: "instagram" },
        { igUserId: got.igUserId, username: got.username, accessToken: got.token, tokenIssuedAt: at, tokenExpiresAt: new Date(Date.now() + got.expiresIn * 1000).toISOString(), connectedAt: at, connectedBy: String(pending.memberId) },
        { upsert: true },
      );
      return back("connected");
    } catch (e) {
      app.log.error(e);
      return back("error");
    }
  });
  app.post("/integrations/instagram/disconnect", { preHandler: adminOnly }, async () => {
    await integrations.deleteOne({ _id: "instagram" });
    return { connected: false };
  });
  /** Meta checks the address once ("subscribe" + our verify token) and then posts each new message, signed. */
  app.get("/integrations/instagram/webhook", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const token = (await getKeys()).webhookVerifyToken;
    if (q["hub.mode"] === "subscribe" && token && q["hub.verify_token"] === token) return reply.type("text/plain").send(q["hub.challenge"] ?? "");
    return reply.code(403).send({ error: "Verify token doesn't match" });
  });
  app.post("/integrations/instagram/webhook", async (req, reply) => {
    const keys = await getKeys();
    const raw = (req.raw as { rawBody?: string | Buffer }).rawBody;
    if (!validSignature(raw, req.headers["x-hub-signature-256"] as string | undefined, [keys.metaAppSecret, keys.instagramAppSecret])) return reply.code(401).send({ error: "Bad signature" });
    return handleWebhook(db, f, req.body as Parameters<typeof handleWebhook>[2]);
  });
  /* ---------- WhatsApp Cloud API (the studio's own Meta app and number) ---------- */
  app.get("/integrations/whatsapp/webhook", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const token = (await getKeys()).webhookVerifyToken;
    if (q["hub.mode"] === "subscribe" && token && q["hub.verify_token"] === token) return reply.type("text/plain").send(q["hub.challenge"] ?? "");
    return reply.code(403).send({ error: "Verify token doesn't match" });
  });
  app.post("/integrations/whatsapp/webhook", async (req, reply) => {
    const keys = await getKeys();
    const raw = (req.raw as { rawBody?: string | Buffer }).rawBody;
    if (!validSignature(raw, req.headers["x-hub-signature-256"] as string | undefined, [keys.metaAppSecret])) return reply.code(401).send({ error: "Bad signature" });
    return handleWhatsAppWebhook(db, keys, req.body as Parameters<typeof handleWhatsAppWebhook>[2]);
  });

  /* ---------- Razorpay (the studio's own account): paid links record themselves ---------- */
  app.post("/integrations/razorpay/webhook", async (req, reply) => {
    const keys = await getKeys();
    const raw = (req.raw as { rawBody?: string | Buffer }).rawBody;
    if (!validRazorpaySignature(raw, req.headers["x-razorpay-signature"] as string | undefined, keys.razorpayWebhookSecret)) return reply.code(401).send({ error: "Bad signature" });
    return handleRazorpayWebhook(db, req.body as Parameters<typeof handleRazorpayWebhook>[1]);
  });

  /* ---------- Website enquiries: a public form that drops straight into Inbox as a routed lead ---------- */
  const enquiryHits = new Map<string, number[]>(); // shortcut: per-instance rate limit; enough for a studio's site
  app.get("/public/enquiry-info", async () => {
    const w = await getWorkspace();
    return { studioName: w.studioName, email: w.enquiryEmail || undefined, whatsapp: w.whatsappNumber || undefined };
  });
  app.post("/public/enquiry", async (req, reply) => {
    const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]!.trim() || req.ip;
    const recent = (enquiryHits.get(ip) ?? []).filter((t) => Date.now() - t < 600_000);
    if (recent.length >= 5) return reply.code(429).send({ error: "Too many enquiries from here — please try again in a few minutes" });
    enquiryHits.set(ip, [...recent, Date.now()]);
    const e = EnquirySchema.parse(req.body);
    if (e.website) return { ok: true }; // honeypot filled: a bot — say thanks, store nothing
    const at = now();
    const details = [e.service && `Service: ${e.service}`, e.budget && `Budget: ${e.budget}`, e.eventDate && `Event date: ${e.eventDate}`, e.location && `Location: ${e.location}`, e.phone && `Phone: ${e.phone}`, e.email && `Email: ${e.email}`].filter(Boolean).join(" · ");
    const message = { id: new ObjectId().toHexString(), direction: "in", body: `Website form · ${details}\n\n${e.message}`, at };
    const key = e.email ?? e.phone!.replace(/\D/g, "");
    const conversations = db.collection<Doc>("conversations");
    const existing = await conversations.findOne({ channel: "web", externalId: key });
    if (existing) {
      await conversations.updateOne({ _id: existing._id }, { $push: { messages: message } as never, $set: { lastMessageAt: at, unread: true } });
    } else {
      const rules = (await db.collection<{ _id: string; rules: RoutingRule[] }>("routing").findOne({ _id: "rules" }))?.rules ?? [];
      const active = new Set((await members.find({ status: { $ne: "removed" } }, { projection: { _id: 1 } }).toArray()).map((x) => x._id));
      const contact = e.email ? await db.collection<Doc>("contacts").findOne({ email: e.email }) : null;
      await conversations.insertOne({
        _id: new ObjectId().toHexString(),
        channel: "web",
        externalId: key,
        name: e.name,
        handle: e.email ?? e.phone!,
        city: e.location ?? "",
        unread: true,
        lastMessageAt: at,
        createdAt: at,
        ...(e.business && { business: e.business }),
        ...(contact && { contactId: contact._id }),
        assigneeId: routeLead(rules, { channel: "web", city: e.location }, (id) => active.has(id)),
        messages: [message],
      });
    }
    return reply.code(201).send({ ok: true });
  });

  /** What the public privacy page needs: who the studio is and how to reach them. */
  app.get("/public/privacy-info", async () => {
    const w = await getWorkspace();
    return { studioName: w.studioName, legalName: w.legalName, address: w.address, contactEmail: w.enquiryEmail };
  });

  /* ---------- Inbox conversations (filled by the channel integrations) ---------- */
  const conversationsCol = db.collection<Doc>("conversations");
  app.get("/conversations", async (req) => {
    if (access(req, "sales") === "none") return [];
    // Sales limited to their own deals sees the conversations assigned to them.
    const mine = (await ownDealIds(req)) ? { assigneeId: req.member._id } : {};
    return (await conversationsCol.find(mine).sort({ lastMessageAt: -1 }).limit(2000).toArray()).map(conversationOut);
  });
  app.patch<{ Params: { id: string } }>("/conversations/:id", { preHandler: mayChange("sales") }, async (req, reply) => {
    const changes = UpdateConversationSchema.parse(req.body);
    // null clears a link (e.g. undoing "Create deal"); anything else is set.
    const update: UpdateFilter<Doc> = {};
    const set = Object.entries(changes).filter(([, v]) => v !== null && v !== undefined);
    const unset = Object.entries(changes).filter(([, v]) => v === null);
    if (set.length) update.$set = Object.fromEntries(set);
    if (unset.length) update.$unset = Object.fromEntries(unset.map(([k]) => [k, true as const]));
    const doc = await conversationsCol.findOneAndUpdate({ _id: req.params.id }, update, { returnDocument: "before" });
    if (!doc) return reply.code(404).send({ error: "Not found" });
    if (changes.assigneeId && changes.assigneeId !== doc.assigneeId)
      await notify(db, [changes.assigneeId], { kind: "lead", text: `${req.member.name} gave you the conversation with ${doc.name}`, link: `/inbox/${doc._id}` }, req.member._id);
    Object.assign(doc, changes);
    for (const [k, v] of Object.entries(changes)) if (v === null) delete (doc as Record<string, unknown>)[k];
    return conversationOut(doc);
  });

  /** Reply from the Inbox: goes out on WhatsApp or Instagram (within their 24-hour window) and joins the thread. */
  app.post<{ Params: { id: string } }>("/conversations/:id/reply", { preHandler: mayChange("sales") }, async (req, reply) => {
    const { body } = z.object({ body: z.string().trim().min(1, "Write a reply").max(4000) }).parse(req.body);
    const c = await conversationsCol.findOne({ _id: req.params.id });
    if (!c) return reply.code(404).send({ error: "Not found" });
    const keys = await getKeys();
    let id: string;
    try {
      if (c.channel === "whatsapp") {
        if (!keys.whatsappPhoneNumberId || !keys.whatsappToken) return reply.code(409).send({ error: "WhatsApp isn't connected yet — set it up in Settings → Integrations" });
        id = await sendText(f, keys, String(c.externalId), body);
      } else if (c.channel === "instagram") {
        const ig = await integrations.findOne({ _id: "instagram" });
        if (!ig) return reply.code(409).send({ error: "Instagram isn't connected" });
        id = await sendInstagram(f, ig.accessToken, String(c.externalId), body);
      } else return reply.code(409).send({ error: "Reply to emails and bookings from Gmail or Calendar" });
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
    const message = { id, direction: "out", body, at: now(), authorId: req.member._id };
    const saved = await conversationsCol.findOneAndUpdate({ _id: c._id }, { $push: { messages: message } as never, $set: { lastMessageAt: message.at, unread: false } }, { returnDocument: "after" });
    return conversationOut(saved!);
  });

  /* ---------- Lead routing (one ordered list of rules) ---------- */
  const routingCol = db.collection<{ _id: string } & z.infer<typeof RoutingSchema>>("routing");
  app.get("/routing", async () => ({ rules: (await routingCol.findOne({ _id: "rules" }))?.rules ?? [] }));
  app.put("/routing", { preHandler: adminOnly }, async (req, reply) => {
    const { rules } = RoutingSchema.parse(req.body);
    const owners = new Set((await members.find({ status: { $ne: "removed" } }, { projection: { _id: 1 } }).toArray()).map((m) => m._id));
    const bad = rules.findIndex((r) => !owners.has(r.ownerId));
    if (bad >= 0) return reply.code(422).send({ error: `Rule ${bad + 1} assigns leads to someone who isn't on the team` });
    await routingCol.replaceOne({ _id: "rules" }, { rules }, { upsert: true });
    return { rules };
  });

  /* ---------- Team & access ---------- */
  app.get("/me", async (req) => out(req.member));
  app.get("/members", async () => (await members.find({ status: { $ne: "removed" } }).sort({ name: 1 }).toArray()).map(out));
  app.post("/members", { preHandler: adminOnly }, async (req, reply) => {
    const { email, name, role } = AddMemberSchema.parse(req.body);
    const existing = await members.findOne({ email });
    if (existing && existing.status !== "removed") return reply.code(409).send({ error: `${email} already has access` });
    // Re-adding a removed person reuses their record (and id), so their old deals still point at them.
    const doc = await members.findOneAndUpdate(
      { email },
      { $set: { name: name || existing?.name || nameFromEmail(email), role, status: "invited", addedAt: new Date().toISOString() }, $setOnInsert: { _id: new ObjectId().toHexString(), email, title: "—" } },
      { upsert: true, returnDocument: "after" },
    );
    return reply.code(201).send(out(doc!));
  });
  app.patch<{ Params: { id: string } }>("/members/:id", { preHandler: adminOnly }, async (req, reply) => {
    const { role } = UpdateMemberSchema.parse(req.body);
    const m = await members.findOne({ _id: req.params.id, status: { $ne: "removed" } });
    if (!m) return reply.code(404).send({ error: "Not found" });
    if (role !== "admin" && (await isLastAdmin(m))) return reply.code(409).send({ error: "Add another admin first" });
    return out((await members.findOneAndUpdate({ _id: m._id }, { $set: { role } }, { returnDocument: "after" }))!);
  });
  app.delete<{ Params: { id: string } }>("/members/:id", { preHandler: adminOnly }, async (req, reply) => {
    const m = await members.findOne({ _id: req.params.id, status: { $ne: "removed" } });
    if (!m) return reply.code(404).send({ error: "Not found" });
    if (m._id === req.member._id) return reply.code(409).send({ error: "You can't remove yourself" });
    if (await isLastAdmin(m)) return reply.code(409).send({ error: "The last admin can't be removed" });
    await members.updateOne({ _id: m._id }, { $set: { status: "removed" } });
    return reply.code(204).send();
  });

  /**
   * List / get / create / patch / delete for a plain collection in one area. Who may change what follows the
   * role's access to that area; `owned` collections (deals, companies, contacts) let Sales change their own
   * records. `scope` narrows what someone sees (undefined = no limit); a role with no access sees nothing.
   * `write` replaces the change rule (tasks: people update the ones given to them).
   */
  function records(
    name: string,
    create: ZodType<Record<string, unknown>>,
    update: ZodType<Record<string, unknown>>,
    defaults: () => Record<string, unknown> | Promise<Record<string, unknown>> = () => ({}),
    {
      area,
      owned = false,
      scope,
      write,
      check,
      after,
      afterDelete,
    }: {
      area: Area;
      owned?: boolean;
      scope?: (req: FastifyRequest) => Promise<Filter<Doc> | undefined>;
      write?: (req: FastifyRequest, next: Record<string, unknown>, existing?: Doc) => string | undefined;
      /** Validates (and may complete) a create or change against the record as it would end up; returns an error message. */
      check?: (next: Record<string, unknown>, existing: Doc | undefined, req: FastifyRequest) => Promise<string | undefined>;
      /** Runs after a create or change is saved (e.g. a confirmed deal makes its company a client). */
      after?: (saved: Doc, req: FastifyRequest, existing?: Doc) => Promise<void>;
      /** Runs after a record is deleted (e.g. its photo goes too). */
      afterDelete?: (deleted: Doc) => Promise<void>;
    },
  ) {
    const col = db.collection<Doc>(name);
    const visible = async (req: FastifyRequest): Promise<Filter<Doc>> => (await scope?.(req)) ?? (access(req, area) === "none" ? NOTHING : {});
    const writeError =
      write ??
      ((req: FastifyRequest, next: Record<string, unknown>, existing?: Doc) => {
        const a = access(req, area);
        if (a === "edit") return undefined;
        if (a !== "own" || !owned) return denied(req, area);
        if (existing && existing.ownerId !== req.member._id) return "You can only change records you own";
        if (next.ownerId !== undefined && next.ownerId !== req.member._id) return "Only admins can assign records to someone else";
        return undefined;
      });
    app.get(`/${name}`, async (req) => {
      const { limit, ...filter } = ListQuery.parse(req.query);
      return (await col.find({ ...filter, ...(await visible(req)) }).sort({ _id: -1 }).limit(limit).toArray()).map(out);
    });
    app.get<{ Params: { id: string } }>(`/${name}/:id`, async (req, reply) => {
      const doc = await col.findOne({ $and: [{ _id: req.params.id }, await visible(req)] });
      return doc ? out(doc) : reply.code(404).send({ error: "Not found" });
    });
    app.post(`/${name}`, async (req, reply) => {
      const body = create.parse(req.body);
      const no = writeError(req, body);
      if (no) return reply.code(403).send({ error: no });
      const invalid = check && (await check(body, undefined, req));
      if (invalid) return reply.code(422).send({ error: invalid });
      const doc: Doc = { _id: new ObjectId().toHexString(), ...(await defaults()), ...body };
      await col.insertOne(doc);
      await after?.(doc, req);
      return reply.code(201).send(out(doc));
    });
    app.patch<{ Params: { id: string } }>(`/${name}/:id`, async (req, reply) => {
      const changes = update.parse(req.body);
      const existing = await col.findOne({ _id: req.params.id });
      if (!existing) return reply.code(404).send({ error: "Not found" });
      const no = writeError(req, changes, existing);
      if (no) return reply.code(403).send({ error: no });
      const invalid = check && (await check(changes, existing, req));
      if (invalid) return reply.code(422).send({ error: invalid });
      // null clears an optional field (e.g. the next follow-up once it's done).
      const mod: UpdateFilter<Doc> = {};
      const set = Object.entries(changes).filter(([, v]) => v !== null);
      const unset = Object.entries(changes).filter(([, v]) => v === null);
      if (set.length) mod.$set = Object.fromEntries(set);
      if (unset.length) mod.$unset = Object.fromEntries(unset.map(([k]) => [k, true as const]));
      const saved = (await col.findOneAndUpdate({ _id: existing._id }, mod, { returnDocument: "after" }))!;
      await after?.(saved, req, existing);
      return out(saved);
    });
    app.delete<{ Params: { id: string } }>(`/${name}/:id`, async (req, reply) => {
      const existing = await col.findOne({ _id: req.params.id });
      if (!existing) return reply.code(404).send({ error: "Not found" });
      const no = writeError(req, {}, existing);
      if (no) return reply.code(403).send({ error: no });
      await col.deleteOne({ _id: existing._id });
      await afterDelete?.(existing);
      return reply.code(204).send();
    });
    return { visible };
  }

  const now = () => new Date().toISOString();
  // Crew see the clients (and their people) of the projects they're on — no leads, no money.
  records("companies", CreateCompanySchema, UpdateCompanySchema, () => ({ lastActivityAt: now() }), {
    area: "sales",
    owned: true,
    // A replaced or removed photo is deleted, and a deleted client takes their photo with them.
    after: async (saved, _req, existing) => {
      if (existing?.photo && existing.photo !== saved.photo) await deletePhoto(db, existing.photo);
    },
    afterDelete: async (c) => deletePhoto(db, c.photo),
    scope: async (req) => {
      const mine = await crewProjects(req);
      return mine && { _id: { $in: mine.map((p) => String(p.companyId)) } };
    },
  });
  records("contacts", CreateContactSchema, UpdateContactSchema, () => ({ lastActivityAt: now() }), {
    area: "sales",
    owned: true,
    scope: async (req) => {
      const mine = await crewProjects(req);
      return mine && { companyId: { $in: mine.map((p) => String(p.companyId)) } };
    },
  });
  /* ---------- Client photos ---------- */
  /** Upload (or replace) a client's card photo: anyone who may change the client. The browser sends a small WebP. */
  app.post<{ Params: { id: string } }>("/companies/:id/photo", { bodyLimit: 1_000_000 }, async (req, reply) => {
    const { dataUrl } = z.object({ dataUrl: z.string().max(600_000) }).parse(req.body);
    const companies = db.collection<Doc>("companies");
    const c = await companies.findOne({ _id: req.params.id });
    if (!c) return reply.code(404).send({ error: "Not found" });
    const a = access(req, "sales");
    if (!(a === "edit" || (a === "own" && c.ownerId === req.member._id) || access(req, "projects") === "edit")) return reply.code(403).send({ error: denied(req, "sales") });
    const bytes = fromDataUrl(dataUrl);
    if (!bytes) return reply.code(400).send({ error: "Use a JPEG, PNG or WebP photo" });
    let photo: string;
    try {
      photo = await savePhoto(db, bytes);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    await deletePhoto(db, c.photo);
    return out((await companies.findOneAndUpdate({ _id: c._id }, { $set: { photo } }, { returnDocument: "after" }))!);
  });
  app.get<{ Params: { file: string } }>("/public/photos/:file", async (req, reply) => {
    const p = /^[\w-]{20,80}$/.test(req.params.file) ? await db.collection<Photo>("photos").findOne({ _id: req.params.file }) : null;
    if (!p) return reply.code(404).send({ error: "Not found" });
    // A new upload gets a new address, so this one never changes: cache it for good (browser and CDN).
    return reply.type(p.type).header("cache-control", "public, max-age=31536000, immutable").header("x-content-type-options", "nosniff").send(Buffer.from(p.data.buffer));
  });

  /* ---------- Pipelines: each business's stages ---------- */
  const pipelinesCol = db.collection<{ _id: string } & Pipelines>("pipelines");
  const getPipelines = async (): Promise<Pipelines> => {
    const doc = await pipelinesCol.findOne({ _id: "pipelines" });
    return doc ? { photography: doc.photography, marketing: doc.marketing } : DEFAULT_PIPELINES;
  };
  app.get("/pipelines", getPipelines);
  app.put("/pipelines", { preHandler: adminOnly }, async (req, reply) => {
    const next = PipelinesSchema.parse(req.body);
    // A stage can't disappear while deals sit in it: they'd have nowhere to show.
    for (const business of ["photography", "marketing"] as const) {
      const ids = new Set(next[business].map((s) => s.id));
      const stranded = await db.collection<Doc>("deals").find({ ...(business === "photography" ? { $or: [{ business }, { business: { $exists: false } }] } : { business }), stage: { $nin: [...ids] } }, { projection: { stage: 1 } }).toArray();
      if (stranded.length) {
        const old = (await getPipelines())[business].find((s) => s.id === stranded[0]!.stage)?.label ?? String(stranded[0]!.stage);
        return reply.code(409).send({ error: `${stranded.length} ${business} deal${stranded.length === 1 ? " is" : "s are"} still in "${old}" — move ${stranded.length === 1 ? "it" : "them"} before removing that stage` });
      }
    }
    await pipelinesCol.replaceOne({ _id: "pipelines" }, next, { upsert: true });
    return next;
  });

  records("deals", CreateDealSchema, UpdateDealSchema, () => ({ createdAt: now(), position: 0 }), {
    area: "sales",
    owned: true,
    scope: async (req) => ((await ownDealIds(req)) ? { ownerId: req.member._id } : undefined),
    // The stage must exist in the deal's business pipeline; reaching the won stage records when.
    check: async (next, existing) => {
      // Automation: a new lead always has a next follow-up (tomorrow 11 am IST unless one was chosen), so none is forgotten.
      if (!existing && next.nextFollowUpAt === undefined && next.stage !== "won" && next.stage !== "lost") next.nextFollowUpAt = `${addDays(istDay(new Date()), 1)}T11:00:00+05:30`;
      if (next.stage === undefined && next.business === undefined) return undefined;
      const business = (next.business ?? existing?.business ?? "photography") as Business;
      const stageId = (next.stage ?? existing?.stage) as string;
      const stage = (await getPipelines())[business].find((s) => s.id === stageId);
      if (!stage) return `"${stageId}" isn't a stage in the ${business} pipeline`;
      if (stage.kind === "won" && !next.wonAt && !existing?.wonAt) next.wonAt = now();
      if (stage.kind === "lost" && !existing?.lostAt) next.lostAt = now(); // for "lost this month"
      return undefined;
    },
    // A lead that's confirmed makes its company (or couple) a client — no need to create the client again.
    after: async (deal, req, existing) => {
      await onConfirmed(deal);
      if (deal.ownerId !== existing?.ownerId) await notify(db, [String(deal.ownerId)], { kind: "assigned", text: `${req.member.name} gave you the lead “${deal.title}”`, link: `/deals/${deal._id}` }, req.member._id);
      if (deal.stage === "won" && existing?.stage !== "won") {
        const admins = await members.find({ role: "admin", status: { $ne: "removed" } }, { projection: { _id: 1 } }).toArray();
        await notify(db, [String(deal.ownerId), ...admins.map((m) => m._id)], { kind: "won", text: `${deal.title} was confirmed`, link: `/deals/${deal._id}` }, req.member._id);
      }
    },
  });
  /** A confirmed deal makes its company a client (once) and starts its project. */
  async function onConfirmed(deal: Doc) {
    if (deal.stage !== "won" || !deal.companyId) return;
    await db.collection<Doc>("companies").updateOne({ _id: String(deal.companyId), clientSince: { $exists: false } }, { $set: { clientSince: String(deal.wonAt ?? now()) } });
    await startProject(deal);
  }

  /* ---------- Projects: started from a template when a lead is confirmed ---------- */
  const templatesCol = db.collection<{ _id: string } & Templates>("templates");
  const getTemplates = async (): Promise<Templates> => {
    const doc = await templatesCol.findOne({ _id: "templates" });
    return doc ? { photography: doc.photography, marketing: doc.marketing } : DEFAULT_TEMPLATES;
  };
  app.get("/project-templates", getTemplates);
  app.put("/project-templates", { preHandler: mayChange("projects", false) }, async (req) => {
    const next = TemplatesSchema.parse(req.body);
    await templatesCol.replaceOne({ _id: "templates" }, next, { upsert: true });
    return next;
  });

  /** One project per confirmed deal (a unique index makes a second confirmation a no-op), with its checklist. */
  async function startProject(deal: Doc) {
    const { project, tasks } = projectFromDeal(deal, await getTemplates(), now());
    const projectId = new ObjectId().toHexString();
    try {
      await db.collection<Doc>("projects").insertOne({ _id: projectId, ...project });
    } catch (e) {
      if (e instanceof MongoServerError && e.code === 11000) return; // this deal already has its project
      throw e;
    }
    await db.collection<Doc>("tasks").insertMany(tasks.map((t) => ({ _id: new ObjectId().toHexString(), ...t, projectId })));
    try {
      await ensureProjectDriveFolder(projectId, String(project.managerId ?? ""));
    } catch (e) {
      // A missing/revoked Google account must not stop a confirmed deal becoming a project.
      await db.collection<Doc>("projects").updateOne({ _id: projectId }, { $set: { driveFolderError: (e as Error).message.slice(0, 200) } });
    }
  }

  /** Creates the project's one Drive folder, preferring the project manager's connected Google account. */
  async function ensureProjectDriveFolder(projectId: string, preferredMemberId?: string) {
    const projects = db.collection<Doc>("projects");
    const project = await projects.findOne({ _id: projectId });
    if (!project) throw Object.assign(new Error("Project not found"), { statusCode: 404 });
    const existing = ((project.links as { label: string; url: string }[] | undefined) ?? []).find((l) => l.label === "Google Drive folder");
    if (existing) return project;
    const keys = (await getKeys()) as { googleClientId?: string; googleClientSecret?: string };
    if (!keys.googleClientId || !keys.googleClientSecret) throw new Error("Finish Google setup in Settings → Integrations first");
    const accounts = db.collection<GoogleAccount>("googleAccounts");
    const account = (preferredMemberId ? await accounts.findOne({ connectedBy: preferredMemberId }) : null) ?? await accounts.findOne({});
    if (!account) throw new Error("Connect a Google account in Settings → Integrations first");
    const token = await googleAccessToken(db, f, { googleClientId: keys.googleClientId, googleClientSecret: keys.googleClientSecret }, account);
    const folder = await createDriveFolder(f, token, String(project.name));
    // Share it with the studio's Workspace domain so the whole team can open it (personal Gmail: left private).
    const domain = (await getWorkspace()).googleDomain || account.email.split("@")[1];
    let shareError: string | undefined;
    if (domain && !/^(gmail|googlemail)\.com$/i.test(domain))
      await shareWithDomain(f, token, folder.id, domain).catch((e: Error) => void (shareError = `Folder made, but not shared with ${domain}: ${e.message}`.slice(0, 200)));
    return (await projects.findOneAndUpdate(
      { _id: projectId },
      { $push: { links: { label: "Google Drive folder", url: folder.url } } as never, $set: { driveFolderId: folder.id, ...(shareError && { driveFolderError: shareError }) }, ...(!shareError && { $unset: { driveFolderError: "" } }) },
      { returnDocument: "after" },
    ))!;
  }
  records("projects", CreateProjectSchema, UpdateProjectSchema, () => ({ createdAt: now() }), {
    area: "projects",
    // Tell people when they're put on a project (in the crew or as its manager).
    after: async (p, req, existing) => {
      const was = new Set([existing?.managerId, ...((existing?.crew as { memberId: string }[] | undefined) ?? []).map((c) => c.memberId)]);
      const now_ = [p.managerId as string | undefined, ...((p.crew as { memberId: string }[] | undefined) ?? []).map((c) => c.memberId)];
      await notify(db, now_.filter((m) => !was.has(m)), { kind: "project", text: `${req.member.name} put you on the project “${p.name}”`, link: `/projects/${p._id}` }, req.member._id);
    },
    scope: async (req) => {
      const mine = await crewProjects(req);
      return mine && { _id: { $in: mine.map((p) => p._id) } };
    },
  });
  app.post<{ Params: { id: string } }>("/projects/:id/drive-folder", { preHandler: mayChange("projects", false) }, async (req, reply) => {
    try {
      return out(await ensureProjectDriveFolder(req.params.id, req.member._id));
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? 409;
      return reply.code(status).send({ error: (e as Error).message });
    }
  });

  /** An update for the client, shown newest first in their portal (and kept on the project). */
  app.post<{ Params: { id: string } }>("/projects/:id/updates", { preHandler: mayChange("projects", false) }, async (req, reply) => {
    const { body } = ClientUpdateSchema.parse(req.body);
    const update = { id: new ObjectId().toHexString(), body, at: now(), by: req.member.name };
    const saved = await db.collection<Doc>("projects").findOneAndUpdate({ _id: req.params.id }, { $push: { clientUpdates: { $each: [update], $position: 0, $slice: 50 } } } as never, { returnDocument: "after" });
    return saved ? reply.code(201).send(out(saved)) : reply.code(404).send({ error: "Not found" });
  });

  /**
   * Retainers repeat: start a month on a marketing project — the marketing checklist and deliverables again, dated
   * from that month's 1st and labelled with the month. Each month only once.
   */
  app.post<{ Params: { id: string } }>("/projects/:id/next-month", { preHandler: mayChange("projects", false) }, async (req, reply) => {
    const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(req.body ?? {});
    const projects = db.collection<Doc>("projects");
    const p = await projects.findOne({ _id: req.params.id });
    if (!p) return reply.code(404).send({ error: "Not found" });
    if (p.business !== "marketing") return reply.code(409).send({ error: "Monthly cycles are for marketing retainers" });
    const cycles = (p.cycles as string[] | undefined) ?? [];
    const next = month ?? (() => {
      const last = cycles.at(-1) ?? istDay(new Date()).slice(0, 7);
      const [y, m] = last.split("-").map(Number) as [number, number];
      return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    })();
    if (cycles.includes(next)) return reply.code(409).send({ error: "That month has already been started" });
    const label = new Date(`${next}-15T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    const { tasks: planned, deliverables } = planProject((await getTemplates()).marketing, { confirmedAt: `${next}-01T06:00:00Z` });
    const managerId = String(p.managerId ?? req.member._id);
    if (planned.length)
      await db.collection<Doc>("tasks").insertMany(
        planned.map((t) => ({ _id: new ObjectId().toHexString(), ...t, title: `${t.title} — ${label}`, status: "todo", done: false, remind: false, links: [], comments: [], business: "marketing", projectId: p._id, dealId: p.dealId, companyId: p.companyId, assigneeId: managerId })),
      );
    const saved = await projects.findOneAndUpdate(
      { _id: p._id },
      { $push: { deliverables: { $each: deliverables.map((d) => ({ ...d, id: `${next}-${d.id}`, name: `${d.name} — ${label}` })) }, cycles: next } as never },
      { returnDocument: "after" },
    );
    return reply.code(201).send({ project: out(saved!), tasksCreated: planned.length, month: next });
  });

  const tasks = records("tasks", CreateTaskSchema, UpdateTaskSchema, () => ({ done: false, comments: [] }), {
    area: "projects",
    scope: async (req) => {
      const me = req.member._id;
      const mine = await crewProjects(req);
      if (mine) return { $or: [{ assigneeId: me }, { projectId: { $in: mine.map((p) => p._id) } }] };
      const own = await ownDealIds(req);
      return own && { $or: [{ assigneeId: me }, { dealId: { $in: own } }] };
    },
    after: async (t, req, existing) => {
      // Completing a task goes on the client's timeline too, so the history shows who did what, when.
      if (t.done && !existing?.done && (t.dealId || t.projectId || t.companyId)) {
        const project = t.projectId ? await db.collection<Doc>("projects").findOne({ _id: String(t.projectId) }) : null;
        const dealId = (t.dealId ?? project?.dealId) as string | undefined;
        const companyId = (t.companyId ?? project?.companyId) as string | undefined;
        await db.collection<Doc>("activities").insertOne({
          _id: new ObjectId().toHexString(),
          type: "task",
          ...(dealId && { dealId }),
          ...(companyId && { companyId }),
          actorId: req.member._id,
          text: `completed “${t.title}”`,
          at: String(t.doneAt ?? now()),
        });
      }
      if (t.assigneeId !== existing?.assigneeId)
        await notify(db, [String(t.assigneeId)], { kind: "task", text: `${req.member.name} gave you a task: ${t.title}`, link: t.projectId ? `/projects/${t.projectId}` : "/tasks" }, req.member._id);
    },
    // Admins and project managers run every task; everyone else updates the ones given to them.
    write: (req, next, existing) => {
      if (access(req, "projects") === "edit") return undefined;
      if (existing && existing.assigneeId !== req.member._id) return "You can only update tasks given to you";
      if (next.assigneeId !== undefined && next.assigneeId !== req.member._id) return "Only admins and project managers can give tasks to someone else";
      return undefined;
    },
    // Ticking a task done and moving it to "Done" are the same thing. Who finished it and when is recorded here,
    // by the server (not the device's clock); reopening clears both.
    check: async (next, existing, req) => {
      if (next.status !== undefined) next.done = next.status === "done";
      else if (next.done !== undefined) next.status = next.done ? "done" : "todo";
      if (next.done === true && !existing?.done) Object.assign(next, { doneAt: now(), doneBy: req.member._id });
      else if (next.done === false && existing?.done) Object.assign(next, { doneAt: null, doneBy: null });
      else if (next.done === undefined) { delete next.doneAt; delete next.doneBy; } // not settable on their own
      return undefined;
    },
  });
  app.post<{ Params: { id: string } }>("/tasks/:id/comments", async (req, reply) => {
    const { body } = TaskCommentSchema.parse(req.body);
    const comment = { id: new ObjectId().toHexString(), authorId: req.member._id, body, at: now() };
    const saved = await db.collection<Doc>("tasks").findOneAndUpdate({ $and: [{ _id: req.params.id }, await tasks.visible(req)] }, { $push: { comments: comment } } as never, { returnDocument: "after" });
    if (!saved) return reply.code(404).send({ error: "Not found" });
    await notify(db, [String(saved.assigneeId)], { kind: "comment", text: `${req.member.name} commented on “${saved.title}”: ${body.slice(0, 120)}`, link: saved.projectId ? `/projects/${saved.projectId}` : "/tasks" }, req.member._id);
    return reply.code(201).send(out(saved));
  });

  /* ---------- Calendar feed: a private address per person for Google/Apple Calendar ---------- */
  const feeds = db.collection<{ _id: string; memberId: string; createdAt: string }>("calendarFeeds");
  const feedUrl = (site: string, token: string) => `${site}/api/public/calendar/${token}.ics`;
  app.post("/calendar/feed", async (req) => {
    const { origin: site, reset } = z.object({ origin, reset: z.boolean().optional() }).parse(req.body);
    if (reset) await feeds.deleteMany({ memberId: req.member._id });
    let feed = await feeds.findOne({ memberId: req.member._id });
    if (!feed) await feeds.insertOne((feed = { _id: newVerifyToken() + newVerifyToken(), memberId: req.member._id, createdAt: now() }));
    return { url: feedUrl(site, feed._id) };
  });
  app.get<{ Params: { file: string } }>("/public/calendar/:file", async (req, reply) => {
    const feed = await feeds.findOne({ _id: req.params.file.replace(/\.ics$/, "") });
    const member = feed && (feed.memberId === "support" ? { ...SUPPORT_MEMBER } : await members.findOne({ _id: feed.memberId, status: { $ne: "removed" } }));
    if (!member) return reply.code(404).type("text/plain").send("This calendar address is no longer valid.");
    const site = `https://${req.headers["x-forwarded-host"] ?? req.headers.host}`;
    return reply.type("text/calendar; charset=utf-8").header("cache-control", "private, max-age=900").send(toIcs(`Oyster CRM — ${member.name}`, await feedFor(db, member as Doc, site)));
  });

  /* ---------- Client portal: one private link per project, no client account ---------- */
  const portalLinks = db.collection<PortalLink>("portalLinks");
  const portalUrl = (site: string, token: string) => `${site}/portal/${token}`;
  const visibleProject = async (req: FastifyRequest, id: string) => {
    const mine = access(req, "projects") === "own" ? await crewProjects(req) : undefined;
    if (access(req, "projects") === "none" || (mine && !mine.some((p) => p._id === id))) return null;
    return db.collection<Doc>("projects").findOne({ _id: id });
  };
  app.get<{ Params: { id: string } }>("/projects/:id/portal", async (req, reply) => {
    if (!(await visibleProject(req, req.params.id))) return reply.code(404).send({ error: "Not found" });
    const link = await portalLinks.findOne({ projectId: req.params.id });
    return link ? { token: link._id, createdAt: link.createdAt, lastViewedAt: link.lastViewedAt } : {};
  });
  // Admins and project managers share, replace or turn off the link.
  app.post<{ Params: { id: string } }>("/projects/:id/portal", { preHandler: mayChange("projects", false) }, async (req, reply) => {
    const { origin: site, reset } = z.object({ origin, reset: z.boolean().optional() }).parse(req.body);
    if (!(await db.collection<Doc>("projects").countDocuments({ _id: req.params.id }, { limit: 1 }))) return reply.code(404).send({ error: "Not found" });
    if (reset) await portalLinks.deleteMany({ projectId: req.params.id });
    let link = await portalLinks.findOne({ projectId: req.params.id });
    if (!link) await portalLinks.insertOne((link = { _id: newVerifyToken() + newVerifyToken(), projectId: req.params.id, createdAt: now(), createdBy: req.member._id }));
    return { token: link._id, url: portalUrl(site, link._id), createdAt: link.createdAt, lastViewedAt: link.lastViewedAt };
  });
  app.delete<{ Params: { id: string } }>("/projects/:id/portal", { preHandler: mayChange("projects", false) }, async (req, reply) => {
    await portalLinks.deleteMany({ projectId: req.params.id });
    return reply.code(204).send();
  });

  const portalToken = z.string().regex(/^[\w-]{40,80}$/);
  app.get<{ Params: { token: string } }>("/public/portal/:token", async (req, reply) => {
    const token = portalToken.safeParse(req.params.token);
    const link = token.success ? await portalLinks.findOne({ _id: token.data }) : null;
    const view = link && (await portalView(db, link.projectId, await getWorkspace()));
    if (!link || !view) return reply.code(404).send({ error: "This link is no longer active. Ask the studio for a new one." });
    // Remember when the client last looked (at most every 10 minutes).
    if (!link.lastViewedAt || Date.now() - +new Date(link.lastViewedAt) > 600_000) await portalLinks.updateOne({ _id: link._id }, { $set: { lastViewedAt: now() } });
    return reply.header("cache-control", "private, no-store").send(view);
  });
  app.post<{ Params: { token: string; taskId: string } }>("/public/portal/:token/approvals/:taskId", async (req, reply) => {
    const token = portalToken.safeParse(req.params.token);
    const link = token.success ? await portalLinks.findOne({ _id: token.data }) : null;
    if (!link) return reply.code(404).send({ error: "This link is no longer active. Ask the studio for a new one." });
    const { decision, note, name } = z
      .object({ decision: z.enum(["approved", "changes"]), note: z.string().trim().max(1000).optional(), name: z.string().trim().max(80).optional() })
      .refine((x) => x.decision === "approved" || !!x.note, { message: "Say what you'd like changed", path: ["note"] })
      .parse(req.body);
    const tasksCol = db.collection<Doc>("tasks");
    const task = await tasksCol.findOne({ _id: req.params.taskId, projectId: link.projectId });
    if (!task || !task.approval || task.approval === "none") return reply.code(404).send({ error: "Not found" });
    if (task.approval === "approved") return reply.code(409).send({ error: "This is already approved" });
    const project = await db.collection<Doc>("projects").findOne({ _id: link.projectId });
    const client = (await db.collection<Doc>("companies").findOne({ _id: String(project?.companyId) }))?.name as string | undefined;
    const by = name || client || "Client";
    const comment = { id: new ObjectId().toHexString(), authorId: "client", authorName: by, body: decision === "approved" ? `Approved${note ? `: ${note}` : ""}` : `Changes requested: ${note}`, at: now() };
    await tasksCol.updateOne({ _id: task._id }, { $set: { approval: decision }, $push: { comments: comment } as never });
    await notify(db, [task.assigneeId as string | undefined, project?.managerId as string | undefined], {
      kind: "approval",
      text: decision === "approved" ? `${by} approved “${task.title}”` : `${by} asked for changes on “${task.title}”: ${note!.slice(0, 120)}`,
      link: `/projects/${link.projectId}`,
    });
    return { ok: true, approval: decision };
  });

  /* ---------- Notifications (mine) ---------- */
  const notifications = db.collection<Notification>("notifications");
  const notificationPreferences = db.collection<NotificationPreferencesDoc>("notificationPreferences");
  app.get("/notifications", async (req) => (await notifications.find({ memberId: req.member._id }).sort({ at: -1 }).limit(50).toArray()).map(out));
  app.post("/notifications/read", async (req) => {
    const { ids } = z.object({ ids: z.array(z.string()).max(200).optional() }).parse(req.body ?? {});
    await notifications.updateMany({ memberId: req.member._id, read: false, ...(ids && { _id: { $in: ids } }) }, { $set: { read: true } });
    return { ok: true };
  });
  app.get("/notification-preferences", async (req): Promise<NotificationPreferences> => {
    const saved = await notificationPreferences.findOne({ _id: req.member._id });
    return saved ? { app: { ...DEFAULT_NOTIFICATION_PREFERENCES.app, ...saved.app } } : DEFAULT_NOTIFICATION_PREFERENCES;
  });
  app.put("/notification-preferences", async (req) => {
    const next = NotificationPreferencesSchema.parse(req.body);
    await notificationPreferences.updateOne({ _id: req.member._id }, { $set: next }, { upsert: true });
    return next;
  });

  /* ---------- Finance: packages, payment plans, quotations, schedules, expenses ---------- */
  const settingsCol = db.collection<{ _id: string } & FinanceSettings>("financeSettings");
  const getFinance = async (): Promise<FinanceSettings> => {
    const doc = await settingsCol.findOne({ _id: "finance" });
    return doc ? { packages: doc.packages, plans: doc.plans, terms: doc.terms } : DEFAULT_FINANCE;
  };
  app.get("/finance-settings", getFinance);
  app.put("/finance-settings", { preHandler: mayChange("finance", false) }, async (req) => {
    const next = FinanceSettingsSchema.parse(req.body);
    await settingsCol.replaceOne({ _id: "finance" }, next, { upsert: true });
    return next;
  });

  // Quotations are Sales' documents: same rules as deals. Numbered TOS/Q/<FY>/<NNN>; gaps don't matter here.
  const quoteNumber = async () => nextNumber(db, "quote", "TOS/Q", financialYear(new Date()));
  records("quotes", CreateQuoteSchema, UpdateQuoteSchema, async () => ({ number: await quoteNumber(), createdAt: now() }), {
    area: "sales",
    owned: true,
    scope: async (req) => ((await ownDealIds(req)) ? { ownerId: req.member._id } : undefined),
    check: async (_next, existing) => (existing?.status === "accepted" ? "An accepted quotation can't change — make a new one" : undefined),
    after: async (q, req, existing) => {
      if (q.status === "sent" && existing?.status !== "sent") await followUpAfterQuote(q);
      await applyAcceptedQuote(q, req.member._id);
    },
  });

  /** Automation: once a proposal goes out, the lead gets a follow-up 3 days later (unless an earlier one is set). */
  async function followUpAfterQuote(q: Doc) {
    if (!q.dealId) return;
    const when = `${addDays(istDay(new Date()), 3)}T11:00:00+05:30`;
    await db.collection<Doc>("deals").updateOne(
      { _id: String(q.dealId), stage: { $nin: ["won", "lost"] }, $or: [{ nextFollowUpAt: { $exists: false } }, { nextFollowUpAt: null }, { nextFollowUpAt: { $gt: when } }] },
      { $set: { nextFollowUpAt: when } },
    );
  }

  /**
   * Accepting confirms the booking: the deal takes the quoted value and payment schedule, and becomes won (client,
   * project). Runs once per quotation, whether a teammate marked it accepted or the client signed it online.
   */
  async function applyAcceptedQuote(q: Doc, actorId?: string) {
    if (q.status !== "accepted" || q.appliedAt || !q.dealId) return;
    const deals = db.collection<Doc>("deals");
    const deal = await deals.findOne({ _id: String(q.dealId) });
    if (!deal) return;
    const subtotal = totalsOf({ supply: q.supply as "intra" | "inter", lines: q.lines as { qty: number; ratePaise: number }[], payments: [] }).subtotal;
    const invoiced = ((deal.schedule as { invoiceId?: string }[] | undefined) ?? []).some((m) => m.invoiceId);
    const $set: Record<string, unknown> = { valuePaise: subtotal, ...(!invoiced && { schedule: q.schedule }) };
    if (deal.stage !== "won") Object.assign($set, { stage: "won", wonAt: now() });
    const saved = (await deals.findOneAndUpdate({ _id: deal._id }, { $set }, { returnDocument: "after" }))!;
    await onConfirmed(saved);
    await db.collection<Doc>("quotes").updateOne({ _id: q._id }, { $set: { appliedAt: now() } });
    const signed = q.signature as { name: string } | undefined;
    await notify(
      db,
      [String(deal.ownerId), ...(await db.collection<Doc>("members").find({ role: { $in: ["admin", "finance"] }, status: { $ne: "removed" } }).toArray()).map((m) => m._id)],
      { kind: "accepted", text: signed ? `${deal.title}: ${signed.name} signed quotation ${q.number} online — booking confirmed` : `${deal.title}: quotation ${q.number} accepted — booking confirmed`, link: `/deals/${deal._id}` },
      actorId,
    );
  }

  /* ---------- Online signing: the client accepts a quotation as a service agreement ---------- */
  const signLinks = db.collection<{ _id: string; quoteId: string; createdAt: string; createdBy: string }>("signLinks");
  const quotesCol = db.collection<Doc>("quotes");
  /** Same rule as changing the quotation: full sales access, or Sales on their own quotations. */
  const mayShareQuote = (req: FastifyRequest, q: Doc) => {
    const a = access(req, "sales");
    return a === "edit" || (a === "own" && q.ownerId === req.member._id);
  };
  app.post<{ Params: { id: string } }>("/quotes/:id/sign-link", async (req, reply) => {
    const { origin: site, reset } = z.object({ origin, reset: z.boolean().optional() }).parse(req.body);
    const q = await quotesCol.findOne({ _id: req.params.id });
    if (!q) return reply.code(404).send({ error: "Not found" });
    if (!mayShareQuote(req, q)) return reply.code(403).send({ error: denied(req, "sales") });
    if (q.status === "accepted" || q.status === "declined") return reply.code(409).send({ error: `This quotation is already ${q.status}` });
    if (!(q.lines as unknown[]).length) return reply.code(409).send({ error: "Add at least one package or item first" });
    if (reset) await signLinks.deleteMany({ quoteId: q._id });
    let link = await signLinks.findOne({ quoteId: q._id });
    if (!link) await signLinks.insertOne((link = { _id: newVerifyToken() + newVerifyToken(), quoteId: q._id, createdAt: now(), createdBy: req.member._id }));
    if (q.status === "draft") {
      await quotesCol.updateOne({ _id: q._id }, { $set: { status: "sent" } });
      await followUpAfterQuote(q);
    }
    return { url: `${site}/sign/${link._id}`, createdAt: link.createdAt };
  });
  app.delete<{ Params: { id: string } }>("/quotes/:id/sign-link", async (req, reply) => {
    const q = await quotesCol.findOne({ _id: req.params.id });
    if (!q) return reply.code(404).send({ error: "Not found" });
    if (!mayShareQuote(req, q)) return reply.code(403).send({ error: denied(req, "sales") });
    await signLinks.deleteMany({ quoteId: q._id });
    return reply.code(204).send();
  });

  const signToken = z.string().regex(/^[\w-]{40,80}$/);
  const quoteBySignToken = async (token: string) => {
    const t = signToken.safeParse(token);
    const link = t.success ? await signLinks.findOne({ _id: t.data }) : null;
    return link ? quotesCol.findOne({ _id: link.quoteId }) : null;
  };
  app.get<{ Params: { token: string } }>("/public/sign/:token", async (req, reply) => {
    const q = await quoteBySignToken(req.params.token);
    if (!q) return reply.code(404).send({ error: "This link is no longer active. Ask the studio for a new one." });
    const w = await getWorkspace();
    const company = await db.collection<Doc>("companies").findOne({ _id: String(q.companyId) });
    const deal = q.dealId ? await db.collection<Doc>("deals").findOne({ _id: String(q.dealId) }) : null;
    const signature = q.signature as { name: string; at: string } | undefined;
    return reply.header("cache-control", "private, no-store").send({
      studio: { name: w.studioName, legalName: w.legalName, gstin: w.gstin, address: w.address, email: w.enquiryEmail || undefined, whatsapp: w.whatsappNumber || undefined },
      client: { name: company?.name ?? "", address: company?.address ?? "", gstin: company?.gstin ?? "", city: company?.city ?? "" },
      deal: deal ? { title: deal.title, eventDate: deal.eventDate } : undefined,
      quote: { id: q._id, number: q.number, business: q.business, createdAt: q.createdAt, validUntil: q.validUntil, supply: q.supply, lines: q.lines, terms: q.terms, schedule: q.schedule, status: q.status },
      fingerprint: quoteFingerprint(q),
      ...(signature && { signature: { name: signature.name, at: signature.at } }),
    });
  });
  app.post<{ Params: { token: string } }>("/public/sign/:token", async (req, reply) => {
    const q = await quoteBySignToken(req.params.token);
    if (!q) return reply.code(404).send({ error: "This link is no longer active. Ask the studio for a new one." });
    const input = z
      .object({
        name: z.string().trim().min(3, "Type your full name").max(80),
        email: z.string().trim().toLowerCase().email("Check the email address").max(120).optional(),
        phone: z.string().trim().max(20).optional(),
        agree: z.literal(true, { error: "Tick the box to agree" }),
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(req.body);
    if (q.signature) return reply.code(409).send({ error: "This agreement is already signed" });
    if (q.status === "accepted" || q.status === "declined") return reply.code(409).send({ error: `This quotation is already ${q.status}. Ask the studio for a new one.` });
    if (String(q.validUntil) < istDay(new Date())) return reply.code(409).send({ error: "This quotation has expired. Ask the studio for an updated one." });
    // The client signs exactly what they read: a change since the page loaded stops the signature.
    if (input.fingerprint !== quoteFingerprint(q)) return reply.code(409).send({ error: "The studio has changed this quotation since you opened it. Reload the page to see the latest version." });
    const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]!.trim();
    const signature = {
      name: input.name,
      ...(input.email && { email: input.email }),
      ...(input.phone && { phone: input.phone }),
      at: now(),
      ip: forwarded || req.ip,
      userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300),
      fingerprint: input.fingerprint,
      method: "Online acceptance (typed name + consent), IT Act 2000 §10A",
    };
    // Only one signature can win, even if the page is submitted twice.
    const saved = await quotesCol.findOneAndUpdate({ _id: q._id, signature: { $exists: false }, status: { $nin: ["accepted", "declined"] } }, { $set: { signature, status: "accepted" } }, { returnDocument: "after" });
    if (!saved) return reply.code(409).send({ error: "This agreement is already signed" });
    if (saved.dealId)
      await db.collection<Doc>("activities").insertOne({ _id: new ObjectId().toHexString(), type: "note", dealId: saved.dealId, companyId: saved.companyId, actorId: "client", at: signature.at, text: `signed quotation ${saved.number} online as ${signature.name}` });
    await applyAcceptedQuote(saved);
    await signLinks.deleteMany({ quoteId: q._id }); // a signed link can't be reused
    return { ok: true, signature: { name: signature.name, at: signature.at } };
  });

  /** Payment schedule of a deal: Sales on their own deals, or Finance. Stages already invoiced stay as they are. */
  app.put<{ Params: { id: string } }>("/deals/:id/schedule", async (req, reply) => {
    const { schedule } = ScheduleSchema.parse(req.body);
    const deal = await db.collection<Doc>("deals").findOne({ _id: req.params.id });
    if (!deal) return reply.code(404).send({ error: "Not found" });
    const sales = access(req, "sales");
    if (!(access(req, "finance") === "edit" || sales === "edit" || (sales === "own" && deal.ownerId === req.member._id))) return reply.code(403).send({ error: denied(req, "sales") });
    for (const m of (deal.schedule as { id: string; amountPaise: number; invoiceId?: string }[] | undefined) ?? [])
      if (m.invoiceId && !schedule.some((x) => x.id === m.id && x.invoiceId === m.invoiceId && x.amountPaise === m.amountPaise))
        return reply.code(409).send({ error: "A stage that has been invoiced can't be changed or removed" });
    return out((await db.collection<Doc>("deals").findOneAndUpdate({ _id: deal._id }, { $set: { schedule } }, { returnDocument: "after" }))!);
  });

  /** Raises the invoice for one stage of a deal's payment schedule (Finance and admins). */
  app.post<{ Params: { id: string; item: string } }>("/deals/:id/schedule/:item/invoice", { preHandler: mayChange("finance", false) }, async (req, reply) => {
    const { legalName, gstin } = await getWorkspace();
    if (!legalName || !gstin) return reply.code(422).send({ error: "Add the studio's legal name and GSTIN in Settings → Workspace first" });
    const deals = db.collection<Doc>("deals");
    const deal = await deals.findOne({ _id: req.params.id });
    const schedule = (deal?.schedule as { id: string; label: string; amountPaise: number; dueDate?: string; invoiceId?: string }[] | undefined) ?? [];
    const item = schedule.find((m) => m.id === req.params.item);
    if (!deal || !item) return reply.code(404).send({ error: "Not found" });
    if (item.invoiceId) return reply.code(409).send({ error: "This stage already has an invoice" });
    if (!item.amountPaise) return reply.code(422).send({ error: "This stage has no amount" });
    const business = (deal.business ?? "photography") as Business;
    const p = await parties(String(deal.companyId));
    // Inter-state only when the client's GSTIN is from another state; unregistered clients are billed as local.
    const supply = p.buyer.gstin && gstState(p.buyer.gstin) && p.buyer.gstin.slice(0, 2) !== gstin.slice(0, 2) ? "inter" : "intra";
    const today = istDay(new Date());
    const dueDay = item.dueDate && item.dueDate > today ? item.dueDate : today;
    const invoice = await createInvoice(db, client, {
      companyId: String(deal.companyId),
      dealId: deal._id,
      business,
      dueAt: `${dueDay}T18:00:00+05:30`,
      supply,
      lines: [{ desc: `${item.label} — ${String(deal.service || deal.title)}`, sac: DEFAULT_SAC[business], qty: 1, ratePaise: item.amountPaise }],
      ...p,
    });
    const next = schedule.map((m) => (m.id === item.id ? { ...m, invoiceId: invoice._id } : m));
    const saved = (await deals.findOneAndUpdate({ _id: deal._id }, { $set: { schedule: next } }, { returnDocument: "after" }))!;
    return reply.code(201).send({ invoice: out(invoice), deal: out(saved) });
  });

  /** A Razorpay link for what's still due on a sent invoice; the client pays online and it records itself. */
  app.post<{ Params: { id: string } }>("/invoices/:id/payment-link", { preHandler: mayChange("finance", false) }, async (req, reply) => {
    const keys = await getKeys();
    if (!keys.razorpayKeyId || !keys.razorpayKeySecret) return reply.code(409).send({ error: "Connect Razorpay first in Settings → Integrations" });
    const inv = await db.collection<Doc>("invoices").findOne({ _id: req.params.id });
    if (!inv) return reply.code(404).send({ error: "Not found" });
    if (!inv.sent || inv.cancelled) return reply.code(409).send({ error: "Mark the invoice as sent first" });
    const due = totalsOf(inv as unknown as Parameters<typeof totalsOf>[0]).due;
    if (due <= 0) return reply.code(409).send({ error: "Nothing is due on this invoice" });
    const old = inv.paymentLink as { url: string; amountPaise: number; status: string } | undefined;
    if (old && old.status === "created" && old.amountPaise === due) return { paymentLink: old };
    const deal = inv.dealId ? await db.collection<Doc>("deals").findOne({ _id: String(inv.dealId) }) : null;
    const person = await db.collection<Doc>("contacts").findOne(deal?.contactId ? { _id: String(deal.contactId) } : { companyId: String(inv.companyId) });
    try {
      const link = await createPaymentLink(f, { razorpayKeyId: keys.razorpayKeyId, razorpayKeySecret: keys.razorpayKeySecret }, {
        invoiceId: inv._id,
        number: String(inv.number),
        amountPaise: due,
        name: String((inv.buyer as { name?: string } | undefined)?.name || person?.name || "Client"),
        email: person?.email as string | undefined,
        phone: person?.phone ? String(person.phone).replace(/[^\d+]/g, "") : undefined,
      });
      const paymentLink = { ...link, amountPaise: due, status: "created", createdAt: now() };
      await db.collection<Doc>("invoices").updateOne({ _id: inv._id }, { $set: { paymentLink } });
      return { paymentLink };
    } catch (e) {
      return reply.code(502).send({ error: `Razorpay: ${(e as Error).message}` });
    }
  });

  /** Sends a payment stage's reminder as the approved WhatsApp template, to the deal's contact. */
  app.post<{ Params: { id: string; item: string } }>("/deals/:id/schedule/:item/remind", async (req, reply) => {
    const keys = await getKeys();
    if (!keys.whatsappPhoneNumberId || !keys.whatsappToken) return reply.code(409).send({ error: "WhatsApp isn't connected yet" });
    const deal = await db.collection<Doc>("deals").findOne({ _id: req.params.id });
    const item = ((deal?.schedule as { id: string; label: string; amountPaise: number; dueDate?: string; invoiceId?: string }[] | undefined) ?? []).find((m) => m.id === req.params.item);
    if (!deal || !item) return reply.code(404).send({ error: "Not found" });
    const sales = access(req, "sales");
    if (!(access(req, "finance") === "edit" || sales === "edit" || (sales === "own" && deal.ownerId === req.member._id))) return reply.code(403).send({ error: denied(req, "sales") });
    const person = await db.collection<Doc>("contacts").findOne(deal.contactId ? { _id: String(deal.contactId) } : { companyId: String(deal.companyId), phone: { $exists: true } });
    if (!person?.phone) return reply.code(422).send({ error: "Add the client's phone number first" });
    const inv = item.invoiceId ? await db.collection<Doc>("invoices").findOne({ _id: item.invoiceId }) : null;
    const owed = inv ? totalsOf(inv as unknown as Parameters<typeof totalsOf>[0]).due : Math.round(item.amountPaise * 1.18);
    const studio = (await getWorkspace()).studioName;
    const due = item.dueDate ? new Date(`${item.dueDate}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "soon";
    try {
      await sendReminder(f, keys, String(person.phone), [String(person.name).split(" ")[0] || "there", studio, `${item.label} for ${deal.title}`, formatFull(owed), due]);
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
    await db.collection<Doc>("activities").insertOne({ _id: new ObjectId().toHexString(), type: "note", dealId: deal._id, companyId: deal.companyId, actorId: req.member._id, at: now(), text: `sent a WhatsApp payment reminder: ${item.label}, ${formatFull(owed)}` });
    return { ok: true };
  });

  // Expenses and profit are for Owners and Finance only.
  records("expenses", CreateExpenseSchema, UpdateExpenseSchema, () => ({ createdAt: now() }), {
    area: "finance",
    // An expense on a project counts against that project's client too (client-wise profit).
    check: async (next, existing) => {
      const projectId = (next.projectId ?? existing?.projectId) as string | undefined;
      if (projectId && !next.companyId && !existing?.companyId) {
        const p = await db.collection<Doc>("projects").findOne({ _id: projectId });
        if (!p) return "That project doesn't exist";
        next.companyId = p.companyId;
        next.business ??= p.business;
      }
      return undefined;
    },
    scope: async (req) => (access(req, "finance") === "edit" ? undefined : NOTHING),
  });

  /* ---------- Import (admins): CSV rows already mapped to field names ---------- */
  type Skipped = { row: number; reason: string };
  const why = (e: ZodError) => e.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`).join("; ");
  const companiesCol = db.collection<Doc>("companies");
  const nameKey = (n: string) => n.trim().toLowerCase();

  app.post("/import/companies", { preHandler: adminOnly }, async (req) => {
    const { rows } = ImportRequestSchema.parse(req.body);
    const seen = new Set((await companiesCol.find({}, { projection: { name: 1 } }).toArray()).map((c) => nameKey(String(c.name))));
    const docs: Doc[] = [];
    const skipped: Skipped[] = [];
    rows.forEach((raw, i) => {
      const r = CreateCompanySchema.safeParse(raw);
      if (!r.success) return skipped.push({ row: i + 1, reason: why(r.error) });
      if (seen.has(nameKey(r.data.name))) return skipped.push({ row: i + 1, reason: `${r.data.name} already exists` });
      seen.add(nameKey(r.data.name));
      docs.push({ _id: new ObjectId().toHexString(), lastActivityAt: now(), ...r.data });
    });
    if (docs.length) await companiesCol.insertMany(docs);
    return { created: docs.length, skipped };
  });

  app.post("/import/contacts", { preHandler: adminOnly }, async (req) => {
    const { rows } = ImportRequestSchema.parse(req.body);
    const contactsCol = db.collection<Doc>("contacts");
    const emails = new Set((await contactsCol.find({ email: { $type: "string" } }, { projection: { email: 1 } }).toArray()).map((c) => String(c.email)));
    const companyIds = new Map((await companiesCol.find({}, { projection: { name: 1 } }).toArray()).map((c) => [nameKey(String(c.name)), c._id]));
    const newCompanies: Doc[] = [];
    const docs: Doc[] = [];
    const skipped: Skipped[] = [];
    rows.forEach((raw, i) => {
      const r = ImportContactRowSchema.safeParse(raw);
      if (!r.success) return skipped.push({ row: i + 1, reason: why(r.error) });
      const { companyName, ...contact } = r.data;
      if (contact.email && emails.has(contact.email)) return skipped.push({ row: i + 1, reason: `${contact.email} already exists` });
      if (contact.email) emails.add(contact.email);
      let companyId: string | undefined;
      if (companyName) {
        companyId = companyIds.get(nameKey(companyName));
        if (!companyId) {
          companyId = new ObjectId().toHexString();
          companyIds.set(nameKey(companyName), companyId);
          newCompanies.push({ _id: companyId, name: companyName, domain: "", industry: "", city: contact.city, ownerId: contact.ownerId, tags: [], lastActivityAt: now() });
        }
      }
      docs.push({ _id: new ObjectId().toHexString(), lastActivityAt: now(), ...contact, ...(companyId && { companyId }) });
    });
    if (newCompanies.length) await companiesCol.insertMany(newCompanies);
    if (docs.length) await contactsCol.insertMany(docs);
    return { created: docs.length, companiesCreated: newCompanies.length, skipped };
  });

  /* ---------- Activity: an append-only log (notes, calls, stage changes…) ---------- */
  const activities = db.collection<Doc>("activities");
  app.get("/activities", async (req) => {
    const { dealId } = z.object({ dealId: z.string().optional() }).parse(req.query);
    if (access(req, "sales") === "none") return [];
    const own = await ownDealIds(req);
    // Sales limited to their own deals see those deals' activity, plus their own entries without a deal.
    const scope = own ? { $or: [{ dealId: { $in: own } }, { dealId: { $exists: false }, actorId: req.member._id }] } : {};
    // shortcut: the newest 2000 are loaded at sign-in; page older history when a deal's timeline needs it.
    return (await activities.find({ ...(dealId ? { dealId } : {}), ...scope }).sort({ at: -1 }).limit(2000).toArray()).map(out);
  });
  app.post("/activities", { preHandler: mayChange("sales") }, async (req, reply) => {
    const doc: Doc = { _id: new ObjectId().toHexString(), ...CreateActivitySchema.parse(req.body), actorId: req.member._id, at: now() };
    await activities.insertOne(doc);
    return reply.code(201).send(out(doc));
  });
  /** Only the author can remove an entry — used by Undo (e.g. undoing a stage change). */
  app.delete<{ Params: { id: string } }>("/activities/:id", async (req, reply) => {
    const { deletedCount } = await activities.deleteOne({ _id: req.params.id, actorId: req.member._id });
    return deletedCount ? reply.code(204).send() : reply.code(404).send({ error: "Not found, or not yours to remove" });
  });

  type InvoiceDoc = InvoiceMath & { _id: string; companyId: string; sent: boolean; cancelled?: boolean; payments: { at: string; amountPaise: number }[] };
  const invoices = db.collection<InvoiceDoc>("invoices");
  app.get("/invoices", async (req) => {
    const { limit, companyId } = ListQuery.parse(req.query);
    if (access(req, "finance") === "none") return [];
    const own = await ownDealIds(req);
    return (await invoices.find({ ...(companyId ? { companyId } : {}), ...(own ? { dealId: { $in: own } } : {}) }).sort({ issuedAt: -1 }).limit(limit).toArray()).map(out);
  });
  app.post("/invoices", { preHandler: mayChange("finance") }, async (req, reply) => {
    const input = CreateInvoiceSchema.parse(req.body);
    const { legalName, gstin } = await getWorkspace();
    if (!legalName || !gstin) return reply.code(422).send({ error: "Add the studio's legal name and GSTIN in Settings → Workspace first" });
    if (!(await db.collection<Doc>("companies").countDocuments({ _id: input.companyId }, { limit: 1 }))) return reply.code(422).send({ error: "That company doesn't exist" });
    const deal = input.dealId ? await db.collection<Doc>("deals").findOne({ _id: input.dealId, companyId: input.companyId }) : null;
    if (input.dealId && !deal) return reply.code(422).send({ error: "That deal doesn't belong to this company" });
    // The business comes from the deal when there is one (one legal entity and number series either way).
    const business = input.business ?? (deal?.business as typeof input.business);
    // Our and the client's details are copied onto the invoice, so later edits don't change issued invoices.
    return reply.code(201).send(out(await createInvoice(db, client, { ...input, ...(business && { business }), ...(await parties(input.companyId)) })));
  });

  /** Our and the client's details as they are now — copied onto an invoice when it's created and when it's issued. */
  const parties = async (companyId: string) => {
    const { legalName, gstin, address } = await getWorkspace();
    const company = await db.collection<Doc>("companies").findOne({ _id: companyId });
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    return { seller: { legalName, gstin, address }, buyer: { name: str(company?.name), gstin: str(company?.gstin), address: str(company?.address), city: str(company?.city) } };
  };
  app.post<{ Params: { id: string } }>("/invoices/:id/send", { preHandler: mayChange("finance") }, async (req, reply) => {
    const inv = await invoices.findOne({ _id: req.params.id, cancelled: { $ne: true } });
    if (!inv) return reply.code(404).send({ error: "Not found, or cancelled" });
    // Issuing is the moment that counts: refresh the copies in case details were corrected while it was a draft.
    const snapshot = inv.sent ? {} : await parties(String(inv.companyId));
    return out((await invoices.findOneAndUpdate({ _id: inv._id }, { $set: { sent: true, ...snapshot } }, { returnDocument: "after" }))!);
  });
  /** Edit a draft. Sent invoices can't change — that's what credit notes are for. */
  app.patch<{ Params: { id: string } }>("/invoices/:id", { preHandler: mayChange("finance") }, async (req, reply) => {
    const changes = UpdateDraftInvoiceSchema.parse(req.body);
    const inv = await invoices.findOne({ _id: req.params.id });
    if (!inv) return reply.code(404).send({ error: "Not found" });
    if (inv.sent || inv.cancelled) return reply.code(409).send({ error: "Only a draft can be edited; use a credit note for a sent invoice" });
    if (changes.dealId && !(await db.collection<Doc>("deals").countDocuments({ _id: changes.dealId, companyId: inv.companyId }, { limit: 1 })))
      return reply.code(422).send({ error: "That deal doesn't belong to this company" });
    return out((await invoices.findOneAndUpdate({ _id: inv._id }, { $set: changes }, { returnDocument: "after" }))!);
  });
  app.post<{ Params: { id: string } }>("/invoices/:id/credit-notes", { preHandler: mayChange("finance") }, async (req, reply) => {
    const result = await createCreditNote(db, client, req.params.id, CreditNoteSchema.parse(req.body), req.member._id);
    if ("error" in result) return reply.code(result.error === "Not found" ? 404 : 409).send({ error: result.error });
    return reply.code(201).send({ creditNote: out(result.note), invoice: out(result.invoice) });
  });
  app.get("/credit-notes", async (req) => {
    if (access(req, "finance") === "none") return [];
    const own = await ownDealIds(req);
    return (await db.collection<Doc>("creditNotes").find(own ? { dealId: { $in: own } } : {}).sort({ issuedAt: -1 }).limit(5000).toArray()).map(out);
  });
  /**
   * Cancels a draft. The invoice stays (marked cancelled) so the number series has no gaps; a sent invoice
   * needs a credit note instead, so it can't be cancelled here.
   */
  app.post<{ Params: { id: string } }>("/invoices/:id/cancel", { preHandler: mayChange("finance") }, async (req, reply) => {
    const { reason } = z.object({ reason: z.string().trim().min(1, "Say why it's being cancelled").max(200) }).parse(req.body);
    const doc = await invoices.findOneAndUpdate(
      { _id: req.params.id, sent: false, cancelled: { $ne: true } },
      { $set: { cancelled: true, cancelledAt: now(), cancelReason: reason, cancelledBy: req.member._id } },
      { returnDocument: "after" },
    );
    return doc ? out(doc) : reply.code(409).send({ error: "Only a draft that hasn't been sent can be cancelled" });
  });
  /** In a transaction so two payments recorded at once can't together exceed the balance. */
  app.post<{ Params: { id: string } }>("/invoices/:id/payments", { preHandler: mayChange("finance") }, async (req, reply) => {
    const { amountPaise, at = now() } = RecordPaymentSchema.parse(req.body);
    const session = client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const inv = await invoices.findOne({ _id: req.params.id }, { session });
        if (!inv) return { code: 404, body: { error: "Not found" } };
        if (inv.cancelled) return { code: 409, body: { error: "This invoice was cancelled" } };
        if (!inv.sent) return { code: 409, body: { error: "Send the invoice before recording a payment" } };
        const { due } = invoiceTotals(inv);
        if (amountPaise > due) return { code: 409, body: { error: `Payment is more than the balance due (${formatFull(due)})` } };
        return { code: 200, body: out((await invoices.findOneAndUpdate({ _id: inv._id }, { $push: { payments: { at, amountPaise } } }, { returnDocument: "after", session }))!) };
      });
      return reply.code(result.code).send(result.body);
    } finally {
      await session.endSession();
    }
  });

  return app;
}
