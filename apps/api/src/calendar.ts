/**
 * A personal calendar feed (iCalendar) that Google Calendar, Apple Calendar or Outlook subscribe to by URL:
 * weddings and functions, my tasks and follow-ups, and (for owners and Finance) payments due. The URL holds a
 * secret token; resetting it cuts off old subscriptions. Calendar apps refresh it every few hours.
 */
import { accessOf, addDays, roleOf } from "@pinnacle/shared";
import type { Db } from "mongodb";
import type { Doc } from "./db";

type Item = { uid: string; title: string; day?: string; at?: string; minutes?: number; url?: string; description?: string };

// iCalendar text: escape \ ; , and newlines; fold lines at 75 octets (approximated by characters).
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string) => (line.length <= 74 ? line : line.match(/.{1,74}/g)!.join("\r\n "));
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function toIcs(name: string, items: Item[], now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Oyster Studios//CRM//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`, "X-WR-TIMEZONE:Asia/Kolkata"];
  for (const it of items) {
    lines.push("BEGIN:VEVENT", `UID:${it.uid}@theoysterstudios-crm`, `DTSTAMP:${stamp(now)}`, `SUMMARY:${esc(it.title)}`);
    if (it.day) lines.push(`DTSTART;VALUE=DATE:${it.day.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(it.day, 1).replace(/-/g, "")}`);
    else {
      const start = new Date(it.at!);
      lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + (it.minutes ?? 30) * 60_000))}`);
    }
    if (it.description) lines.push(`DESCRIPTION:${esc(it.description)}`);
    if (it.url) lines.push(`URL:${it.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** What one person's feed shows, following their role. */
export async function feedFor(db: Db, member: Doc, site: string): Promise<Item[]> {
  const me = member._id;
  const role = roleOf(String(member.role));
  const items: Item[] = [];
  const since = addDays(new Date().toISOString().slice(0, 10), -60); // keep the feed small: the last two months onwards

  const projectFilter = accessOf(role, "projects") === "own" ? { $or: [{ managerId: me }, { "crew.memberId": me }] } : {};
  for (const p of await db.collection<Doc>("projects").find({ ...projectFilter, status: { $in: ["planning", "active"] } }).toArray()) {
    for (const e of (p.events as { id: string; name: string; date?: string; venue?: string }[]) ?? [])
      if (e.date && e.date >= since) items.push({ uid: `event-${p._id}-${e.id}`, title: `${e.name} · ${p.name}`, day: e.date, description: e.venue, url: `${site}/projects/${p._id}` });
    for (const d of (p.deliverables as { id: string; name: string; dueDate?: string; status: string }[]) ?? [])
      if (d.dueDate && d.dueDate >= since && d.status !== "delivered") items.push({ uid: `deliverable-${p._id}-${d.id}`, title: `Due: ${d.name} · ${p.name}`, day: d.dueDate, url: `${site}/projects/${p._id}` });
  }
  for (const t of await db.collection<Doc>("tasks").find({ assigneeId: me, done: false }).toArray())
    if (String(t.dueAt).slice(0, 10) >= since) items.push({ uid: `task-${t._id}`, title: `☐ ${t.title}`, at: String(t.dueAt), url: `${site}${t.projectId ? `/projects/${t.projectId}` : "/tasks"}` });
  if (accessOf(role, "sales") !== "none")
    for (const d of await db.collection<Doc>("deals").find({ ownerId: me, stage: { $nin: ["won", "lost"] }, nextFollowUpAt: { $type: "string" } }).toArray())
      items.push({ uid: `followup-${d._id}`, title: `Follow up: ${d.title}`, at: String(d.nextFollowUpAt), minutes: 15, url: `${site}/deals/${d._id}` });
  if (accessOf(role, "finance") === "edit")
    for (const d of await db.collection<Doc>("deals").find({ "schedule.0": { $exists: true } }).toArray())
      for (const m of (d.schedule as { id: string; label: string; dueDate?: string; invoiceId?: string }[]) ?? [])
        if (m.dueDate && m.dueDate >= since && !m.invoiceId) items.push({ uid: `payment-${d._id}-${m.id}`, title: `₹ ${m.label} · ${d.title}`, day: m.dueDate, url: `${site}/deals/${d._id}` });
  return items;
}
