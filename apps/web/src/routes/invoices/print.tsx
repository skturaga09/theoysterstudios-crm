import { fmtDate, gstState, invoiceTotals, rupeesInWords } from "@pinnacle/shared";
import { Button } from "@pinnacle/ui";
import { ArrowLeft, Printer } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { EmptyState } from "../../components/empty-state";
import { invoiceStatus } from "../../data/derive";
import { useCrm, useWorkspace } from "../../data/store";
import type { Invoice, Quote } from "../../data/types";

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
  const inv = useCrm((s) => s.invoices.find((i) => i.id === id));
  return <TaxDocument doc={inv} />;
}

/** Printable GST credit note, laid out like the invoice it corrects. */
export function CreditNotePrintRoute() {
  const { id } = useParams();
  const note = useCrm((s) => s.creditNotes.find((c) => c.id === id));
  // A credit note prints as a document with no due date and no payments, plus a reference to its invoice.
  return <TaxDocument doc={note && { ...note, payments: [], sent: true }} credit={note && { invoiceNumber: note.invoiceNumber, invoiceIssuedAt: note.invoiceIssuedAt, reason: note.reason }} />;
}

/** Printable quotation / proposal: the same layout, plus the payment plan and terms. Not a tax invoice. */
export function QuotePrintRoute() {
  const { id } = useParams();
  const q = useCrm((s) => s.quotes.find((x) => x.id === id));
  return <TaxDocument doc={q && { ...q, issuedAt: q.createdAt, payments: [], sent: true }} quote={q} />;
}

/** Printable service agreement generated from an accepted quotation. Signatures remain outside the CRM. */
export function AgreementPrintRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const q = useCrm((s) => s.quotes.find((x) => x.id === id));
  const deal = useCrm((s) => s.deals.find((x) => x.id === q?.dealId));
  const client = useCrm((s) => s.companies.find((x) => x.id === q?.companyId));
  const workspace = useWorkspace();

  useEffect(() => {
    if (!q) return;
    const before = document.title;
    document.title = `Agreement ${q.number.replaceAll("/", "-")} ${client?.name ?? ""}`.trim();
    return () => void (document.title = before);
  }, [q, client]);

  if (!q || q.status !== "accepted") return <div className="p-8"><EmptyState icon={Printer} title="Accepted agreement not found" body="Accept the quotation first; the locked quotation then becomes the agreement's scope and price." /></div>;
  return (
    <div className="min-h-dvh bg-sunken py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex w-[210mm] max-w-full items-center gap-2 px-4 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft strokeWidth={1.5} /> Back</Button>
        <span className="t-meta text-ink-3">{q.signature ? "Signed online by the client — the audit trail is printed at the end." : "Review the studio's legal terms before signature."} In the print dialog choose “Save as PDF”.</span>
        <Button variant="ink" size="sm" className="ml-auto" onClick={() => window.print()}><Printer strokeWidth={1.5} /> Print / Save as PDF</Button>
      </div>
      <AgreementDocument
        quote={q}
        studio={{ name: workspace.studioName, legalName: workspace.legalName, address: workspace.address }}
        client={{ name: client?.name ?? "Client", address: client?.address }}
        deal={deal && { title: deal.title, eventDate: deal.eventDate }}
      />
    </div>
  );
}

type AgreementQuote = Pick<Quote, "number" | "createdAt" | "supply" | "lines" | "schedule" | "terms" | "signature">;

/**
 * The service agreement made from a quotation: parties, services, fees, payment schedule, terms and signatures.
 * The staff print page and the client's online signing page show this same document.
 */
export function AgreementDocument({ quote: q, studio, client, deal }: { quote: AgreementQuote; studio: { name: string; legalName?: string; address?: string }; client: { name: string; address?: string }; deal?: { title: string; eventDate?: string } }) {
  const total = invoiceTotals({ ...q, payments: [] }).total;
  const studioName = studio.legalName || studio.name;
  const sig = q.signature;
  const signedAt = sig && new Date(sig.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <article className="inv mx-auto w-[210mm] max-w-full p-[14mm] fs-11.5 leading-relaxed shadow-pop" aria-label={`Service agreement ${q.number}`}>
      <style>{PRINT_CSS}</style>
      <header className="bl flex items-start gap-6 border-b pb-5">
        <img src="/logo.png" alt="" className="h-20 w-auto object-contain" />
        <div className="ml-auto text-right">
          <h1 className="m-0 fs-20 font-semibold tracking-wide">SERVICE AGREEMENT</h1>
          <p className="i3 m-0 mt-1 font-mono fs-11">From quotation {q.number}</p>
          <p className="i3 m-0 font-mono fs-11">Quotation dated {fmtDate(q.createdAt)}</p>
        </div>
      </header>

      <section className="bl border-b py-5">
        <p className="m-0">This service agreement is between <b>{studioName}</b>{studio.address ? `, ${studio.address}` : ""} (“Studio”) and <b>{client.name}</b>{client.address ? `, ${client.address}` : ""} (“Client”). It records the scope, price, payment schedule and terms below.</p>
      </section>

      <section className="mt-6">
        <h2 className="i3 m-0 mb-2 fs-10 font-medium tracking-wider uppercase">1. Services and deliverables</h2>
        <p className="i2 m-0 mb-2">Project: <span className="text-[var(--i-ink)]">{deal?.title ?? client.name}</span>{deal?.eventDate ? ` · event date ${fmtDate(deal.eventDate)}` : ""}</p>
        <ol className="m-0 pl-5">
          {q.lines.map((line, index) => <li key={index} className="bl border-b py-1.5">{line.desc} · quantity {line.qty} · ₹{inr(Math.round(line.qty * line.ratePaise))} before GST</li>)}
        </ol>
      </section>

      <section className="mt-6">
        <h2 className="i3 m-0 mb-2 fs-10 font-medium tracking-wider uppercase">2. Fees and taxes</h2>
        <p className="m-0">The total consideration is <b>₹{inr(total)}</b>, including GST at 18%. GST invoices will be issued for each payment stage.</p>
      </section>

      <section className="mt-6">
        <h2 className="i3 m-0 mb-2 fs-10 font-medium tracking-wider uppercase">3. Payment schedule</h2>
        <table className="w-full border-collapse">
          <tbody>
            {q.schedule.map((item) => (
              <tr key={item.id} className="bl border-b">
                <td className="py-1.5 pr-2">{item.label}</td>
                <td className="i2 py-1.5 pr-2">{item.dueDate ? `Due ${fmtDate(item.dueDate)}` : "Due as agreed"}</td>
                <td className="py-1.5 text-right font-mono">₹{inr(item.amountPaise)} before GST</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="i3 m-0 mb-2 fs-10 font-medium tracking-wider uppercase">4. Terms</h2>
        <p className="i2 m-0 whitespace-pre-line">{q.terms || "The parties will perform the accepted services and payment obligations in good faith. Changes to scope, dates or deliverables must be agreed in writing."}</p>
      </section>

      <section className="mt-12 grid grid-cols-2 gap-12">
        <div className="bl border-t pt-2">
          <p className="m-0 font-semibold">For {studioName}</p>
          <p className="i3 m-0 mt-10">Signature · name · date</p>
        </div>
        <div className="bl border-t pt-2">
          <p className="m-0 font-semibold">For {client.name}</p>
          {sig ? (
            <>
              <p className="m-0 mt-3 fs-16 italic">{sig.name}</p>
              <p className="i3 m-0">Signed online · {signedAt} IST</p>
            </>
          ) : (
            <p className="i3 m-0 mt-10">Signature · name · date</p>
          )}
        </div>
      </section>

      {sig?.ip && (
        <section className="bl mt-8 border-t pt-3 fs-10">
          <h2 className="i3 m-0 mb-1 fs-10 font-medium tracking-wider uppercase">Electronic acceptance record</h2>
          <p className="i2 m-0">Accepted online by <b>{sig.name}</b>{sig.email ? ` (${sig.email})` : ""}{sig.phone ? ` · ${sig.phone}` : ""} on {signedAt} IST, from IP {sig.ip}, after confirming they had read and agreed to this agreement, its payment schedule and terms. Device: {sig.userAgent || "not recorded"}.</p>
          <p className="i2 m-0 mt-1">Document fingerprint (SHA-256 of the quotation as signed): <span className="font-mono break-all">{sig.fingerprint}</span></p>
          <p className="i3 m-0 mt-1">{sig.method}.</p>
        </section>
      )}
    </article>
  );
}

export type PrintableDoc = Pick<Invoice, "id" | "number" | "issuedAt" | "companyId" | "supply" | "lines" | "payments" | "sent" | "seller" | "buyer" | "cancelled" | "credits"> & { dueAt?: string };

export function TaxDocument({ doc: inv, credit, quote }: { doc?: PrintableDoc; credit?: { invoiceNumber: string; invoiceIssuedAt: string; reason: string }; quote?: Quote }) {
  const navigate = useNavigate();
  const co = useCrm((s) => s.companies.find((c) => c.id === inv?.companyId));
  const workspace = useWorkspace();

  useEffect(() => {
    if (!inv) return;
    const before = document.title;
    document.title = `${inv.number.replaceAll("/", "-")} ${co?.name ?? ""}`.trim(); // becomes the PDF's file name
    return () => void (document.title = before);
  }, [inv, co]);

  if (!inv) return <div className="p-8"><EmptyState icon={Printer} title="Not found" body="It may have been removed, or the link is old." /></div>;

  const seller = inv.seller ?? workspace;
  const buyer = inv.buyer ?? { name: co?.name ?? "—", gstin: co?.gstin ?? "", address: co?.address ?? "", city: co?.city ?? "" };
  const t = invoiceTotals(inv);
  const st = credit || quote ? "sent" : invoiceStatus(inv as Invoice);
  const stamp = st === "draft" ? "DRAFT — NOT ISSUED" : st === "cancelled" ? "CANCELLED" : undefined;
  // Place of supply is where the client is: their GSTIN's state, or ours for an intra-state supply.
  const placeOfSupply = stateWithCode(buyer.gstin) ?? (inv.supply === "intra" ? stateWithCode(seller.gstin) : undefined) ?? (buyer.city || "—");

  return (
    <div className="min-h-dvh bg-sunken py-6 print:bg-white print:py-0">
      <style>{PRINT_CSS}</style>
      <div className="mx-auto mb-4 flex w-[210mm] max-w-full items-center gap-2 px-4 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft strokeWidth={1.5} /> Back</Button>
        <span className="t-meta text-ink-3">In the print dialog choose “Save as PDF”.</span>
        <Button variant="ink" size="sm" className="ml-auto" onClick={() => window.print()}><Printer strokeWidth={1.5} /> Print / Save as PDF</Button>
      </div>

      <article className="inv relative mx-auto w-[210mm] max-w-full p-[14mm] fs-11.5 leading-relaxed shadow-pop" aria-label={`${quote ? "Quotation" : credit ? "Credit note" : "Tax invoice"} ${inv.number}`}>
        {stamp && <div className="absolute top-[14mm] left-1/2 -translate-x-1/2 rounded border-2 border-current px-3 py-1 fs-13 font-semibold tracking-wider text-[#b42318]">{stamp}</div>}

        <header className="bl flex items-start gap-6 border-b pb-5">
          <img src="/logo.png" alt="" className="h-20 w-auto object-contain" />
          <div className="ml-auto text-right">
            <h1 className="m-0 fs-20 font-semibold tracking-wide">{quote ? "QUOTATION" : credit ? "CREDIT NOTE" : "TAX INVOICE"}</h1>
            {!quote && <p className="i3 m-0 fs-10">Original for recipient</p>}
            <dl className="m-0 mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 font-mono fs-11">
              <dt className="i3">{quote ? "Quotation no." : credit ? "Credit note no." : "Invoice no."}</dt><dd className="m-0 font-semibold">{inv.number}</dd>
              <dt className="i3">Date</dt><dd className="m-0">{fmtDate(inv.issuedAt)}</dd>
              {quote ? (
                <><dt className="i3">Valid until</dt><dd className="m-0">{fmtDate(quote.validUntil)}</dd></>
              ) : credit ? (
                <><dt className="i3">Against invoice</dt><dd className="m-0">{credit.invoiceNumber} · {fmtDate(credit.invoiceIssuedAt)}</dd></>
              ) : (
                inv.dueAt && <><dt className="i3">Due</dt><dd className="m-0">{fmtDate(inv.dueAt)}</dd></>
              )}
            </dl>
          </div>
        </header>

        <section className="bl grid grid-cols-2 gap-6 border-b py-5">
          <div>
            <h2 className="i3 m-0 mb-1 fs-10 font-medium tracking-wider uppercase">Supplier</h2>
            <p className="m-0 font-semibold">{seller.legalName || "—"}</p>
            <p className="i2 m-0 whitespace-pre-line">{seller.address}</p>
            <p className="m-0 mt-1 font-mono">GSTIN {seller.gstin || "—"}</p>
            {stateWithCode(seller.gstin) && <p className="i2 m-0">State: {stateWithCode(seller.gstin)}</p>}
          </div>
          <div>
            <h2 className="i3 m-0 mb-1 fs-10 font-medium tracking-wider uppercase">{quote ? "Prepared for" : "Bill to"}</h2>
            <p className="m-0 font-semibold">{buyer.name}</p>
            {buyer.address ? <p className="i2 m-0 whitespace-pre-line">{buyer.address}</p> : buyer.city && <p className="i2 m-0">{buyer.city}</p>}
            <p className="m-0 mt-1 font-mono">GSTIN {buyer.gstin || "Unregistered"}</p>
            {stateWithCode(buyer.gstin) && <p className="i2 m-0">State: {stateWithCode(buyer.gstin)}</p>}
          </div>
        </section>

        {credit && <p className="m-0 pt-3">Reason for credit: <span className="i2">{credit.reason}</span></p>}
        <p className="i2 m-0 py-3">Place of supply: <span className="text-[var(--i-ink)]">{placeOfSupply}</span> · {inv.supply === "intra" ? "Intra-state supply (CGST + SGST)" : "Inter-state supply (IGST)"}</p>

        <table className="w-full border-collapse">
          <thead>
            <tr className="bl border-y text-left fs-10 tracking-wider uppercase">
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
            <h2 className="i3 m-0 mb-1 fs-10 font-medium tracking-wider uppercase">Amount in words</h2>
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
            <dt className="bl border-t pt-1 font-sans font-semibold">{credit ? "Total credit (₹)" : "Total (₹)"}</dt><dd className="bl m-0 border-t pt-1 text-right font-semibold">{inr(t.total)}</dd>
            {inv.payments.map((p, k) => (
              <div key={k} className="contents"><dt className="i2">Received {fmtDate(p.at)}</dt><dd className="m-0 text-right">−{inr(p.amountPaise)}</dd></div>
            ))}
            {inv.credits?.map((c) => (
              <div key={c.creditNoteId} className="contents"><dt className="i2">Credit note {c.number}</dt><dd className="m-0 text-right">−{inr(c.totalPaise)}</dd></div>
            ))}
            {(t.paid > 0 || t.credited > 0) && <><dt className="font-sans font-semibold">Balance due (₹)</dt><dd className="m-0 text-right font-semibold">{inr(t.due)}</dd></>}
          </dl>
        </section>

        {quote && quote.schedule.length > 0 && (
          <section className="mt-6">
            <h2 className="i3 m-0 mb-1 fs-10 font-medium tracking-wider uppercase">Payment plan (before GST)</h2>
            <table className="w-full border-collapse">
              <tbody>
                {quote.schedule.map((m) => (
                  <tr key={m.id} className="bl border-b">
                    <td className="py-1.5 pr-2">{m.label}</td>
                    <td className="i2 py-1.5 pr-2">{m.dueDate ? `by ${fmtDate(m.dueDate)}` : ""}</td>
                    <td className="py-1.5 text-right font-mono">{inr(m.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {quote?.terms && (
          <section className="mt-6">
            <h2 className="i3 m-0 mb-1 fs-10 font-medium tracking-wider uppercase">Terms</h2>
            <p className="i2 m-0 whitespace-pre-line">{quote.terms}</p>
          </section>
        )}

        <footer className="bl mt-10 flex items-end justify-between border-t pt-4">
          <p className="i3 m-0 max-w-[90mm] fs-10">{quote ? "This is a quotation, not a tax invoice. A GST invoice is issued for each payment." : "This is a computer-generated invoice. Tax is not payable on reverse charge basis."}</p>
          <div className="text-right">
            <p className="m-0">For {seller.legalName || "—"}</p>
            <p className="i3 m-0 mt-10 fs-10">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
