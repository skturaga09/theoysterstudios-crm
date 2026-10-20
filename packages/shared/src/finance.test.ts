import { describe, expect, it } from "vitest";
import { DEFAULT_FINANCE } from "./domain";
import { profitAndLoss, scheduleFrom } from "./finance";

describe("finance", () => {
  it("splits a booking across the plan; the parts add up and nothing is due before booking", () => {
    const s = scheduleFrom(DEFAULT_FINANCE.plans.photography, 3_00_001_00, { confirmedAt: "2026-10-20T06:00:00Z", eventDate: "2026-12-10" });
    expect(s.map((x) => [x.label, x.amountPaise, x.dueDate])).toEqual([
      ["Booking advance", 90_000_30, "2026-10-20"],
      ["Before the wedding", 1_50_000_50, "2026-12-03"],
      ["On delivery", 60_000_20, "2027-01-24"],
    ]);
    expect(s.reduce((a, x) => a + x.amountPaise, 0)).toBe(3_00_001_00);
    expect(scheduleFrom(DEFAULT_FINANCE.plans.photography, 100, { confirmedAt: "2026-12-08T06:00:00Z", eventDate: "2026-12-10" })[1]!.dueDate).toBe("2026-12-08");
  });

  it("adds up profit by IST month and business, before GST", () => {
    const line = (ratePaise: number) => [{ qty: 1, ratePaise }];
    const rows = profitAndLoss({
      invoices: [
        { business: "photography", supply: "intra", lines: line(1000), sent: true, issuedAt: "2026-09-30T20:00:00Z" }, // 1 Oct IST
        { business: "photography", supply: "intra", lines: line(500), sent: false, issuedAt: "2026-10-05T00:00:00Z" }, // draft
        { business: "marketing", supply: "inter", lines: line(700), sent: true, cancelled: true, issuedAt: "2026-10-05T00:00:00Z" },
      ],
      creditNotes: [{ business: "photography", supply: "intra", lines: line(100), issuedAt: "2026-10-09T00:00:00Z" }],
      expenses: [{ business: "photography", date: "2026-10-03", amountPaise: 300 }, { business: "marketing", date: "2026-09-12", amountPaise: 50 }],
    });
    expect(rows).toEqual([
      { month: "2026-10", business: "photography", revenuePaise: 900, expensesPaise: 300, profitPaise: 600 },
      { month: "2026-09", business: "marketing", revenuePaise: 0, expensesPaise: 50, profitPaise: -50 },
    ]);
  });
});
