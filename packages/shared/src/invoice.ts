import type { Paise } from "./money";

export type InvoiceMath = {
  supply: "intra" | "inter";
  lines: { qty: number; ratePaise: Paise }[];
  payments: { amountPaise: Paise }[];
  /** Credit notes raised against the invoice (their total including GST). */
  credits?: { totalPaise: Paise }[];
};

/** 18% GST: intra-state splits into CGST + SGST, inter-state is IGST. Shared so web and API agree to the paisa. */
export function invoiceTotals(inv: InvoiceMath) {
  const subtotal = inv.lines.reduce((a, l) => a + Math.round(l.qty * l.ratePaise), 0);
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;
  const paid = inv.payments.reduce((a, p) => a + p.amountPaise, 0);
  const credited = (inv.credits ?? []).reduce((a, c) => a + c.totalPaise, 0);
  return {
    subtotal,
    cgst: inv.supply === "intra" ? Math.round(gst / 2) : 0,
    sgst: inv.supply === "intra" ? gst - Math.round(gst / 2) : 0,
    igst: inv.supply === "inter" ? gst : 0,
    total,
    paid,
    credited,
    due: Math.max(0, total - paid - credited),
  };
}
