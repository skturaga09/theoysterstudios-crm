import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { ensureAdmin, type Verify } from "./auth";
import { connect } from "./db";
import { financialYear } from "./invoices";

const ADMIN = "owner@theoysterstudios.in";
const SUPPORT = "dev@gmail.com";
/** Stand-in for Google: "ok:<email>" is a verified sign-in, "unverified:<email>" isn't, anything else is a bad token. */
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
  if (process.env.TEST_MONGODB_URI) await Promise.all(["companies", "contacts", "deals", "invoices", "counters", "members", "workspace", "tasks", "activities", "routing"].map((c) => db.collection(c).deleteMany({})));
  await ensureAdmin(db, ADMIN);
  deps = { db, client, supportEmails: [SUPPORT] };
  app = buildApp({ ...deps, verify });
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
    const added = await call("POST", "/members", { email: " Riya@Gmail.com ", role: "member" });
    expect(added.statusCode).toBe(201);
    const id = added.json().id;
    expect(added.json()).toMatchObject({ email: riya, name: "Riya", status: "invited" });
    expect((await call("POST", "/members", { email: riya })).statusCode).toBe(409);
    expect((await call("GET", "/me", undefined, `ok:${riya}`)).json().status).toBe("active");
    // Members can't manage the team.
    expect((await call("POST", "/members", { email: "x@gmail.com" }, `ok:${riya}`)).statusCode).toBe(403);
    expect((await call("PATCH", `/members/${id}`, { role: "manager" })).json().role).toBe("manager");
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

  it("never leaves the team without an admin", async () => {
    const adminId = (await call("GET", "/me")).json().id;
    expect((await call("DELETE", `/members/${adminId}`)).statusCode).toBe(409);
    expect((await call("PATCH", `/members/${adminId}`, { role: "member" })).statusCode).toBe(409);
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
    expect((await call("GET", "/deals?stage=proposal")).json()).toHaveLength(1);
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
    expect((await call("PATCH", `/tasks/${t.id}`, { done: false, doneAt: null })).json().doneAt).toBeNull();
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
