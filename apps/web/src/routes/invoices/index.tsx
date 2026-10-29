import { BUSINESS_SHORT, parseRupees, rupeesText, fmtDate, fmtDay, formatCompact, formatFull, rupees } from "@pinnacle/shared";
import { Button, cn, Input, MoneyText, Pill, Segmented, Sheet, Table, TBody, TD, TH, THead, toast, TR } from "@pinnacle/ui";
import { Ban, Download, FileDown, FileText, Link2, Pencil, Plus, ReceiptText, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ClientPhoto } from "../../components/client-photo";
import { PaymentsDue } from "../../components/payments-due";
import { PageHeader } from "../../components/page-header";
import { agingBucket, daysOverdue, invoiceStatus, invoiceTotals, sum } from "../../data/derive";
import { useCrm, useAccess, useWorkspace } from "../../data/store";
import type { CreditNote, Invoice } from "../../data/types";
import { api } from "../../lib/api";
import { downloadCsv } from "../../lib/download";
import { useCreateAction, useListNav } from "../../lib/hooks";
import { useUi } from "../../lib/ui-store";

const TONE = { draft: "mute", sent: "mute", partial: "warn", paid: "ok", overdue: "risk", cancelled: "mute", credited: "mute" } as const;
const LABEL = { draft: "Draft", sent: "Sent", partial: "Partially paid", paid: "Paid", overdue: "Overdue", cancelled: "Cancelled", credited: "Credited" } as const;
type Filter = "all" | "draft" | "outstanding" | "overdue" | "paid";

export function InvoicesRoute() {
  const s = useCrm();
  // ?open=<id> (e.g. right after creating one) opens that invoice and shows everything, drafts included.
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>(params.get("open") ? "all" : "outstanding");
  const [openId, setOpenId] = useState(params.get("open") ?? undefined);
  const isManager = useAccess("finance") === "edit";
  useCreateAction(isManager ? () => useUi.getState().openComposer("invoice") : undefined);

  const rows = useMemo(
    () =>
      [...s.invoices]
        .map((i) => ({ i, st: invoiceStatus(i), t: invoiceTotals(i), co: s.companies.find((c) => c.id === i.companyId) }))
        .filter((r) =>
          filter === "all" ? true : filter === "draft" ? r.st === "draft" : filter === "paid" ? r.st === "paid" : filter === "overdue" ? r.st === "overdue" : !["paid", "draft", "cancelled", "credited"].includes(r.st),
        )
        .sort((a, b) => +new Date(a.i.dueAt) - +new Date(b.i.dueAt)),
    [s.invoices, s.companies, filter],
  );
  const [active] = useListNav(rows.length, (k) => setOpenId(rows[k]!.i.id));

  const outstanding = s.invoices.filter((i) => ["sent", "partial", "overdue"].includes(invoiceStatus(i)));
  const overdue = outstanding.filter((i) => invoiceStatus(i) === "overdue");
  const buckets = (["0–30", "31–60", "61–90", "90+"] as const).map((b) => {
    const xs = overdue.filter((i) => agingBucket(i) === b);
    return { b, n: xs.length, amt: sum(xs.map((i) => invoiceTotals(i).due)) };
  });
  const totalOverdue = sum(buckets.map((b) => b.amt));
  const open = s.invoices.find((i) => i.id === openId);

  return (
    <>
      <PageHeader
        title="Invoices"
        stats={[
          { label: "Outstanding", value: sum(outstanding.map((i) => invoiceTotals(i).due)), format: formatCompact, tone: "signal" },
          { label: `Overdue · ${overdue.length}`, value: totalOverdue, format: formatCompact, tone: totalOverdue ? "risk" : undefined },
        ]}
        actions={
          <>
            <Segmented
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "outstanding", label: "Outstanding" },
                { value: "overdue", label: "Overdue" },
                { value: "draft", label: "Drafts" },
                { value: "paid", label: "Paid" },
                { value: "all", label: "All" },
              ]}
            />
            {isManager && (
              <Button variant="ink" size="sm" onClick={() => useUi.getState().openComposer("invoice")}>
                <Plus strokeWidth={1.5} /> New invoice
              </Button>
            )}
          </>
        }
      />

      <div className="mb-10"><PaymentsDue /></div>
      <section aria-label="Overdue aging" className="mb-10">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="t-eyebrow m-0 text-ink-2">Overdue by age (days past due)</h2>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              const open = s.invoices.filter((i) => i.sent && !i.cancelled && invoiceTotals(i).due > 100);
              const name = (id: string) => s.companies.find((c) => c.id === id)?.name ?? "";
              downloadCsv("outstanding-payments", [
                ["Invoice", "Client", "Business", "Issued", "Due date", "Days overdue", "Total (₹)", "Paid (₹)", "Outstanding (₹)"],
                ...open
                  .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
                  .map((i) => {
                    const t = invoiceTotals(i);
                    return [i.number, name(i.companyId), i.business ? BUSINESS_SHORT[i.business] : "", i.issuedAt.slice(0, 10), i.dueAt.slice(0, 10), daysOverdue(i), t.total / 100, t.paid / 100, t.due / 100];
                  }),
              ]);
            }}
          >
            <Download strokeWidth={1.5} /> Outstanding (CSV)
          </Button>
        </div>
        <div className="grid grid-cols-2 border-t border-ink md:grid-cols-4">
          {buckets.map((b, i) => (
            <div key={b.b} className={cn("flex flex-col gap-2 py-4 pr-4", i > 0 && "md:border-l md:border-line md:pl-5", i % 2 === 1 && "border-l border-line pl-5", i >= 2 && "border-t border-line md:border-t-0")}>
              <span className="font-mono fs-11 text-ink-3">{b.b} days</span>
              <span className="flex items-baseline gap-1">
                <span className={cn("font-serif fs-30 leading-none tnum", b.amt ? "text-ink" : "text-ink-3")}>{b.amt ? formatCompact(b.amt).replace("₹", "").replace(/ (L|Cr|K)$/, "") : "0"}</span>
                {b.amt > 0 && <span className="font-mono fs-12 text-ink-2">{formatCompact(b.amt).split(" ")[1]}</span>}
              </span>
              <span className="font-mono fs-11 text-ink-3">{b.n} {b.n === 1 ? "invoice" : "invoices"}</span>
            </div>
          ))}
        </div>
        <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-line">
          {buckets.map((b, i) => b.amt > 0 && <span key={b.b} className="h-full border-r-2 border-bg bg-risk" style={{ width: `${(b.amt / (totalOverdue || 1)) * 100}%`, opacity: 0.45 + i * 0.18 }} />)}
        </div>
      </section>

      <div className="border-t border-line">
        <Table>
          <THead>
            <tr>
              <TH>Invoice</TH>
              <TH>Client</TH>
              <TH className="hidden md:table-cell">Issued</TH>
              <TH>Due</TH>
              <TH align="right">Total</TH>
              <TH align="right">Balance</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ i, st, t, co }, k) => (
              <TR key={i.id} data-nav-index={k} onClick={() => setOpenId(i.id)} className={cn(active === k && "bg-hover")}>
                <TD className="font-mono fs-12.5">{i.number}{i.kind === "cash" && <Pill tone="mute" className="ml-2 font-sans">Cash</Pill>}</TD>
                <TD><div className="flex items-center gap-2.5"><ClientPhoto company={co} size="sm" /><div className="min-w-0"><div className="font-medium">{co?.name}</div><div className="font-mono fs-11 text-ink-3">{co?.gstin || "Unregistered"}</div></div></div></TD>
                <TD numeric className="hidden text-ink-2 md:table-cell">{fmtDay(i.issuedAt)}</TD>
                <TD numeric className={st === "overdue" ? "text-risk" : "text-ink-2"}>{fmtDay(i.dueAt)}{st === "overdue" && <span className="ml-1.5 fs-11">+{daysOverdue(i)}d</span>}</TD>
                <TD align="right"><MoneyText paise={t.total} /></TD>
                <TD align="right">{t.due ? <MoneyText paise={t.due} /> : <span className="text-ink-3">—</span>}</TD>
                <TD><Pill tone={TONE[st]}>{LABEL[st]}</Pill></TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {!rows.length && (
          <div className="flex flex-col items-start gap-2 py-10">
            <FileText size={20} strokeWidth={1.5} className="text-ink-3" />
            <p className="t-sheet m-0">No invoices here</p>
            <p className="t-dense m-0 text-ink-2">{s.invoices.length ? "Nothing in this view — try All." : "Create one with New invoice, or from a won deal's page. Totals include GST at 18%."}</p>
          </div>
        )}
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(undefined)} eyebrow="Tax invoice" title={open?.number ?? ""} footer={open && <InvoiceActions inv={open} />}>
        {open && <InvoiceDetail inv={open} />}
      </Sheet>
    </>
  );
}

function InvoiceDetail({ inv }: { inv: Invoice }) {
  const workspace = useWorkspace();
  const from = inv.seller ?? workspace;
  const co = useCrm((s) => s.companies.find((c) => c.id === inv.companyId));
  // The copy saved on the invoice wins; older invoices fall back to the company as it is now.
  const to = inv.buyer ?? { name: co?.name ?? "—", gstin: co?.gstin ?? "", address: co?.address ?? "", city: co?.city ?? "" };
  const t = invoiceTotals(inv);
  const st = invoiceStatus(inv);
  return (
    <div className="flex flex-col gap-6">
      <img src="/logo.png" alt={from.legalName} className="h-20 w-auto self-start object-contain" />
      {inv.cancelled && (
        <p className="t-dense m-0 rounded-card bg-sunken px-3 py-2 text-ink-2">
          Cancelled {inv.cancelledAt && fmtDay(inv.cancelledAt)} · {inv.cancelReason}. Kept on record so the invoice numbers stay continuous.
        </p>
      )}
      <div className="flex items-baseline gap-2">
        <span className={cn("font-serif fs-32 leading-none tnum", inv.cancelled && "text-ink-3 line-through")}>{formatFull(t.total)}</span>
        <Pill tone={TONE[st]} className="ml-auto self-center">{LABEL[st]}</Pill>
      </div>
      <div className="grid grid-cols-2 gap-4 t-dense">
        <div>
          <div className="t-eyebrow mb-1.5 text-ink-3">From</div>
          <div className="font-medium">{from.legalName || "—"}</div>
          <div className="fs-12 text-ink-2">{from.address}</div>
          <div className="mt-1 font-mono fs-11.5 text-ink-2">GSTIN {from.gstin || "—"}</div>
        </div>
        <div>
          <div className="t-eyebrow mb-1.5 text-ink-3">Bill to</div>
          <div className="font-medium">{co ? <Link to={`/clients/${co.id}`} className="hover:underline">{to.name}</Link> : to.name}</div>
          {to.address && <div className="fs-12 whitespace-pre-line text-ink-2">{to.address}</div>}
          {!to.address && to.city && <div className="fs-12 text-ink-2">{to.city}</div>}
          <div className="mt-1 font-mono fs-11.5 text-ink-2">GSTIN {to.gstin || "Unregistered"}</div>
        </div>
      </div>
      <dl className="m-0 grid grid-cols-[110px_1fr] gap-y-2 t-dense">
        <dt className="text-ink-3">Issued</dt><dd className="m-0 font-mono fs-12.5">{fmtDate(inv.issuedAt)}</dd>
        <dt className="text-ink-3">Due</dt><dd className="m-0 font-mono fs-12.5">{fmtDate(inv.dueAt)}</dd>
        <dt className="text-ink-3">Supply</dt><dd className="m-0">{inv.supply === "intra" ? "Intra-state (Karnataka) · CGST + SGST" : "Inter-state · IGST"}</dd>
      </dl>
      <table className="w-full border-collapse t-dense">
        <thead>
          <tr className="border-b border-line">
            <th className="py-2 text-left font-mono fs-10.5 font-medium tracking-[0.08em] text-ink-3 uppercase">Item</th>
            <th className="py-2 text-left font-mono fs-10.5 font-medium tracking-[0.08em] text-ink-3 uppercase">SAC</th>
            <th className="py-2 text-right font-mono fs-10.5 font-medium tracking-[0.08em] text-ink-3 uppercase">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, k) => (
            <tr key={k} className="border-b border-line">
              <td className="py-2.5 pr-3">{l.desc}</td>
              <td className="py-2.5 font-mono fs-12 text-ink-2">{l.sac}</td>
              <td className="py-2.5 text-right font-mono tnum">{formatFull(l.qty * l.ratePaise)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="font-mono fs-12.5 tnum">
          <tr><td colSpan={2} className="pt-3 text-ink-2">Taxable value</td><td className="pt-3 text-right">{formatFull(t.subtotal)}</td></tr>
          {inv.supply === "intra" ? (
            <>
              <tr><td colSpan={2} className="pt-1 text-ink-2">CGST 9%</td><td className="pt-1 text-right">{formatFull(t.cgst)}</td></tr>
              <tr><td colSpan={2} className="pt-1 text-ink-2">SGST 9%</td><td className="pt-1 text-right">{formatFull(t.sgst)}</td></tr>
            </>
          ) : (
            <tr><td colSpan={2} className="pt-1 text-ink-2">IGST 18%</td><td className="pt-1 text-right">{formatFull(t.igst)}</td></tr>
          )}
          <tr className="border-t border-ink"><td colSpan={2} className="pt-2 font-sans font-medium">Total</td><td className="pt-2 text-right font-medium">{formatFull(t.total)}</td></tr>
          {inv.payments.map((p, k) => (
            <tr key={k}><td colSpan={2} className="pt-1 text-ok">Paid · {fmtDay(p.at)}</td><td className="pt-1 text-right text-ok">−{formatFull(p.amountPaise)}</td></tr>
          ))}
          {inv.credits?.map((c) => (
            <tr key={c.creditNoteId}>
              <td colSpan={2} className="pt-1 text-ink-2">
                Credit note{" "}
                <Link to={`/credit-notes/${c.creditNoteId}/print`} className="underline hover:text-ink">{c.number}</Link> · {fmtDay(c.at)}
              </td>
              <td className="pt-1 text-right text-ink-2">−{formatFull(c.totalPaise)}</td>
            </tr>
          ))}
          {(t.paid > 0 || t.credited > 0) && <tr><td colSpan={2} className="pt-1 font-sans font-medium">Balance due</td><td className="pt-1 text-right font-medium">{formatFull(t.due)}</td></tr>}
        </tfoot>
      </table>
    </div>
  );
}

function InvoiceActions({ inv }: { inv: Invoice }) {
  const isManager = useAccess("finance") === "edit";
  const st = invoiceStatus(inv);
  const t = invoiceTotals(inv);
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [crediting, setCrediting] = useState(false);
  const [credit, setCredit] = useState({ amount: "", reason: "" });
  // Left to credit = taxable value not yet credited.
  const creditable = t.subtotal - (inv.credits ?? []).reduce((a, c) => a + c.taxablePaise, 0);
  /** Calls the API, then shows the invoice exactly as it was saved. */
  const run = async (path: string, body: object | undefined, done: string) => {
    setBusy(true);
    try {
      const saved = await api<Invoice>(`/invoices/${inv.id}${path}`, { method: "POST", body });
      useCrm.setState((s) => ({ invoices: s.invoices.map((i) => (i.id === inv.id ? saved : i)) }));
      toast(done);
      return true;
    } catch (e) {
      toast(`Couldn't save — ${(e as Error).message}`);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${inv.id}/print`)}>
        <FileDown strokeWidth={1.5} /> PDF
      </Button>
      {isManager && t.due > 0 && inv.sent && !inv.cancelled && st !== "credited" && (
        inv.paymentLink?.status === "created" && inv.paymentLink.amountPaise === t.due ? (
          <Button asChild variant="outline" size="sm">
            <a href={inv.paymentLink.url} target="_blank" rel="noreferrer"><Link2 strokeWidth={1.5} /> Open payment link</a>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const { paymentLink } = await api<{ paymentLink: NonNullable<Invoice["paymentLink"]> }>(`/invoices/${inv.id}/payment-link`, { method: "POST" });
                useCrm.setState((s) => ({ invoices: s.invoices.map((i) => (i.id === inv.id ? { ...i, paymentLink } : i)) }));
                toast("Payment link ready", { action: { label: "Open", onClick: () => window.open(paymentLink.url, "_blank", "noopener,noreferrer") } });
              } catch (e) {
                toast(`Couldn't create payment link — ${(e as Error).message}`);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Link2 strokeWidth={1.5} /> {busy ? "Creating…" : "Payment link"}
          </Button>
        )
      )}
      {isManager && inv.sent && !inv.cancelled && inv.kind !== "cash" && creditable > 0 && !crediting && (
        <Button variant="ghost" size="sm" onClick={() => setCrediting(true)}>
          <ReceiptText strokeWidth={1.5} /> Credit note
        </Button>
      )}
      {!isManager || st === "cancelled" ? null : st === "draft" && cancelling ? (
        <form
          className="ml-auto flex flex-1 items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reason.trim()) return toast("Say why it's being cancelled");
            if (await run("/cancel", { reason: reason.trim() }, `Cancelled ${inv.number}`)) setCancelling(false);
          }}
        >
          <Input aria-label="Reason for cancelling" autoFocus placeholder="Reason, e.g. wrong client" value={reason} onChange={(e) => setReason(e.target.value)} className="h-7 min-w-0 flex-1" />
          <Button size="sm" variant="ghost" type="button" onClick={() => setCancelling(false)}>Keep</Button>
          <Button size="sm" variant="ink" type="submit" className="bg-risk hover:bg-risk/90" disabled={busy}>Cancel invoice</Button>
        </form>
      ) : st === "draft" ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setCancelling(true)}>
            <Ban strokeWidth={1.5} /> Cancel draft
          </Button>
          <Button variant="ghost" size="sm" onClick={() => useUi.getState().openComposer("invoice", { invoiceId: inv.id })}>
            <Pencil strokeWidth={1.5} /> Edit
          </Button>
          <Button variant="ink" size="sm" className="ml-auto" disabled={busy} onClick={() => void run("/send", undefined, `Marked ${inv.number} as sent`)}>
            <Send strokeWidth={1.5} /> Mark as sent
          </Button>
        </>
      ) : crediting ? (
        <form
          className="ml-auto flex flex-1 flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = parseFloat(credit.amount.replace(/,/g, ""));
            if (!(v > 0)) return toast("Enter the amount to credit in rupees, before GST");
            if (rupees(v) > creditable) return toast(`At most ${formatFull(creditable)} is left to credit (before GST)`);
            if (!credit.reason.trim()) return toast("Say why the credit is being given");
            setBusy(true);
            try {
              const res = await api<{ creditNote: CreditNote; invoice: Invoice }>(`/invoices/${inv.id}/credit-notes`, { method: "POST", body: { amountPaise: rupees(v), reason: credit.reason.trim() } });
              useCrm.setState((s) => ({ invoices: s.invoices.map((i) => (i.id === inv.id ? res.invoice : i)), creditNotes: [res.creditNote, ...s.creditNotes] }));
              toast(`Credit note ${res.creditNote.number} raised`, { action: { label: "Open PDF", onClick: () => navigate(`/credit-notes/${res.creditNote.id}/print`) } });
              setCrediting(false);
              setCredit({ amount: "", reason: "" });
            } catch (err) {
              toast(`Couldn't raise the credit note — ${(err as Error).message}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input aria-label="Amount to credit in rupees, before GST" autoFocus inputMode="decimal" placeholder={`₹ up to ${(creditable / 100).toLocaleString("en-IN")}`} value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} className="h-7 w-32 font-mono" />
          <Input aria-label="Reason for the credit" placeholder="Reason" value={credit.reason} onChange={(e) => setCredit({ ...credit, reason: e.target.value })} className="h-7 min-w-0 flex-1" />
          <Button size="sm" variant="ghost" type="button" onClick={() => setCrediting(false)}>Back</Button>
          <Button size="sm" variant="ink" type="submit" disabled={busy}>Raise credit note</Button>
        </form>
      ) : st !== "paid" && st !== "credited" ? (
        <form
          className="ml-auto flex items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = amount.trim() ? parseRupees(amount) : t.due; // blank = the full balance
            if (!v || v <= 0) return toast("Enter the amount received in rupees, for example 58,950");
            if (v > t.due) return toast(`That's more than the ${formatFull(t.due)} still due`);
            const paise = v;
            if (await run("/payments", { amountPaise: paise }, `Payment of ${formatCompact(paise)} recorded`)) setAmount("");
          }}
        >
          <Input aria-label="Amount received in rupees" inputMode="decimal" placeholder={`₹${rupeesText(t.due)}`} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-7 w-32 font-mono" />
          <Button variant="ink" size="sm" type="submit" disabled={busy}>Record payment</Button>
        </form>
      ) : null}
    </div>
  );
}
