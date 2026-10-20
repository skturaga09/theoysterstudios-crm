/**
 * Razorpay payment links on the studio's own Razorpay account: a link per invoice for the amount still due,
 * and the webhook that records the payment on the invoice when the client pays. Keys live in setup/keys.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "mongodb";
import type { Doc } from "./db";
import type { Fetch } from "./instagram";

export type RazorpayKeys = { razorpayKeyId?: string; razorpayKeySecret?: string; razorpayWebhookSecret?: string };

export async function createPaymentLink(
  f: Fetch,
  keys: Required<Pick<RazorpayKeys, "razorpayKeyId" | "razorpayKeySecret">>,
  link: { invoiceId: string; number: string; amountPaise: number; name: string; email?: string; phone?: string; expireBy?: number },
) {
  const res = await f("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${keys.razorpayKeyId}:${keys.razorpayKeySecret}`).toString("base64")}`, "content-type": "application/json" },
    body: JSON.stringify({
      amount: link.amountPaise,
      currency: "INR",
      accept_partial: false,
      description: `Invoice ${link.number}`,
      reference_id: `${link.number}-${Date.now().toString(36)}`, // must be unique per link; a new link for the same invoice gets a new one
      customer: { name: link.name, ...(link.email && { email: link.email }), ...(link.phone && { contact: link.phone }) },
      notify: { sms: false, email: false }, // the studio sends it themselves (WhatsApp)
      reminder_enable: false,
      notes: { invoiceId: link.invoiceId },
      ...(link.expireBy && { expire_by: link.expireBy }),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; short_url?: string; error?: { description?: string } };
  if (!res.ok || !body.id || !body.short_url) throw new Error(body.error?.description ?? `Razorpay answered ${res.status}`);
  return { id: body.id, url: body.short_url };
}

/** `X-Razorpay-Signature`: hex HMAC-SHA256 of the raw body with the webhook secret. */
export function validRazorpaySignature(rawBody: string | Buffer | undefined, header: string | undefined, secret: string | undefined) {
  if (!rawBody || !header || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(header, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type Payload = { event?: string; payload?: { payment_link?: { entity?: { id?: string; notes?: { invoiceId?: string } } }; payment?: { entity?: { id?: string; amount?: number; created_at?: number; method?: string } } } };

/** A paid link records the payment on its invoice — once, however often Razorpay retries. */
export async function handleRazorpayWebhook(db: Db, p: Payload) {
  if (p.event !== "payment_link.paid") return { recorded: false };
  const link = p.payload?.payment_link?.entity;
  const pay = p.payload?.payment?.entity;
  if (!link?.notes?.invoiceId || !pay?.id || !pay.amount) return { recorded: false };
  const at = new Date((pay.created_at ?? Date.now() / 1000) * 1000).toISOString();
  const r = await db.collection<Doc>("invoices").updateOne(
    { _id: link.notes.invoiceId, "payments.ref": { $ne: pay.id } },
    { $push: { payments: { at, amountPaise: pay.amount, ref: pay.id, method: `Razorpay${pay.method ? ` · ${pay.method}` : ""}` } } as never, $set: { "paymentLink.status": "paid" } },
  );
  return { recorded: r.modifiedCount === 1, invoiceId: link.notes.invoiceId };
}
