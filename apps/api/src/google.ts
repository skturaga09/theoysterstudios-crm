/**
 * Gmail and Calendar through the client's own Google Cloud project (Internal OAuth client, read-only scopes).
 * Each person connects their own account; a shared inbox (enquiry@) is connected by whoever signs in to it.
 * A scheduled job checks every connected account each minute: new outside emails and new meetings with unknown
 * people become Inbox leads, routed by the lead rules. Nothing is ever sent, deleted or changed in Google.
 */
import { routeLead, type RoutingRule } from "@pinnacle/shared";
import { MongoServerError, ObjectId, type Db } from "mongodb";
import type { Doc } from "./db";
import type { Fetch } from "./instagram";

export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/calendar.readonly"];
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export type GoogleKeys = { googleClientId?: string; googleClientSecret?: string };

/** One connected Google account. Tokens are server-only — never returned by the API. */
export type GoogleAccount = {
  _id: string; // the account's email
  email: string;
  refreshToken: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  historyId?: string;
  calendarSyncToken?: string;
  connectedBy: string;
  connectedAt: string;
  lastSyncAt?: string;
  error?: string;
};

export function googleAuthorizeUrl(clientId: string, redirectUri: string, state: string) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", // a refresh token, so syncing keeps working after the hour-long access token ends
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

const json = async (res: Response) => {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = body.error as { message?: string } | string | undefined;
    throw Object.assign(new Error(typeof err === "string" ? `${err}: ${body.error_description ?? ""}` : (err?.message ?? `Google returned ${res.status}`)), { status: res.status });
  }
  return body;
};

/** Code → tokens → which account it is (via Gmail, so no extra scope is needed). */
export async function exchangeGoogleCode(f: Fetch, keys: Required<GoogleKeys>, redirectUri: string, code: string) {
  const t = await json(
    await f("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({ client_id: keys.googleClientId, client_secret: keys.googleClientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
    }),
  );
  if (!t.refresh_token) throw new Error("Google didn't grant ongoing access — try connecting again");
  const scopes = String(t.scope ?? "");
  if (!GOOGLE_SCOPES.every((s) => scopes.includes(s))) throw new Error("Both Gmail and Calendar access are needed — tick both boxes on Google's screen");
  const profile = await json(await f(`${GMAIL}/profile`, { headers: { authorization: `Bearer ${t.access_token}` } }));
  return {
    email: String(profile.emailAddress).toLowerCase(),
    historyId: String(profile.historyId),
    refreshToken: String(t.refresh_token),
    accessToken: String(t.access_token),
    accessTokenExpiresAt: new Date(Date.now() + Number(t.expires_in ?? 3600) * 1000).toISOString(),
  };
}

/** A valid access token for the account, refreshed (and saved) when it's within 2 minutes of expiring. */
async function accessToken(db: Db, f: Fetch, keys: Required<GoogleKeys>, acct: GoogleAccount) {
  if (acct.accessToken && acct.accessTokenExpiresAt && +new Date(acct.accessTokenExpiresAt) - Date.now() > 120_000) return acct.accessToken;
  const t = await json(
    await f("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({ client_id: keys.googleClientId, client_secret: keys.googleClientSecret, refresh_token: acct.refreshToken, grant_type: "refresh_token" }),
    }),
  );
  const accessTokenExpiresAt = new Date(Date.now() + Number(t.expires_in ?? 3600) * 1000).toISOString();
  await db.collection<GoogleAccount>("googleAccounts").updateOne({ _id: acct._id }, { $set: { accessToken: String(t.access_token), accessTokenExpiresAt } });
  return String(t.access_token);
}

export async function revokeGoogle(f: Fetch, token: string) {
  await f(`https://oauth2.googleapis.com/revoke?${new URLSearchParams({ token })}`, { method: "POST" }).catch(() => undefined);
}

/* ---------- helpers ---------- */

type Header = { name: string; value: string };
type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
type GmailMessage = { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: Part & { headers?: Header[] } };

const header = (m: GmailMessage, name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
/** "Riya Mehta <riya@halcyon.in>" → { name, email } */
export const parseAddress = (v: string) => {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (m ? m[2]! : v).trim().toLowerCase();
  return { name: (m?.[1] ?? "").trim(), email };
};
const domainOf = (email: string) => email.split("@")[1] ?? "";
/** Plain-text body (first text/plain part), without the quoted earlier messages; falls back to Gmail's snippet. */
export function plainText(m: GmailMessage) {
  const find = (p?: Part): string | undefined => {
    if (!p) return undefined;
    if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
    for (const c of p.parts ?? []) {
      const t = find(c);
      if (t) return t;
    }
    return undefined;
  };
  const text = find(m.payload) ?? m.snippet ?? "";
  // Cut at the usual start of a quoted reply ("On Mon, … wrote:" or a line of "> ").
  const cut = text.split(/\r?\n(?:On .{5,200} wrote:|>)/)[0]!;
  return cut.trim().slice(0, 4000);
}
/** Newsletters, notifications and bounces aren't leads. */
const automated = (m: GmailMessage, from: string) =>
  !!header(m, "List-Unsubscribe") || /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?|bounce)/i.test(from) || header(m, "Auto-Submitted").toLowerCase().startsWith("auto");

type SyncContext = { db: Db; f: Fetch; rules: RoutingRule[]; active: Set<string>; ourDomains: Set<string>; ourEmails: Set<string> };

/** Store a message once across every connected mailbox (the same email can reach enquiry@ and a person). */
async function firstTime(db: Db, key: string) {
  try {
    await db.collection<{ _id: string; at: string }>("seenMessages").insertOne({ _id: key, at: new Date().toISOString() });
    return true;
  } catch (e) {
    if (e instanceof MongoServerError && e.code === 11000) return false;
    throw e;
  }
}

/** Adds a message to the person's conversation on this channel, or opens one (a new lead, routed). */
async function upsertConversation(
  ctx: SyncContext,
  channel: "gmail" | "calendar",
  person: { email: string; name: string },
  message: { id: string; direction: "in" | "out"; body: string; at: string },
  extra: Record<string, unknown>,
  openNew: boolean,
) {
  const col = ctx.db.collection<Doc>("conversations");
  const existing = await col.findOne({ channel, externalId: person.email });
  if (existing) {
    await col.updateOne({ _id: existing._id }, { $push: { messages: message } as never, $set: { lastMessageAt: message.at, ...extra, ...(message.direction === "in" && { unread: true }) } });
    return "joined";
  }
  if (!openNew) return "skipped";
  const contact = await ctx.db.collection<Doc>("contacts").findOne({ email: person.email });
  await col.insertOne({
    _id: new ObjectId().toHexString(),
    channel,
    externalId: person.email,
    name: person.name || (contact?.name as string | undefined) || person.email,
    handle: person.email,
    city: "",
    unread: message.direction === "in",
    lastMessageAt: message.at,
    createdAt: message.at,
    ...(contact && { contactId: contact._id }),
    assigneeId: routeLead(ctx.rules, { channel }, (id) => ctx.active.has(id)),
    messages: [message],
    ...extra,
  });
  return "opened";
}

/* ---------- Gmail ---------- */

async function syncGmail(ctx: SyncContext, acct: GoogleAccount, token: string) {
  const auth = { headers: { authorization: `Bearer ${token}` } };
  const col = ctx.db.collection<GoogleAccount>("googleAccounts");
  if (!acct.historyId) {
    const p = await json(await ctx.f(`${GMAIL}/profile`, auth));
    await col.updateOne({ _id: acct._id }, { $set: { historyId: String(p.historyId) } });
    return 0;
  }
  let res = await ctx.f(`${GMAIL}/history?${new URLSearchParams({ startHistoryId: acct.historyId, historyTypes: "messageAdded" })}`, auth);
  if (res.status === 404) {
    // Too old to continue from: start again from now rather than replaying the mailbox.
    const p = await json(await ctx.f(`${GMAIL}/profile`, auth));
    await col.updateOne({ _id: acct._id }, { $set: { historyId: String(p.historyId) } });
    return 0;
  }
  const h = await json(res);
  const ids = new Set<string>();
  for (const rec of (h.history as { messagesAdded?: { message: { id: string; labelIds?: string[] } }[] }[] | undefined) ?? [])
    for (const a of rec.messagesAdded ?? []) if (a.message.labelIds?.some((l) => l === "INBOX" || l === "SENT")) ids.add(a.message.id);

  let stored = 0;
  for (const id of ids) {
    res = await ctx.f(`${GMAIL}/messages/${id}?format=full`, auth);
    if (res.status === 404) continue; // deleted since
    const m = (await json(res)) as unknown as GmailMessage;
    const from = parseAddress(header(m, "From"));
    const sent = !!m.labelIds?.includes("SENT") || from.email === acct.email;
    const at = new Date(Number(m.internalDate ?? Date.now())).toISOString();
    const subject = header(m, "Subject");
    const extra = { subject, gmailThread: { account: acct.email, threadId: m.threadId } };
    const key = `gmail:${header(m, "Message-ID") || m.id}`;

    if (sent) {
      // Our reply: joins the conversation of each outside person it went to; never opens a lead.
      const to = header(m, "To").split(",").map(parseAddress).filter((p) => p.email && !ctx.ourDomains.has(domainOf(p.email)));
      if (!to.length || !(await firstTime(ctx.db, key))) continue;
      for (const p of to) if ((await upsertConversation(ctx, "gmail", p, { id: m.id, direction: "out", body: plainText(m), at }, {}, false)) === "joined") stored++;
      continue;
    }
    if (!from.email || ctx.ourEmails.has(from.email) || ctx.ourDomains.has(domainOf(from.email)) || automated(m, from.email)) continue;
    if (!(await firstTime(ctx.db, key))) continue;
    await upsertConversation(ctx, "gmail", from, { id: m.id, direction: "in", body: plainText(m), at }, extra, true);
    stored++;
  }
  await col.updateOne({ _id: acct._id }, { $set: { historyId: String(h.historyId ?? acct.historyId) } });
  return stored;
}

/* ---------- Calendar ---------- */

type CalEvent = {
  id: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  created?: string;
  htmlLink?: string;
  attendees?: { email?: string; displayName?: string; self?: boolean; organizer?: boolean; resource?: boolean }[];
};

async function syncCalendar(ctx: SyncContext, acct: GoogleAccount, token: string) {
  const auth = { headers: { authorization: `Bearer ${token}` } };
  const col = ctx.db.collection<GoogleAccount>("googleAccounts");
  const events: CalEvent[] = [];
  let syncToken = acct.calendarSyncToken;
  let pageToken: string | undefined;
  const first = !syncToken;
  do {
    const q = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "250" });
    if (syncToken) q.set("syncToken", syncToken);
    else q.set("updatedMin", new Date(Date.now() - 60_000).toISOString()); // first run: only from now on
    if (pageToken) q.set("pageToken", pageToken);
    const res = await ctx.f(`${CALENDAR}?${q}`, auth);
    if (res.status === 410) {
      // Google expired the sync token: start again from now.
      await col.updateOne({ _id: acct._id }, { $unset: { calendarSyncToken: "" } });
      return 0;
    }
    const page = await json(res);
    events.push(...(((page.items as CalEvent[] | undefined) ?? [])));
    pageToken = page.nextPageToken as string | undefined;
    if (page.nextSyncToken) syncToken = String(page.nextSyncToken);
  } while (pageToken);
  await col.updateOne({ _id: acct._id }, { $set: { calendarSyncToken: syncToken } });
  if (first) return 0;

  let stored = 0;
  for (const ev of events) {
    if (ev.status === "cancelled" || !ev.attendees?.length) continue;
    const when = ev.start?.dateTime ?? ev.start?.date;
    if (!when || +new Date(when) < Date.now() - 86_400_000) continue; // edits to old meetings aren't news
    const guests = ev.attendees.filter((a) => a.email && !a.self && !a.resource && !ctx.ourEmails.has(a.email.toLowerCase()) && !ctx.ourDomains.has(domainOf(a.email.toLowerCase())));
    for (const g of guests) {
      const email = g.email!.toLowerCase();
      if (!(await firstTime(ctx.db, `calendar:${ev.id}:${email}`))) continue;
      const contact = await ctx.db.collection<Doc>("contacts").findOne({ email });
      const label = `${ev.summary || "Meeting"} · ${new Date(when).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: ev.start?.dateTime ? "short" : undefined })}`;
      if (contact) {
        // A meeting with someone we know goes on their timeline (their open deal, if there is one).
        const deal = await ctx.db.collection<Doc>("deals").findOne({ contactId: contact._id, stage: { $nin: ["won", "lost"] } });
        await ctx.db.collection<Doc>("activities").insertOne({
          _id: new ObjectId().toHexString(),
          type: "meeting",
          ...(deal && { dealId: deal._id }),
          ...(contact.companyId ? { companyId: contact.companyId } : {}),
          actorId: "calendar",
          text: `has a meeting with ${contact.name}: ${label}`,
          at: new Date().toISOString(),
        });
      } else {
        await upsertConversation(ctx, "calendar", { email, name: g.displayName ?? "" }, { id: ev.id, direction: "in", body: `Booked: ${label}`, at: ev.created ?? new Date().toISOString() }, { subject: ev.summary ?? "Meeting" }, true);
      }
      stored++;
    }
  }
  return stored;
}

/** One pass over every connected account. Errors on one account are recorded on it and don't stop the others. */
export async function syncGoogle(db: Db, f: Fetch) {
  const keysDoc = (await db.collection<Doc>("setup").findOne({ _id: "keys" })) as (Doc & GoogleKeys) | null;
  if (!keysDoc?.googleClientId || !keysDoc.googleClientSecret) return { accounts: 0, stored: 0 };
  const keys = { googleClientId: keysDoc.googleClientId, googleClientSecret: keysDoc.googleClientSecret };
  const accounts = await db.collection<GoogleAccount>("googleAccounts").find().toArray();
  if (!accounts.length) return { accounts: 0, stored: 0 };

  const workspace = await db.collection<Doc>("workspace").findOne({ _id: "studio" });
  const ourDomains = new Set([String(workspace?.googleDomain ?? ""), ...accounts.map((a) => domainOf(a.email))].filter((d) => d && d !== "gmail.com"));
  const ourEmails = new Set([...accounts.map((a) => a.email), ...(await db.collection<Doc>("members").find({}, { projection: { email: 1 } }).toArray()).map((m) => String(m.email))]);
  const rules = ((await db.collection<Doc>("routing").findOne({ _id: "rules" }))?.rules as RoutingRule[] | undefined) ?? [];
  const active = new Set((await db.collection<Doc>("members").find({ status: { $ne: "removed" } }, { projection: { _id: 1 } }).toArray()).map((x) => x._id));
  const ctx: SyncContext = { db, f, rules, active, ourDomains, ourEmails };

  let stored = 0;
  for (const acct of accounts) {
    try {
      const token = await accessToken(db, f, keys, acct);
      stored += await syncGmail(ctx, acct, token);
      stored += await syncCalendar(ctx, acct, token);
      await db.collection<GoogleAccount>("googleAccounts").updateOne({ _id: acct._id }, { $set: { lastSyncAt: new Date().toISOString() }, $unset: { error: "" } });
    } catch (e) {
      const status = (e as { status?: number }).status;
      const error = status === 400 || status === 401 ? "Google access was withdrawn — connect this account again" : (e as Error).message.slice(0, 200);
      await db.collection<GoogleAccount>("googleAccounts").updateOne({ _id: acct._id }, { $set: { error } });
    }
  }
  return { accounts: accounts.length, stored };
}
