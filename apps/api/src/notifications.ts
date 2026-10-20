/**
 * In-app notifications: who was given what, new leads, replies running late, and a morning summary.
 * Kept per person; the app polls for them. Nothing here sends email or messages outside the CRM.
 */
import { ObjectId, type Db } from "mongodb";
import { addDays, istDay, roleOf } from "@pinnacle/shared";
import type { Doc } from "./db";

export type Notification = { _id: string; memberId: string; kind: string; text: string; link?: string; at: string; read: boolean };

/** Tells each person (once each), except whoever caused it. */
export async function notify(db: Db, memberIds: (string | undefined)[], n: { kind: string; text: string; link?: string }, actorId?: string) {
  const to = [...new Set(memberIds.filter((m): m is string => !!m && m !== actorId && m !== "support"))];
  if (!to.length) return;
  const at = new Date().toISOString();
  await db.collection<Notification>("notifications").insertMany(to.map((memberId) => ({ _id: new ObjectId().toHexString(), memberId, ...n, at, read: false })));
}

const activeAdmins = async (db: Db) => (await db.collection<Doc>("members").find({ role: "admin", status: { $ne: "removed" } }, { projection: { _id: 1 } }).toArray()).map((m) => m._id);
const CHANNEL: Record<string, string> = { instagram: "Instagram", gmail: "email", calendar: "a booking", whatsapp: "WhatsApp" };

/**
 * Every minute: tell the assignee (or the admins, when nobody is assigned) about new leads, and tell the assignee
 * and the admins when a lead's message has waited longer than the reply target. Each only once.
 */
export async function leadAlerts(db: Db, now = new Date(), targetMinutes = 30) {
  const col = db.collection<Doc>("conversations");
  const admins = await activeAdmins(db);
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  let sent = 0;
  // Only recent ones, so turning this on doesn't announce every old conversation.
  for (const c of await col.find({ createdAt: { $gte: hourAgo }, notifiedAt: { $exists: false } }).toArray()) {
    await notify(db, c.assigneeId ? [String(c.assigneeId)] : admins, { kind: "lead", text: `New lead on ${CHANNEL[String(c.channel)] ?? c.channel}: ${c.name}`, link: `/inbox/${c._id}` });
    await col.updateOne({ _id: c._id }, { $set: { notifiedAt: now.toISOString() } });
    sent++;
  }
  const late = new Date(now.getTime() - targetMinutes * 60_000).toISOString();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  for (const c of await col.find({ unread: true, lastMessageAt: { $lte: late, $gte: dayAgo } }).toArray()) {
    const last = (c.messages as { direction: string; at: string }[] | undefined)?.at(-1);
    if (last?.direction !== "in" || c.lateAlertFor === c.lastMessageAt) continue;
    await notify(db, [c.assigneeId as string | undefined, ...admins], { kind: "late", text: `${c.name} has waited over ${targetMinutes} minutes for a reply`, link: `/inbox/${c._id}` });
    await col.updateOne({ _id: c._id }, { $set: { lateAlertFor: c.lastMessageAt } });
    sent++;
  }
  return sent;
}

/** Each morning: everyone's tasks and follow-ups for today (and what's late); owners and Finance also get payments due. */
export async function morningSummary(db: Db, now = new Date()) {
  const today = istDay(now);
  const endOfToday = `${addDays(today, 1)}T00:00:00+05:30`;
  const people = await db.collection<Doc>("members").find({ status: "active" }).toArray();
  const tasks = await db.collection<Doc>("tasks").find({ done: false, dueAt: { $lt: endOfToday } }).toArray();
  const deals = await db.collection<Doc>("deals").find({ stage: { $nin: ["won", "lost"] }, nextFollowUpAt: { $lt: endOfToday } }).toArray();
  const stages = (await db.collection<Doc>("deals").find({ "schedule.0": { $exists: true } }).toArray()).flatMap((d) =>
    ((d.schedule as { dueDate?: string; invoiceId?: string }[]) ?? []).filter((m) => !m.invoiceId && m.dueDate && m.dueDate <= today),
  );
  let sent = 0;
  for (const p of people) {
    const t = tasks.filter((x) => x.assigneeId === p._id).length;
    const f = deals.filter((x) => x.ownerId === p._id).length;
    const money = ["admin", "finance"].includes(roleOf(String(p.role))) ? stages.length : 0;
    const parts = [t && `${t} ${t === 1 ? "task" : "tasks"}`, f && `${f} ${f === 1 ? "follow-up" : "follow-ups"}`, money && `${money} ${money === 1 ? "payment" : "payments"} to invoice`].filter(Boolean);
    if (!parts.length) continue;
    await notify(db, [p._id], { kind: "summary", text: `Today: ${parts.join(", ")} (including anything late)`, link: t ? "/tasks" : f ? "/" : "/invoices" });
    sent++;
  }
  return sent;
}
