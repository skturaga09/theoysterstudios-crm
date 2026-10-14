import { invoiceTotals, STAGES, type Stage } from "@pinnacle/shared";
import type { Deal, Invoice, InvoiceStatus, Task } from "./types";

export const PROBABILITY: Record<Stage, number> = { new: 0.1, qualified: 0.25, proposal: 0.5, negotiation: 0.75, won: 1, lost: 0 };
export const OPEN_STAGES = STAGES.filter((s) => s !== "won") as Stage[];

export const isOpen = (d: Deal) => d.stage !== "won" && d.stage !== "lost";
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const startOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfMonth = () => {
  const d = startOfMonth();
  d.setMonth(d.getMonth() + 1);
  return d;
};
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export function pipelineMetrics(deals: Deal[]) {
  const open = deals.filter(isOpen);
  const som = startOfMonth();
  const wonThisMonth = deals.filter((d) => d.stage === "won" && d.wonAt && new Date(d.wonAt) >= som);
  return {
    openCount: open.length,
    openPaise: sum(open.map((d) => d.valuePaise)),
    weightedPaise: Math.round(sum(open.map((d) => d.valuePaise * PROBABILITY[d.stage]))),
    wonPaise: sum(wonThisMonth.map((d) => d.valuePaise)),
    wonCount: wonThisMonth.length,
  };
}

export function closingThisMonth(deals: Deal[]) {
  const eom = endOfMonth();
  return deals
    .filter((d) => isOpen(d) && new Date(d.closeAt) < eom)
    .sort((a, b) => +new Date(a.closeAt) - +new Date(b.closeAt));
}

export type TaskGroup = "overdue" | "today" | "upcoming" | "done";
export function taskGroup(t: Task): TaskGroup {
  if (t.done) return "done";
  const sod = startOfToday();
  const eod = new Date(sod);
  eod.setDate(eod.getDate() + 1);
  const due = new Date(t.dueAt);
  if (due < sod) return "overdue";
  if (due < eod) return "today";
  return "upcoming";
}

/* ---------- invoices ---------- */
export { invoiceTotals };
export function invoiceStatus(inv: Invoice): InvoiceStatus {
  if (inv.cancelled) return "cancelled";
  const t = invoiceTotals(inv);
  if (!inv.sent) return "draft";
  if (t.due <= 100) return t.credited > 0 && t.paid === 0 ? "credited" : "paid";
  if (new Date(inv.dueAt) < startOfToday()) return "overdue";
  if (t.paid > 0) return "partial";
  return "sent";
}
export const daysOverdue = (inv: Invoice) =>
  Math.max(0, Math.floor((+startOfToday() - +new Date(inv.dueAt)) / 86_400_000));
export function agingBucket(inv: Invoice): "0–30" | "31–60" | "61–90" | "90+" {
  const d = daysOverdue(inv);
  if (d <= 30) return "0–30";
  if (d <= 60) return "31–60";
  if (d <= 90) return "61–90";
  return "90+";
}

/* ---------- text ---------- */
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
export const countWord = (n: number) => WORDS[n] ?? String(n);
export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
