import { formatFull, istDay, parseRupees } from "@pinnacle/shared";
import { ID_TYPES } from "@pinnacle/shared/schemas";
import { Avatar, Button, Input, Pill, Segmented, Select, Sheet, Table, TBody, TD, TH, THead, toast, TR } from "@pinnacle/ui";
import { Plus, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AmountInput } from "../../components/amount-input";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/page-header";
import { addExpense } from "../../data/finance";
import { loadPeople, saveFreelancer, setSalary, usePeople } from "../../data/people";
import { useAccess, useCrm } from "../../data/store";
import type { Freelancer } from "../../data/types";
import { usePref } from "../../lib/hooks";

const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const lastMonths = (n: number) => {
  const [y, m] = istDay(new Date()).slice(0, 7).split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
};

/** What each freelancer is owed and has been paid, project by project. */
function useLedger(f: Freelancer) {
  const s = useCrm();
  const payments = s.expenses.filter((e) => e.freelancerId === f.id).sort((a, b) => b.date.localeCompare(a.date));
  const projects = s.projects.flatMap((p) =>
    p.crew
      .filter((c) => c.freelancerId === f.id)
      .map((c) => {
        const paid = payments.filter((e) => e.projectId === p.id).reduce((n, e) => n + e.amountPaise, 0);
        return { p, role: c.role, fee: c.feePaise ?? 0, paid, pending: Math.max(0, (c.feePaise ?? 0) - paid) };
      }),
  );
  const paid = payments.reduce((n, e) => n + e.amountPaise, 0);
  return { projects, payments, paid, pending: projects.reduce((n, x) => n + x.pending, 0) };
}

/** In-house team salaries and outside freelancers: who they are, what they're owed, what's been paid. */
export function TeamRoute() {
  const canPay = useAccess("finance") === "edit";
  const canEdit = useAccess("projects") === "edit";
  const loaded = usePeople((p) => p.loaded);
  const freelancers = usePeople((p) => p.freelancers);
  const [tab, setTab] = usePref<"freelancers" | "salaries">("team.tab", "freelancers");
  useEffect(() => void loadPeople(canPay), [canPay]);
  const shown = canPay ? tab : "freelancers";
  return (
    <>
      <PageHeader
        title="Team & freelancers"
        stats={[{ label: "Freelancers", value: freelancers.length, tone: "signal" }]}
        actions={canPay && <Segmented label="Show" value={shown} onChange={setTab} options={[{ value: "freelancers", label: "Freelancers" }, { value: "salaries", label: "Salaries" }]} />}
      />
      {!loaded ? <p className="t-dense text-ink-3">Loading…</p> : shown === "salaries" ? <Salaries /> : <Freelancers canEdit={canEdit} canPay={canPay} />}
    </>
  );
}

function Freelancers({ canEdit, canPay }: { canEdit: boolean; canPay: boolean }) {
  const freelancers = usePeople((p) => p.freelancers);
  const [openId, setOpenId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const open = freelancers.find((f) => f.id === openId);
  return (
    <>
      {canEdit && (
        <div className="mb-4">
          {adding ? <FreelancerForm onDone={() => setAdding(false)} /> : <Button variant="ink" onClick={() => setAdding(true)}><Plus strokeWidth={1.5} /> New freelancer</Button>}
        </div>
      )}
      {!freelancers.length ? (
        <EmptyState icon={UserRound} title="No freelancers yet" body="Add the photographers, cinematographers and editors you hire per wedding. Put them on a project's team with their fee, and record what you pay them." />
      ) : (
        <Table>
          <THead>
            <TR><TH>Name</TH><TH>Phone</TH><TH>ID</TH><TH className="text-right">Projects</TH>{canPay && <><TH className="text-right">Paid</TH><TH className="text-right">Pending</TH></>}</TR>
          </THead>
          <TBody>
            {freelancers.map((f) => <FreelancerRow key={f.id} f={f} canPay={canPay} onOpen={() => setOpenId(f.id)} />)}
          </TBody>
        </Table>
      )}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(undefined)} eyebrow={open?.skill ?? "Freelancer"} title={open?.name ?? ""}>
        {open && <FreelancerDetail f={open} canEdit={canEdit} canPay={canPay} />}
      </Sheet>
    </>
  );
}

function FreelancerRow({ f, canPay, onOpen }: { f: Freelancer; canPay: boolean; onOpen: () => void }) {
  const l = useLedger(f);
  return (
    <TR onClick={onOpen} className="cursor-pointer hover:bg-hover">
      <TD><span className="flex items-center gap-2.5"><Avatar name={f.name} size="sm" /><span><span className="block font-medium">{f.name}</span>{f.skill && <span className="fs-11.5 text-ink-3">{f.skill}</span>}</span></span></TD>
      <TD className="font-mono fs-12">{f.phone ?? "—"}</TD>
      <TD className="fs-12 text-ink-2">{f.idType ? `${f.idType} ${f.idNumber ?? ""}` : "—"}</TD>
      <TD className="text-right font-mono">{l.projects.length}</TD>
      {canPay && <><TD className="text-right font-mono">{formatFull(l.paid)}</TD><TD className="text-right font-mono">{l.pending ? <span className="text-risk">{formatFull(l.pending)}</span> : "—"}</TD></>}
    </TR>
  );
}

/** Add or edit a freelancer. An ID number shows masked to everyone but owners; leaving it as is keeps it. */
function FreelancerForm({ f, onDone }: { f?: Freelancer; onDone?: () => void }) {
  const [draft, setDraft] = useState({ name: f?.name ?? "", phone: f?.phone ?? "", skill: f?.skill ?? "", idType: f?.idType ?? "", idNumber: f?.idNumber ?? "", notes: f?.notes ?? "" });
  const put = (k: keyof typeof draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });
  return (
    <form
      className="grid grid-cols-1 gap-2 rounded-card bg-sunken p-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!draft.name.trim()) return toast("Add their name");
        const saved = await saveFreelancer({ ...(f && { id: f.id, createdAt: f.createdAt }), ...draft, idType: draft.idType || undefined, name: draft.name.trim() });
        if (saved) {
          toast(f ? "Saved" : `${saved.name} added`);
          onDone?.();
        }
      }}
    >
      <Input aria-label="Name" placeholder="Name" value={draft.name} onChange={put("name")} autoFocus={!f} />
      <Input aria-label="Phone" placeholder="Phone, e.g. +91 98450 11223" value={draft.phone} onChange={put("phone")} />
      <Input aria-label="Skill" list="freelancer-skills" placeholder="Photographer, cinematographer…" value={draft.skill} onChange={put("skill")} />
      <datalist id="freelancer-skills">{["Photographer", "Candid photographer", "Cinematographer", "Drone operator", "Editor", "Album designer"].map((x) => <option key={x} value={x} />)}</datalist>
      <span className="flex gap-2">
        <Select aria-label="ID type" value={draft.idType} onChange={put("idType")} className="w-[150px]">
          <option value="">ID type…</option>
          {ID_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
        </Select>
        <Input aria-label="ID number" placeholder="ID number" value={draft.idNumber} onChange={put("idNumber")} className="flex-1 font-mono" />
      </span>
      <Input aria-label="Notes" placeholder="Notes (rates, bank details are kept elsewhere)" value={draft.notes} onChange={put("notes")} className="sm:col-span-2" />
      <span className="flex gap-2 sm:col-span-2">
        <Button type="submit" variant="ink" size="sm">{f ? "Save" : "Add freelancer"}</Button>
        {onDone && <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>}
      </span>
    </form>
  );
}

function FreelancerDetail({ f, canEdit, canPay }: { f: Freelancer; canEdit: boolean; canPay: boolean }) {
  const s = useCrm();
  const l = useLedger(f);
  const [projectId, setProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(istDay(new Date()));
  return (
    <div className="flex flex-col gap-6">
      {canEdit ? <FreelancerForm key={f.id} f={f} /> : (
        <dl className="t-dense m-0 grid grid-cols-[100px_1fr] gap-y-1.5">
          <dt className="text-ink-3">Phone</dt><dd className="m-0 font-mono">{f.phone ?? "—"}</dd>
          <dt className="text-ink-3">ID</dt><dd className="m-0">{f.idType ? `${f.idType} ${f.idNumber ?? ""}` : "—"}</dd>
        </dl>
      )}

      <section>
        <h3 className="t-eyebrow m-0 mb-2 text-ink-3">Projects · {l.projects.length}</h3>
        {!l.projects.length ? <p className="t-meta m-0 text-ink-3">Not on a project yet. Add them from a project's Team section, with their fee.</p> : (
          <ul className="m-0 list-none border-t border-line p-0">
            {l.projects.map((x) => (
              <li key={`${x.p.id}-${x.role}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2">
                <Link to={`/projects/${x.p.id}`} className="t-dense min-w-0 flex-1 font-medium hover:underline">{s.companies.find((c) => c.id === x.p.companyId)?.name ?? x.p.name}<span className="font-normal text-ink-3"> · {x.role}</span></Link>
                <span className="font-mono fs-12 text-ink-2">fee {x.fee ? formatFull(x.fee) : "not set"}</span>
                {canPay && (x.pending ? <Pill tone="warn">{formatFull(x.pending)} pending</Pill> : x.fee ? <Pill tone="ok">Paid</Pill> : null)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canPay && (
        <section>
          <h3 className="t-eyebrow m-0 mb-2 text-ink-3">Payments · {formatFull(l.paid)} paid{l.pending ? ` · ${formatFull(l.pending)} pending` : ""}</h3>
          <form
            className="mb-3 flex flex-wrap items-start gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const p = s.projects.find((x) => x.id === projectId);
              const paise = parseRupees(amount);
              if (!p || !paise) return toast("Pick the project and the amount paid");
              addExpense({ date, category: "Freelancers & crew", description: `${f.name} · ${p.name}`, vendor: f.name, amountPaise: paise, gstPaise: 0, projectId: p.id, companyId: p.companyId, business: p.business, freelancerId: f.id });
              setAmount("");
              toast(`Recorded ${formatFull(paise)} to ${f.name}`);
            }}
          >
            <Select aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="min-w-[180px] flex-1">
              <option value="">Paid for which project…</option>
              {l.projects.map((x) => <option key={x.p.id} value={x.p.id}>{s.companies.find((c) => c.id === x.p.companyId)?.name ?? x.p.name}{x.pending ? ` · ${formatFull(x.pending)} pending` : ""}</option>)}
            </Select>
            <AmountInput aria-label="Amount paid" placeholder="Amount" value={amount} onValue={setAmount} className="w-[150px]" />
            <Input type="date" aria-label="Paid on" value={date} onChange={(e) => setDate(e.target.value)} className="w-[150px]" />
            <Button type="submit" size="sm" variant="ink">Record payment</Button>
          </form>
          {!l.payments.length ? <p className="t-meta m-0 text-ink-3">No payments yet.</p> : (
            <ul className="m-0 list-none border-t border-line p-0">
              {l.payments.map((e) => (
                <li key={e.id} className="flex items-center gap-3 border-b border-line py-2">
                  <span className="w-[90px] font-mono fs-12 text-ink-3">{e.date}</span>
                  <span className="t-dense min-w-0 flex-1 truncate">{e.description}</span>
                  <span className="font-mono fs-12.5">{formatFull(e.amountPaise)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** Each team member's monthly salary, and whether this month's has been paid (a Salary expense for that month). */
function Salaries() {
  const s = useCrm();
  const salaries = usePeople((p) => p.salaries);
  const months = lastMonths(6);
  const [month, setMonth] = useState(months[0]!);
  const paidFor = (memberId: string) => s.expenses.find((e) => e.category === "Salaries" && e.memberId === memberId && e.salaryMonth === month);
  const team = [...s.members].sort((a, b) => a.name.localeCompare(b.name));
  const payroll = team.reduce((n, m) => n + (salaries[m.id] ?? 0), 0);
  const paid = team.reduce((n, m) => n + (paidFor(m.id)?.amountPaise ?? 0), 0);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[180px]">
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </Select>
        <span className="t-dense text-ink-2">Payroll <b className="font-mono text-ink">{formatFull(payroll)}</b> · paid <b className="font-mono text-ok">{formatFull(paid)}</b> · pending <b className="font-mono text-risk">{formatFull(Math.max(0, payroll - paid))}</b></span>
      </div>
      <Table>
        <THead><TR><TH>Team member</TH><TH>Monthly salary</TH><TH>{monthLabel(month)}</TH></TR></THead>
        <TBody>
          {team.map((m) => {
            const done = paidFor(m.id);
            const amount = salaries[m.id];
            return (
              <TR key={m.id}>
                <TD><span className="flex items-center gap-2.5"><Avatar name={m.name} size="sm" /><span><span className="block font-medium">{m.name}</span><span className="fs-11.5 text-ink-3">{m.title}</span></span></span></TD>
                <TD><SalaryField memberId={m.id} paise={amount} /></TD>
                <TD>
                  {done ? (
                    <Pill tone="ok">Paid {done.date.slice(8)}/{done.date.slice(5, 7)} · {formatFull(done.amountPaise)}</Pill>
                  ) : amount ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        addExpense({ date: istDay(new Date()), category: "Salaries", description: `Salary · ${monthLabel(month)} · ${m.name}`, vendor: m.name, amountPaise: amount, gstPaise: 0, memberId: m.id, salaryMonth: month });
                        toast(`${m.name}'s ${monthLabel(month)} salary recorded`);
                      }}
                    >
                      Mark paid
                    </Button>
                  ) : (
                    <span className="t-meta text-ink-3">Set a salary first</span>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <p className="t-meta mt-3 text-ink-3">Salaries are seen only by owners and Finance. Each payment is saved as a Salary expense, so it counts in Profit &amp; loss.</p>
    </>
  );
}

function SalaryField({ memberId, paise }: { memberId: string; paise?: number }) {
  const [text, setText] = useState(paise ? String(paise / 100) : "");
  return (
    <AmountInput
      aria-label="Monthly salary"
      placeholder="Monthly"
      value={text}
      onValue={setText}
      onBlur={() => {
        const next = text.trim() ? parseRupees(text) : 0;
        if (next !== undefined && next !== (paise ?? 0)) void setSalary(memberId, next);
      }}
      className="w-[170px]"
    />
  );
}
