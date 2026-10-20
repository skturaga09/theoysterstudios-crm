import type { Business, Channel } from "./domain";
import { invoiceTotals, type InvoiceMath } from "./invoice";
import { istDay } from "./projects";

type DealIn = { id: string; business?: Business; channel: Channel; stage: string; valuePaise: number; createdAt: string; wonAt?: string; eventDate?: string; lostReason?: string };
type InvoiceIn = Omit<InvoiceMath, "payments"> & { dealId?: string; sent?: boolean; cancelled?: boolean };
type ExpenseIn = { business?: Business; category: string; amountPaise: number; date: string };

export type SourceRow = { channel: Channel; leads: number; confirmed: number; lost: number; conversion: number | null; confirmedPaise: number; invoicedPaise: number; avgBookingPaise: number | null; avgDaysToConfirm: number | null };

const DAY = 86_400_000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Where business comes from and what it's worth, for the leads passed in (already narrowed to a business and a
 * date range by the caller): per source — leads, confirmed, lost, conversion (confirmed ÷ closed), confirmed value,
 * invoiced before GST, average booking and days from enquiry to confirmation. Sorted by confirmed value.
 */
export function bySource(deals: DealIn[], invoices: InvoiceIn[]): SourceRow[] {
  const taxable = new Map<string, number>();
  for (const i of invoices)
    if (i.dealId && i.sent && !i.cancelled) taxable.set(i.dealId, (taxable.get(i.dealId) ?? 0) + invoiceTotals({ ...i, payments: [] }).subtotal);
  const channels = [...new Set(deals.map((d) => d.channel))];
  return channels
    .map((channel) => {
      const mine = deals.filter((d) => d.channel === channel);
      const won = mine.filter((d) => d.stage === "won");
      const lost = mine.filter((d) => d.stage === "lost").length;
      const confirmedPaise = won.reduce((a, d) => a + d.valuePaise, 0);
      const days = avg(won.filter((d) => d.wonAt).map((d) => Math.max(0, (Date.parse(d.wonAt!) - Date.parse(d.createdAt)) / DAY)));
      return {
        channel,
        leads: mine.length,
        confirmed: won.length,
        lost,
        conversion: won.length + lost ? Math.round((won.length / (won.length + lost)) * 100) : null,
        confirmedPaise,
        invoicedPaise: mine.reduce((a, d) => a + (taxable.get(d.id) ?? 0), 0),
        avgBookingPaise: won.length ? Math.round(confirmedPaise / won.length) : null,
        avgDaysToConfirm: days === null ? null : Math.round(days),
      };
    })
    .sort((a, b) => b.confirmedPaise - a.confirmedPaise || b.leads - a.leads);
}

/**
 * The season: for each of the 12 months ending with `now`'s (IST, "2026-10"), new enquiries, bookings confirmed,
 * and — for weddings — how many booked events fall in that month (the busy months to staff for).
 */
export function seasons(deals: DealIn[], now = new Date()) {
  const end = istDay(now).slice(0, 7);
  const [y, m] = end.split("-").map(Number) as [number, number];
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 12 + i, 1));
    return d.toISOString().slice(0, 7);
  });
  const month = (at?: string) => (at ? istDay(at).slice(0, 7) : undefined);
  return months.map((key) => ({
    month: key,
    enquiries: deals.filter((d) => month(d.createdAt) === key).length,
    confirmed: deals.filter((d) => d.stage === "won" && month(d.wonAt) === key).length,
    events: deals.filter((d) => d.stage === "won" && d.eventDate?.slice(0, 7) === key).length,
  }));
}

/** Why leads were lost, most common first; leads closed without a reason count as "No reason given". */
export function lostReasons(deals: DealIn[]) {
  const counts = new Map<string, number>();
  for (const d of deals.filter((x) => x.stage === "lost")) {
    const reason = d.lostReason?.trim() || "No reason given";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

/**
 * What ad spend bought: the "Ad spend" expenses against all leads and bookings in the same period. Ads can't be
 * tied to single leads here, so these are blended figures — read them as a trend, not an exact attribution.
 */
export function adReturn(deals: DealIn[], expenses: ExpenseIn[]) {
  const spendPaise = expenses.filter((e) => e.category === "Ad spend").reduce((a, e) => a + e.amountPaise, 0);
  const leads = deals.length;
  const won = deals.filter((d) => d.stage === "won");
  const bookedPaise = won.reduce((a, d) => a + d.valuePaise, 0);
  return {
    spendPaise,
    costPerLeadPaise: spendPaise && leads ? Math.round(spendPaise / leads) : null,
    costPerBookingPaise: spendPaise && won.length ? Math.round(spendPaise / won.length) : null,
    /** Confirmed value per rupee of ads (e.g. 12 = ₹12 booked per ₹1 spent). */
    returnMultiple: spendPaise ? Math.round((bookedPaise / spendPaise) * 10) / 10 : null,
  };
}
