/**
 * WhatsApp Cloud API on the studio's own Meta app and number: incoming messages become Inbox conversations
 * (routed like Instagram), replies go out within WhatsApp's 24-hour window, and payment reminders go out as an
 * approved template message (allowed any time).
 */
import { ObjectId, MongoServerError, type Db } from "mongodb";
import { routeLead, type RoutingRule } from "@pinnacle/shared";
import type { Doc } from "./db";
import type { Fetch } from "./instagram";

export type WhatsAppKeys = { whatsappPhoneNumberId?: string; whatsappToken?: string; whatsappReminderTemplate?: string; whatsappTemplateLanguage?: string };
const GRAPH = "https://graph.facebook.com/v21.0";

/** Indian numbers saved without the country code get +91; everything else is digits only. */
export const waNumber = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
};

type Value = {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: { from?: string; id?: string; timestamp?: string; type?: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[];
};
type Payload = { object?: string; entry?: { changes?: { field?: string; value?: Value }[] }[] };

export async function handleWhatsAppWebhook(db: Db, keys: WhatsAppKeys, payload: Payload) {
  if (payload.object !== "whatsapp_business_account") return { stored: 0 };
  const conversations = db.collection<Doc>("conversations");
  const seen = db.collection<{ _id: string; at: string }>("seenMessages");
  let stored = 0;
  for (const change of payload.entry?.flatMap((e) => e.changes ?? []) ?? []) {
    const v = change.value;
    if (change.field !== "messages" || !v?.messages) continue;
    if (keys.whatsappPhoneNumberId && v.metadata?.phone_number_id !== keys.whatsappPhoneNumberId) continue; // only our number
    for (const m of v.messages) {
      if (!m.id || !m.from) continue;
      try {
        await seen.insertOne({ _id: `whatsapp:${m.id}`, at: new Date().toISOString() });
      } catch (e) {
        if (e instanceof MongoServerError && e.code === 11000) continue; // already stored
        throw e;
      }
      const at = new Date(Number(m.timestamp ?? Date.now() / 1000) * 1000).toISOString();
      const body = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type ?? "Message"} — open in WhatsApp]`;
      const message = { id: m.id, direction: "in", body, at };
      const existing = await conversations.findOne({ channel: "whatsapp", externalId: m.from });
      if (existing) {
        await conversations.updateOne({ _id: existing._id }, { $push: { messages: message } as never, $set: { lastMessageAt: at, lastInboundAt: at, unread: true } });
      } else {
        const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name;
        const rules = (await db.collection<{ _id: string; rules: RoutingRule[] }>("routing").findOne({ _id: "rules" }))?.rules ?? [];
        const active = new Set((await db.collection<Doc>("members").find({ status: { $ne: "removed" } }, { projection: { _id: 1 } }).toArray()).map((x) => x._id));
        const contact = await db.collection<Doc>("contacts").findOne({ phone: { $regex: `${m.from.slice(-10)}$` } });
        await conversations.insertOne({
          _id: new ObjectId().toHexString(),
          channel: "whatsapp",
          externalId: m.from,
          name: name || `+${m.from}`,
          handle: `+${m.from}`,
          city: "",
          unread: true,
          lastMessageAt: at,
          lastInboundAt: at,
          createdAt: at,
          ...(contact && { contactId: contact._id }),
          assigneeId: routeLead(rules, { channel: "whatsapp" }, (id) => active.has(id)),
          messages: [message],
        });
      }
      stored++;
    }
  }
  if (stored) await db.collection<Doc>("integrations").updateOne({ _id: "whatsapp" }, { $set: { lastEventAt: new Date().toISOString() } }, { upsert: true });
  return { stored };
}

async function send(f: Fetch, keys: WhatsAppKeys, body: object) {
  const res = await f(`${GRAPH}/${keys.whatsappPhoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${keys.whatsappToken}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...body }),
  });
  const out = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok || !out.messages?.[0]) {
    // 131047: outside the 24-hour window — only template messages can start a conversation.
    if (out.error?.code === 131047) throw new Error("It's been more than 24 hours since they last wrote — WhatsApp only allows approved template messages now");
    throw new Error(out.error?.message ?? `WhatsApp answered ${res.status}`);
  }
  return out.messages[0].id;
}

export const sendText = (f: Fetch, keys: WhatsAppKeys, to: string, text: string) => send(f, keys, { to: waNumber(to), type: "text", text: { body: text, preview_url: true } });

/** The payment reminder template: Hello {{1}}, … {{2}}: {{3}} of {{4}} is due by {{5}}. */
export const sendReminder = (f: Fetch, keys: WhatsAppKeys, to: string, params: [string, string, string, string, string]) =>
  send(f, keys, {
    to: waNumber(to),
    type: "template",
    template: { name: keys.whatsappReminderTemplate || "payment_reminder", language: { code: keys.whatsappTemplateLanguage || "en" }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] },
  });
