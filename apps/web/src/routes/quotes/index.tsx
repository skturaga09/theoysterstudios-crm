import { BUSINESS_SHORT, fmtDate, formatFull, invoiceTotals, scheduleFrom, type ScheduleItem } from "@pinnacle/shared";
import { Button, Input, MoneyText, Pill, Segmented, Select, Textarea, toast } from "@pinnacle/ui";
import { ArrowLeft, FileSignature, Plus, Printer, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/page-header";
import { acceptQuote, sacFor, updateQuote } from "../../data/finance";
import { useCanEdit, useCrm } from "../../data/store";
import type { Quote } from "../../data/types";
import { usePref } from "../../lib/hooks";

const STATUS_LABEL: Record<Quote["status"], string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };
const STATUS_TONE: Record<Quote["status"], "mute" | "warn" | "ok" | "risk"> = { draft: "mute", sent: "warn", accepted: "ok", declined: "risk" };
const rupees = (paise: number) => (paise ? String(paise / 100) : "");
const toPaise = (v: string) => Math.round(Number(v.replace(/[^\d.]/g, "")) * 100) || 0;

/** Every quotation, newest first. New ones start from a lead (deal page → New quotation). */
export function QuotesRoute() {
  const s = useCrm();
  const [show, setShow] = usePref<"open" | "all">("quotes.show", "open");
  const quotes = s.quotes.filter((q) => show === "all" || q.status === "draft" || q.status === "sent").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <PageHeader
        eyebrow={`${s.quotes.filter((q) => q.status === "sent").length} awaiting the client`}
        title="Quotations"
        actions={<Segmented label="Show" value={show} onChange={setShow} options={[{ value: "open", label: "Open" }, { value: "all", label: "All" }]} />}
      />
      {!quotes.length ? (
        <EmptyState icon={FileSignature} title="No quotations yet" body="Open a lead and choose New quotation: pick packages, adjust the price, and print it or save it as a PDF to send." />
      ) : (
        <ul className="m-0 list-none border-t border-line p-0">
          {quotes.map((q) => {
            const co = s.companies.find((c) => c.id === q.companyId);
            return (
              <li key={q.id}>
                <Link to={`/quotes/${q.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3 hover:bg-hover">
                  <span className="w-[130px] font-mono text-[12px]">{q.number}</span>
                  <span className="min-w-0 flex-1 basis-[200px]">
                    <span className="t-dense block truncate font-medium">{co?.name ?? "—"}</span>
                    <span className="text-[11.5px] text-ink-3">{BUSINESS_SHORT[q.business]} · valid until {fmtDate(q.validUntil)}</span>
                  </span>
                  <MoneyText paise={invoiceTotals({ ...q, payments: [] }).total} />
                  <Pill tone={STATUS_TONE[q.status]}>{STATUS_LABEL[q.status]}</Pill>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** One quotation: packages and prices, payment plan, terms; then send, accept or decline. */
export function QuoteRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const s = useCrm();
  const q = s.quotes.find((x) => x.id === id);
  const canEdit = useCanEdit(q?.ownerId);
  if (!q) return <EmptyState icon={FileSignature} title="Quotation not found" body="It may belong to the other business — switch the top bar to Both." action={<Button asChild><Link to="/quotes">All quotations</Link></Button>} />;

  const co = s.companies.find((c) => c.id === q.companyId);
  const deal = s.deals.find((d) => d.id === q.dealId);
  const locked = q.status === "accepted" || !canEdit;
  const t = invoiceTotals({ ...q, payments: [] });
  const set = (patch: Partial<Quote>) => updateQuote(q.id, patch);
  const setLines = (lines: Quote["lines"]) => set({ lines, schedule: replan(lines) });
  // Changing the items recalculates the plan from the business's standard one; dates and names can then be edited.
  const replan = (lines: Quote["lines"]): ScheduleItem[] =>
    scheduleFrom(s.finance.plans[q.business], invoiceTotals({ supply: q.supply, lines, payments: [] }).subtotal, { confirmedAt: deal?.wonAt ?? new Date().toISOString(), eventDate: deal?.eventDate });
  const packages = s.finance.packages.filter((p) => p.business === q.business);

  return (
    <>
      <button onClick={() => navigate(-1)} className="t-meta mb-2 inline-flex items-center gap-1 text-ink-3 hover:text-ink-2">
        <ArrowLeft size={13} strokeWidth={1.5} /> Back
      </button>
      <PageHeader
        eyebrow={<>{q.number} · {co ? <Link to={`/clients/${co.id}`} className="hover:underline">{co.name}</Link> : "—"}{deal && <> · <button className="hover:underline" onClick={() => navigate(`/deals/${deal.id}`)}>{deal.title}</button></>}</>}
        title="Quotation"
        actions={
          <>
            <Pill tone={STATUS_TONE[q.status]}>{STATUS_LABEL[q.status]}</Pill>
            <Button asChild><Link to={`/quotes/${q.id}/print`}><Printer strokeWidth={1.5} /> Print / PDF</Link></Button>
            {!locked && q.status === "draft" && <Button onClick={() => { set({ status: "sent" }); toast("Marked as sent"); }} disabled={!q.lines.length}>Mark as sent</Button>}
            {!locked && q.status !== "declined" && (
              <Button variant="ink" disabled={!q.lines.length} onClick={() => { void acceptQuote(q); toast(deal ? `Accepted — ${deal.title} is confirmed` : "Accepted"); }}>
                Client accepted
              </Button>
            )}
            {!locked && q.status === "sent" && <Button variant="ghost" onClick={() => set({ status: "declined" })}>Declined</Button>}
          </>
        }
      />

      <fieldset disabled={locked} className="contents">
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-8">
            <section>
              <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Packages & items</h2>
              <ul className="m-0 list-none border-t border-line p-0">
                {q.lines.map((l, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 border-b border-line py-2">
                    <Textarea rows={1} aria-label="Description" defaultValue={l.desc} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== l.desc && setLines(q.lines.map((x, k) => (k === i ? { ...x, desc: e.target.value.trim() } : x)))} className="min-h-[34px] min-w-0 flex-1 basis-[260px]" />
                    <Input aria-label="Quantity" inputMode="decimal" defaultValue={l.qty} onBlur={(e) => { const v = Number(e.target.value) || 1; if (v !== l.qty) setLines(q.lines.map((x, k) => (k === i ? { ...x, qty: v } : x))); }} className="h-8 w-14 text-right font-mono" />
                    <Input aria-label="Price in rupees" inputMode="decimal" defaultValue={rupees(l.ratePaise)} onBlur={(e) => { const v = toPaise(e.target.value); if (v !== l.ratePaise) setLines(q.lines.map((x, k) => (k === i ? { ...x, ratePaise: v } : x))); }} className="h-8 w-28 text-right font-mono" />
                    <MoneyText paise={Math.round(l.qty * l.ratePaise)} className="w-24 text-right" />
                    <Button size="icon-sm" variant="ghost" aria-label="Remove line" onClick={() => setLines(q.lines.filter((_, k) => k !== i))}><Trash2 strokeWidth={1.5} /></Button>
                  </li>
                ))}
              </ul>
              {!locked && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Select aria-label="Add a package" value="" onChange={(e) => {
                    const p = packages.find((x) => x.id === e.target.value);
                    if (p) setLines([...q.lines, { desc: `${p.name}${p.description ? ` — ${p.description}` : ""}${p.monthly ? " (per month)" : ""}`, sac: sacFor(q.business), qty: 1, ratePaise: p.pricePaise }]);
                  }} className="w-[280px]">
                    <option value="">Add a package or add-on…</option>
                    {packages.map((p) => <option key={p.id} value={p.id}>{p.addOn ? "+ " : ""}{p.name} · {formatFull(p.pricePaise)}{p.monthly ? "/mo" : ""}</option>)}
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => setLines([...q.lines, { desc: "Custom item", sac: sacFor(q.business), qty: 1, ratePaise: 0 }])}><Plus strokeWidth={1.5} /> Custom line</Button>
                </div>
              )}
              <dl className="m-0 mt-4 ml-auto grid max-w-[320px] grid-cols-[1fr_auto] gap-x-6 gap-y-1 font-mono text-[12.5px]">
                <dt className="text-ink-2">Before GST</dt><dd className="m-0 text-right">{formatFull(t.subtotal)}</dd>
                <dt className="text-ink-2">GST 18%</dt><dd className="m-0 text-right">{formatFull(t.cgst + t.sgst + t.igst)}</dd>
                <dt className="border-t border-line pt-1 font-sans font-semibold">Total</dt><dd className="m-0 border-t border-line pt-1 text-right font-semibold">{formatFull(t.total)}</dd>
              </dl>
            </section>

            <section>
              <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Payment plan</h2>
              <ul className="m-0 list-none border-t border-line p-0">
                {q.schedule.map((m, i) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 border-b border-line py-2">
                    <Input aria-label="Stage" defaultValue={m.label} onBlur={(e) => e.target.value.trim() && set({ schedule: q.schedule.map((x, k) => (k === i ? { ...x, label: e.target.value.trim() } : x)) })} className="h-8 min-w-0 flex-1 basis-[160px]" />
                    <Input type="date" aria-label={`${m.label} due`} value={m.dueDate ?? ""} onChange={(e) => set({ schedule: q.schedule.map((x, k) => (k === i ? { ...x, dueDate: e.target.value || undefined } : x)) })} className="h-8 w-[150px]" />
                    <MoneyText paise={m.amountPaise} className="w-28 text-right" />
                    <span className="w-12 text-right font-mono text-[11px] text-ink-3">{t.subtotal ? Math.round((m.amountPaise / t.subtotal) * 100) : 0}%</span>
                  </li>
                ))}
                {!q.schedule.length && <li className="t-dense py-2 text-ink-3">Add packages and the {q.business === "photography" ? "wedding" : "marketing"} payment plan fills in.</li>}
              </ul>
              <p className="t-meta mt-2 text-ink-3">Amounts before GST. The plan comes from Settings → Packages & payments; dates count from {q.business === "photography" ? "the wedding date" : "the booking"}.</p>
            </section>
          </div>

          <aside className="flex min-w-0 flex-col gap-6">
            <section className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2.5">
              <span className="t-meta text-ink-3">Valid until</span>
              <Input type="date" value={q.validUntil} onChange={(e) => e.target.value && set({ validUntil: e.target.value })} />
              <span className="t-meta text-ink-3">GST</span>
              <Select value={q.supply} onChange={(e) => set({ supply: e.target.value as Quote["supply"] })}>
                <option value="intra">Same state (CGST + SGST)</option>
                <option value="inter">Other state (IGST)</option>
              </Select>
            </section>
            <section>
              <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Terms</h2>
              <Textarea key={q.id} rows={10} defaultValue={q.terms} onBlur={(e) => e.target.value !== q.terms && set({ terms: e.target.value })} />
            </section>
          </aside>
        </div>
      </fieldset>
      {q.status === "accepted" && <p className="t-meta mt-6 text-ink-3">Accepted quotations can't change. To revise, make a new quotation from the lead.</p>}
    </>
  );
}
