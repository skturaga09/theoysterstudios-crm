import { invoiceTotals, type InvoiceMath } from "./invoice";
import { istDay } from "./projects";

type DealIn = { id: string; title: string; stage: string; createdAt: string; wonAt?: string; schedule?: { id: string; label: string; amountPaise: number; dueDate?: string; invoiceId?: string }[] };
type ProjectIn = { dealId?: string; business: string; status: string; events: { id: string; name: string; date?: string }[]; deliverables: { id: string; name: string; dueDate?: string; status: string }[]; cycles?: string[] };
type InvoiceIn = Omit<InvoiceMath, "payments"> & { id: string; payments: { amountPaise: number }[]; cancelled?: boolean };

export type Milestone = {
  key: string;
  label: string;
  /** YYYY-MM-DD (IST); undated milestones sort last. */
  date?: string;
  kind: "lead" | "booking" | "payment" | "event" | "deliverable" | "month";
  done: boolean;
  /** Not done and its date has passed. */
  late: boolean;
  /** The first milestone not yet done — what the client and the team are working towards. */
  current: boolean;
};

const monthLabel = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

/**
 * A client's journey, built from what the CRM already records — nothing to keep up by hand: the enquiry, the
 * booking, each payment stage (done when its invoice is paid), each wedding function (done once its date has
 * passed), each retainer month, and each deliverable (done when delivered). In date order.
 */
export function clientJourney({ deal, project, invoices }: { deal?: DealIn; project?: ProjectIn; invoices: InvoiceIn[] }, now = new Date()): Milestone[] {
  const today = istDay(now);
  const list: Omit<Milestone, "late" | "current">[] = [];
  if (deal) {
    list.push({ key: "enquiry", label: "Enquiry", date: istDay(deal.createdAt), kind: "lead", done: true });
    list.push({ key: "booked", label: deal.stage === "lost" ? "Not booked" : "Booked", date: deal.wonAt ? istDay(deal.wonAt) : undefined, kind: "booking", done: deal.stage === "won" });
    for (const m of deal.schedule ?? []) {
      const inv = m.invoiceId ? invoices.find((i) => i.id === m.invoiceId && !i.cancelled) : undefined;
      list.push({ key: `pay-${m.id}`, label: m.label, date: m.dueDate, kind: "payment", done: !!inv && invoiceTotals({ ...inv, payments: inv.payments }).due <= 100 });
    }
  }
  if (project) {
    for (const e of project.events) list.push({ key: `event-${e.id}`, label: e.name, date: e.date, kind: "event", done: !!e.date && e.date < today });
    for (const m of project.cycles ?? []) list.push({ key: `month-${m}`, label: monthLabel(m), date: `${m}-01`, kind: "month", done: m < today.slice(0, 7) });
    for (const d of project.deliverables) list.push({ key: `deliv-${d.id}`, label: d.name, date: d.dueDate, kind: "deliverable", done: d.status === "delivered" });
  }
  // Done first among the same day, then by date; undated at the end (enquiry and booking always lead).
  const sorted = list.map((m, i) => ({ m, i })).sort((a, b) => (a.m.date ?? "9999").localeCompare(b.m.date ?? "9999") || Number(b.m.done) - Number(a.m.done) || a.i - b.i).map((x) => x.m);
  const firstOpen = sorted.findIndex((m) => !m.done);
  return sorted.map((m, i) => ({ ...m, late: !m.done && !!m.date && m.date < today, current: i === firstOpen }));
}
