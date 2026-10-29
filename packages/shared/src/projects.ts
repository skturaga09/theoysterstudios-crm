import type { Business, Priority, ProjectTemplate } from "./domain";

const DAY = 86_400_000;
/** The IST calendar day (YYYY-MM-DD) of an instant. */
export const istDay = (at: string | Date) => new Date(new Date(at).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export type PlannedTask = { title: string; dueAt: string; priority: Priority; approval: "none" | "pending" };
export type PlannedDeliverable = { id: string; name: string; dueDate: string; status: "pending" };

/**
 * Turns a template into dated tasks and deliverables. "event" items count from the wedding/event date
 * (falling back to the confirmation day when there's none yet); "confirmed" items from the confirmation day.
 * Tasks are due 6 pm IST on their day, never before the confirmation day.
 */
export function planProject(template: ProjectTemplate, { confirmedAt, eventDate }: { confirmedAt: string; eventDate?: string }) {
  const confirmed = istDay(confirmedAt);
  const base = (from: "event" | "confirmed") => (from === "event" && eventDate ? eventDate : confirmed);
  // Nothing is due before the deal was confirmed (e.g. "a month before the wedding" for a late booking).
  const dueDay = (from: "event" | "confirmed", days: number) => {
    const day = addDays(base(from), days);
    return day < confirmed ? confirmed : day;
  };
  const tasks: PlannedTask[] = template.tasks.map((t) => ({
    title: t.title,
    dueAt: `${dueDay(t.from, t.days)}T18:00:00+05:30`,
    priority: t.priority,
    approval: t.approval ? "pending" : "none",
  }));
  const deliverables: PlannedDeliverable[] = template.deliverables.map((d, i) => ({ id: `d${i + 1}`, name: d.name, dueDate: dueDay(d.from, d.days), status: "pending" }));
  return { tasks, deliverables };
}

/** The first function of a new wedding project; marketing projects start without functions. */
export const firstEvents = (business: Business, eventDate?: string, venue?: string) =>
  business === "photography" ? [{ id: "e1", name: "Wedding", ...(eventDate && { date: eventDate }), ...(venue && { venue }) }] : [];

type DealLike = { _id?: string; id?: string; title?: unknown; business?: unknown; companyId?: unknown; ownerId?: unknown; wonAt?: unknown; eventDate?: unknown; location?: unknown };

/** The project and checklist a confirmed deal starts (ids are added by whoever saves them). */
export function projectFromDeal(deal: DealLike, templates: Record<Business, ProjectTemplate>, now = new Date().toISOString()) {
  const business = (deal.business ?? "photography") as Business;
  const dealId = String(deal._id ?? deal.id);
  const confirmedAt = String(deal.wonAt ?? now);
  const eventDate = deal.eventDate as string | undefined;
  const ownerId = String(deal.ownerId);
  const { tasks, deliverables } = planProject(templates[business], { confirmedAt, eventDate });
  return {
    project: {
      name: String(deal.title),
      business,
      companyId: String(deal.companyId),
      dealId,
      status: "active" as const,
      managerId: ownerId,
      startDate: istDay(confirmedAt),
      ...(eventDate && { dueDate: eventDate }),
      events: firstEvents(business, eventDate, deal.location as string | undefined),
      crew: [] as { memberId: string; role: string }[],
      deliverables,
      links: [] as { label: string; url: string }[],
      createdAt: now,
    },
    tasks: tasks.map((t) => ({ ...t, status: "todo" as const, done: false, remind: false, links: [], comments: [], business, dealId, assigneeId: ownerId })),
  };
}

/** Crew typed as "Aniketh & Arun" or "Bobby, Teju and Ravi" → one name each (at most 20). */
export const splitNames = (text: string) => text.split(/\s*(?:,|&|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean).slice(0, 20);

/** Edited photos and the album follow the couple's photo selection by 3 to 5 weeks. */
export const SELECTION_WEEKS = [3, 5] as const;
export function deliveryWindow(selectionDate?: string): { from: string; to: string } | undefined {
  if (!selectionDate) return undefined;
  const plus = (weeks: number) => new Date(Date.parse(`${selectionDate}T12:00:00Z`) + weeks * 7 * 86400_000).toISOString().slice(0, 10);
  return { from: plus(SELECTION_WEEKS[0]), to: plus(SELECTION_WEEKS[1]) };
}
