import { parseRupees, BUSINESS_SHORT, BUSINESSES, EXPENSE_CATEGORIES, fmtDate, formatFull, istDay, type Business, type ExpenseCategory } from "@pinnacle/shared";
import { Button, Input, MoneyText, Select, Table, TBody, TD, TH, THead, TR, toast } from "@pinnacle/ui";
import { Download, ExternalLink, Receipt, Trash2 } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/page-header";
import { addExpense, removeExpense } from "../../data/finance";
import { defaultBusiness, useAccess, useCrm } from "../../data/store";
import { downloadCsv } from "../../lib/download";

const toPaise = (v: string) => parseRupees(v) ?? 0; // exact rupees ("58,950"); "2.5L", "75k" also work
const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

/** Money going out: what, when, for which business and project, with the GST paid kept apart. Owners and Finance. */
export function ExpensesRoute() {
  const s = useCrm();
  const canSee = useAccess("finance") === "edit";
  const months = [...new Set(s.expenses.map((e) => e.date.slice(0, 7)))].sort().reverse();
  const [month, setMonth] = useState(() => istDay(new Date()).slice(0, 7));
  if (!canSee) return <Navigate to="/" replace />;

  const shown = s.expenses.filter((e) => month === "all" || e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const total = shown.reduce((a, e) => a + e.amountPaise, 0);
  const project = (id?: string) => s.projects.find((p) => p.id === id)?.name ?? "";
  const client = (id?: string) => s.companies.find((c) => c.id === id)?.name ?? "";

  return (
    <>
      <PageHeader
        title="Expenses"
        stats={[
          { label: "Spent, before GST", value: formatFull(total), tone: "risk" },
          { label: "Expenses", value: shown.length },
        ]}
        actions={
          <>
            <Select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[180px]">
              {!months.includes(istDay(new Date()).slice(0, 7)) && <option value={istDay(new Date()).slice(0, 7)}>{monthLabel(istDay(new Date()).slice(0, 7))}</option>}
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              <option value="all">All time</option>
            </Select>
            <Button
              disabled={!shown.length}
              onClick={() =>
                downloadCsv(`expenses-${month}`, [
                  ["Date", "Business", "Category", "Description", "Vendor", "Client", "Project", "Amount before GST (₹)", "GST (₹)", "Receipt"],
                  ...shown.map((e) => [e.date, e.business ? BUSINESS_SHORT[e.business] : "", e.category, e.description, e.vendor ?? "", client(e.companyId), project(e.projectId), e.amountPaise / 100, e.gstPaise / 100, e.receiptUrl ?? ""]),
                ])
              }
            >
              <Download strokeWidth={1.5} /> Excel (CSV)
            </Button>
          </>
        }
      />
      <AddExpense />
      {!shown.length ? (
        <EmptyState icon={Receipt} title="No expenses this month" body="Add freelancer payments, travel, rentals, album printing, ad spend and the rest — profit and loss is worked out from them." />
      ) : (
        <Table className="border-t border-line">
          <THead>
            <TR interactive={false}>
              <TH>Date</TH>
              <TH>Category</TH>
              <TH>What</TH>
              <TH>Client · project</TH>
              <TH align="right">Amount</TH>
              <TH align="right">GST</TH>
              <TH> </TH>
            </TR>
          </THead>
          <TBody>
            {shown.map((e) => (
              <TR key={e.id} interactive={false}>
                <TD className="font-mono fs-12 whitespace-nowrap">{fmtDate(e.date)}</TD>
                <TD>{e.category}{e.business && <span className="fs-11.5 text-ink-3"> · {BUSINESS_SHORT[e.business]}</span>}</TD>
                <TD>
                  {e.description}
                  {e.vendor && <span className="fs-11.5 text-ink-3"> · {e.vendor}</span>}
                  {e.receiptUrl && <a href={e.receiptUrl} target="_blank" rel="noreferrer" aria-label="Receipt" className="ml-1 inline-flex text-ink-3 hover:text-ink"><ExternalLink size={12} strokeWidth={1.5} /></a>}
                </TD>
                <TD className="text-ink-2">{[client(e.companyId), project(e.projectId)].filter(Boolean).join(" · ") || "—"}</TD>
                <TD align="right" numeric><MoneyText paise={e.amountPaise} /></TD>
                <TD align="right" numeric className="text-ink-3">{e.gstPaise ? formatFull(e.gstPaise) : "—"}</TD>
                <TD align="right"><Button size="icon-sm" variant="ghost" aria-label={`Delete ${e.description}`} onClick={() => removeExpense(e.id)}><Trash2 strokeWidth={1.5} /></Button></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}

function AddExpense() {
  const projects = useCrm((s) => s.projects);
  const companies = useCrm((s) => s.companies);
  const blank = () => ({ date: istDay(new Date()), category: "Freelancers & crew" as ExpenseCategory, description: "", vendor: "", amount: "", gst: "", business: defaultBusiness() as Business, projectId: "", companyId: "", receiptUrl: "" });
  const [f, setF] = useState(blank);
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  return (
    <form
      className="mb-8 grid grid-cols-2 gap-2 rounded-card bg-sunken p-3 md:grid-cols-4 xl:grid-cols-8"
      onSubmit={(e) => {
        e.preventDefault();
        const amountPaise = toPaise(f.amount);
        if (!f.description.trim() || !amountPaise) return toast("Add what it was for and the amount");
        if (f.receiptUrl.trim() && !/^https?:\/\/\S+$/.test(f.receiptUrl.trim())) return toast("The receipt link needs a full web address, starting https://");
        addExpense({
          date: f.date,
          category: f.category,
          description: f.description.trim(),
          vendor: f.vendor.trim() || undefined,
          amountPaise,
          gstPaise: toPaise(f.gst),
          business: f.business,
          projectId: f.projectId || undefined,
          // The project's client unless another was picked (the server fills it in the same way).
          companyId: f.companyId || projects.find((p) => p.id === f.projectId)?.companyId || undefined,
          receiptUrl: f.receiptUrl.trim() || undefined,
        });
        setF({ ...blank(), date: f.date, business: f.business });
        toast("Expense added");
      }}
    >
      <Input type="date" aria-label="Date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
      <Select aria-label="Category" value={f.category} onChange={(e) => set({ category: e.target.value as ExpenseCategory })}>
        {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </Select>
      <Input aria-label="What for" placeholder="What for" value={f.description} onChange={(e) => set({ description: e.target.value })} className="col-span-2" />
      <Input aria-label="Paid to" placeholder="Paid to (optional)" value={f.vendor} onChange={(e) => set({ vendor: e.target.value })} />
      <Input aria-label="Amount before GST in rupees" inputMode="decimal" placeholder="₹ before GST" value={f.amount} onChange={(e) => set({ amount: e.target.value })} className="font-mono" />
      <Input aria-label="GST paid in rupees" inputMode="decimal" placeholder="₹ GST (if any)" value={f.gst} onChange={(e) => set({ gst: e.target.value })} className="font-mono" />
      <Select aria-label="Business" value={f.business} onChange={(e) => set({ business: e.target.value as Business, projectId: "" })}>
        {BUSINESSES.map((b) => <option key={b} value={b}>{BUSINESS_SHORT[b]}</option>)}
      </Select>
      <Select aria-label="Client" value={f.companyId || projects.find((p) => p.id === f.projectId)?.companyId || ""} onChange={(e) => set({ companyId: e.target.value })} className="col-span-2">
        <option value="">No client</option>
        {companies.filter((c) => !c.business || c.business === f.business).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Select aria-label="Project" value={f.projectId} onChange={(e) => set({ projectId: e.target.value })} className="col-span-2">
        <option value="">No project (overheads)</option>
        {projects.filter((p) => p.business === f.business).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Input aria-label="Receipt link" placeholder="Receipt link (Drive)" value={f.receiptUrl} onChange={(e) => set({ receiptUrl: e.target.value })} className="col-span-2 md:col-span-3 xl:col-span-5" />
      <Button type="submit" variant="ink">Add expense</Button>
    </form>
  );
}
