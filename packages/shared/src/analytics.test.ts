import { expect, it } from "vitest";
import { adReturn, bySource, lostReasons, seasons } from "./analytics";

const deal = (id: string, channel: "instagram" | "web", stage: string, extra: Record<string, unknown> = {}) => ({ id, channel, stage, valuePaise: 100_000_00, createdAt: "2026-09-01T06:00:00Z", ...extra });
const deals = [
  deal("a", "instagram", "won", { wonAt: "2026-09-11T06:00:00Z", eventDate: "2026-12-12" }),
  deal("b", "instagram", "won", { wonAt: "2026-09-21T06:00:00Z", valuePaise: 300_000_00, eventDate: "2026-12-20" }),
  deal("c", "instagram", "lost", { lostReason: "Budget" }),
  deal("d", "instagram", "new"),
  deal("e", "web", "lost", { lostReason: " Budget " }),
  deal("f", "web", "lost"),
];

it("follows each source from enquiry to bookings and invoiced revenue", () => {
  const rows = bySource(deals, [
    { dealId: "a", supply: "intra", lines: [{ qty: 1, ratePaise: 30_000_00 }], sent: true },
    { dealId: "a", supply: "intra", lines: [{ qty: 1, ratePaise: 99_000_00 }], sent: false }, // draft: not counted
  ]);
  expect(rows[0]).toEqual({ channel: "instagram", leads: 4, confirmed: 2, lost: 1, conversion: 67, confirmedPaise: 400_000_00, invoicedPaise: 30_000_00, avgBookingPaise: 200_000_00, avgDaysToConfirm: 15 });
  expect(rows[1]).toMatchObject({ channel: "web", leads: 2, confirmed: 0, conversion: 0, avgBookingPaise: null, avgDaysToConfirm: null });
});

it("shows the season: enquiries, bookings and weddings per month for the last 12 months", () => {
  const s = seasons(deals, new Date("2026-12-31T20:00:00Z")); // 1 Jan 2027 in IST
  expect(s).toHaveLength(12);
  expect(s.at(-1)!.month).toBe("2027-01");
  expect(s.find((x) => x.month === "2026-09")).toEqual({ month: "2026-09", enquiries: 6, confirmed: 2, events: 0 });
  expect(s.find((x) => x.month === "2026-12")!.events).toBe(2);
});

it("counts why leads were lost, and what ads bought", () => {
  expect(lostReasons(deals)).toEqual([{ reason: "Budget", count: 2 }, { reason: "No reason given", count: 1 }]);
  expect(adReturn(deals, [{ category: "Ad spend", amountPaise: 12_000_00, date: "2026-09-02" }, { category: "Travel & stay", amountPaise: 5_000_00, date: "2026-09-02" }])).toEqual({
    spendPaise: 12_000_00,
    costPerLeadPaise: 2_000_00,
    costPerBookingPaise: 6_000_00,
    returnMultiple: 33.3,
  });
  expect(adReturn(deals, []).returnMultiple).toBeNull();
});
