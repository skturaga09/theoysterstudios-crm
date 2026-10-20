import type { Business } from "./domain";
import { invoiceTotals, type InvoiceMath } from "./invoice";
import { istDay } from "./projects";

type DealIn = { business?: Business; stage: string; valuePaise: number; createdAt: string; wonAt?: string; lostAt?: string; ownerId: string; nextFollowUpAt?: string | null };
type ExpenseIn = { business?: Business; date: string; amountPaise: number };
type ProjectIn = { id: string; business: Business; status: string; managerId?: string; dueDate?: string; crew: { memberId: string }[]; deliverables: { status: string; dueDate?: string }[] };
type TaskIn = { business?: Business; projectId?: string; done: boolean; dueAt: string; assigneeId: string; approval?: string };
type InvoiceIn = Omit<InvoiceMath, "payments"> & { business?: Business; sent: boolean; cancelled?: boolean; issuedAt: string; dueAt: string; payments: { at: string; amountPaise: number }[] };
export type DashboardInput = { deals: DealIn[]; projects: ProjectIn[]; tasks: TaskIn[]; invoices: InvoiceIn[]; expenses?: ExpenseIn[] };

const DAY = 86_400_000;
const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isOpen = (d: DealIn) => d.stage !== "won" && d.stage !== "lost";
const liveProject = (p: ProjectIn) => p.status === "planning" || p.status === "active";

/**
 * The owner's numbers, for whatever records are passed in (one business or both). "This month" is the IST
 * calendar month; money is in paise. Conversion counts every lead that has closed, won or lost.
 */
export function ownerSummary({ deals, projects, tasks, invoices, expenses = [] }: DashboardInput, now = new Date()) {
  const today = istDay(now);
  const month = today.slice(0, 7);
  const inMonth = (at?: string) => !!at && istDay(at).slice(0, 7) === month;
  const in30 = istDay(new Date(now.getTime() + 30 * DAY));
  const in7 = istDay(new Date(now.getTime() + 7 * DAY));
  const late = (t: TaskIn) => !t.done && Date.parse(t.dueAt) < now.getTime();

  const won = deals.filter((d) => d.stage === "won");
  const closed = won.length + deals.filter((d) => d.stage === "lost").length;
  const wonMonth = won.filter((d) => inMonth(d.wonAt));
  const open = deals.filter(isOpen);

  const live = projects.filter(liveProject);
  const projectTasks = tasks.filter((t) => t.projectId);

  const billed = invoices.filter((i) => i.sent && !i.cancelled);
  const due = billed.map((i) => ({ i, due: invoiceTotals(i).due })).filter((x) => x.due > 0);

  return {
    sales: {
      newLeads: deals.filter((d) => inMonth(d.createdAt)).length,
      confirmed: wonMonth.length,
      lost: deals.filter((d) => d.stage === "lost" && inMonth(d.lostAt)).length,
      confirmedPaise: total(wonMonth.map((d) => d.valuePaise)),
      pipelinePaise: total(open.map((d) => d.valuePaise)),
      openLeads: open.length,
      conversion: closed ? Math.round((won.length / closed) * 100) : null,
      followUpsOverdue: open.filter((d) => d.nextFollowUpAt && Date.parse(d.nextFollowUpAt) < now.getTime()).length,
    },
    projects: {
      active: live.length,
      pendingTasks: tasks.filter((t) => !t.done).length,
      eventsNext30: live.filter((p) => p.business === "photography" && p.dueDate && p.dueDate >= today && p.dueDate <= in30).length,
      overdueTasks: projectTasks.filter(late).length,
      awaitingApproval: projectTasks.filter((t) => !t.done && t.approval === "pending").length,
      deliverablesDue: total(live.map((p) => p.deliverables.filter((d) => d.status !== "delivered" && d.dueDate && d.dueDate <= in7).length)),
    },
    finance: {
      invoicedPaise: total(billed.filter((i) => inMonth(i.issuedAt)).map((i) => invoiceTotals(i).total)),
      /** This month, before GST: sent invoices' taxable value minus expenses (credit notes are left to the P&L page). */
      expensesPaise: total(expenses.filter((e) => e.date.slice(0, 7) === month).map((e) => e.amountPaise)),
      profitPaise:
        total(billed.filter((i) => inMonth(i.issuedAt)).map((i) => invoiceTotals(i).subtotal)) - total(expenses.filter((e) => e.date.slice(0, 7) === month).map((e) => e.amountPaise)),
      receivedPaise: total(invoices.filter((i) => !i.cancelled).flatMap((i) => i.payments.filter((p) => inMonth(p.at)).map((p) => p.amountPaise))),
      outstandingPaise: total(due.map((x) => x.due)),
      overduePaise: total(due.filter((x) => Date.parse(x.i.dueAt) < now.getTime()).map((x) => x.due)),
    },
    /** Per person: their open leads, what they confirmed this month, their open and late tasks, live projects they're on. */
    person: (id: string) => ({
      openLeads: open.filter((d) => d.ownerId === id).length,
      confirmedPaise: total(wonMonth.filter((d) => d.ownerId === id).map((d) => d.valuePaise)),
      openTasks: tasks.filter((t) => !t.done && t.assigneeId === id).length,
      overdueTasks: tasks.filter((t) => late(t) && t.assigneeId === id).length,
      projects: live.filter((p) => p.managerId === id || p.crew.some((c) => c.memberId === id)).length,
    }),
  };
}

/** The records that belong to one business (for the side-by-side view). */
export const onlyBusiness = (input: DashboardInput, b: Business): DashboardInput => ({
  deals: input.deals.filter((x) => x.business === b),
  projects: input.projects.filter((x) => x.business === b),
  tasks: input.tasks.filter((x) => x.business === b),
  invoices: input.invoices.filter((x) => x.business === b),
  expenses: (input.expenses ?? []).filter((x) => x.business === b),
});
