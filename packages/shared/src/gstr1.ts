import { GST_STATES } from "./gst";
import { invoiceTotals, type InvoiceMath } from "./invoice";
import { istDay } from "./projects";

type Party = { gstin?: string; name?: string; city?: string };
type Doc = Omit<InvoiceMath, "payments" | "lines"> & {
  number: string;
  issuedAt: string;
  sent?: boolean;
  cancelled?: boolean;
  lines: { sac: string; qty: number; ratePaise: number }[];
  seller?: { gstin?: string };
  buyer?: Party;
};
type Note = Doc & { invoiceNumber: string };

export type RegisterRow = {
  type: "Invoice" | "Credit note";
  number: string;
  date: string; // YYYY-MM-DD, IST
  against?: string; // the invoice a credit note corrects
  buyer: string;
  buyerGstin: string;
  /** GSTR-1 section: B2B (client has a GSTIN), B2CS (unregistered) or CDNR / CDNUR for credit notes. */
  section: "B2B" | "B2CS" | "CDNR" | "CDNUR";
  placeOfSupply: string; // "29-Karnataka"
  sac: string;
  ratePercent: 18;
  taxablePaise: number;
  igstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalPaise: number;
};

const place = (d: Doc) => {
  // Where the client is: their GSTIN's state; an unregistered client billed in-state is in the studio's state.
  const code = d.buyer?.gstin?.slice(0, 2) || (d.supply === "intra" ? d.seller?.gstin?.slice(0, 2) : undefined);
  return code && GST_STATES[code] ? `${code}-${GST_STATES[code]}` : "";
};

/** One row per SAC on the document; GST is worked out per row the same way the invoice works it out. */
function rows(d: Doc, type: RegisterRow["type"], sign: 1 | -1, against?: string): RegisterRow[] {
  const sacs = [...new Set(d.lines.map((l) => l.sac))];
  const registered = !!d.buyer?.gstin;
  return sacs.map((sac) => {
    const t = invoiceTotals({ supply: d.supply, lines: d.lines.filter((l) => l.sac === sac), payments: [] });
    return {
      type,
      number: d.number,
      date: istDay(d.issuedAt),
      ...(against && { against }),
      buyer: d.buyer?.name ?? "",
      buyerGstin: d.buyer?.gstin ?? "",
      section: type === "Invoice" ? (registered ? "B2B" : "B2CS") : registered ? "CDNR" : "CDNUR",
      placeOfSupply: place(d),
      sac,
      ratePercent: 18,
      taxablePaise: sign * t.subtotal,
      igstPaise: sign * t.igst,
      cgstPaise: sign * t.cgst,
      sgstPaise: sign * t.sgst,
      totalPaise: sign * t.total,
    };
  });
}

/**
 * The sales register a CA needs for GSTR-1 and the books: every sent, not-cancelled invoice and every credit note
 * issued between `from` and `to` (IST days, inclusive), in number order. Credit notes are negative. Drafts and
 * cancelled drafts never had a GST effect, so they're left out.
 */
export function salesRegister({ invoices, creditNotes }: { invoices: Doc[]; creditNotes: Note[] }, from: string, to: string): RegisterRow[] {
  const inRange = (d: Doc) => istDay(d.issuedAt) >= from && istDay(d.issuedAt) <= to;
  return [
    // Cash bills carry no GST, so they stay out of the GST register.
    ...invoices.filter((i) => i.sent && !i.cancelled && i.kind !== "cash" && inRange(i)).flatMap((i) => rows(i, "Invoice", 1)),
    ...creditNotes.filter(inRange).flatMap((c) => rows(c, "Credit note", -1, c.invoiceNumber)),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
}

const rupees = (p: number) => (p / 100).toFixed(2);
/** The register as spreadsheet rows (₹ with paise, as GST portals and Tally imports expect). */
export function registerTable(rows: RegisterRow[]): (string | number)[][] {
  return [
    ["Type", "Number", "Date", "Against invoice", "Buyer", "Buyer GSTIN", "GSTR-1 section", "Place of supply", "SAC", "GST rate %", "Taxable value (₹)", "IGST (₹)", "CGST (₹)", "SGST (₹)", "Total (₹)"],
    ...rows.map((r) => [r.type, r.number, r.date, r.against ?? "", r.buyer, r.buyerGstin, r.section, r.placeOfSupply, r.sac, r.ratePercent, rupees(r.taxablePaise), rupees(r.igstPaise), rupees(r.cgstPaise), rupees(r.sgstPaise), rupees(r.totalPaise)]),
  ];
}
