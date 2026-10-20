import type { PlanStep } from "./domain";
import { invoiceTotals, type InvoiceMath } from "./invoice";
import { addDays, istDay } from "./projects";
import type { Business } from "./domain";

export type ScheduleItem = { id: string; label: string; amountPaise: number; dueDate?: string; invoiceId?: string };

/**
 * Splits a taxable amount across a payment plan, with dates from the event or the booking (never before the
 * booking). Rounding goes to the last stage so the parts always add up to the whole.
 */
export function scheduleFrom(plan: PlanStep[], amountPaise: number, { confirmedAt, eventDate }: { confirmedAt: string; eventDate?: string }): ScheduleItem[] {
  const confirmed = istDay(confirmedAt);
  let left = amountPaise;
  return plan.map((s, i) => {
    const amount = i === plan.length - 1 ? left : Math.round((amountPaise * s.percent) / 100);
    left -= amount;
    const day = addDays(s.from === "event" && eventDate ? eventDate : confirmed, s.days);
    return { id: `m${i + 1}`, label: s.label, amountPaise: amount, dueDate: day < confirmed ? confirmed : day };
  });
}

type Sale = Omit<InvoiceMath, "payments"> & { business?: Business; sent?: boolean; cancelled?: boolean; issuedAt: string; dealId?: string };
type Cost = { business?: Business; date: string; amountPaise: number; projectId?: string };
export type PnlRow = { month: string; business: Business | "none"; revenuePaise: number; expensesPaise: number; profitPaise: number };

/**
 * Profit and loss by month (IST, "2026-10") and business, before GST: sent invoices' taxable value less credit
 * notes, minus expenses. Accrual basis: revenue counts when invoiced, not when paid.
 */
export function profitAndLoss({ invoices, creditNotes, expenses }: { invoices: Sale[]; creditNotes: Sale[]; expenses: Cost[] }): PnlRow[] {
  const rows = new Map<string, PnlRow>();
  const row = (at: string, business?: Business) => {
    const month = istDay(at).slice(0, 7);
    const key = `${month}|${business ?? "none"}`;
    if (!rows.has(key)) rows.set(key, { month, business: business ?? "none", revenuePaise: 0, expensesPaise: 0, profitPaise: 0 });
    return rows.get(key)!;
  };
  const taxable = (s: Sale) => invoiceTotals({ ...s, payments: [] }).subtotal;
  for (const i of invoices) if (i.sent && !i.cancelled) row(i.issuedAt, i.business).revenuePaise += taxable(i);
  for (const c of creditNotes) row(c.issuedAt, c.business).revenuePaise -= taxable(c);
  for (const e of expenses) row(`${e.date}T12:00:00+05:30`, e.business).expensesPaise += e.amountPaise;
  return [...rows.values()].map((r) => ({ ...r, profitPaise: r.revenuePaise - r.expensesPaise })).sort((a, b) => b.month.localeCompare(a.month) || a.business.localeCompare(b.business));
}
