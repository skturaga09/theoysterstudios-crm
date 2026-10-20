import { BUSINESS_LABEL, BUSINESS_SHORT, formatFull, invoiceTotals, istDay, profitAndLoss } from "@pinnacle/shared";
import { Button, Ledger, Table, TBody, TD, TH, THead, TR } from "@pinnacle/ui";
import { Download, Printer } from "lucide-react";
import { Navigate } from "react-router";
import { PageHeader } from "../../components/page-header";
import { useAccess, useCrm } from "../../data/store";
import { downloadCsv } from "../../lib/download";

const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const margin = (profit: number, revenue: number) => (revenue > 0 ? `${Math.round((profit / revenue) * 100)}%` : "—");
/** Indian financial year start (1 April) for a day, as "2026-04". */
const fyStart = (day: string) => (Number(day.slice(5, 7)) >= 4 ? `${day.slice(0, 4)}-04` : `${Number(day.slice(0, 4)) - 1}-04`);

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

  const projects = s.projects
    .map((p) => {
      const revenue = invoices.filter((i) => i.dealId && i.dealId === p.dealId && i.sent && !i.cancelled).reduce((a, i) => a + invoiceTotals(i).subtotal - (i.credits ?? []).reduce((x, c) => x + c.taxablePaise, 0), 0);
      const cost = s.expenses.filter((e) => e.projectId === p.id).reduce((a, e) => a + e.amountPaise, 0);
      return { p, revenue, cost, profit: revenue - cost };
    })
    .filter((x) => x.revenue || x.cost)
    .sort((a, b) => b.profit - a.profit);

  const view = s.businessView === "all" ? "Both businesses" : BUSINESS_LABEL[s.businessView];
  return (
    <div className="flex flex-col gap-10">
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

      <section>
        <h2 className="t-eyebrow m-0 mb-3 text-ink-2">This financial year (from April)</h2>
        <Ledger
          cells={[
            { label: "Revenue", paise: fyTotal("revenue"), delta: "invoiced, after credit notes", deltaTone: "mute" },
            { label: "Expenses", paise: fyTotal("expenses"), delta: `${fyExpenses.length} recorded`, deltaTone: "mute" },
            { label: "Profit", paise: fyTotal("profit"), delta: fyTotal("profit") < 0 ? "loss so far" : "so far", deltaTone: fyTotal("profit") < 0 ? "risk" : "ok" },
            { label: "Margin", value: fyTotal("revenue") > 0 ? Math.round((fyTotal("profit") / fyTotal("revenue")) * 100) : 0, unit: "%", delta: "profit ÷ revenue", deltaTone: "mute" },
          ]}
        />
      </section>

      <section>
        <h2 className="t-eyebrow m-0 mb-2 text-ink-2">By month</h2>
        <Table className="border-t border-line">
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

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-2">
        <section>
          <h2 className="t-eyebrow m-0 mb-2 text-ink-2">Expenses by category · this financial year</h2>
          <Table className="border-t border-line">
            <TBody>
              {categories.map(({ c, paise }) => (
                <TR key={c} interactive={false}>
                  <TD>{c}</TD>
                  <TD align="right" numeric>{formatFull(paise)}</TD>
                </TR>
              ))}
              {!categories.length && <TR interactive={false}><TD className="text-ink-3">No expenses recorded this year.</TD></TR>}
            </TBody>
          </Table>
        </section>
        <section>
          <h2 className="t-eyebrow m-0 mb-2 text-ink-2">By project</h2>
          <Table className="border-t border-line">
            <THead>
              <TR interactive={false}>
                <TH>Project</TH>
                <TH align="right">Invoiced</TH>
                <TH align="right">Costs</TH>
                <TH align="right">Profit</TH>
              </TR>
            </THead>
            <TBody>
              {projects.map(({ p, revenue, cost, profit }) => (
                <TR key={p.id} interactive={false}>
                  <TD>{p.name}</TD>
                  <TD align="right" numeric>{formatFull(revenue)}</TD>
                  <TD align="right" numeric>{formatFull(cost)}</TD>
                  <TD align="right" numeric className={profit < 0 ? "text-risk" : undefined}>{formatFull(profit)}</TD>
                </TR>
              ))}
              {!projects.length && <TR interactive={false}><TD colSpan={4} className="text-ink-3">Tag expenses with a project to see what each one earns.</TD></TR>}
            </TBody>
          </Table>
        </section>
      </div>
    </div>
  );
}
