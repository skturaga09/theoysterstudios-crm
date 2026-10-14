/**
 * Instagram DMs through the client's own Meta app ("Instagram API with Instagram Login").
 * Sign-in uses the app's Instagram App ID / secret; webhooks are signed with an app secret (we accept either the
 * Instagram or the Meta app secret, since Meta's docs name both). Read-only: nothing is ever sent to Instagram.
 * Docs: developers.facebook.com/docs/instagram-platform (business-login, webhooks).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { routeLead, type RoutingRule } from "@pinnacle/shared";
import { MongoServerError, ObjectId, type Db } from "mongodb";
import type { Doc } from "./db";

export const IG_SCOPES = "instagram_business_basic,instagram_business_manage_messages";
export type Fetch = typeof fetch;

/** The keys the client pastes in (Settings → Integrations → Instagram → Set up), plus our webhook verify token. */
export type SetupKeys = { instagramAppId?: string; instagramAppSecret?: string; metaAppSecret?: string; webhookVerifyToken?: string };

/** The connected account. The access token is server-only — never returned by the API. */
export type InstagramIntegration = {
  _id: "instagram";
  igUserId: string;
  username: string;
  accessToken: string;
  tokenExpiresAt: string;
  tokenIssuedAt: string;
  connectedAt: string;
  connectedBy: string;
  lastEventAt?: string;
};

export const newVerifyToken = () => randomBytes(18).toString("base64url");

export function authorizeUrl(appId: string, redirectUri: string, state: string) {
  const q = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, response_type: "code", scope: IG_SCOPES, state });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

const json = async (res: Response) => {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String((body.error_message ?? (body.error as { message?: string } | undefined)?.message ?? `Instagram returned ${res.status}`)));
  return body;
};

/** Code → short-lived token → 60-day token, then the account's id and username. */
export async function exchangeCode(f: Fetch, keys: Required<Pick<SetupKeys, "instagramAppId" | "instagramAppSecret">>, redirectUri: string, code: string) {
  const short = await json(
    await f("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: new URLSearchParams({ client_id: keys.instagramAppId, client_secret: keys.instagramAppSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
    }),
  );
  const long = await json(
    await f(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: keys.instagramAppSecret, access_token: String(short.access_token) })}`),
  );
  const token = String(long.access_token);
  const me = await json(await f(`https://graph.instagram.com/me?${new URLSearchParams({ fields: "user_id,username", access_token: token })}`));
  return { token, expiresIn: Number(long.expires_in ?? 5_184_000), igUserId: String(me.user_id ?? short.user_id), username: String(me.username ?? "") };
}

/** Asks Meta to send this account's new messages to our webhook. */
export async function subscribeMessages(f: Fetch, token: string) {
  await json(await f(`https://graph.instagram.com/me/subscribed_apps?${new URLSearchParams({ subscribed_fields: "messages", access_token: token })}`, { method: "POST" }));
}

/** 60-day tokens must be refreshed (allowed once a day or less often) before they lapse; run daily. */
export async function refreshToken(db: Db, f: Fetch, now = new Date()) {
  const col = db.collection<InstagramIntegration>("integrations");
  const ig = await col.findOne({ _id: "instagram" });
  if (!ig) return "not-connected";
  const ageHours = (+now - +new Date(ig.tokenIssuedAt)) / 3_600_000;
  const daysLeft = (+new Date(ig.tokenExpiresAt) - +now) / 86_400_000;
  if (ageHours < 24 || daysLeft > 30) return "not-due";
  const res = await json(await f(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: ig.accessToken })}`));
  await col.updateOne(
    { _id: "instagram" },
    { $set: { accessToken: String(res.access_token), tokenIssuedAt: now.toISOString(), tokenExpiresAt: new Date(+now + Number(res.expires_in ?? 5_184_000) * 1000).toISOString() } },
  );
  return "refreshed";
}

/** `X-Hub-Signature-256: sha256=<hex>` over the raw body, checked against each saved secret in constant time. */
export function validSignature(rawBody: string | Buffer | undefined, header: string | undefined, secrets: (string | undefined)[]) {
  if (!rawBody || !header?.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice(7), "hex");
  return secrets.some((secret) => {
    if (!secret) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest();
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean; attachments?: unknown[] };
};
type WebhookPayload = { object?: string; entry?: { id?: string; time?: number; messaging?: MessagingEvent[] }[] };

/**
 * Turns Instagram message events into Inbox conversations. A first message from someone opens a conversation,
 * owned by whoever lead routing picks; later messages join it. Each message is stored once even if Meta
 * delivers it twice. Messages the studio sends from Instagram itself (echoes) are kept as outgoing.
 */
export async function handleWebhook(db: Db, f: Fetch, payload: WebhookPayload) {
  if (payload.object !== "instagram") return { stored: 0 };
  const integrations = db.collection<InstagramIntegration>("integrations");
  const ig = await integrations.findOne({ _id: "instagram" });
  if (!ig) return { stored: 0 };
  const conversations = db.collection<Doc>("conversations");
  const seen = db.collection<{ _id: string; at: string }>("seenMessages");
  let stored = 0;

  for (const entry of payload.entry ?? []) {
    if (entry.id !== ig.igUserId) continue; // only the connected account
    for (const ev of entry.messaging ?? []) {
      const m = ev.message;
      if (!m?.mid || m.is_deleted) continue;
      const outgoing = !!m.is_echo;
      const person = outgoing ? ev.recipient?.id : ev.sender?.id;
      if (!person) continue;
      try {
        await seen.insertOne({ _id: `instagram:${m.mid}`, at: new Date().toISOString() });
      } catch (e) {
        if (e instanceof MongoServerError && e.code === 11000) continue; // already stored
        throw e;
      }
      const at = new Date(ev.timestamp ?? Date.now()).toISOString();
      const message = { id: m.mid, direction: outgoing ? "out" : "in", body: m.text ?? (m.attachments?.length ? "[Photo, video or attachment — open in Instagram]" : ""), at };

      const existing = await conversations.findOne({ channel: "instagram", externalId: person });
      if (existing) {
        await conversations.updateOne(
          { _id: existing._id },
          { $push: { messages: message } as never, $set: { lastMessageAt: at, ...(!outgoing && { unread: true }) } },
        );
      } else {
        const profile = await fetchProfile(f, ig.accessToken, person);
        const rules = (await db.collection<{ _id: string; rules: RoutingRule[] }>("routing").findOne({ _id: "rules" }))?.rules ?? [];
        const active = new Set((await db.collection<Doc>("members").find({ status: { $ne: "removed" } }, { projection: { _id: 1 } }).toArray()).map((x) => x._id));
        await conversations.insertOne({
          _id: new ObjectId().toHexString(),
          channel: "instagram",
          externalId: person,
          name: profile.name || (profile.username ? `@${profile.username}` : "Instagram user"),
          handle: profile.username ? `@${profile.username}` : "",
          city: "",
          unread: !outgoing,
          lastMessageAt: at,
          createdAt: at,
          assigneeId: routeLead(rules, { channel: "instagram" }, (id) => active.has(id)),
          messages: [message],
        });
      }
      stored++;
    }
  }
  if (stored) await integrations.updateOne({ _id: "instagram" }, { $set: { lastEventAt: new Date().toISOString() } });
  return { stored };
}

/** Name and username of someone who messaged the account. Best effort: a failure leaves them unnamed. */
async function fetchProfile(f: Fetch, token: string, igsid: string): Promise<{ name?: string; username?: string }> {
  try {
    const res = await f(`https://graph.instagram.com/${encodeURIComponent(igsid)}?${new URLSearchParams({ fields: "name,username", access_token: token })}`);
    if (!res.ok) return {};
    const body = (await res.json()) as { name?: string; username?: string };
    return { name: body.name, username: body.username };
  } catch {
    return {};
  }
}
