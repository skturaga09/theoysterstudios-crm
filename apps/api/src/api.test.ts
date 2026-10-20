import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { buildApp } from "./app";
import { ensureAdmin, type Verify } from "./auth";
import { syncGoogle } from "./google";
import { refreshToken } from "./instagram";
import { connect } from "./db";
import { financialYear } from "./invoices";

const ADMIN = "owner@theoysterstudios.in";
const SUPPORT = "dev@gmail.com";
/** Stand-in for Google: "ok:<email>" is a verified sign-in, "unverified:<email>" isn't, anything else is a bad token. */
/** Stand-in for Instagram's servers: records calls and answers like the real endpoints. */
const igCalls: string[] = [];
const fakeInstagram: typeof fetch = async (input, init) => {
  const url = String(input);
  igCalls.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
  const ok = (body: object) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  if (url.startsWith("https://api.instagram.com/oauth/access_token")) return ok({ access_token: "short-token", user_id: 17841400000000001 });
  if (url.startsWith("https://graph.instagram.com/access_token")) return ok({ access_token: "LONG-SECRET-TOKEN", token_type: "bearer", expires_in: 5184000 });
  if (url.startsWith("https://graph.instagram.com/refresh_access_token")) return ok({ access_token: "RENEWED-TOKEN", token_type: "bearer", expires_in: 5184000 });
  if (url.startsWith("https://graph.instagram.com/me/subscribed_apps")) return ok({ success: true });
  if (url.startsWith("https://graph.instagram.com/me?")) return ok({ user_id: "17841400000000001", username: "theoysterstudios" });
  if (url.startsWith("https://graph.instagram.com/")) return ok({ name: "Riya Mehta", username: "riya.m" }); // a DM sender's profile
  return new Response("{}", { status: 404 });
};

/** Stand-in for Google: one mailbox's history and messages, a calendar, and the token endpoints. */
const g = {
  calls: [] as string[],
  scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly",
  history: [] as { id: string; labelIds: string[] }[],
  messages: {} as Record<string, object>,
  events: [] as object[],
};
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const gmailMsg = (id: string, from: string, opts: { to?: string; label?: string; subject?: string; body?: string; mid?: string; extra?: { name: string; value: string }[] } = {}) => ({
  id, threadId: `t-${id}`, labelIds: [opts.label ?? "INBOX"], internalDate: String(Date.parse("2026-10-14T10:00:00Z")), snippet: "snippet",
  payload: { mimeType: "multipart/alternative", headers: [{ name: "From", value: from }, { name: "To", value: opts.to ?? "studio@theoysterstudios.com" }, { name: "Subject", value: opts.subject ?? "Enquiry" }, { name: "Message-ID", value: opts.mid ?? `<${id}@mail>` }, ...(opts.extra ?? [])],
    parts: [{ mimeType: "text/plain", body: { data: b64(opts.body ?? "Hello") } }, { mimeType: "text/html", body: { data: b64("<p>Hello</p>") } }] },
});
const fakeGoogle: typeof fetch = async (input, init) => {
  const url = String(input);
  g.calls.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
  const ok = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const form = new URLSearchParams(String(init?.body ?? ""));
  if (url === "https://oauth2.googleapis.com/token" && form.get("grant_type") === "authorization_code") return ok({ access_token: "G-ACCESS", refresh_token: "G-REFRESH-SECRET", expires_in: 3599, scope: g.scope });
  if (url === "https://oauth2.googleapis.com/token" && form.get("grant_type") === "refresh_token") return ok({ access_token: "G-ACCESS-2", expires_in: 3599 });
  if (url.startsWith("https://oauth2.googleapis.com/revoke")) return ok({});
  if (url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/profile")) return ok({ emailAddress: "studio@theoysterstudios.com", historyId: "100" });
  if (url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/history")) return ok({ historyId: "200", history: g.history.map((m) => ({ messagesAdded: [{ message: m }] })) });
  const msg = url.match(/users\/me\/messages\/([^?]+)/);
  if (msg) return g.messages[msg[1]!] ? ok(g.messages[msg[1]!]!) : ok({}, 404);
  if (url.startsWith("https://www.googleapis.com/calendar/v3/calendars/primary/events")) return ok({ items: g.events, nextSyncToken: "sync-2" });
  return fakeInstagram(input, init);
};

const verify: Verify = async (t) => {
  const [kind, email] = t.split(":");
  if (kind === "ok") return { email, email_verified: true, name: "Name From Google", picture: "https://p/x.png" };
  if (kind === "unverified") return { email, email_verified: false };
  throw new Error("bad token");
};
let rs: MongoMemoryReplSet | undefined;
let app: ReturnType<typeof buildApp>;
let close: () => Promise<void>;
let deps: Omit<Parameters<typeof buildApp>[0], "verify">;

beforeAll(async () => {
  // TEST_MONGODB_URI runs the suite against a real (throwaway!) Firestore database; it writes test data.
  const uri = process.env.TEST_MONGODB_URI ?? (rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } })).getUri();
  const { client, db } = await connect(uri);
  if (process.env.TEST_MONGODB_URI) await Promise.all(["companies", "contacts", "deals", "invoices", "counters", "members", "workspace", "tasks", "activities", "routing", "creditNotes", "setup", "integrations", "conversations", "seenMessages", "googleAccounts", "pipelines", "projects", "templates"].map((c) => db.collection(c).deleteMany({})));
  await ensureAdmin(db, ADMIN);
  deps = { db, client, supportEmails: [SUPPORT] };
  app = buildApp({ ...deps, verify, fetch: fakeGoogle });
  close = async () => { await app.close(); await client.close(); await rs?.stop(); };
}, 600_000); // first run against Firestore builds indexes (~75s each, in parallel)
afterAll(() => close?.());

const call = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object, token = `ok:${ADMIN}`) =>
  app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });

describe("auth", () => {
  it("needs a verified Google sign-in on the team list; healthz is open", async () => {
    expect((await app.inject({ url: "/healthz" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/deals" })).statusCode).toBe(401);
    expect((await call("GET", "/deals", undefined, "garbage")).statusCode).toBe(401);
    expect((await call("GET", "/deals", undefined, `unverified:${ADMIN}`)).statusCode).toBe(401);
    expect((await call("GET", "/deals", undefined, "ok:stranger@gmail.com")).json()).toMatchObject({ error: "not_on_team" });
    expect((await call("GET", "/api/deals")).statusCode).toBe(200); // /api prefix used by the web app
  });

  it("first sign-in activates the admin and takes name + photo from Google", async () => {
    const me = (await call("GET", "/api/me")).json();
    expect(me).toMatchObject({ email: ADMIN, role: "admin", status: "active", name: "Name From Google", photoURL: "https://p/x.png" });
  });

  it("admins manage the team; removal cuts access immediately", async () => {
    const riya = "riya@gmail.com";
    const added = await call("POST", "/members", { email: " Riya@Gmail.com ", role: "sales" });
    expect(added.statusCode).toBe(201);
    const id = added.json().id;
    expect(added.json()).toMatchObject({ email: riya, name: "Riya", status: "invited" });
    expect((await call("POST", "/members", { email: riya })).statusCode).toBe(409);
    expect((await call("GET", "/me", undefined, `ok:${riya}`)).json().status).toBe("active");
    // Only admins manage the team.
    expect((await call("POST", "/members", { email: "x@gmail.com" }, `ok:${riya}`)).statusCode).toBe(403);
    expect((await call("PATCH", `/members/${id}`, { role: "pm" })).json().role).toBe("pm");
    expect((await call("DELETE", `/members/${id}`)).statusCode).toBe(204);
    expect((await call("GET", "/deals", undefined, `ok:${riya}`)).statusCode).toBe(403);
    expect((await call("GET", "/members")).json().map((m: { email: string }) => m.email)).toEqual([ADMIN]);
    // Re-adding restores the same record.
    expect((await call("POST", "/members", { email: riya })).json().id).toBe(id);
  });

  it("support signs in as a hidden admin that is never stored or listed", async () => {
    const me = (await call("GET", "/me", undefined, `ok:${SUPPORT}`)).json();
    expect(me).toMatchObject({ id: "support", name: "Support", role: "admin", email: "" });
    expect(JSON.stringify((await call("GET", "/members", undefined, `ok:${SUPPORT}`)).json())).not.toContain(SUPPORT);
    expect((await call("POST", "/members", { email: "new@gmail.com" }, `ok:${SUPPORT}`)).statusCode).toBe(201);
    expect((await call("DELETE", "/members/support")).statusCode).toBe(404);
  });

  it("saves lead routing rules; admins only; owners must be on the team", async () => {
    expect((await call("GET", "/routing")).json()).toEqual({ rules: [] });
    const meId = (await call("GET", "/me")).json().id;
    const rules = [{ id: "r1", channel: "instagram", ownerId: meId }, { id: "r2", city: "Goa", minPaise: 100000000, ownerId: meId }];
    expect((await call("PUT", "/routing", { rules })).json().rules).toHaveLength(2);
    expect((await call("GET", "/routing")).json().rules[1]).toMatchObject({ city: "Goa", minPaise: 100000000 });
    expect((await call("PUT", "/routing", { rules: [{ id: "x", ownerId: meId }] })).statusCode).toBe(400); // no condition
    expect((await call("PUT", "/routing", { rules: [{ id: "x", channel: "web", ownerId: "ghost" }] })).statusCode).toBe(422);
    await call("POST", "/members", { email: "seller@gmail.com" });
    expect((await call("PUT", "/routing", { rules }, "ok:seller@gmail.com")).statusCode).toBe(403);
  });

  it("imports companies and contacts, skipping bad rows and duplicates with a reason", async () => {
    const co = await call("POST", "/import/companies", {
      rows: [
        { name: "Halcyon Hotels", city: "Goa", ownerId: "sr", tags: ["Retainer"] },
        { name: "halcyon hotels", ownerId: "sr" }, // same name, other case
        { name: "", ownerId: "sr" },
        { name: "Marrow & Co", gstin: "not-a-gstin", ownerId: "sr" },
      ],
    });
    expect(co.json().created).toBe(1);
    expect(co.json().skipped.map((s: { row: number }) => s.row)).toEqual([2, 3, 4]);
    const ct = await call("POST", "/import/contacts", {
      rows: [
        { name: "Riya Mehta", email: "Riya@Halcyon.in", companyName: "HALCYON HOTELS", ownerId: "sr", source: "instagram" },
        { name: "Arjun", email: "riya@halcyon.in", ownerId: "sr", source: "web" }, // duplicate email
        { name: "Neha", companyName: "Brand New Co", ownerId: "sr", source: "referral" },
        { name: "Bad", email: "nope", ownerId: "sr", source: "web" },
      ],
    });
    expect(ct.json()).toMatchObject({ created: 2, companiesCreated: 1 });
    expect(ct.json().skipped.map((s: { row: number }) => s.row)).toEqual([2, 4]);
    const contacts = (await call("GET", "/contacts")).json();
    const halcyon = (await call("GET", "/companies")).json().find((c: { name: string }) => c.name === "Halcyon Hotels");
    expect(contacts.find((c: { name: string }) => c.name === "Riya Mehta").companyId).toBe(halcyon.id); // matched existing company
    await call("POST", "/members", { email: "importer@gmail.com" });
    expect((await call("POST", "/import/companies", { rows: [{ name: "X", ownerId: "sr" }] }, "ok:importer@gmail.com")).statusCode).toBe(403);
  });

  it("enforces roles: Sales work on their own records; invoices are view-only for them", async () => {
    const add = async (email: string, role: string) => (await call("POST", "/members", { email, role })).json().id as string;
    const meera = await add("meera@gmail.com", "sales");
    const kabir = await add("kabir@gmail.com", "sales");
    const as = (who: string) => `ok:${who}@gmail.com`;
    const deal = (ownerId: string) => ({ title: "Shoot", companyId: "c1", valuePaise: 100, closeAt: "2026-12-01T00:00:00+05:30", ownerId, channel: "instagram" });

    const mine = (await call("POST", "/deals", deal(meera), as("meera"))).json();
    expect((await call("POST", "/deals", deal(kabir), as("meera"))).statusCode).toBe(403); // can't create for someone else
    const kabirs = (await call("POST", "/deals", deal(kabir), as("kabir"))).json();
    expect((await call("PATCH", `/deals/${mine.id}`, { stage: "proposal" }, as("meera"))).statusCode).toBe(200);
    expect((await call("PATCH", `/deals/${kabirs.id}`, { stage: "proposal" }, as("meera"))).statusCode).toBe(403); // not hers
    expect((await call("PATCH", `/deals/${mine.id}`, { ownerId: kabir }, as("meera"))).statusCode).toBe(403); // can't reassign
    expect((await call("PATCH", `/deals/${mine.id}`, { ownerId: kabir })).statusCode).toBe(200); // admins can
    expect((await call("DELETE", `/deals/${kabirs.id}`, undefined, as("meera"))).statusCode).toBe(403);

    // Invoices: Sales may look, not touch.
    expect((await call("GET", "/invoices", undefined, as("meera"))).statusCode).toBe(200);
    expect((await call("POST", "/invoices", { companyId: "c1", dueAt: "2026-12-01T00:00:00+05:30", supply: "intra", lines: [{ desc: "x", sac: "998391", qty: 1, ratePaise: 1 }] }, as("meera"))).statusCode).toBe(403);

    // With "Sales see everyone's leads" off, Meera sees only her own deals and their tasks.
    expect((await call("GET", "/deals", undefined, as("meera"))).json().some((d: { id: string }) => d.id === kabirs.id)).toBe(true);
    const ws = (await call("GET", "/workspace")).json();
    await call("PUT", "/workspace", { ...ws, membersSeeAllDeals: false });
    await call("POST", "/tasks", { title: "Kabir's follow-up", dueAt: "2026-12-01T00:00:00+05:30", assigneeId: kabir, dealId: kabirs.id }, as("kabir"));
    const seen = (await call("GET", "/deals", undefined, as("meera"))).json().map((d: { id: string }) => d.id);
    expect(seen).not.toContain(kabirs.id);
    expect((await call("GET", `/deals/${kabirs.id}`, undefined, as("meera"))).statusCode).toBe(404);
    expect((await call("GET", "/tasks", undefined, as("meera"))).json().some((t: { title: string }) => t.title === "Kabir's follow-up")).toBe(false);
    expect((await call("GET", "/deals")).json().map((d: { id: string }) => d.id)).toContain(kabirs.id); // admins see all
    await call("PUT", "/workspace", { ...ws, membersSeeAllDeals: true });
  });

  it("gives each of the five roles its own access; old role names become Sales", async () => {
    const add = async (email: string, role: string) => (await call("POST", "/members", { email, role })).json().id as string;
    const as = (who: string) => `ok:${who}@gmail.com`;
    const seller = await add("seema@gmail.com", "sales");
    await add("pm@gmail.com", "pm");
    await add("accounts@gmail.com", "finance");
    const raj = await add("raj@gmail.com", "crew");
    expect((await call("POST", "/members", { email: "fresh@gmail.com" })).json().role).toBe("crew"); // least access by default

    const co = (await call("POST", "/companies", { name: "Isha & Dev", ownerId: seller, business: "photography" })).json();
    const other = (await call("POST", "/companies", { name: "Someone else", ownerId: seller })).json();
    const d = (await call("POST", "/deals", { title: "Isha & Dev wedding", companyId: co.id, valuePaise: 1, closeAt: "2027-01-10T00:00:00+05:30", ownerId: seller, channel: "instagram", business: "photography", stage: "won", eventDate: "2027-01-10" })).json();
    const p = (await call("GET", `/projects?dealId=${d.id}`)).json()[0];
    const tasks = (await call("GET", `/tasks?projectId=${p.id}`)).json() as { id: string; title: string }[];

    // Crew: nothing until they're on a project; then that project, its client and its tasks — no leads, no money.
    expect((await call("GET", "/projects", undefined, as("raj"))).json()).toEqual([]);
    for (const path of ["/deals", "/invoices", "/credit-notes", "/conversations", "/activities"]) expect((await call("GET", path, undefined, as("raj"))).json()).toEqual([]);
    await call("PATCH", `/projects/${p.id}`, { crew: [{ memberId: raj, role: "Candid photographer" }] });
    expect((await call("GET", "/projects", undefined, as("raj"))).json().map((x: { id: string }) => x.id)).toEqual([p.id]);
    const theirClients = (await call("GET", "/companies", undefined, as("raj"))).json().map((x: { id: string }) => x.id);
    expect(theirClients).toContain(co.id);
    expect(theirClients).not.toContain(other.id);
    expect((await call("GET", `/tasks?projectId=${p.id}`, undefined, as("raj"))).json()).toHaveLength(tasks.length);
    const t = tasks[0]!;
    expect((await call("PATCH", `/tasks/${t.id}`, { status: "in_progress" }, as("raj"))).statusCode).toBe(403); // not given to him
    await call("PATCH", `/tasks/${t.id}`, { assigneeId: raj });
    expect((await call("PATCH", `/tasks/${t.id}`, { status: "done" }, as("raj"))).json().done).toBe(true);
    expect((await call("PATCH", `/tasks/${t.id}`, { assigneeId: seller }, as("raj"))).statusCode).toBe(403);
    expect((await call("POST", `/tasks/${t.id}/comments`, { body: "Done, uploaded" }, as("raj"))).statusCode).toBe(201);
    expect((await call("PATCH", `/projects/${p.id}`, { status: "delivered" }, as("raj"))).statusCode).toBe(403);
    expect((await call("POST", "/deals", { title: "x", companyId: co.id, valuePaise: 1, closeAt: "2027-01-10T00:00:00+05:30", ownerId: raj, channel: "web" }, as("raj"))).statusCode).toBe(403);
    // Crew can't comment on tasks they can't see.
    const hidden = (await call("POST", "/tasks", { title: "Internal", dueAt: "2027-01-01T10:00:00+05:30", assigneeId: seller })).json();
    expect((await call("POST", `/tasks/${hidden.id}/comments`, { body: "hi" }, as("raj"))).statusCode).toBe(404);

    // Project manager: runs projects and templates; sees leads but doesn't change them; no invoices.
    expect((await call("PATCH", `/projects/${p.id}`, { status: "delivered" }, as("pm"))).statusCode).toBe(200);
    expect((await call("PATCH", `/tasks/${t.id}`, { assigneeId: seller }, as("pm"))).statusCode).toBe(200);
    expect((await call("PUT", "/project-templates", (await call("GET", "/project-templates")).json(), as("pm"))).statusCode).toBe(200);
    expect((await call("GET", "/deals", undefined, as("pm"))).json().length).toBeGreaterThan(0);
    expect((await call("PATCH", `/deals/${d.id}`, { title: "x" }, as("pm"))).statusCode).toBe(403);
    expect((await call("GET", "/invoices", undefined, as("pm"))).json()).toEqual([]);
    expect((await call("POST", "/invoices", {}, as("pm"))).statusCode).toBe(403);

    // Finance: invoices yes (the body is checked next), projects and leads view-only.
    expect((await call("POST", "/invoices", {}, as("accounts"))).statusCode).toBe(400);
    expect((await call("PATCH", `/projects/${p.id}`, { status: "closed" }, as("accounts"))).statusCode).toBe(403);
    expect((await call("PATCH", `/deals/${d.id}`, { title: "x" }, as("accounts"))).statusCode).toBe(403);
    expect((await call("POST", "/activities", { type: "note", dealId: d.id, text: "added a note" }, as("accounts"))).statusCode).toBe(403);

    // Sales: own leads; projects view-only; templates admins and PMs only.
    expect((await call("PATCH", `/deals/${d.id}`, { title: "Isha & Dev — wedding" }, as("seema"))).statusCode).toBe(200);
    expect((await call("PATCH", `/projects/${p.id}`, { status: "closed" }, as("seema"))).statusCode).toBe(403);
    expect((await call("PUT", "/project-templates", (await call("GET", "/project-templates")).json(), as("seema"))).statusCode).toBe(403);

    // Someone saved under the old "manager" role signs in as Sales.
    await deps.db.collection("members").insertOne({ _id: "legacy", email: "old@gmail.com", name: "Old", role: "manager", title: "—", status: "active", addedAt: "2026-01-01T00:00:00Z" } as never);
    expect((await call("GET", "/me", undefined, as("old"))).json().role).toBe("sales");
  }, 60_000);

  it("saves setup progress and keeps integration secrets write-only, admins only", async () => {
    expect((await call("PUT", "/setup/progress", { done: ["g-project", "g-project", "m-business"] })).json().done).toEqual(["g-project", "m-business"]);
    expect((await call("GET", "/setup/progress")).json().done).toHaveLength(2);
    const secret = "GOCSPX-abcdefghijklmnopqrstuvwx";
    const saved = (await call("PUT", "/setup/keys", { googleClientId: "123-abc.apps.googleusercontent.com", googleClientSecret: secret })).json();
    expect(saved).toMatchObject({ googleClientId: "123-abc.apps.googleusercontent.com", googleClientSecretSaved: true, instagramAppId: "", instagramAppSecretSaved: false, metaAppSecretSaved: false });
    expect(JSON.stringify((await call("GET", "/setup/keys")).json())).not.toContain(secret); // never read back
    expect((await call("PUT", "/setup/keys", { googleClientId: "" })).json().googleClientId).toBe("123-abc.apps.googleusercontent.com"); // blank keeps it
    expect((await call("PUT", "/setup/keys", { metaAppSecret: "nope" })).statusCode).toBe(400);
    await call("POST", "/members", { email: "setup-member@gmail.com" });
    expect((await call("GET", "/setup/keys", undefined, "ok:setup-member@gmail.com")).statusCode).toBe(403);
  });

  it("connects Instagram through the client's own app and turns DMs into routed conversations", async () => {
    const igSecret = "a".repeat(32), metaSecret = "b".repeat(32);
    expect((await call("POST", "/integrations/instagram/start", { origin: "https://crm.example.com" })).statusCode).toBe(409); // keys first
    await call("PUT", "/setup/keys", { instagramAppId: "1234567890", instagramAppSecret: igSecret, metaAppSecret: metaSecret });
    const { webhookVerifyToken } = (await call("GET", "/setup/keys")).json();
    expect(webhookVerifyToken).toMatch(/^[\w-]{20,}$/);

    // Meta's one-time check of the webhook address (no CRM login involved).
    const check = await app.inject({ url: `/api/integrations/instagram/webhook?hub.mode=subscribe&hub.verify_token=${webhookVerifyToken}&hub.challenge=4242` });
    expect([check.statusCode, check.body]).toEqual([200, "4242"]);
    expect((await app.inject({ url: "/api/integrations/instagram/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1" })).statusCode).toBe(403);

    // Connect: start → Instagram → callback with a one-time state.
    const { url } = (await call("POST", "/integrations/instagram/start", { origin: "https://crm.example.com" })).json();
    const u = new URL(url);
    expect(u.searchParams.get("client_id")).toBe("1234567890");
    expect(u.searchParams.get("redirect_uri")).toBe("https://crm.example.com/api/integrations/instagram/callback");
    const state = u.searchParams.get("state")!;
    const back = await app.inject({ url: `/api/integrations/instagram/callback?code=abc&state=${state}` });
    expect(back.statusCode).toBe(302);
    expect(back.headers.location).toBe("https://crm.example.com/settings/integrations?setup=meta&instagram=connected");
    expect(igCalls).toContain("POST https://graph.instagram.com/me/subscribed_apps");
    expect((await app.inject({ url: `/api/integrations/instagram/callback?code=abc&state=${state}` })).statusCode).toBe(400); // state is one-time
    const status = (await call("GET", "/integrations")).json();
    expect(status.instagram).toMatchObject({ connected: true, username: "theoysterstudios" });
    expect(JSON.stringify(status)).not.toContain("LONG-SECRET-TOKEN");

    // Lead routing: Instagram leads go to the admin.
    const meId = (await call("GET", "/me")).json().id;
    await call("PUT", "/routing", { rules: [{ id: "r-ig", channel: "instagram", ownerId: meId }] });

    const post = (body: object, secret = metaSecret) => {
      const raw = JSON.stringify(body);
      const sig = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
      return app.inject({ method: "POST", url: "/api/integrations/instagram/webhook", payload: raw, headers: { "content-type": "application/json", "x-hub-signature-256": sig } });
    };
    const dm = (mid: string, text: string, echo = false) => ({
      object: "instagram",
      entry: [{ id: "17841400000000001", time: 1, messaging: [{ sender: { id: echo ? "17841400000000001" : "IGSID-RIYA" }, recipient: { id: echo ? "IGSID-RIYA" : "17841400000000001" }, timestamp: 1791900000000, message: { mid, text, ...(echo && { is_echo: true }) } }] }],
    });
    expect((await post(dm("m1", "Hi! Can you share a quote for a product shoot?"), "c".repeat(32))).statusCode).toBe(401); // forged
    expect((await post(dm("m1", "Hi! Can you share a quote for a product shoot?"))).json()).toEqual({ stored: 1 });
    expect((await post(dm("m1", "Hi! Can you share a quote for a product shoot?"))).json()).toEqual({ stored: 0 }); // Meta retried
    expect((await post(dm("m2", "Sure — sending details now", true), igSecret)).json()).toEqual({ stored: 1 }); // sent from Instagram, signed with the other secret

    const [conv] = (await call("GET", "/conversations")).json();
    expect(conv).toMatchObject({ channel: "instagram", name: "Riya Mehta", handle: "@riya.m", assigneeId: meId, unread: true });
    expect(conv.messages.map((m: { direction: string }) => m.direction)).toEqual(["in", "out"]);
    expect(conv.externalId).toBeUndefined();
    expect((await call("PATCH", `/conversations/${conv.id}`, { unread: false, dealId: "d-1" })).json()).toMatchObject({ unread: false, dealId: "d-1" });
    expect((await call("PATCH", `/conversations/${conv.id}`, { dealId: null })).json().dealId).toBeUndefined();
  });

  it("renews the Instagram token only when it's due", async () => {
    const col = deps.db.collection<{ _id: string; tokenIssuedAt: string; tokenExpiresAt: string; accessToken: string }>("integrations");
    const day = 86_400_000, now = new Date("2026-12-01T00:00:00Z");
    await col.updateOne({ _id: "instagram" }, { $set: { tokenIssuedAt: new Date(+now - 2 * day).toISOString(), tokenExpiresAt: new Date(+now + 50 * day).toISOString() } });
    expect(await refreshToken(deps.db, fakeInstagram, now)).toBe("not-due"); // 50 days left
    await col.updateOne({ _id: "instagram" }, { $set: { tokenExpiresAt: new Date(+now + 10 * day).toISOString() } });
    expect(await refreshToken(deps.db, fakeInstagram, now)).toBe("refreshed");
    expect((await col.findOne({ _id: "instagram" }))!.tokenIssuedAt).toBe(now.toISOString());
  });

  it("connects Google accounts and turns outside emails and new bookings into routed leads", async () => {
    const meId = (await call("GET", "/me")).json().id;
    await call("PUT", "/routing", { rules: [{ id: "r-mail", channel: "gmail", ownerId: meId }] });
    await call("POST", "/members", { email: "teammate@gmail.com" });

    // Any teammate can start; Google returns to a one-time link.
    const { url } = (await call("POST", "/integrations/google/start", { origin: "https://crm.example.com" }, "ok:teammate@gmail.com")).json();
    const u = new URL(url);
    expect(u.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly");
    expect(u.searchParams.get("access_type")).toBe("offline");
    const back = await app.inject({ url: `/api/integrations/google/callback?code=c1&state=${u.searchParams.get("state")}` });
    expect(back.headers.location).toBe("https://crm.example.com/settings/integrations?google=connected&detail=studio%40theoysterstudios.com");
    const status = (await call("GET", "/integrations")).json().google;
    expect(status).toMatchObject({ ready: true, accounts: [{ email: "studio@theoysterstudios.com" }] });
    expect(JSON.stringify(status)).not.toMatch(/G-REFRESH|G-ACCESS/);

    // Unticking a permission on Google's screen is caught.
    g.scope = "https://www.googleapis.com/auth/gmail.readonly";
    const { url: url2 } = (await call("POST", "/integrations/google/start", { origin: "https://crm.example.com" })).json();
    const back2 = await app.inject({ url: `/api/integrations/google/callback?code=c2&state=${new URL(url2).searchParams.get("state")}` });
    expect(back2.headers.location).toContain("google=error");
    g.scope = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly";

    // Mail since the last check: a new lead, a newsletter, a colleague, and our reply.
    await call("POST", "/contacts", { name: "Asha Rao", email: "asha@client.in", ownerId: meId, source: "referral" });
    g.messages = {
      a: gmailMsg("a", "Riya Mehta <riya@halcyon.in>", { subject: "Shoot for our hotel", body: "Hi, can you quote a 2-day shoot?\n\nOn Mon, someone wrote:\n> old" }),
      b: gmailMsg("b", "News <news@brand.com>", { extra: [{ name: "List-Unsubscribe", value: "<mailto:x>" }] }),
      c: gmailMsg("c", "Kabir <kabir@theoysterstudios.com>"),
      d: gmailMsg("d", "studio@theoysterstudios.com", { label: "SENT", to: "Riya Mehta <riya@halcyon.in>", body: "Sure, sending a quote today." }),
    };
    g.history = ["a", "b", "c", "d"].map((id) => ({ id, labelIds: [id === "d" ? "SENT" : "INBOX"] }));
    g.events = [];
    expect(await syncGoogle(deps.db, fakeGoogle)).toEqual({ accounts: 1, stored: 2 }); // lead + our reply
    let convs = (await call("GET", "/conversations")).json();
    const riya = convs.find((c: { handle: string }) => c.handle === "riya@halcyon.in");
    expect(riya).toMatchObject({ channel: "gmail", name: "Riya Mehta", subject: "Shoot for our hotel", assigneeId: meId, unread: true, gmailThread: { account: "studio@theoysterstudios.com", threadId: "t-a" } });
    expect(riya.messages.map((m: { direction: string; body: string }) => [m.direction, m.body])).toEqual([["in", "Hi, can you quote a 2-day shoot?"], ["out", "Sure, sending a quote today."]]);
    expect(convs.some((c: { handle: string }) => /brand|kabir/.test(c.handle))).toBe(false);
    expect(await syncGoogle(deps.db, fakeGoogle)).toEqual({ accounts: 1, stored: 0 }); // same mail again → nothing new

    // Calendar: the first check only starts tracking; then a booking from someone new, and a meeting with a contact.
    g.history = [];
    g.events = [
      { id: "e1", status: "confirmed", summary: "Discovery call", created: "2026-10-14T09:00:00Z", start: { dateTime: "2099-01-10T10:00:00+05:30" }, attendees: [{ email: "studio@theoysterstudios.com", self: true }, { email: "New.Person@startup.io", displayName: "Neel" }] },
      { id: "e2", status: "confirmed", summary: "Review", start: { dateTime: "2099-01-11T10:00:00+05:30" }, attendees: [{ email: "asha@client.in" }] },
    ];
    expect((await syncGoogle(deps.db, fakeGoogle)).stored).toBe(2);
    convs = (await call("GET", "/conversations")).json();
    expect(convs.find((c: { handle: string }) => c.handle === "new.person@startup.io")).toMatchObject({ channel: "calendar", name: "Neel", subject: "Discovery call" });
    expect((await call("GET", "/activities")).json().some((a: { type: string; text: string }) => a.type === "meeting" && a.text.includes("Asha Rao"))).toBe(true);

    // An expired access token is renewed with the refresh token.
    await deps.db.collection("googleAccounts").updateOne({ _id: "studio@theoysterstudios.com" } as never, { $set: { accessTokenExpiresAt: "2000-01-01T00:00:00Z" } });
    g.calls.length = 0;
    await syncGoogle(deps.db, fakeGoogle);
    expect(g.calls).toContain("POST https://oauth2.googleapis.com/token");

    // Disconnect: not by someone else's teammate; yes by an admin, and Google access is withdrawn.
    await call("POST", "/members", { email: "other@gmail.com" });
    expect((await call("DELETE", "/integrations/google/studio@theoysterstudios.com", undefined, "ok:other@gmail.com")).statusCode).toBe(403);
    expect((await call("DELETE", "/integrations/google/studio@theoysterstudios.com")).statusCode).toBe(204);
    expect(g.calls).toContain("POST https://oauth2.googleapis.com/revoke");
  }, 60_000); // many round trips against real Firestore

  it("never leaves the team without an admin", async () => {
    const adminId = (await call("GET", "/me")).json().id;
    expect((await call("DELETE", `/members/${adminId}`)).statusCode).toBe(409);
    expect((await call("PATCH", `/members/${adminId}`, { role: "sales" })).statusCode).toBe(409);
  });
});

describe("Cloud Functions mode", () => {
  it("reads JSON bodies the platform already parsed", async () => {
    const fn = buildApp({ ...deps, verify, preParsedBody: true });
    await fn.ready();
    // Like Cloud Functions: read + parse the body first, then hand the request to Fastify.
    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c)).on("end", () => {
        (req as { body?: unknown }).body = raw ? JSON.parse(raw) : undefined;
        fn.routing(req, res);
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const res = await fetch(`http://localhost:${(server.address() as AddressInfo).port}/api/companies`, {
      method: "POST",
      headers: { authorization: `Bearer ok:${ADMIN}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Lumen Skincare", ownerId: "sr" }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ name: "Lumen Skincare" });
    server.close();
    await fn.close();
  });
});

describe("api", () => {
  let c1 = "";
  const studio = { studioName: "The Oyster Studios", legalName: "The Oyster Studios LLP", gstin: "29ABCDE1234F1Z5", address: "Bengaluru" };
  beforeAll(async () => {
    c1 = (await call("POST", "/companies", { name: "Cirrus Travel", ownerId: "sr" })).json().id;
  });

  it("keeps workspace details; only admins change them; invoices need them and keep a copy", async () => {
    expect((await call("GET", "/workspace")).json()).toMatchObject({ studioName: "The Oyster Studios", gstin: "" });
    const inv = { companyId: c1, dueAt: "2026-11-13T00:00:00+05:30", supply: "intra", lines: [{ desc: "x", sac: "998391", qty: 1, ratePaise: 100 }] };
    expect((await call("POST", "/invoices", inv)).statusCode).toBe(422); // no GSTIN yet
    expect((await call("PUT", "/workspace", { ...studio, gstin: "bad" })).statusCode).toBe(400);
    await call("POST", "/members", { email: "member@gmail.com" });
    expect((await call("PUT", "/workspace", studio, "ok:member@gmail.com")).statusCode).toBe(403);
    expect((await call("PUT", "/workspace", { ...studio, instagramHandle: "theoysterstudios" })).json().instagramHandle).toBe("@theoysterstudios");
    const created = (await call("POST", "/invoices", inv)).json();
    expect(created.seller).toEqual({ legalName: studio.legalName, gstin: studio.gstin, address: studio.address });
    expect(created.buyer).toMatchObject({ name: "Cirrus Travel", address: "" });
    await call("PATCH", `/companies/${c1}`, { address: "4 MG Road, Pune 411001", gstin: "27ABCDE1234F1Z5" });
    const after = (await call("POST", "/invoices", inv)).json();
    expect(after.buyer).toEqual({ name: "Cirrus Travel", gstin: "27ABCDE1234F1Z5", address: "4 MG Road, Pune 411001", city: "" });
    expect((await call("PATCH", `/companies/${c1}`, { gstin: "" })).json().gstin).toBe(""); // can be cleared
    expect((await call("GET", "/invoices")).json().find((i: { id: string }) => i.id === after.id).buyer.gstin).toBe("27ABCDE1234F1Z5"); // issued copy kept
    await call("PUT", "/workspace", { ...studio, address: "New address" });
    expect((await call("GET", "/invoices")).json().find((i: { id: string }) => i.id === created.id).seller.address).toBe("Bengaluru");
  });

  it("refuses invoices for unknown companies or someone else's deal", async () => {
    const inv = { companyId: "nope", dueAt: "2026-11-13T00:00:00+05:30", supply: "intra", lines: [{ desc: "x", sac: "998391", qty: 1, ratePaise: 1 }] };
    expect((await call("POST", "/invoices", inv)).statusCode).toBe(422);
    const other = (await call("POST", "/companies", { name: "Other", ownerId: "sr" })).json().id;
    const deal = (await call("POST", "/deals", { title: "D", companyId: other, valuePaise: 1, closeAt: "2026-11-30T00:00:00+05:30", ownerId: "sr", channel: "web" })).json().id;
    expect((await call("POST", "/invoices", { ...inv, companyId: c1, dealId: deal })).statusCode).toBe(422);
  });

  it("creates, lists and patches deals; validates input", async () => {
    const bad = await call("POST", "/deals", { title: "", valuePaise: 1.5 });
    expect(bad.statusCode).toBe(400);
    const res = await call("POST", "/deals", { title: "Rebrand", companyId: "c1", valuePaise: 360000000, closeAt: "2026-11-30T00:00:00+05:30", ownerId: "sr", channel: "web" });
    expect(res.statusCode).toBe(201);
    const deal = res.json();
    expect(deal).toMatchObject({ stage: "new", health: "ok" });
    const patched = await call("PATCH", `/deals/${deal.id}`, { stage: "proposal", _id: "hijack" });
    expect(patched.json()).toMatchObject({ id: deal.id, stage: "proposal" });
    const listed = (await call("GET", "/deals?stage=proposal")).json() as { id: string; stage: string }[];
    expect(listed.map((d) => d.id)).toContain(deal.id);
    expect(listed.every((d) => d.stage === "proposal")).toBe(true);
  });

  it("keeps contact emails unique", async () => {
    const c = { name: "Asha", email: "Asha@Example.com", ownerId: "sr", source: "gmail" };
    expect((await call("POST", "/contacts", c)).json().email).toBe("asha@example.com");
    expect((await call("POST", "/contacts", c)).statusCode).toBe(409);
    expect((await call("POST", "/contacts", { name: "No email", ownerId: "sr", source: "web" })).statusCode).toBe(201);
    expect((await call("POST", "/contacts", { name: "No email 2", ownerId: "sr", source: "web" })).statusCode).toBe(201);
  });

  it("numbers invoices consecutively per financial year, even under concurrency", async () => {
    await Promise.all(["counters", "invoices"].map((c) => deps.db.collection(c).deleteMany({}))); // start this year at 001
    const inv = { companyId: c1, issuedAt: "2026-10-14T10:00:00+05:30", dueAt: "2026-11-13T00:00:00+05:30", supply: "intra", lines: [{ desc: "Shoot", sac: "998391", qty: 1, ratePaise: 100000 }] };
    const results = await Promise.all(Array.from({ length: 20 }, () => call("POST", "/invoices", inv)));
    const numbers = results.map((r) => r.json().number).sort();
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => `TOS/26-27/${String(i + 1).padStart(3, "0")}`));
    // A new financial year restarts at 001.
    expect((await call("POST", "/invoices", { ...inv, issuedAt: "2027-04-01T00:30:00+05:30" })).json().number).toBe("TOS/27-28/001");
  }, 60_000); // 20 contended transactions take several seconds against real Firestore

  it("sends invoices and records payments without overpaying", async () => {
    // ₹1,000 + 18% GST = ₹1,180 = 118000 paise
    const inv = (await call("POST", "/invoices", { companyId: c1, dueAt: "2026-11-13T00:00:00+05:30", supply: "inter", lines: [{ desc: "Shoot", sac: "998391", qty: 1, ratePaise: 100000 }] })).json();
    expect((await call("POST", `/invoices/${inv.id}/payments`, { amountPaise: 1000 })).statusCode).toBe(409); // not sent yet
    expect((await call("POST", `/invoices/${inv.id}/send`)).json().sent).toBe(true);
    expect((await call("POST", `/invoices/${inv.id}/payments`, { amountPaise: 0 })).statusCode).toBe(400);
    expect((await call("POST", `/invoices/${inv.id}/payments`, { amountPaise: 100000 })).json().payments).toHaveLength(1);
    expect((await call("POST", `/invoices/${inv.id}/payments`, { amountPaise: 18001 })).statusCode).toBe(409); // ₹180.01 > ₹180 due
    expect((await call("POST", `/invoices/${inv.id}/payments`, { amountPaise: 18000 })).json().payments).toHaveLength(2);
  });

  it("cancels drafts only, keeping them on record", async () => {
    const inv = { companyId: c1, dueAt: "2026-11-13T00:00:00+05:30", supply: "intra", lines: [{ desc: "x", sac: "998391", qty: 1, ratePaise: 100 }] };
    const draft = (await call("POST", "/invoices", inv)).json();
    expect((await call("POST", `/invoices/${draft.id}/cancel`, { reason: "" })).statusCode).toBe(400);
    expect((await call("POST", `/invoices/${draft.id}/cancel`, { reason: "Wrong client" })).json()).toMatchObject({ cancelled: true, cancelReason: "Wrong client" });
    expect((await call("POST", `/invoices/${draft.id}/send`)).statusCode).toBe(404); // can't send a cancelled one
    expect((await call("GET", "/invoices")).json().some((i: { id: string }) => i.id === draft.id)).toBe(true); // still listed
    const sent = (await call("POST", "/invoices", inv)).json();
    await call("POST", `/invoices/${sent.id}/send`);
    expect((await call("POST", `/invoices/${sent.id}/cancel`, { reason: "Changed mind" })).statusCode).toBe(409);
  });

  it("edits drafts only, and credits sent invoices in their own series", async () => {
    const inv = { companyId: c1, dueAt: "2026-11-13T00:00:00+05:30", supply: "intra", lines: [{ desc: "Shoot", sac: "998391", qty: 1, ratePaise: 100000 }] };
    const draft = (await call("POST", "/invoices", inv)).json();
    const edited = (await call("PATCH", `/invoices/${draft.id}`, { lines: [{ desc: "Shoot, 2 days", sac: "998391", qty: 2, ratePaise: 100000 }], companyId: "ignored" })).json();
    expect(edited).toMatchObject({ companyId: c1, lines: [{ desc: "Shoot, 2 days", qty: 2 }] });
    await call("PATCH", `/companies/${c1}`, { address: "New office, Pune" });
    const sent = (await call("POST", `/invoices/${draft.id}/send`)).json();
    expect(sent.buyer.address).toBe("New office, Pune"); // details re-captured at issue
    expect((await call("PATCH", `/invoices/${draft.id}`, { dueAt: "2026-12-01T00:00:00+05:30" })).statusCode).toBe(409);

    // ₹2,000 + 9% + 9% = ₹2,360. Credit ₹500 (+GST = ₹590).
    expect((await call("POST", `/invoices/${(await call("POST", "/invoices", inv)).json().id}/credit-notes`, { amountPaise: 100, reason: "x" })).statusCode).toBe(409); // draft
    const cn = (await call("POST", `/invoices/${draft.id}/credit-notes`, { amountPaise: 50000, reason: "One day cancelled" })).json();
    expect(cn.creditNote.number).toMatch(/^TOS\/CN\/\d\d-\d\d\/001$/);
    expect(cn.invoice.credits[0]).toMatchObject({ taxablePaise: 50000, totalPaise: 59000 });
    expect((await call("POST", `/invoices/${draft.id}/credit-notes`, { amountPaise: 150001, reason: "too much" })).statusCode).toBe(409); // only ₹1,500 left
    expect((await call("POST", `/invoices/${draft.id}/payments`, { amountPaise: 236000 - 59000 + 1 })).statusCode).toBe(409); // can't overpay what's left
    expect((await call("GET", "/credit-notes")).json()[0].invoiceNumber).toBe(draft.number);
  });

  it("tags records with a business; invoices take it from their deal", async () => {
    const d = (await call("POST", "/deals", { title: "Wedding — Riya & Arjun", companyId: c1, valuePaise: 1, closeAt: "2026-12-01T00:00:00+05:30", ownerId: "sr", channel: "instagram", business: "photography" })).json();
    expect(d.business).toBe("photography");
    expect((await call("POST", "/deals", { title: "x", companyId: c1, valuePaise: 1, closeAt: "2026-12-01T00:00:00+05:30", ownerId: "sr", channel: "web", business: "bakery" })).statusCode).toBe(400);
    const inv = (await call("POST", "/invoices", { companyId: c1, dealId: d.id, dueAt: "2026-12-01T00:00:00+05:30", supply: "intra", lines: [{ desc: "x", sac: "998391", qty: 1, ratePaise: 100 }] })).json();
    expect(inv.business).toBe("photography");
    expect((await call("PATCH", `/deals/${d.id}`, { business: "marketing" })).json().business).toBe("marketing");
  });

  it("keeps a pipeline per business; deals must use their business's stages; lead details and follow-ups", async () => {
    expect((await call("GET", "/pipelines")).json().photography.map((x: { label: string }) => x.label)).toEqual(["New lead", "Contacted", "Qualified", "Proposal sent", "Negotiation", "Confirmed", "Lost"]);
    const base = { title: "Social media retainer", companyId: c1, valuePaise: 1, closeAt: "2026-12-01T00:00:00+05:30", ownerId: "sr", channel: "phone" };
    // Marketing gets its own stages.
    const pipes = (await call("GET", "/pipelines")).json();
    const marketing = [{ id: "new", label: "Enquiry", kind: "open", probability: 0.1 }, { id: "pitch", label: "Pitch sent", kind: "open", probability: 0.5 }, { id: "won", label: "Signed", kind: "won", probability: 1 }, { id: "lost", label: "Lost", kind: "lost", probability: 0 }];
    expect((await call("PUT", "/pipelines", { ...pipes, marketing: marketing.filter((x) => x.kind !== "won") })).statusCode).toBe(400); // needs a won stage
    expect((await call("PUT", "/pipelines", { ...pipes, marketing })).statusCode).toBe(200);
    expect((await call("POST", "/deals", { ...base, business: "marketing", stage: "contacted" })).statusCode).toBe(422); // not in marketing's list
    const d = (await call("POST", "/deals", { ...base, business: "marketing", stage: "pitch", service: "Social media management", location: "Pune", requirements: "3 posts a week", nextFollowUpAt: "2026-10-21T10:00:00+05:30" })).json();
    expect(d).toMatchObject({ stage: "pitch", service: "Social media management", location: "Pune", nextFollowUpAt: "2026-10-21T10:00:00+05:30" });
    expect((await call("PATCH", `/deals/${d.id}`, { nextFollowUpAt: null })).json().nextFollowUpAt).toBeUndefined(); // follow-up done
    expect((await call("PATCH", `/deals/${d.id}`, { stage: "won" })).json().wonAt).toBeTruthy(); // reaching "Signed" records when
    // A stage that still has deals can't be removed.
    const pitching = (await call("POST", "/deals", { ...base, business: "marketing", stage: "pitch" })).json();
    const removed = await call("PUT", "/pipelines", { ...pipes, marketing: marketing.filter((x) => x.id !== "pitch") });
    expect([removed.statusCode, removed.json().error]).toEqual([409, '1 marketing deal is still in "Pitch sent" — move it before removing that stage']);
    await call("PATCH", `/deals/${pitching.id}`, { stage: "new" });
    expect((await call("PUT", "/pipelines", { ...pipes, marketing: marketing.filter((x) => x.id !== "pitch") })).statusCode).toBe(200);
    // Photography deals keep the client's list, including the new "Contacted" stage.
    expect((await call("POST", "/deals", { ...base, business: "photography", stage: "contacted", eventDate: "2027-02-14" })).json().eventDate).toBe("2027-02-14");
    await call("PUT", "/pipelines", pipes);
  });

  it("makes a company a client when one of its deals is confirmed; keeps file links", async () => {
    const co = (await call("POST", "/companies", { name: "Riya & Arjun", ownerId: "sr", business: "photography" })).json();
    expect(co.clientSince).toBeUndefined();
    const d = (await call("POST", "/deals", { title: "Wedding photography", companyId: co.id, valuePaise: 1, closeAt: "2027-02-14T00:00:00+05:30", ownerId: "sr", channel: "instagram", business: "photography", stage: "proposal" })).json();
    expect((await call("GET", `/companies/${co.id}`)).json().clientSince).toBeUndefined();
    await call("PATCH", `/deals/${d.id}`, { stage: "won" });
    const since = (await call("GET", `/companies/${co.id}`)).json().clientSince;
    expect(since).toBeTruthy();
    // A second confirmed deal doesn't move the "client since" date.
    const d2 = (await call("POST", "/deals", { title: "Album", companyId: co.id, valuePaise: 1, closeAt: "2027-03-01T00:00:00+05:30", ownerId: "sr", channel: "instagram", business: "photography", stage: "won" })).json();
    expect(d2.wonAt).toBeTruthy();
    expect((await call("GET", `/companies/${co.id}`)).json().clientSince).toBe(since);
    expect((await call("PATCH", `/companies/${co.id}`, { links: [{ label: "Drive folder", url: "https://drive.google.com/drive/folders/abc" }] })).json().links).toHaveLength(1);
    expect((await call("PATCH", `/companies/${co.id}`, { links: [{ label: "Bad", url: "drive folder" }] })).statusCode).toBe(400);
  });

  it("starts one project with its checklist when a lead is confirmed; tasks take status, comments and approval", async () => {
    const co = (await call("POST", "/companies", { name: "Meera & Kabir", ownerId: "sr", business: "photography" })).json();
    const d = (await call("POST", "/deals", { title: "Meera & Kabir wedding", companyId: co.id, valuePaise: 1, closeAt: "2027-02-14T00:00:00+05:30", ownerId: "sr", channel: "instagram", business: "photography", stage: "proposal", eventDate: "2027-02-14", location: "Udaipur" })).json();
    await call("PATCH", `/deals/${d.id}`, { stage: "won" });
    await call("PATCH", `/deals/${d.id}`, { stage: "won", title: "Meera & Kabir wedding" }); // saving again doesn't start a second project
    const projects = (await call("GET", `/projects?dealId=${d.id}`)).json();
    expect(projects).toHaveLength(1);
    const p = projects[0];
    expect(p).toMatchObject({ name: "Meera & Kabir wedding", business: "photography", companyId: co.id, managerId: "sr", status: "active", dueDate: "2027-02-14" });
    expect(p.events).toEqual([{ id: "e1", name: "Wedding", date: "2027-02-14", venue: "Udaipur" }]);
    expect(p.deliverables[0]).toMatchObject({ name: "Edited photos", dueDate: "2027-02-28", status: "pending" });
    const tasks = (await call("GET", `/tasks?projectId=${p.id}`)).json();
    expect(tasks).toHaveLength(13);
    const day = tasks.find((t: { title: string }) => t.title === "Wedding day coverage");
    expect(day).toMatchObject({ dueAt: "2027-02-14T18:00:00+05:30", priority: "urgent", status: "todo", assigneeId: "sr" });
    expect((await call("PATCH", `/tasks/${day.id}`, { status: "done" })).json().done).toBe(true);
    expect((await call("PATCH", `/tasks/${day.id}`, { done: false })).json().status).toBe("todo");
    const c = (await call("POST", `/tasks/${day.id}/comments`, { body: "Second shooter confirmed" })).json();
    expect(c.comments).toHaveLength(1);
    expect((await call("POST", `/tasks/${day.id}/comments`, { body: " " })).statusCode).toBe(400);
    expect((await call("PATCH", `/projects/${p.id}`, { crew: [{ memberId: "sr", role: "Lead photographer" }], calendarUrl: "not a link" })).statusCode).toBe(400);
    expect((await call("PATCH", `/projects/${p.id}`, { crew: [{ memberId: "sr", role: "Lead photographer" }] })).json().crew).toHaveLength(1);
    // Admins change the checklist new projects start with.
    const t = (await call("GET", "/project-templates")).json();
    expect(t.marketing.tasks.length).toBeGreaterThan(0);
    const next = { ...t, marketing: { tasks: [{ title: "Onboarding", from: "confirmed", days: 1, priority: "high" }], deliverables: [] } };
    expect((await call("PUT", "/project-templates", next)).statusCode).toBe(200);
    const m = (await call("POST", "/deals", { title: "Café retainer", companyId: co.id, valuePaise: 1, closeAt: "2027-02-14T00:00:00+05:30", ownerId: "sr", channel: "web", business: "marketing", stage: "won" })).json();
    const mp = (await call("GET", `/projects?dealId=${m.id}`)).json()[0];
    expect(mp.events).toEqual([]);
    expect((await call("GET", `/tasks?projectId=${mp.id}`)).json().map((x: { title: string }) => x.title)).toEqual(["Onboarding"]);
  });

  it("deletes records and keeps a deal's board position", async () => {
    const d = (await call("POST", "/deals", { title: "Film", companyId: "c1", valuePaise: 1, closeAt: "2026-11-30T00:00:00+05:30", ownerId: "sr", channel: "web", position: 3 })).json();
    expect(d.position).toBe(3);
    expect((await call("DELETE", `/deals/${d.id}`)).statusCode).toBe(204);
    expect((await call("DELETE", `/deals/${d.id}`)).statusCode).toBe(404);
  });

  it("saves tasks and completes them", async () => {
    const t = (await call("POST", "/tasks", { title: "Send moodboard", dueAt: "2026-10-20T10:00:00+05:30", assigneeId: "sr" })).json();
    expect(t).toMatchObject({ title: "Send moodboard", done: false, remind: false });
    expect((await call("PATCH", `/tasks/${t.id}`, { done: true, doneAt: "2026-10-15T10:00:00+05:30" })).json().done).toBe(true);
    expect((await call("PATCH", `/tasks/${t.id}`, { done: false, doneAt: null })).json().doneAt).toBeUndefined(); // cleared
    expect((await call("POST", "/tasks", { title: "", dueAt: "2026-10-20T10:00:00+05:30", assigneeId: "sr" })).statusCode).toBe(400);
  });

  it("logs activity as the signed-in person; only the author can remove it", async () => {
    const me = (await call("GET", "/me")).json();
    const a = (await call("POST", "/activities", { type: "note", dealId: "d1", text: "added a note", body: "Prefers Thursday", actorId: "someone-else", at: "2000-01-01T00:00:00Z" })).json();
    expect(a).toMatchObject({ type: "note", actorId: me.id, body: "Prefers Thursday" });
    expect(a.at).not.toBe("2000-01-01T00:00:00Z");
    expect((await call("GET", "/activities?dealId=d1")).json().map((x: { id: string }) => x.id)).toContain(a.id);
    await call("POST", "/members", { email: "colleague@gmail.com" });
    expect((await call("DELETE", `/activities/${a.id}`, undefined, "ok:colleague@gmail.com")).statusCode).toBe(404);
    expect((await call("DELETE", `/activities/${a.id}`)).statusCode).toBe(204);
  });

  it("splits financial years at 1 April IST", () => {
    expect(financialYear(new Date("2027-03-31T18:29:00Z"))).toBe("26-27"); // 23:59 IST, 31 Mar
    expect(financialYear(new Date("2027-03-31T18:31:00Z"))).toBe("27-28"); // 00:01 IST, 1 Apr
    expect(financialYear(new Date("2099-12-01T00:00:00Z"))).toBe("99-00");
  });
});
