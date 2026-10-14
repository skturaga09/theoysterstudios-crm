import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { MongoServerError, ObjectId, type Db, type MongoClient } from "mongodb";
import { z, ZodError, type ZodType } from "zod";
import {
  AddMemberSchema,
  CreateCompanySchema,
  CreateContactSchema,
  CreateDealSchema,
  CreateActivitySchema,
  CreateInvoiceSchema,
  CreateTaskSchema,
  ImportContactRowSchema,
  ImportRequestSchema,
  RecordPaymentSchema,
  RoutingSchema,
  UpdateCompanySchema,
  UpdateContactSchema,
  UpdateDealSchema,
  UpdateMemberSchema,
  UpdateTaskSchema,
  WorkspaceSchema,
  type Workspace,
} from "@pinnacle/shared/schemas";
import { formatFull, invoiceTotals, type InvoiceMath } from "@pinnacle/shared";
import { nameFromEmail, SUPPORT_MEMBER, type Member, type Verify } from "./auth";
import type { Doc } from "./db";
import { createInvoice } from "./invoices";

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
}: {
  db: Db;
  client: MongoClient;
  verify: Verify;
  supportEmails?: string[];
  /** Cloud Functions has already read and parsed the JSON body (into `req.body`) before Fastify sees the request. */
  preParsedBody?: boolean;
}): FastifyInstance {
  const support = new Set(supportEmails.map((e) => e.trim().toLowerCase()));
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    // The web app calls /api/* (Vite proxy locally, Hosting rewrite in prod); routes live at the root.
    rewriteUrl: (req) => req.url!.replace(/^\/api(?=\/|\?|$)/, "") || "/",
  });
  const members = db.collection<Member>("members");
  if (preParsedBody) {
    app.removeContentTypeParser("application/json");
    app.addContentTypeParser("application/json", (req, _payload, done) => done(null, (req.raw as { body?: unknown }).body));
  }

  /**
   * Every route except /healthz needs a Google sign-in (Firebase ID token) whose verified email is on
   * the team list. Checked per request, so removing someone cuts access immediately.
   */
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/healthz") return;
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
    return w;
  };
  app.get("/workspace", getWorkspace);
  app.put("/workspace", { preHandler: adminOnly }, async (req) => {
    const w = WorkspaceSchema.parse(req.body);
    await workspaceCol.replaceOne({ _id: "studio" }, w, { upsert: true });
    return w;
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

  /** List / get / create / patch / delete for a plain collection. */
  function records(name: string, create: ZodType<Record<string, unknown>>, update: ZodType<Record<string, unknown>>, defaults: () => Record<string, unknown> = () => ({})) {
    const col = db.collection<Doc>(name);
    app.get(`/${name}`, async (req) => {
      const { limit, ...filter } = ListQuery.parse(req.query);
      return (await col.find(filter).sort({ _id: -1 }).limit(limit).toArray()).map(out);
    });
    app.get<{ Params: { id: string } }>(`/${name}/:id`, async (req, reply) => {
      const doc = await col.findOne({ _id: req.params.id });
      return doc ? out(doc) : reply.code(404).send({ error: "Not found" });
    });
    app.post(`/${name}`, async (req, reply) => {
      const doc: Doc = { _id: new ObjectId().toHexString(), ...defaults(), ...create.parse(req.body) };
      await col.insertOne(doc);
      return reply.code(201).send(out(doc));
    });
    app.patch<{ Params: { id: string } }>(`/${name}/:id`, async (req, reply) => {
      const doc = await col.findOneAndUpdate({ _id: req.params.id }, { $set: update.parse(req.body) }, { returnDocument: "after" });
      return doc ? out(doc) : reply.code(404).send({ error: "Not found" });
    });
    app.delete<{ Params: { id: string } }>(`/${name}/:id`, async (req, reply) => {
      const { deletedCount } = await col.deleteOne({ _id: req.params.id });
      return deletedCount ? reply.code(204).send() : reply.code(404).send({ error: "Not found" });
    });
  }

  const now = () => new Date().toISOString();
  records("companies", CreateCompanySchema, UpdateCompanySchema, () => ({ lastActivityAt: now() }));
  records("contacts", CreateContactSchema, UpdateContactSchema, () => ({ lastActivityAt: now() }));
  records("deals", CreateDealSchema, UpdateDealSchema, () => ({ createdAt: now(), position: 0 }));
  records("tasks", CreateTaskSchema, UpdateTaskSchema, () => ({ done: false }));

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
    // shortcut: the newest 2000 are loaded at sign-in; page older history when a deal's timeline needs it.
    return (await activities.find(dealId ? { dealId } : {}).sort({ at: -1 }).limit(2000).toArray()).map(out);
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

  type InvoiceDoc = InvoiceMath & { _id: string; sent: boolean; cancelled?: boolean; payments: { at: string; amountPaise: number }[] };
  const invoices = db.collection<InvoiceDoc>("invoices");
  app.get("/invoices", async (req) => {
    const { limit, companyId } = ListQuery.parse(req.query);
    return (await invoices.find(companyId ? { companyId } : {}).sort({ issuedAt: -1 }).limit(limit).toArray()).map(out);
  });
  app.post("/invoices", async (req, reply) => {
    const input = CreateInvoiceSchema.parse(req.body);
    const { legalName, gstin, address } = await getWorkspace();
    if (!legalName || !gstin) return reply.code(422).send({ error: "Add the studio's legal name and GSTIN in Settings → Workspace first" });
    const company = await db.collection<Doc>("companies").findOne({ _id: input.companyId });
    if (!company) return reply.code(422).send({ error: "That company doesn't exist" });
    if (input.dealId && !(await db.collection<Doc>("deals").countDocuments({ _id: input.dealId, companyId: input.companyId }, { limit: 1 })))
      return reply.code(422).send({ error: "That deal doesn't belong to this company" });
    // The seller's details are copied onto the invoice, so later edits to the workspace don't change issued invoices.
    // The client's details are copied too, so editing the company later doesn't change issued invoices.
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const buyer = { name: str(company.name), gstin: str(company.gstin), address: str(company.address), city: str(company.city) };
    return reply.code(201).send(out(await createInvoice(db, client, { ...input, seller: { legalName, gstin, address }, buyer })));
  });
  app.post<{ Params: { id: string } }>("/invoices/:id/send", async (req, reply) => {
    const doc = await invoices.findOneAndUpdate({ _id: req.params.id, cancelled: { $ne: true } }, { $set: { sent: true } }, { returnDocument: "after" });
    return doc ? out(doc) : reply.code(404).send({ error: "Not found, or cancelled" });
  });
  /**
   * Cancels a draft. The invoice stays (marked cancelled) so the number series has no gaps; a sent invoice
   * needs a credit note instead, so it can't be cancelled here.
   */
  app.post<{ Params: { id: string } }>("/invoices/:id/cancel", async (req, reply) => {
    const { reason } = z.object({ reason: z.string().trim().min(1, "Say why it's being cancelled").max(200) }).parse(req.body);
    const doc = await invoices.findOneAndUpdate(
      { _id: req.params.id, sent: false, cancelled: { $ne: true } },
      { $set: { cancelled: true, cancelledAt: now(), cancelReason: reason, cancelledBy: req.member._id } },
      { returnDocument: "after" },
    );
    return doc ? out(doc) : reply.code(409).send({ error: "Only a draft that hasn't been sent can be cancelled" });
  });
  /** In a transaction so two payments recorded at once can't together exceed the balance. */
  app.post<{ Params: { id: string } }>("/invoices/:id/payments", async (req, reply) => {
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
