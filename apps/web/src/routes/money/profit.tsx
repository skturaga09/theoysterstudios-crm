import { BUSINESS_LABEL, BUSINESS_SHORT, formatCompact, formatFull, invoiceTotals, istDay, profitAndLoss, registerTable, salesRegister } from "@pinnacle/shared";
import { Button, cn, Select, Table, TBody, TD, TH, THead, toast, TR } from "@pinnacle/ui";
import { motion } from "motion/react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Big, Dial, Label, Tile, tile } from "../../components/bento";
import { ClientPhoto } from "../../components/client-photo";
import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Navigate } from "react-router";
import { PageHeader } from "../../components/page-header";
import { useAccess, useCrm } from "../../data/store";
import { downloadCsv } from "../../lib/download";

const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const margin = (profit: number, revenue: number) => (revenue > 0 ? `${Math.round((profit / revenue) * 100)}%` : "—");
/** Indian financial year start (1 April) for a day, as "2026-04". */
const fyStart = (day: string) => (Number(day.slice(5, 7)) >= 4 ? `${day.slice(0, 4)}-04` : `${Number(day.slice(0, 4)) - 1}-04`);

/**
 * The GST sales register for the CA: every sent invoice and credit note in a month (or a financial year), one row
 * per SAC, split B2B / B2CS / CDNR / CDNUR as GSTR-1 asks. Always the whole studio (one GSTIN), whatever the
 * business switch shows.
 */
function GstRegister() {
  const today = istDay(new Date());
  const months = Array.from({ length: 13 }, (_, i) => {
    const d = new Date(`${today.slice(0, 7)}-15T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    return d.toISOString().slice(0, 7);
  });
  const [period, setPeriod] = useState(months[1]!); // last month: what's usually being filed
  const fy = fyStart(today);
  const range = (): [string, string] => {
    if (period === "fy") return [`${fy}-01`, today];
    const [y, m] = period.split("-").map(Number) as [number, number];
    return [`${period}-01`, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)];
  };
  const download = () => {
    const { invoices, creditNotes } = useCrm.getState(); // whole studio, not the business view
    const [from, to] = range();
    const rows = salesRegister({ invoices, creditNotes }, from, to);
    if (!rows.length) return toast("No sent invoices or credit notes in that period");
    downloadCsv(`gst-sales-register-${period === "fy" ? `FY-${fy.slice(0, 4)}` : period}`, registerTable(rows));
  };
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-card bg-sunken p-4 print:hidden">
      <div className="min-w-0 flex-1 basis-[260px]">
        <h2 className="t-dense m-0 font-medium">GST sales register for your CA</h2>
        <p className="t-meta m-0 text-ink-3">Every sent invoice and credit note, one row per SAC, split for GSTR-1 (B2B, B2CS, credit notes). Opens in Excel; Tally and the GST offline tool take it from there.</p>
      </div>
      <Select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-[170px]">
        {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        <option value="fy">This financial year</option>
      </Select>
      <Button variant="ink" onClick={download}><Download strokeWidth={1.5} /> Download</Button>
    </section>
  );
}

/**
 * Profit and loss, before GST and on an accrual basis (revenue when invoiced): by month, by expense category and
 * by project. Follows the business switch. Owners and Finance.
 */
export function ProfitRoute() {
  const s = useCrm();
  const canSee = useAccess("finance") === "edit";
  if (!canSee) return <Navigate to="/" replace />;

  const businessOf = (dealId?: string) => s.deals.find((d) => d.id === dealId)?.business;
  const invoices = s.invoices.map((i) => ({ ...i, business: i.business ?? businessOf(i.dealId) }));
  const creditNotes = s.creditNotes.map((c) => ({ ...c, business: invoices.find((i) => i.id === c.invoiceId)?.business }));
  const rows = profitAndLoss({ invoices, creditNotes, expenses: s.expenses });

  // One line per month across the businesses shown.
  const byMonth = [...new Set(rows.map((r) => r.month))].map((month) => {
    const rs = rows.filter((r) => r.month === month);
    const sum = (k: "revenuePaise" | "expensesPaise" | "profitPaise") => rs.reduce((a, r) => a + r[k], 0);
    return { month, revenue: sum("revenuePaise"), expenses: sum("expensesPaise"), profit: sum("profitPaise") };
  });
  const fy = fyStart(istDay(new Date()));
  const thisFy = byMonth.filter((r) => r.month >= fy);
  const fyTotal = (k: "revenue" | "expenses" | "profit") => thisFy.reduce((a, r) => a + r[k], 0);

  const fyExpenses = s.expenses.filter((e) => e.date.slice(0, 7) >= fy);
  const categories = [...new Set(fyExpenses.map((e) => e.category))]
    .map((c) => ({ c, paise: fyExpenses.filter((e) => e.category === c).reduce((a, e) => a + e.amountPaise, 0) }))
    .sort((a, b) => b.paise - a.paise);

  // Client-wise: what each client was invoiced (before GST, after credit notes), paid, still owes, and cost.
  const clientsRows = s.companies
    .map((c) => {
      const inv = invoices.filter((i) => i.companyId === c.id && i.sent && !i.cancelled);
      const revenue = inv.reduce((a, i) => a + invoiceTotals(i).subtotal - (i.credits ?? []).reduce((x, cr) => x + cr.taxablePaise, 0), 0);
      const received = inv.reduce((a, i) => a + i.payments.reduce((x, pmt) => x + pmt.amountPaise, 0), 0);
      const due = inv.reduce((a, i) => a + invoiceTotals(i).due, 0);
      const cost = s.expenses.filter((e) => e.companyId === c.id).reduce((a, e) => a + e.amountPaise, 0);
      return { c, revenue, received, due, cost, profit: revenue - cost };
    })
    .filter((x) => x.revenue || x.cost || x.due)
    .sort((a, b) => b.revenue - a.revenue);

  // Photography, marketing and combined for this financial year — always both businesses, whatever the switch shows.
  const all = useCrm.getState();
  const allInvoices = all.invoices.map((i) => ({ ...i, business: i.business ?? all.deals.find((d) => d.id === i.dealId)?.business }));
  const allRows = profitAndLoss({ invoices: allInvoices, creditNotes: all.creditNotes.map((c) => ({ ...c, business: allInvoices.find((i) => i.id === c.invoiceId)?.business })), expenses: all.expenses }).filter((r) => r.month >= fy);
  const split = (["photography", "marketing"] as const).map((b) => {
    const rs = allRows.filter((r) => r.business === b);
    const sum = (k: "revenuePaise" | "expensesPaise" | "profitPaise") => rs.reduce((a, r) => a + r[k], 0);
    return { label: BUSINESS_LABEL[b], short: BUSINESS_SHORT[b], revenue: sum("revenuePaise"), expenses: sum("expensesPaise"), profit: sum("profitPaise") };
  });
  const unassigned = allRows.filter((r) => r.business === "none");
  const combined = {
    label: "Combined",
    short: "Combined",
    revenue: allRows.reduce((a, r) => a + r.revenuePaise, 0),
    expenses: allRows.reduce((a, r) => a + r.expensesPaise, 0),
    profit: allRows.reduce((a, r) => a + r.profitPaise, 0),
  };

  const projects = s.projects
    .map((p) => {
      const revenue = invoices.filter((i) => i.dealId && i.dealId === p.dealId && i.sent && !i.cancelled).reduce((a, i) => a + invoiceTotals(i).subtotal - (i.credits ?? []).reduce((x, c) => x + c.taxablePaise, 0), 0);
      const cost = s.expenses.filter((e) => e.projectId === p.id).reduce((a, e) => a + e.amountPaise, 0);
      return { p, revenue, cost, profit: revenue - cost };
    })
    .filter((x) => x.revenue || x.cost)
    .sort((a, b) => b.profit - a.profit);

  const view = s.businessView === "all" ? "Both businesses" : BUSINESS_LABEL[s.businessView];
  const revenue = fyTotal("revenue");
  const profit = fyTotal("profit");
  const pct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
  const chart = [...thisFy].sort((a, b) => a.month.localeCompare(b.month)).map((r) => ({ month: monthLabel(r.month).split(" ")[0], Revenue: r.revenue / 100, Expenses: r.expenses / 100, Profit: r.profit / 100 }));
  const catMax = Math.max(1, ...categories.map((c) => c.paise));
  const projMax = Math.max(1, ...projects.map((x) => Math.abs(x.profit)));
  const clientName = (id: string) => s.companies.find((c) => c.id === id)?.name;
  const rupeeTick = (v: number) => formatCompact(v * 100);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`${view} · before GST · revenue counted when invoiced`}
        title="Profit & loss"
        actions={
          <span className="flex gap-2 print:hidden">
            <Button
              onClick={() =>
                downloadCsv("profit-and-loss", [
                  ["Month", "Business", "Revenue (₹)", "Expenses (₹)", "Profit (₹)"],
                  ...rows.map((r) => [r.month, r.business === "none" ? "Unassigned" : BUSINESS_SHORT[r.business], r.revenuePaise / 100, r.expensesPaise / 100, r.profitPaise / 100]),
                ])
              }
            >
              <Download strokeWidth={1.5} /> Excel (CSV)
            </Button>
            <Button onClick={() => window.print()}><Printer strokeWidth={1.5} /> Print / PDF</Button>
          </span>
        }
      />

      <p className="t-eyebrow m-0 text-ink-2">This financial year · from April {fy.slice(0, 4)}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile i={0} className={cn("border-transparent text-white", profit < 0 ? "bg-risk" : "bg-signal")}>
          <Label light>{profit < 0 ? "Loss so far" : "Profit so far"}</Label>
          <Big paise={profit} />
          <p className="m-0 mt-3 fs-12.5 text-white/85">{pct}% of revenue kept after costs</p>
        </Tile>
        <Tile i={1}>
          <Label>Revenue</Label>
          <Big paise={revenue} className="fs-30" />
          <p className="t-meta m-0 mt-2 text-ink-3">invoiced, after credit notes</p>
        </Tile>
        <Tile i={2}>
          <Label>Expenses</Label>
          <Big paise={fyTotal("expenses")} className="fs-30" />
          <p className="t-meta m-0 mt-2 text-ink-3">{fyExpenses.length} recorded · <Link to="/expenses" className="hover:text-ink">Expenses →</Link></p>
        </Tile>
        <Tile i={3}>
          <Label>Margin</Label>
          <div className="mt-2 flex justify-center"><Dial pct={Math.max(0, pct)} label={`${pct}% margin`} /></div>
          <p className="t-meta m-0 mt-1 text-center text-ink-3">profit ÷ revenue</p>
        </Tile>

        <Tile i={4} className="sm:col-span-2 xl:col-span-3">
          <Label>Month by month</Label>
          {chart.length ? (
            <div className="mt-3 h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} padding={{ left: 16, right: 16 }} tick={{ fill: "var(--ink-3)", fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={rupeeTick} tick={{ fill: "var(--ink-3)", fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatFull(Number(v) * 100)} cursor={{ fill: "var(--hover)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="Revenue" fill="var(--signal)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Expenses" fill="var(--line-2)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Line dataKey="Profit" stroke="var(--ink)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="t-meta mt-3 text-ink-3">Nothing yet — sent invoices and expenses appear here.</p>
          )}
        </Tile>

        <Tile i={5}>
          <Label>By business</Label>
          <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
            {[...split, combined].map((r) => (
              <li key={r.label}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("fs-12.5", r.label === "Combined" ? "font-medium" : "text-ink-2")}>{r.short}</span>
                  <span className={cn("font-mono fs-12.5 tnum", r.profit < 0 && "text-risk")}>{formatCompact(r.profit)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken">
                  <motion.span
                    className={cn("block h-full rounded-full", r.label === BUSINESS_LABEL.marketing ? "bg-ok" : r.label === "Combined" ? "bg-ink" : "bg-signal")}
                    initial={{ width: 0 }}
                    animate={{ width: `${combined.revenue ? Math.max(0, (r.revenue / combined.revenue) * 100) : 0}%` }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                  />
                </div>
                <p className="m-0 mt-0.5 fs-11 text-ink-3">{formatCompact(r.revenue)} revenue · {margin(r.profit, r.revenue)} margin</p>
              </li>
            ))}
          </ul>
          {unassigned.length > 0 && <p className="m-0 mt-3 fs-11 text-ink-3">Combined includes overheads not tagged to either business.</p>}
        </Tile>

        <Tile i={6} className="sm:col-span-2">
          <Label>Where the money goes</Label>
          {!categories.length ? <p className="t-meta mt-3 text-ink-3">No expenses recorded this year.</p> : (
            <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
              {categories.map(({ c, paise }, k) => (
                <li key={c} className="grid grid-cols-[minmax(0,10em)_1fr_auto] items-center gap-3 fs-12.5">
                  <span className="truncate text-ink-2">{c}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-sunken">
                    <motion.span className="block h-full rounded-full bg-signal" style={{ opacity: 1 - k * 0.07 }} initial={{ width: 0 }} animate={{ width: `${(paise / catMax) * 100}%` }} transition={{ duration: 0.7, delay: 0.2 + k * 0.05 }} />
                  </span>
                  <span className="font-mono tnum">{formatCompact(paise)}</span>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        <Tile i={7} className="sm:col-span-2">
          <div className="flex items-baseline justify-between"><Label>Projects, by profit</Label><Link to="/projects" className="t-meta text-ink-3 hover:text-ink">Projects →</Link></div>
          {!projects.length ? <p className="t-meta mt-3 text-ink-3">Tag expenses with a project to see what each one earns.</p> : (
            <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
              {projects.slice(0, 8).map(({ p, revenue: rev, cost, profit: pr }, k) => (
                <li key={p.id} className="grid grid-cols-[minmax(0,12em)_1fr_auto] items-center gap-3 fs-12.5" title={`Invoiced ${formatFull(rev)} · costs ${formatFull(cost)}`}>
                  <Link to={`/projects/${p.id}`} className="truncate hover:underline"><b className="font-medium">{clientName(p.companyId) ?? p.name}</b> <span className="text-ink-3">{p.name}</span></Link>
                  <span className="h-2 overflow-hidden rounded-full bg-sunken">
                    <motion.span className={cn("block h-full rounded-full", pr < 0 ? "bg-risk" : p.business === "marketing" ? "bg-ok" : "bg-signal")} initial={{ width: 0 }} animate={{ width: `${(Math.abs(pr) / projMax) * 100}%` }} transition={{ duration: 0.7, delay: 0.2 + k * 0.05 }} />
                  </span>
                  <span className={cn("font-mono tnum", pr < 0 && "text-risk")}>{formatCompact(pr)}</span>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </div>

      <section className={tile}>
        <h2 className="t-eyebrow m-0 mb-2 text-ink-3">By client</h2>
        <Table>
          <THead>
            <TR interactive={false}>
              <TH>Client</TH>
              <TH align="right">Invoiced</TH>
              <TH align="right" className="hidden sm:table-cell">Received</TH>
              <TH align="right">Outstanding</TH>
              <TH align="right" className="hidden sm:table-cell">Costs</TH>
              <TH align="right">Profit</TH>
            </TR>
          </THead>
          <TBody>
            {clientsRows.map(({ c, revenue: rev, received, due, cost, profit: pr }) => (
              <TR key={c.id} interactive={false}>
                <TD><Link to={`/clients/${c.id}`} className="flex items-center gap-2 hover:underline"><ClientPhoto company={c} size="sm" />{c.name}</Link></TD>
                <TD align="right" numeric>{formatFull(rev)}</TD>
                <TD align="right" numeric className="hidden text-ok sm:table-cell">{formatFull(received)}</TD>
                <TD align="right" numeric className={due ? "text-warn" : "text-ink-3"}>{formatFull(due)}</TD>
                <TD align="right" numeric className="hidden sm:table-cell">{formatFull(cost)}</TD>
                <TD align="right" numeric className={pr < 0 ? "text-risk" : undefined}>{formatFull(pr)}</TD>
              </TR>
            ))}
            {!clientsRows.length && <TR interactive={false}><TD colSpan={6} className="text-ink-3">Sent invoices and client expenses appear here.</TD></TR>}
          </TBody>
        </Table>
        <p className="t-meta m-0 mt-2 text-ink-3">Invoiced and profit before GST; received and outstanding include GST.</p>
      </section>

      <section className={tile}>
        <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Every month</h2>
        <Table>
          <THead>
            <TR interactive={false}>
              <TH>Month</TH>
              <TH align="right">Revenue</TH>
              <TH align="right">Expenses</TH>
              <TH align="right">Profit</TH>
              <TH align="right">Margin</TH>
            </TR>
          </THead>
          <TBody>
            {byMonth.map((r) => (
              <TR key={r.month} interactive={false}>
                <TD>{monthLabel(r.month)}</TD>
                <TD align="right" numeric>{formatFull(r.revenue)}</TD>
                <TD align="right" numeric>{formatFull(r.expenses)}</TD>
                <TD align="right" numeric className={r.profit < 0 ? "text-risk" : undefined}>{formatFull(r.profit)}</TD>
                <TD align="right" numeric className="text-ink-3">{margin(r.profit, r.revenue)}</TD>
              </TR>
            ))}
            {!byMonth.length && <TR interactive={false}><TD colSpan={5} className="text-ink-3">Nothing yet — sent invoices and expenses appear here.</TD></TR>}
          </TBody>
        </Table>
      </section>

      <GstRegister />
    </div>
  );
}
