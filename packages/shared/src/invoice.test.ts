import { expect, it } from "vitest";
import { invoiceTotals } from "./invoice";

it("splits 18% GST and tracks the balance", () => {
  const lines = [{ qty: 1, ratePaise: 100001 }];
  const intra = invoiceTotals({ supply: "intra", lines, payments: [{ amountPaise: 50000 }] });
  expect(intra).toMatchObject({ subtotal: 100001, cgst: 9000, sgst: 9000, igst: 0, total: 118001, paid: 50000, due: 68001 });
  expect(intra.cgst + intra.sgst).toBe(Math.round(100001 * 0.18));
  expect(invoiceTotals({ supply: "inter", lines, payments: [{ amountPaise: 200000 }] })).toMatchObject({ igst: 18000, due: 0 });
});
