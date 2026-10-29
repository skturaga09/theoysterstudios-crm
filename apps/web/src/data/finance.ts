/**
 * Quotations, payment schedules and expenses: screen-first updates saved to the API (rolled back on failure),
 * and the derived "what's due" list that drives payment reminders.
 */
import { addDays, DEFAULT_SAC, invoiceTotals, istDay, scheduleFrom, type Business, type ScheduleItem } from "@pinnacle/shared";
import { toast } from "@pinnacle/ui";
import { api, save } from "../lib/api";
import { IS_DEMO } from "../lib/demo";
import { ME_ID } from "./seed";
import { useCrm } from "./store";
import type { Deal, Expense, Invoice, Quote } from "./types";

const set = useCrm.setState;
const get = useCrm.getState;
const temp = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

/** A new draft quotation for a deal (or a client), with the business's standard terms and payment plan. */
export async function createQuote({ deal, companyId, business }: { deal?: Deal; companyId: string; business: Business }): Promise<Quote> {
  const today = istDay(new Date());
  // Other-state GST (IGST) when the client's GSTIN is from a different state than the studio's.
  const theirs = get().companies.find((c) => c.id === companyId)?.gstin ?? "";
  const ours = get().workspace.gstin ?? "";
  const supply: Quote["supply"] = theirs.length >= 2 && ours.length >= 2 && theirs.slice(0, 2) !== ours.slice(0, 2) ? "inter" : "intra";
  const body = {
    supply,
    companyId,
    dealId: deal?.id,
    ownerId: deal?.ownerId ?? ME_ID,
    business,
    validUntil: addDays(today, 30),
    lines: [],
    terms: get().finance.terms[business],
    schedule: [],
  };
  const quote: Quote = IS_DEMO
    ? { ...body, id: temp("q"), number: `TOS/Q/26-27/${String(get().quotes.length + 1).padStart(3, "0")}`, status: "draft", createdAt: new Date().toISOString() }
    : await api<Quote>("/quotes", { method: "POST", body });
  set((s) => ({ quotes: [quote, ...s.quotes] }));
  return quote;
}

export function updateQuote(id: string, changes: Partial<Quote>) {
  const prev = get().quotes;
  set({ quotes: prev.map((q) => (q.id === id ? { ...q, ...changes } : q)) });
  save(api(`/quotes/${id}`, { method: "PATCH", body: changes }), () => set({ quotes: prev }));
}

/** Accepting confirms the booking: the API sets the deal's value, schedule and stage; this mirrors it. */
export async function acceptQuote(q: Quote) {
  updateQuote(q.id, { status: "accepted" });
  if (!q.dealId) return;
  const subtotal = invoiceTotals({ ...q, payments: [] }).subtotal;
  if (IS_DEMO) {
    set((s) => ({ deals: s.deals.map((d) => (d.id === q.dealId ? { ...d, valuePaise: subtotal, schedule: d.schedule?.some((m) => m.invoiceId) ? d.schedule : q.schedule } : d)) }));
    const deal = get().deals.find((d) => d.id === q.dealId);
    if (deal && deal.stage !== "won") get().moveDeal(deal.id, "won");
    return;
  }
  const deal = get().deals.find((d) => d.id === q.dealId);
  if (deal && deal.stage !== "won") get().moveDeal(deal.id, "won"); // shows the client and project straight away
  // Pick up the value and schedule the API wrote.
  setTimeout(() => void api<Deal>(`/deals/${q.dealId}`).then((d) => set((s) => ({ deals: s.deals.map((x) => (x.id === d.id ? d : x)) })), () => {}), 1500);
}

/** The plan's stages for a deal's value, dated from its event and confirmation. */
export const planFor = (deal: Pick<Deal, "business" | "valuePaise" | "wonAt" | "eventDate">, amountPaise = deal.valuePaise) =>
  scheduleFrom(get().finance.plans[deal.business ?? "photography"], amountPaise, { confirmedAt: deal.wonAt ?? new Date().toISOString(), eventDate: deal.eventDate });

export function setSchedule(dealId: string, schedule: ScheduleItem[]) {
  const prev = get().deals;
  set({ deals: prev.map((d) => (d.id === dealId ? { ...d, schedule } : d)) });
  save(api(`/deals/${dealId}/schedule`, { method: "PUT", body: { schedule } }), () => set({ deals: prev }));
}

/** Raises the invoice for one payment stage (the API numbers it and links it to the stage). */
export async function invoiceStage(dealId: string, itemId: string, kind: "tax" | "cash" = "tax") {
  if (IS_DEMO) return void toast("Invoices are numbered by the server — sign in to raise one");
  try {
    const { invoice, deal } = await api<{ invoice: Invoice; deal: Deal }>(`/deals/${dealId}/schedule/${itemId}/invoice`, { method: "POST", body: { kind } });
    set((s) => ({ invoices: [invoice, ...s.invoices], deals: s.deals.map((d) => (d.id === deal.id ? deal : d)) }));
    toast(`${kind === "cash" ? "Cash bill" : "Invoice"} ${invoice.number} raised as a draft — check it and mark it sent`);
    return invoice;
  } catch (e) {
    toast(`Couldn't raise the invoice — ${(e as Error).message}`);
  }
}

export type StageState = "planned" | "due" | "overdue" | "invoiced" | "part paid" | "paid";
/** Where a payment stage stands: not yet due, due within a week, overdue, or invoiced and how far paid. */
export function stageState(m: ScheduleItem, invoices: Invoice[], today = istDay(new Date())): StageState {
  const inv = m.invoiceId ? invoices.find((i) => i.id === m.invoiceId) : undefined;
  if (inv && !inv.cancelled) {
    const t = invoiceTotals(inv);
    if (t.due <= 100) return "paid";
    if (t.paid > 0) return "part paid";
    return inv.sent && istDay(inv.dueAt) < today ? "overdue" : "invoiced";
  }
  if (!m.dueDate) return "planned";
  if (m.dueDate < today) return "overdue";
  return m.dueDate <= addDays(today, 7) ? "due" : "planned";
}

export type DuePayment = { deal: Deal; item: ScheduleItem; state: StageState; amountPaise: number };
/** Payment stages to chase: overdue, or due within a week, not yet paid. Oldest first. */
export function paymentsDue(deals: Deal[], invoices: Invoice[]): DuePayment[] {
  return deals
    .flatMap((deal) =>
      (deal.schedule ?? []).map((item) => {
        const inv = item.invoiceId ? invoices.find((i) => i.id === item.invoiceId) : undefined;
        // What the client owes for it: the invoice balance once invoiced, else the stage plus GST.
        const amountPaise = inv ? invoiceTotals(inv).due : invoiceTotals({ supply: "intra", lines: [{ qty: 1, ratePaise: item.amountPaise }], payments: [] }).total;
        return { deal, item, state: stageState(item, invoices), amountPaise };
      }),
    )
    .filter((x) => x.state === "due" || x.state === "overdue" || ((x.state === "invoiced" || x.state === "part paid") && !!x.item.dueDate && x.item.dueDate <= addDays(istDay(new Date()), 7)))
    .sort((a, b) => (a.item.dueDate ?? "").localeCompare(b.item.dueDate ?? ""));
}

/** A WhatsApp chat with the client, the reminder already typed (they still press send). */
export function whatsappReminder(phone: string | undefined, text: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits; // Indian numbers saved without the country code
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

export const sacFor = (b?: Business) => DEFAULT_SAC[b ?? "photography"];

export function addExpense(e: Omit<Expense, "id" | "createdAt">) {
  const local: Expense = { ...e, id: temp("e"), createdAt: new Date().toISOString() };
  set((s) => ({ expenses: [local, ...s.expenses] }));
  if (IS_DEMO) return;
  api<Expense>("/expenses", { method: "POST", body: e }).then(
    (saved) => set((s) => ({ expenses: s.expenses.map((x) => (x.id === local.id ? saved : x)) })),
    (err: Error) => {
      set((s) => ({ expenses: s.expenses.filter((x) => x.id !== local.id) }));
      toast(`Couldn't save the expense — ${err.message}`);
    },
  );
}

export function removeExpense(id: string) {
  const prev = get().expenses;
  set({ expenses: prev.filter((x) => x.id !== id) });
  save(api(`/expenses/${id}`, { method: "DELETE" }), () => set({ expenses: prev }));
}
