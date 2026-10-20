import { expect, it } from "vitest";
import { clientJourney } from "./journey";

it("builds a wedding client's journey from bookings, payments, functions and deliverables", () => {
  const j = clientJourney(
    {
      deal: {
        id: "d1", title: "Riya & Arjun", stage: "won", createdAt: "2026-08-01T06:00:00Z", wonAt: "2026-09-02T06:00:00Z",
        schedule: [
          { id: "m1", label: "Booking advance", amountPaise: 1000, dueDate: "2026-09-02", invoiceId: "i1" },
          { id: "m2", label: "Before the wedding", amountPaise: 1000, dueDate: "2026-10-15" },
        ],
      },
      project: {
        dealId: "d1", business: "photography", status: "active",
        events: [{ id: "e1", name: "Sangeet", date: "2026-10-18" }, { id: "e2", name: "Wedding", date: "2026-12-12" }],
        deliverables: [{ id: "x1", name: "Edited photos", dueDate: "2026-12-26", status: "pending" }],
      },
      invoices: [{ id: "i1", supply: "intra", lines: [{ qty: 1, ratePaise: 1000 }], payments: [{ amountPaise: 1180 }] }],
    },
    new Date("2026-10-20T06:00:00Z"),
  );
  expect(j.map((m) => [m.label, m.done, m.late, m.current])).toEqual([
    ["Enquiry", true, false, false],
    ["Booked", true, false, false],
    ["Booking advance", true, false, false],
    ["Before the wedding", false, true, true], // unpaid and past due: the late, current step
    ["Sangeet", true, false, false], // the function happened
    ["Wedding", false, false, false],
    ["Edited photos", false, false, false],
  ]);
});

it("shows a retainer as its months", () => {
  const j = clientJourney({ deal: { id: "d", title: "Brewhouse", stage: "won", createdAt: "2026-08-01T06:00:00Z", wonAt: "2026-08-05T06:00:00Z" }, project: { business: "marketing", status: "active", events: [], deliverables: [], cycles: ["2026-09", "2026-10", "2026-11"] }, invoices: [] }, new Date("2026-10-20T06:00:00Z"));
  expect(j.map((m) => [m.label, m.done, m.current])).toEqual([["Enquiry", true, false], ["Booked", true, false], ["Sept 2026", true, false], ["Oct 2026", false, true], ["Nov 2026", false, false]]);
});
