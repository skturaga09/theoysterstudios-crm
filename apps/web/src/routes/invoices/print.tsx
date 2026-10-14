import { fmtDate, gstState, invoiceTotals, rupeesInWords } from "@pinnacle/shared";
import { Button } from "@pinnacle/ui";
import { ArrowLeft, Printer } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { EmptyState } from "../../components/empty-state";
import { invoiceStatus } from "../../data/derive";
import { useCrm, useWorkspace } from "../../data/store";

/** ₹ amounts on a tax invoice keep their paise: 1,18,000.00 */
const inr = (paise: number) => (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const stateWithCode = (gstin?: string) => (gstin && gstState(gstin) ? `${gstState(gstin)} (${gstin.slice(0, 2)})` : undefined);

// Printed pages are always light, whatever the app theme; A4 with the browser's header/footer space removed.
const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
.inv { --i-ink:#111; --i-ink2:#444; --i-ink3:#777; --i-line:#d9d9d4; background:#fff; color:var(--i-ink); }
.inv .i2 { color: var(--i-ink2); } .inv .i3 { color: var(--i-ink3); } .inv .bl { border-color: var(--i-line); }
@media print { body { background:#fff !important; } .inv { box-shadow:none !important; margin:0 !important; width:auto !important; padding:0 !important; } }
`;

/** Printable GST tax invoice: the browser's "Save as PDF" turns it into the PDF. */
export function InvoicePrintRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const inv = useCrm((s) => s.invoices.find((i) => i.id === id));
  const co = useCrm((s) => s.companies.find((c) => c.id === inv?.companyId));
  const workspace = useWorkspace();

  useEffect(() => {
    if (!inv) return;
    const before = document.title;
    document.title = `${inv.number.replaceAll("/", "-")} ${co?.name ?? ""}`.trim(); // becomes the PDF's file name
    return () => void (document.title = before);
  }, [inv, co]);

  if (!inv) return <div className="p-8"><EmptyState icon={Printer} title="Invoice not found" body="It may have been removed, or the link is old." /></div>;

  const seller = inv.seller ?? workspace;
  const t = invoiceTotals(inv);
  const st = invoiceStatus(inv);
  const stamp = st === "draft" ? "DRAFT — NOT ISSUED" : st === "cancelled" ? "CANCELLED" : undefined;
  // Place of supply is where the client is: their GSTIN's state, or ours for an intra-state supply.
  const placeOfSupply = stateWithCode(co?.gstin) ?? (inv.supply === "intra" ? stateWithCode(seller.gstin) : undefined) ?? co?.city ?? "—";

  return (
    <div className="min-h-dvh bg-sunken py-6 print:bg-white print:py-0">
      <style>{PRINT_CSS}</style>
      <div className="mx-auto mb-4 flex w-[210mm] max-w-full items-center gap-2 px-4 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft strokeWidth={1.5} /> Back</Button>
        <span className="t-meta text-ink-3">In the print dialog choose “Save as PDF”.</span>
        <Button variant="ink" size="sm" className="ml-auto" onClick={() => window.print()}><Printer strokeWidth={1.5} /> Print / Save as PDF</Button>
      </div>

      <article className="inv relative mx-auto w-[210mm] max-w-full p-[14mm] text-[11.5px] leading-relaxed shadow-pop" aria-label={`Tax invoice ${inv.number}`}>
        {stamp && <div className="absolute top-[14mm] left-1/2 -translate-x-1/2 rounded border-2 border-current px-3 py-1 text-[13px] font-semibold tracking-wider text-[#b42318]">{stamp}</div>}

        <header className="bl flex items-start gap-6 border-b pb-5">
          <img src="/logo.png" alt="" className="h-20 w-auto object-contain" />
          <div className="ml-auto text-right">
            <h1 className="m-0 text-[20px] font-semibold tracking-wide">TAX INVOICE</h1>
            <p className="i3 m-0 text-[10px]">Original for recipient</p>
            <dl className="m-0 mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 font-mono text-[11px]">
              <dt className="i3">Invoice no.</dt><dd className="m-0 font-semibold">{inv.number}</dd>
              <dt className="i3">Date</dt><dd className="m-0">{fmtDate(inv.issuedAt)}</dd>
              <dt className="i3">Due</dt><dd className="m-0">{fmtDate(inv.dueAt)}</dd>
            </dl>
          </div>
        </header>

        <section className="bl grid grid-cols-2 gap-6 border-b py-5">
          <div>
            <h2 className="i3 m-0 mb-1 text-[10px] font-medium tracking-wider uppercase">Supplier</h2>
            <p className="m-0 font-semibold">{seller.legalName || "—"}</p>
            <p className="i2 m-0 whitespace-pre-line">{seller.address}</p>
            <p className="m-0 mt-1 font-mono">GSTIN {seller.gstin || "—"}</p>
            {stateWithCode(seller.gstin) && <p className="i2 m-0">State: {stateWithCode(seller.gstin)}</p>}
          </div>
          <div>
            <h2 className="i3 m-0 mb-1 text-[10px] font-medium tracking-wider uppercase">Bill to</h2>
            <p className="m-0 font-semibold">{co?.name ?? "—"}</p>
            {co?.city && <p className="i2 m-0">{co.city}</p>}
            <p className="m-0 mt-1 font-mono">GSTIN {co?.gstin ?? "Unregistered"}</p>
            {stateWithCode(co?.gstin) && <p className="i2 m-0">State: {stateWithCode(co?.gstin)}</p>}
          </div>
        </section>

        <p className="i2 m-0 py-3">Place of supply: <span className="text-[var(--i-ink)]">{placeOfSupply}</span> · {inv.supply === "intra" ? "Intra-state supply (CGST + SGST)" : "Inter-state supply (IGST)"}</p>

        <table className="w-full border-collapse">
          <thead>
            <tr className="bl border-y text-left text-[10px] tracking-wider uppercase">
              <th className="i3 py-2 pr-2 font-medium">#</th>
              <th className="i3 py-2 pr-2 font-medium">Description</th>
              <th className="i3 py-2 pr-2 font-medium">SAC</th>
              <th className="i3 py-2 pr-2 text-right font-medium">Qty</th>
              <th className="i3 py-2 pr-2 text-right font-medium">Rate (₹)</th>
              <th className="i3 py-2 text-right font-medium">Taxable value (₹)</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, k) => (
              <tr key={k} className="bl border-b align-top">
                <td className="i3 py-2 pr-2">{k + 1}</td>
                <td className="py-2 pr-2">{l.desc}</td>
                <td className="py-2 pr-2 font-mono">{l.sac}</td>
                <td className="py-2 pr-2 text-right font-mono">{l.qty}</td>
                <td className="py-2 pr-2 text-right font-mono">{inr(l.ratePaise)}</td>
                <td className="py-2 text-right font-mono">{inr(Math.round(l.qty * l.ratePaise))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-4 grid grid-cols-[1fr_auto] gap-6">
          <div>
            <h2 className="i3 m-0 mb-1 text-[10px] font-medium tracking-wider uppercase">Amount in words</h2>
            <p className="m-0 font-medium">{rupeesInWords(t.total)}</p>
          </div>
          <dl className="m-0 grid min-w-[62mm] grid-cols-[1fr_auto] gap-x-6 gap-y-1 font-mono">
            <dt className="i2">Taxable value</dt><dd className="m-0 text-right">{inr(t.subtotal)}</dd>
            {inv.supply === "intra" ? (
              <>
                <dt className="i2">CGST @ 9%</dt><dd className="m-0 text-right">{inr(t.cgst)}</dd>
                <dt className="i2">SGST @ 9%</dt><dd className="m-0 text-right">{inr(t.sgst)}</dd>
              </>
            ) : (
              <><dt className="i2">IGST @ 18%</dt><dd className="m-0 text-right">{inr(t.igst)}</dd></>
            )}
            <dt className="bl border-t pt-1 font-sans font-semibold">Total (₹)</dt><dd className="bl m-0 border-t pt-1 text-right font-semibold">{inr(t.total)}</dd>
            {inv.payments.map((p, k) => (
              <div key={k} className="contents"><dt className="i2">Received {fmtDate(p.at)}</dt><dd className="m-0 text-right">−{inr(p.amountPaise)}</dd></div>
            ))}
            {t.paid > 0 && <><dt className="font-sans font-semibold">Balance due (₹)</dt><dd className="m-0 text-right font-semibold">{inr(t.due)}</dd></>}
          </dl>
        </section>

        <footer className="bl mt-10 flex items-end justify-between border-t pt-4">
          <p className="i3 m-0 max-w-[90mm] text-[10px]">This is a computer-generated invoice. Tax is not payable on reverse charge basis.</p>
          <div className="text-right">
            <p className="m-0">For {seller.legalName || "—"}</p>
            <p className="i3 m-0 mt-10 text-[10px]">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
