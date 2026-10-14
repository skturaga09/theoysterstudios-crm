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
  UpdateCompanySchema,
  UpdateContactSchema,
  UpdateDealSchema,
  UpdateMemberSchema,
  UpdateTaskSchema,
  IntegrationKeysSchema,
  UpdateConversationSchema,
  SetupProgressSchema,
  WorkspaceSchema,
  type Workspace,
} from "@pinnacle/shared/schemas";
import { formatFull, invoiceTotals, type InvoiceMath } from "@pinnacle/shared";
import { nameFromEmail, SUPPORT_MEMBER, type Member, type Verify } from "./auth";
import type { Doc } from "./db";
import { createCreditNote, createInvoice } from "./invoices";
import { authorizeUrl, exchangeCode, handleWebhook, newVerifyToken, subscribeMessages, validSignature, type Fetch, type InstagramIntegration, type SetupKeys } from "./instagram";

/** `_id` → `id`, matching the web app's types. */
const out = ({ _id, ...rest }: { _id: string } & object) => ({ id: _id, ...rest });

const ListQuery = z.object({
  // shortcut: the web app loads whole collections at sign-in; add paging past a few thousand records.
  limit: z.coerce.number().int().min(1).max(5000).default(5000),
  stage: z.string().optional(),
  companyId: z.string().optional(),
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
  const PUBLIC = new Set(["/healthz", "/integrations/instagram/webhook", "/integrations/instagram/callback", "/public/privacy-info"]);

  /**
   * Every route except /healthz needs a Google sign-in (Firebase ID token) whose verified email is on
   * the team list. Checked per request, so removing someone cuts access immediately.
   */
  app.addHook("onRequest", async (req, reply) => {
    if (PUBLIC.has(req.url.split("?")[0]!)) return;
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    const claims = token ? await verify(token).catch(() => undefined) : undefined;
    if (!claims?.email || !claims.email_verified) return reply.code(401).send({ error: "Sign in with Google" });
    if (support.has(claims.email.toLowerCase())) {
      req.member = SUPPORT_MEMBER;
      return;
    }
    const member = await members.findOne({ email: claims.email.toLowerCase(), status: { $ne: "removed" } });
    if (!member) return reply.code(403).send({ error: "not_on_team", email: claims.email });
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
   * Roles, as described in Settings → Team & access. Admin: everything. Manager: all records, no settings.
   * Member: works on records they own; can't reassign to others; invoices are view-only; and with
   * "Members see all deals" off, sees only their own deals and what hangs off them.
   */
  const isMember = (req: FastifyRequest) => req.member.role === "member";
  const notMember = async (req: FastifyRequest, reply: FastifyReply) => {
    if (isMember(req)) return reply.code(403).send({ error: "Members can view invoices but only admins and managers can change them" });
  };
  /** For a Member who can't see others' deals: the ids of the deals they own. Otherwise undefined (no limit). */
  const ownDealIds = async (req: FastifyRequest): Promise<string[] | undefined> => {
    if (!isMember(req) || (await getWorkspace()).membersSeeAllDeals) return undefined;
    return (await db.collection<Doc>("deals").find({ ownerId: req.member._id }, { projection: { _id: 1 } }).toArray()).map((d) => d._id);
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
  });
  const getKeys = async () => ((await setupCol.findOne({ _id: "keys" })) ?? {}) as SetupKeys;
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

  /** Status of each channel, for the Integrations page and the sidebar. Never includes tokens. */
  app.get("/integrations", async () => {
    const ig = await integrations.findOne({ _id: "instagram" });
    return { instagram: ig ? { connected: true, username: ig.username, lastEventAt: ig.lastEventAt, tokenExpiresAt: ig.tokenExpiresAt, connectedAt: ig.connectedAt } : { connected: false } };
  });
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
  /** What the public privacy page needs: who the studio is and how to reach them. */
  app.get("/public/privacy-info", async () => {
    const w = await getWorkspace();
    return { studioName: w.studioName, legalName: w.legalName, address: w.address, contactEmail: w.enquiryEmail };
  });

  /* ---------- Inbox conversations (filled by the channel integrations) ---------- */
  const conversationsCol = db.collection<Doc>("conversations");
  app.get("/conversations", async (req) => {
    // A Member limited to their own deals sees the conversations assigned to them.
    const mine = (await ownDealIds(req)) ? { assigneeId: req.member._id } : {};
    return (await conversationsCol.find(mine).sort({ lastMessageAt: -1 }).limit(2000).toArray()).map(({ _id, externalId: _, ...c }) => ({ id: _id, ...c }));
  });
  app.patch<{ Params: { id: string } }>("/conversations/:id", async (req, reply) => {
    const changes = UpdateConversationSchema.parse(req.body);
    // null clears a link (e.g. undoing "Create deal"); anything else is set.
    const update: UpdateFilter<Doc> = {};
    const set = Object.entries(changes).filter(([, v]) => v !== null && v !== undefined);
    const unset = Object.entries(changes).filter(([, v]) => v === null);
    if (set.length) update.$set = Object.fromEntries(set);
    if (unset.length) update.$unset = Object.fromEntries(unset.map(([k]) => [k, true as const]));
    const doc = await conversationsCol.findOneAndUpdate({ _id: req.params.id }, update, { returnDocument: "after" });
    if (!doc) return reply.code(404).send({ error: "Not found" });
    const { _id, externalId: _, ...c } = doc;
    return { id: _id, ...c };
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
   * List / get / create / patch / delete for a plain collection. `owned` collections (deals, companies,
   * contacts) apply the Member rules: create and change only records they own, never hand them to someone else.
   * `scope` narrows what a Member may see when "Members see all deals" is off (given their own deals' ids).
   */
  function records(
    name: string,
    create: ZodType<Record<string, unknown>>,
    update: ZodType<Record<string, unknown>>,
    defaults: () => Record<string, unknown> = () => ({}),
    { owned = false, scope }: { owned?: boolean; scope?: (req: FastifyRequest, ownDeals: string[]) => Filter<Doc> } = {},
  ) {
    const col = db.collection<Doc>(name);
    const visible = async (req: FastifyRequest): Promise<Filter<Doc>> => {
      const own = scope && (await ownDealIds(req));
      return own ? scope(req, own) : {};
    };
    const memberError = (req: FastifyRequest, ownerId: unknown, existingOwner?: unknown) => {
      if (!owned || !isMember(req)) return undefined;
      if (existingOwner !== undefined && existingOwner !== req.member._id) return "Members can only change records they own";
      if (ownerId !== undefined && ownerId !== req.member._id) return "Only admins and managers can assign records to someone else";
      return undefined;
    };
    app.get(`/${name}`, async (req) => {
      const { limit, ...filter } = ListQuery.parse(req.query);
      return (await col.find({ ...filter, ...(await visible(req)) }).sort({ _id: -1 }).limit(limit).toArray()).map(out);
    });
    app.get<{ Params: { id: string } }>(`/${name}/:id`, async (req, reply) => {
      const doc = await col.findOne({ _id: req.params.id, ...(await visible(req)) });
      return doc ? out(doc) : reply.code(404).send({ error: "Not found" });
    });
    app.post(`/${name}`, async (req, reply) => {
      const body = create.parse(req.body);
      const denied = memberError(req, body.ownerId);
      if (denied) return reply.code(403).send({ error: denied });
      const doc: Doc = { _id: new ObjectId().toHexString(), ...defaults(), ...body };
      await col.insertOne(doc);
      return reply.code(201).send(out(doc));
    });
    app.patch<{ Params: { id: string } }>(`/${name}/:id`, async (req, reply) => {
      const changes = update.parse(req.body);
      const existing = await col.findOne({ _id: req.params.id });
      if (!existing) return reply.code(404).send({ error: "Not found" });
      const denied = memberError(req, changes.ownerId, existing.ownerId);
      if (denied) return reply.code(403).send({ error: denied });
      return out((await col.findOneAndUpdate({ _id: existing._id }, { $set: changes }, { returnDocument: "after" }))!);
    });
    app.delete<{ Params: { id: string } }>(`/${name}/:id`, async (req, reply) => {
      const existing = await col.findOne({ _id: req.params.id });
      if (!existing) return reply.code(404).send({ error: "Not found" });
      const denied = memberError(req, undefined, existing.ownerId);
      if (denied) return reply.code(403).send({ error: denied });
      await col.deleteOne({ _id: existing._id });
      return reply.code(204).send();
    });
  }

  const now = () => new Date().toISOString();
  records("companies", CreateCompanySchema, UpdateCompanySchema, () => ({ lastActivityAt: now() }), { owned: true });
  records("contacts", CreateContactSchema, UpdateContactSchema, () => ({ lastActivityAt: now() }), { owned: true });
  records("deals", CreateDealSchema, UpdateDealSchema, () => ({ createdAt: now(), position: 0 }), { owned: true, scope: (req) => ({ ownerId: req.member._id }) });
  records("tasks", CreateTaskSchema, UpdateTaskSchema, () => ({ done: false }), {
    scope: (req, own) => ({ $or: [{ assigneeId: req.member._id }, { dealId: { $in: own } }] }),
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
    const own = await ownDealIds(req);
    // A Member limited to their own deals sees those deals' activity, plus their own entries without a deal.
    const scope = own ? { $or: [{ dealId: { $in: own } }, { dealId: { $exists: false }, actorId: req.member._id }] } : {};
    // shortcut: the newest 2000 are loaded at sign-in; page older history when a deal's timeline needs it.
    return (await activities.find({ ...(dealId ? { dealId } : {}), ...scope }).sort({ at: -1 }).limit(2000).toArray()).map(out);
  });
  app.post("/activities", async (req, reply) => {
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
    const own = await ownDealIds(req);
    return (await invoices.find({ ...(companyId ? { companyId } : {}), ...(own ? { dealId: { $in: own } } : {}) }).sort({ issuedAt: -1 }).limit(limit).toArray()).map(out);
  });
  app.post("/invoices", { preHandler: notMember }, async (req, reply) => {
    const input = CreateInvoiceSchema.parse(req.body);
    const { legalName, gstin } = await getWorkspace();
    if (!legalName || !gstin) return reply.code(422).send({ error: "Add the studio's legal name and GSTIN in Settings → Workspace first" });
    if (!(await db.collection<Doc>("companies").countDocuments({ _id: input.companyId }, { limit: 1 }))) return reply.code(422).send({ error: "That company doesn't exist" });
    if (input.dealId && !(await db.collection<Doc>("deals").countDocuments({ _id: input.dealId, companyId: input.companyId }, { limit: 1 })))
      return reply.code(422).send({ error: "That deal doesn't belong to this company" });
    // Our and the client's details are copied onto the invoice, so later edits don't change issued invoices.
    return reply.code(201).send(out(await createInvoice(db, client, { ...input, ...(await parties(input.companyId)) })));
  });

  /** Our and the client's details as they are now — copied onto an invoice when it's created and when it's issued. */
  const parties = async (companyId: string) => {
    const { legalName, gstin, address } = await getWorkspace();
    const company = await db.collection<Doc>("companies").findOne({ _id: companyId });
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    return { seller: { legalName, gstin, address }, buyer: { name: str(company?.name), gstin: str(company?.gstin), address: str(company?.address), city: str(company?.city) } };
  };
  app.post<{ Params: { id: string } }>("/invoices/:id/send", { preHandler: notMember }, async (req, reply) => {
    const inv = await invoices.findOne({ _id: req.params.id, cancelled: { $ne: true } });
    if (!inv) return reply.code(404).send({ error: "Not found, or cancelled" });
    // Issuing is the moment that counts: refresh the copies in case details were corrected while it was a draft.
    const snapshot = inv.sent ? {} : await parties(String(inv.companyId));
    return out((await invoices.findOneAndUpdate({ _id: inv._id }, { $set: { sent: true, ...snapshot } }, { returnDocument: "after" }))!);
  });
  /** Edit a draft. Sent invoices can't change — that's what credit notes are for. */
  app.patch<{ Params: { id: string } }>("/invoices/:id", { preHandler: notMember }, async (req, reply) => {
    const changes = UpdateDraftInvoiceSchema.parse(req.body);
    const inv = await invoices.findOne({ _id: req.params.id });
    if (!inv) return reply.code(404).send({ error: "Not found" });
    if (inv.sent || inv.cancelled) return reply.code(409).send({ error: "Only a draft can be edited; use a credit note for a sent invoice" });
    if (changes.dealId && !(await db.collection<Doc>("deals").countDocuments({ _id: changes.dealId, companyId: inv.companyId }, { limit: 1 })))
      return reply.code(422).send({ error: "That deal doesn't belong to this company" });
    return out((await invoices.findOneAndUpdate({ _id: inv._id }, { $set: changes }, { returnDocument: "after" }))!);
  });
  app.post<{ Params: { id: string } }>("/invoices/:id/credit-notes", { preHandler: notMember }, async (req, reply) => {
    const result = await createCreditNote(db, client, req.params.id, CreditNoteSchema.parse(req.body), req.member._id);
    if ("error" in result) return reply.code(result.error === "Not found" ? 404 : 409).send({ error: result.error });
    return reply.code(201).send({ creditNote: out(result.note), invoice: out(result.invoice) });
  });
  app.get("/credit-notes", async (req) => {
    const own = await ownDealIds(req);
    return (await db.collection<Doc>("creditNotes").find(own ? { dealId: { $in: own } } : {}).sort({ issuedAt: -1 }).limit(5000).toArray()).map(out);
  });
  /**
   * Cancels a draft. The invoice stays (marked cancelled) so the number series has no gaps; a sent invoice
   * needs a credit note instead, so it can't be cancelled here.
   */
  app.post<{ Params: { id: string } }>("/invoices/:id/cancel", { preHandler: notMember }, async (req, reply) => {
    const { reason } = z.object({ reason: z.string().trim().min(1, "Say why it's being cancelled").max(200) }).parse(req.body);
    const doc = await invoices.findOneAndUpdate(
      { _id: req.params.id, sent: false, cancelled: { $ne: true } },
      { $set: { cancelled: true, cancelledAt: now(), cancelReason: reason, cancelledBy: req.member._id } },
      { returnDocument: "after" },
    );
    return doc ? out(doc) : reply.code(409).send({ error: "Only a draft that hasn't been sent can be cancelled" });
  });
  /** In a transaction so two payments recorded at once can't together exceed the balance. */
  app.post<{ Params: { id: string } }>("/invoices/:id/payments", { preHandler: notMember }, async (req, reply) => {
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
