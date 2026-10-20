import { expect, it } from "vitest";
import { onlyBusiness, ownerSummary } from "./dashboard";

const now = new Date("2026-10-20T06:00:00Z"); // 20 Oct, 11:30 IST
const line = (ratePaise: number) => ({ qty: 1, ratePaise });

it("adds up the owner's numbers for this IST month, per business", () => {
  const input = {
    deals: [
      { business: "photography" as const, stage: "won", valuePaise: 500, createdAt: "2026-10-02T00:00:00Z", wonAt: "2026-10-05T00:00:00Z", ownerId: "a" },
      { business: "photography" as const, stage: "won", valuePaise: 900, createdAt: "2026-08-02T00:00:00Z", wonAt: "2026-09-30T19:00:00Z", ownerId: "a" }, // 1 Oct IST
      { business: "marketing" as const, stage: "lost", valuePaise: 100, createdAt: "2026-09-01T00:00:00Z", ownerId: "b" },
      { business: "marketing" as const, stage: "new", valuePaise: 300, createdAt: "2026-10-10T00:00:00Z", ownerId: "b", nextFollowUpAt: "2026-10-19T05:00:00Z" },
    ],
    projects: [
      { id: "p1", business: "photography" as const, status: "active", managerId: "a", dueDate: "2026-11-10", crew: [{ memberId: "c" }], deliverables: [{ status: "pending", dueDate: "2026-10-25" }, { status: "delivered", dueDate: "2026-10-21" }] },
      { id: "p2", business: "photography" as const, status: "delivered", dueDate: "2026-10-30", crew: [], deliverables: [{ status: "pending", dueDate: "2026-10-21" }] },
    ],
    tasks: [
      { business: "photography" as const, projectId: "p1", done: false, dueAt: "2026-10-19T12:30:00Z", assigneeId: "c", approval: "pending" },
      { business: "photography" as const, projectId: "p1", done: true, dueAt: "2026-10-18T12:30:00Z", assigneeId: "c" },
      { business: "marketing" as const, done: false, dueAt: "2026-10-25T12:30:00Z", assigneeId: "b" },
    ],
    invoices: [
      // 1000 + 18% GST = 1180, 500 paid this month, due 15 Oct → 680 overdue.
      { business: "photography" as const, supply: "intra" as const, lines: [line(1000)], sent: true, issuedAt: "2026-10-01T00:00:00Z", dueAt: "2026-10-15T00:00:00Z", payments: [{ at: "2026-10-03T00:00:00Z", amountPaise: 500 }] },
      { business: "marketing" as const, supply: "intra" as const, lines: [line(1000)], sent: false, issuedAt: "2026-10-01T00:00:00Z", dueAt: "2026-11-15T00:00:00Z", payments: [] }, // draft: not counted
    ],
  };
  const all = ownerSummary(input, now);
  expect(all.sales).toEqual({ newLeads: 2, confirmed: 2, confirmedPaise: 1400, pipelinePaise: 300, openLeads: 1, conversion: 67, followUpsOverdue: 1 });
  expect(all.projects).toEqual({ active: 1, eventsNext30: 1, overdueTasks: 1, awaitingApproval: 1, deliverablesDue: 1 });
  expect(all.finance).toEqual({ invoicedPaise: 1180, receivedPaise: 500, outstandingPaise: 680, overduePaise: 680 });
  expect(all.person("c")).toEqual({ openLeads: 0, confirmedPaise: 0, openTasks: 1, overdueTasks: 1, projects: 1 });
  const marketing = ownerSummary(onlyBusiness(input, "marketing"), now);
  expect(marketing.sales.conversion).toBe(0);
  expect(marketing.finance.invoicedPaise).toBe(0);
  expect(ownerSummary(onlyBusiness(input, "photography"), now).sales.confirmed).toBe(2);
});
