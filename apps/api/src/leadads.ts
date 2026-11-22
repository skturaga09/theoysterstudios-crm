/**
 * Meta Lead Ads on the studio's own Meta app and Facebook Page: each form someone submits from an ad becomes an
 * Inbox lead (channel "facebook"), routed like every other lead, with all their answers. Read-only.
 *
 * Setup: a system-user token (Business settings, never expires) with leads_retrieval, pages_manage_metadata,
 * pages_show_list and pages_read_engagement, assigned the Page. The CRM swaps it for the Page's own token and
 * subscribes the Page to the app's "leadgen" webhook; Meta then posts each new lead's id, and the CRM fetches it.
 */
import { ObjectId, MongoServerError, type Db } from "mongodb";
import { routeLead, type RoutingRule } from "@pinnacle/shared";
import type { Doc } from "./db";
import type { Fetch } from "./instagram";

export const GRAPH = "https://graph.facebook.com/v23.0";

export type LeadAdsIntegration = { _id: "leadads"; pageId: string; pageName: string; pageToken: string; connectedAt: string; connectedBy: string; lastEventAt?: string };

async function graph<T>(f: Fetch, path: string, params: Record<string, string>, init?: RequestInit): Promise<T> {
  const res = await f(`${GRAPH}/${path}?${new URLSearchParams(params)}`, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || body.error) throw new Error(body.error?.message ?? `Meta returned ${res.status}`);
  return body;
}

/** Checks the token can reach the Page, gets the Page's own token, and turns on lead notifications for it. */
export async function connectPage(f: Fetch, pageId: string, token: string) {
  const page = await graph<{ id: string; name: string; access_token?: string }>(f, pageId, { fields: "name,access_token", access_token: token });
  // A Page token answers without access_token; a system-user or user token returns the Page's own.
  const pageToken = page.access_token ?? token;
  await graph(f, `${pageId}/subscribed_apps`, { subscribed_fields: "leadgen", access_token: pageToken }, { method: "POST" });
  return { pageId: page.id, pageName: page.name, pageToken };
}

type Field = { name: string; values?: string[] };
type Lead = { id: string; created_time?: string; field_data?: Field[]; ad_name?: string; campaign_name?: string; form_id?: string };

/** "full_name" → "Full name"; Meta's standard keys get their plain names. */
const LABEL: Record<string, string> = { full_name: "Name", first_name: "First name", last_name: "Last name", email: "Email", phone_number: "Phone", city: "City", company_name: "Company", job_title: "Job title" };
const labelOf = (k: string) => LABEL[k] ?? k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Name, email, phone, city and every other answer from a lead's form. */
export function readLead(lead: Lead) {
  const get = (k: string) => lead.field_data?.find((x) => x.name === k)?.values?.[0]?.trim() || undefined;
  const name = get("full_name") ?? ([get("first_name"), get("last_name")].filter(Boolean).join(" ") || undefined);
  const answers = (lead.field_data ?? []).filter((x) => x.values?.[0]?.trim()).map((x) => `${labelOf(x.name)}: ${x.values!.join(", ")}`);
  const from = [lead.campaign_name && `campaign ${lead.campaign_name}`, lead.ad_name && `ad ${lead.ad_name}`].filter(Boolean).join(", ");
  return { name, email: get("email")?.toLowerCase(), phone: get("phone_number"), city: get("city") ?? "", company: get("company_name"), body: `Lead form${from ? ` (${from})` : ""}\n\n${answers.join("\n")}` };
}

type Payload = { object?: string; entry?: { id?: string; changes?: { field?: string; value?: { leadgen_id?: string; page_id?: string; created_time?: number } }[] }[] };

/**
 * Each new lead once (Meta may send it twice): fetch it with the Page token and file it in Inbox. Someone who
 * fills a form again joins their earlier conversation (matched by email or phone).
 */
export async function handleLeadgen(db: Db, f: Fetch, payload: Payload) {
  if (payload.object !== "page") return { stored: 0 };
  const integrations = db.collection<LeadAdsIntegration>("integrations");
  const la = await integrations.findOne({ _id: "leadads" });
  if (!la) return { stored: 0 };
  const conversations = db.collection<Doc>("conversations");
  const seen = db.collection<{ _id: string; at: string }>("seenMessages");
  let stored = 0;
  for (const entry of payload.entry ?? []) {
    if (entry.id !== la.pageId) continue; // only the connected Page
    for (const ch of entry.changes ?? []) {
      const id = ch.field === "leadgen" ? ch.value?.leadgen_id : undefined;
      if (!id) continue;
      try {
        await seen.insertOne({ _id: `leadads:${id}`, at: new Date().toISOString() });
      } catch (e) {
        if (e instanceof MongoServerError && e.code === 11000) continue;
        throw e;
      }
      let lead: Lead;
      try {
        lead = await graph<Lead>(f, id, { fields: "created_time,field_data,ad_name,campaign_name,form_id", access_token: la.pageToken });
      } catch (e) {
        await seen.deleteOne({ _id: `leadads:${id}` }); // let Meta's retry try again
        throw e;
      }
      const l = readLead(lead);
      const at = lead.created_time ? new Date(lead.created_time).toISOString() : new Date().toISOString();
      const message = { id, direction: "in", body: l.body, at };
      const key = l.email ?? l.phone?.replace(/\D/g, "") ?? id;
      const existing = await conversations.findOne({ channel: "facebook", externalId: key });
      if (existing) {
        await conversations.updateOne({ _id: existing._id }, { $push: { messages: message } as never, $set: { lastMessageAt: at, unread: true } });
      } else {
        const rules = (await db.collection<{ _id: string; rules: RoutingRule[] }>("routing").findOne({ _id: "rules" }))?.rules ?? [];
        const active = new Set((await db.collection<Doc>("members").find({ status: { $ne: "removed" } }, { projection: { _id: 1 } }).toArray()).map((x) => x._id));
        const contact = l.email ? await db.collection<Doc>("contacts").findOne({ email: l.email }) : null;
        await conversations.insertOne({
          _id: new ObjectId().toHexString(),
          channel: "facebook",
          externalId: key,
          name: l.name ?? l.email ?? l.phone ?? "Lead Ads enquiry",
          handle: l.phone ?? l.email ?? "",
          city: l.city,
          ...(l.company && { company: l.company }),
          ...(contact && { contactId: contact._id }),
          unread: true,
          lastMessageAt: at,
          createdAt: at,
          assigneeId: routeLead(rules, { channel: "facebook", city: l.city }, (m) => active.has(m)),
          messages: [message],
        });
      }
      stored++;
    }
  }
  if (stored) await integrations.updateOne({ _id: "leadads" }, { $set: { lastEventAt: new Date().toISOString() } });
  return { stored };
}
