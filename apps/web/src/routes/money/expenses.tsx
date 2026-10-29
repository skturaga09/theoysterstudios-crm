import { parseRupees, BUSINESS_SHORT, formatCompact, BUSINESSES, EXPENSE_CATEGORIES, fmtDate, formatFull, istDay, type Business, type ExpenseCategory } from "@pinnacle/shared";
import { Button, cn, Input, MoneyText, Select, Table, TBody, TD, TH, THead, TR, toast } from "@pinnacle/ui";
import { motion } from "motion/react";
import { Big, Label, Tile, tile } from "../../components/bento";
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
  const [category, setCategory] = useState<"all" | ExpenseCategory>("all");
  if (!canSee) return <Navigate to="/" replace />;

  const inMonth = s.expenses.filter((e) => month === "all" || e.date.startsWith(month));
  const shown = inMonth.filter((e) => category === "all" || e.category === category).sort((a, b) => b.date.localeCompare(a.date));
  const total = inMonth.reduce((a, e) => a + e.amountPaise, 0);
  const gst = inMonth.reduce((a, e) => a + e.gstPaise, 0);
  const withReceipt = inMonth.filter((e) => e.receiptUrl).length;
  const project = (id?: string) => s.projects.find((p) => p.id === id)?.name ?? "";
  const client = (id?: string) => s.companies.find((c) => c.id === id)?.name ?? "";
  const byCategory = [...new Set(inMonth.map((e) => e.category))]
    .map((c) => ({ c, paise: inMonth.filter((e) => e.category === c).reduce((a, e) => a + e.amountPaise, 0) }))
    .sort((a, b) => b.paise - a.paise);
  const catMax = Math.max(1, ...byCategory.map((x) => x.paise));
  const period = month === "all" ? "All time" : monthLabel(month);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Expenses"
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile i={0} className="border-transparent bg-signal text-white">
          <Label light>Spent · {period}</Label>
          <Big paise={total} />
          <p className="m-0 mt-3 fs-12.5 text-white/85">before GST · {inMonth.length} {inMonth.length === 1 ? "expense" : "expenses"}</p>
        </Tile>
        <Tile i={1}>
          <Label>GST paid</Label>
          <Big paise={gst} className="fs-30" />
          <p className="t-meta m-0 mt-2 text-ink-3">input credit to claim · ask your CA</p>
        </Tile>
        <Tile i={2} className="sm:col-span-2">
          <Label>Where it went</Label>
          {!byCategory.length ? <p className="t-meta mt-3 text-ink-3">Nothing recorded for {period.toLowerCase()} yet.</p> : (
            <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
              {byCategory.slice(0, 6).map(({ c, paise }, k) => (
                <li key={c}>
                  <button type="button" onClick={() => setCategory(category === c ? "all" : c)} className={cn("grid w-full grid-cols-[minmax(0,11em)_1fr_auto] items-center gap-3 rounded-control px-1 py-0.5 text-left fs-12.5 hover:bg-hover", category === c && "bg-hover")} aria-pressed={category === c}>
                    <span className="truncate text-ink-2">{c}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-sunken">
                      <motion.span className="block h-full rounded-full bg-signal" style={{ opacity: 1 - k * 0.1 }} initial={{ width: 0 }} animate={{ width: `${(paise / catMax) * 100}%` }} transition={{ duration: 0.7, delay: 0.2 + k * 0.05 }} />
                    </span>
                    <span className="font-mono tnum">{formatCompact(paise)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {withReceipt < inMonth.length && <p className="m-0 mt-2 fs-11 text-warn">{inMonth.length - withReceipt} without a receipt link</p>}
        </Tile>
      </div>

      <section className={tile}>
        <h2 className="t-eyebrow m-0 mb-3 text-ink-3">Add an expense</h2>
        <AddExpense />
      </section>

      <section className={tile}>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="t-eyebrow m-0 text-ink-3">{period} · {shown.length} {shown.length === 1 ? "expense" : "expenses"}</h2>
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as "all" | ExpenseCategory)} className="ml-auto w-[220px]">
            <option value="all">Every category</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        {!shown.length ? (
          <EmptyState icon={Receipt} title={category === "all" ? "No expenses this month" : `No ${category.toLowerCase()} this month`} body="Add freelancer payments, travel, rentals, album printing, ad spend and the rest — profit and loss is worked out from them." />
        ) : (
          <Table>
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
                  <TD><span className="inline-flex items-center gap-1.5"><span className={cn("size-2 rounded-full", e.business === "marketing" ? "bg-ok" : e.business ? "bg-signal" : "bg-ink-3")} />{e.category}</span></TD>
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
        <p className="t-meta m-0 mt-2 flex items-center gap-3 text-ink-3"><span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-signal" /> Photography</span><span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-ok" /> Marketing</span><span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-ink-3" /> Studio overheads</span></p>
      </section>
    </div>
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
      className="grid grid-cols-2 gap-2 md:grid-cols-6"
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
      <Select aria-label="Category" className="md:col-span-2" value={f.category} onChange={(e) => set({ category: e.target.value as ExpenseCategory })}>
        {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </Select>
      <Input aria-label="What for" placeholder="What for" value={f.description} onChange={(e) => set({ description: e.target.value })} className="col-span-2 md:col-span-3" />
      <Input aria-label="Paid to" placeholder="Paid to (optional)" value={f.vendor} onChange={(e) => set({ vendor: e.target.value })} className="md:col-span-2" />
      <Input aria-label="Amount before GST in rupees" inputMode="decimal" placeholder="₹ amount" value={f.amount} onChange={(e) => set({ amount: e.target.value })} className="font-mono" />
      <Input aria-label="GST paid in rupees" inputMode="decimal" placeholder="₹ GST" value={f.gst} onChange={(e) => set({ gst: e.target.value })} className="font-mono" />
      <Select aria-label="Business" className="md:col-span-2" value={f.business} onChange={(e) => set({ business: e.target.value as Business, projectId: "" })}>
        {BUSINESSES.map((b) => <option key={b} value={b}>{BUSINESS_SHORT[b]}</option>)}
      </Select>
      <Select aria-label="Client" value={f.companyId || projects.find((p) => p.id === f.projectId)?.companyId || ""} onChange={(e) => set({ companyId: e.target.value })} className="col-span-2 md:col-span-3">
        <option value="">No client</option>
        {companies.filter((c) => !c.business || c.business === f.business).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Select aria-label="Project" value={f.projectId} onChange={(e) => set({ projectId: e.target.value })} className="col-span-2 md:col-span-3">
        <option value="">No project (overheads)</option>
        {projects.filter((p) => p.business === f.business).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Input aria-label="Receipt link" placeholder="Receipt link (Drive)" value={f.receiptUrl} onChange={(e) => set({ receiptUrl: e.target.value })} className="col-span-2 md:col-span-5" />
      <Button type="submit" variant="ink">Add expense</Button>
    </form>
  );
}
