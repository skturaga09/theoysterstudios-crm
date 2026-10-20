import { expect, it } from "vitest";
import { registerTable, salesRegister } from "./gstr1";

const seller = { gstin: "29ABCDE1234F1Z5" };

it("lists sent invoices and credit notes for the period, ready for GSTR-1", () => {
  const rows = salesRegister(
    {
      invoices: [
        // A registered client in Maharashtra: B2B, IGST.
        { number: "TOS/26-27/002", issuedAt: "2026-10-05T06:00:00Z", sent: true, supply: "inter", seller, buyer: { name: "Atlas", gstin: "27ABCDE1234F1Z5" }, lines: [{ sac: "998361", qty: 1, ratePaise: 1_00_000_00 }] },
        // An unregistered couple in Karnataka with two kinds of work: B2CS, CGST + SGST, one row per SAC.
        { number: "TOS/26-27/001", issuedAt: "2026-10-01T06:00:00Z", sent: true, supply: "intra", seller, buyer: { name: "Riya & Arjun" }, lines: [{ sac: "998383", qty: 1, ratePaise: 50_000_00 }, { sac: "998361", qty: 2, ratePaise: 5_000_00 }] },
        { number: "TOS/26-27/003", issuedAt: "2026-10-06T06:00:00Z", sent: false, supply: "intra", seller, lines: [{ sac: "998383", qty: 1, ratePaise: 1 }] }, // draft
        { number: "TOS/26-27/000", issuedAt: "2026-09-30T19:00:00Z", sent: true, supply: "intra", seller, lines: [{ sac: "998383", qty: 1, ratePaise: 1 }] }, // 1 Oct IST
        { number: "TOS/26-27/099", issuedAt: "2026-11-01T06:00:00Z", sent: true, supply: "intra", seller, lines: [{ sac: "998383", qty: 1, ratePaise: 1 }] }, // next month
      ],
      creditNotes: [{ number: "TOS/CN/26-27/001", invoiceNumber: "TOS/26-27/002", issuedAt: "2026-10-20T06:00:00Z", supply: "inter", seller, buyer: { name: "Atlas", gstin: "27ABCDE1234F1Z5" }, lines: [{ sac: "998361", qty: 1, ratePaise: 10_000_00 }] }],
    },
    "2026-10-01",
    "2026-10-31",
  );
  expect(rows.map((r) => [r.number, r.sac, r.section])).toEqual([
    ["TOS/26-27/000", "998383", "B2CS"],
    ["TOS/26-27/001", "998383", "B2CS"],
    ["TOS/26-27/001", "998361", "B2CS"],
    ["TOS/26-27/002", "998361", "B2B"],
    ["TOS/CN/26-27/001", "998361", "CDNR"],
  ]);
  expect(rows[1]).toMatchObject({ placeOfSupply: "29-Karnataka", taxablePaise: 50_000_00, cgstPaise: 4_500_00, sgstPaise: 4_500_00, igstPaise: 0, totalPaise: 59_000_00 });
  expect(rows[3]).toMatchObject({ placeOfSupply: "27-Maharashtra", igstPaise: 18_000_00, totalPaise: 1_18_000_00 });
  expect(rows[4]).toMatchObject({ type: "Credit note", against: "TOS/26-27/002", taxablePaise: -10_000_00, igstPaise: -1_800_00 });
  const table = registerTable(rows);
  expect(table[0]![10]).toBe("Taxable value (₹)");
  expect(table[5]![10]).toBe("-10000.00");
});
