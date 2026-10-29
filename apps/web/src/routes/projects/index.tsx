import {
  addDays,
  deliveryWindow,
  splitNames,
  APPROVAL_LABEL,
  APPROVALS,
  BUSINESS_LABEL,
  CREW_ROLES,
  DELIVERABLE_STATUSES,
  fmtAgo,
  fmtDate,
  formatFull,
  parseRupees,
  PEOPLE_COST_CATEGORIES,
  invoiceTotals,
  istDay,
  PRIORITIES,
  PRIORITY_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUSES,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  type Approval,
  type DeliverableStatus,
  type Priority,
  type ProjectStatus,
  type TaskStatus,
} from "@pinnacle/shared";
import { Avatar, Button, Checkbox, cn, Input, Pill, Segmented, Select, StrikeText, Textarea, toast } from "@pinnacle/ui";
import { ArrowLeft, ChevronDown, ExternalLink, FolderKanban, FolderPlus, MessageSquare, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ClientPhoto } from "../../components/client-photo";
import { EmptyState } from "../../components/empty-state";
import { Cover } from "../records/client-cards";
import { motion } from "motion/react";
import { BUSINESS_TEXT, BusinessIcon } from "../../components/business-icon";
import { PageHeader } from "../../components/page-header";
import { DoneBy } from "../../components/done-by";
import { Timeline } from "../../components/deal/timeline";
import { ME_ID } from "../../data/seed";
import { DealPayments } from "../../components/deal/deal-money";
import { stageState } from "../../data/finance";
import { useAccess, useCrm } from "../../data/store";
import type { Project, ProjectEvent, Task } from "../../data/types";
import { usePref } from "../../lib/hooks";
import { api } from "../../lib/api";
import { IS_DEMO } from "../../lib/demo";
import { useFreelancers, usePeople } from "../../data/people";
import { trackSpotlight } from "../../lib/spotlight";

const DELIVERABLE_LABEL: Record<DeliverableStatus, string> = { pending: "Pending", in_progress: "In progress", delivered: "Delivered" };
const PRIORITY_TONE: Record<Priority, "mute" | "warn" | "risk"> = { low: "mute", normal: "mute", high: "warn", urgent: "risk" };
const STATUS_TONE: Record<ProjectStatus, "mute" | "ok" | "warn"> = { planning: "mute", active: "warn", delivered: "ok", closed: "mute" };
const statusOf = (t: Task): TaskStatus => t.status ?? (t.done ? "done" : "todo");
const dueOn = (day: string) => `${day}T18:00:00+05:30`;

/** A section that folds to a one-line summary; whether it's open is remembered on this device. */
function Fold({ id, title, summary, children, defaultOpen = false }: { id: string; title: string; summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [state, setState] = usePref<"open" | "closed">(`project.fold.${id}`, defaultOpen ? "open" : "closed");
  const open = state === "open";
  return (
    <section>
      <button type="button" onClick={() => setState(open ? "closed" : "open")} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
        <h2 className="t-eyebrow m-0 text-ink-3">{title}</h2>
        <ChevronDown size={14} strokeWidth={1.5} className={cn("ml-auto shrink-0 text-ink-3 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open ? <div className="mt-2 flex flex-col gap-6">{children}</div> : <div className="t-meta mt-1.5 text-ink-2">{summary}</div>}
    </section>
  );
}

/** Owners and project managers can remove a project, with its checklist and client link. The deal and invoices stay. */
function DeleteProject({ p, taskCount }: { p: Project; taskCount: number }) {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Delete project"
      title="Delete project"
      onClick={async () => {
        if (!window.confirm(`Delete “${p.name}”? Its ${taskCount} checklist ${taskCount === 1 ? "task" : "tasks"} and the client's portal link go too. The lead, quotations and invoices stay. This can't be undone.`)) return;
        try {
          if (!IS_DEMO) await api(`/projects/${p.id}`, { method: "DELETE" });
          useCrm.setState((s) => ({ projects: s.projects.filter((x) => x.id !== p.id), tasks: s.tasks.filter((t) => t.projectId !== p.id) }));
          toast("Project deleted");
          navigate("/projects");
        } catch (e) {
          toast(`Couldn't delete it — ${(e as Error).message}`);
        }
      }}
    >
      <Trash2 strokeWidth={1.5} />
    </Button>
  );
}

/**
 * A new wedding date moves the checklist with it: open tasks and pending deliverables that the template counts from
 * the event shift by the same number of days. Ones counted from the booking stay put.
 */
function moveDate(p: Project, tasks: Task[], next?: string) {
  const s = useCrm.getState();
  const shift = p.dueDate && next ? Math.round((Date.parse(next) - Date.parse(p.dueDate)) / 86400_000) : 0;
  if (!shift) return s.updateProject(p.id, { dueDate: next });
  const t = s.templates[p.business];
  const taskTitles = new Set(t.tasks.filter((x) => x.from === "event").map((x) => x.title));
  const deliverableNames = new Set(t.deliverables.filter((x) => x.from === "event").map((x) => x.name));
  const moving = tasks.filter((x) => !x.done && taskTitles.has(x.title));
  for (const x of moving) s.updateTask(x.id, { dueAt: dueOn(addDays(istDay(x.dueAt), shift)) });
  const deliverables = p.deliverables.map((d) => (d.status !== "delivered" && d.dueDate && deliverableNames.has(d.name) ? { ...d, dueDate: addDays(d.dueDate, shift) } : d));
  s.updateProject(p.id, { dueDate: next, deliverables });
  toast(`Moved ${moving.length} ${moving.length === 1 ? "task" : "tasks"} ${shift > 0 ? "later" : "earlier"} by ${Math.abs(shift)} ${Math.abs(shift) === 1 ? "day" : "days"}`);
}
const overdue = (t: Task) => !t.done && +new Date(t.dueAt) < Date.now();
const newId = (p: string) => `${p}${Date.now().toString(36)}`;

function progress(tasks: Task[]) {
  const done = tasks.filter((t) => t.done).length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

/** A project as a card: the client's photo on top, then progress, the next function and who runs it. */
function ProjectCard({ p, index }: { p: Project; index: number }) {
  const s = useCrm();
  const tasks = s.tasks.filter((t) => t.projectId === p.id);
  const pr = progress(tasks);
  const late = tasks.filter(overdue).length;
  const client = s.companies.find((c) => c.id === p.companyId);
  const manager = s.members.find((m) => m.id === p.managerId);
  const today = istDay(new Date());
  const next = p.events.filter((e) => e.date && e.date >= today).sort((a, b) => a.date!.localeCompare(b.date!))[0];
  const bar = p.business === "marketing" ? "bg-ok" : "bg-signal";
  return (
    <motion.li initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.05, duration: 0.3 }} whileHover={{ y: -4 }}>
      <Link to={`/projects/${p.id}`} onMouseMove={trackSpotlight} className="spotlight block overflow-hidden rounded-card border border-line bg-surface shadow-rest transition-shadow duration-200 hover:shadow-pop">
        {client ? (
          <Cover company={client} canUpload={false} hoverZoom className="h-[150px]">
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-10 pb-3">
              <span className="block truncate font-serif fs-22 leading-tight text-white">{client.name}</span>
            </span>
            <BusinessIcon business={p.business} size="sm" className="absolute top-3 left-3 bg-surface/90" />
          </Cover>
        ) : (
          <div className="h-[150px] bg-sunken" />
        )}
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <span className="t-dense min-w-0 flex-1 truncate font-medium">{p.name}</span>
            <Pill tone={STATUS_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Pill>
          </div>
          <span className="flex items-center gap-2">
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunken"><span className={cn("block h-full rounded-full", bar)} style={{ width: `${pr.pct}%` }} /></span>
            <span className="font-mono fs-11 text-ink-3">{pr.done}/{pr.total}</span>
          </span>
          <div className="flex items-center gap-2 fs-12 text-ink-2">
            <span className="min-w-0 flex-1 truncate">
              {next ? <>Next: <b className="font-medium text-ink">{next.name}</b> · {fmtDate(next.date!)}</> : p.dueDate ? `${p.business === "photography" ? "Event" : "Due"} ${fmtDate(p.dueDate)}` : "No dates yet"}
            </span>
            {late > 0 && <Pill tone="risk">{late} overdue</Pill>}
            {manager && <Avatar name={manager.name} me={manager.id === ME_ID} size="sm" />}
          </div>
        </div>
      </Link>
    </motion.li>
  );
}

/** All projects, started automatically when a lead is confirmed. */
export function ProjectsRoute() {
  const s = useCrm();
  const [show, setShow] = usePref<"open" | "all">("projects.show", "open");
  const [layout, setLayout] = usePref<"cards" | "list">("projects.layout", "cards");
  const projects = s.projects
    .filter((p) => show === "all" || p.status === "planning" || p.status === "active")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  return (
    <>
      <PageHeader
        banner
        eyebrow={`${s.projects.filter((p) => p.status === "active").length} active`}
        title="Projects"
        stats={[
          { label: "Weddings", value: projects.filter((p) => p.business === "photography").length, tone: "signal" },
          { label: "Marketing", value: projects.filter((p) => p.business === "marketing").length, tone: "ok" },
          { label: "Overdue tasks", value: s.tasks.filter((t) => projects.some((p) => p.id === t.projectId) && overdue(t)).length, tone: "risk" },
        ]}
        actions={
          <>
            <Segmented label="Layout" value={layout} onChange={setLayout} options={[{ value: "cards", label: "Cards" }, { value: "list", label: "List" }]} />
            <Segmented label="Show" value={show} onChange={setShow} options={[{ value: "open", label: "In progress" }, { value: "all", label: "All" }]} />
          </>
        }
      />
      {!projects.length ? (
        <EmptyState icon={FolderKanban} title="No projects yet" body="When a lead is moved to Confirmed, its project starts here with the standard checklist for that business." />
      ) : layout === "cards" ? (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5 p-0">
          {projects.map((p, i) => <ProjectCard key={p.id} p={p} index={i} />)}
        </ul>
      ) : (
        <ul className="m-0 list-none border-t border-line p-0">
          {projects.map((p) => {
            const tasks = s.tasks.filter((t) => t.projectId === p.id);
            const pr = progress(tasks);
            const late = tasks.filter(overdue).length;
            const client = s.companies.find((c) => c.id === p.companyId);
            const manager = s.members.find((m) => m.id === p.managerId);
            return (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3.5 hover:bg-hover">
                  <span className="flex min-w-0 flex-1 basis-[260px] items-center gap-3">
                    <BusinessIcon business={p.business} />
                    <span className="min-w-0">
                      {/* The client first, in the business colour; then the project and its date. */}
                      <span className={cn("block truncate fs-15 font-medium", BUSINESS_TEXT[p.business])}>{client?.name ?? "No client"}</span>
                      <span className="block truncate fs-12 text-ink-2">
                        {p.name}
                        <span className="text-ink-3">{p.dueDate ? ` · ${p.business === "photography" ? "event" : "due"} ${fmtDate(p.dueDate)}` : ""}</span>
                      </span>
                    </span>
                  </span>
                  {late > 0 && <Pill tone="risk">{late} overdue</Pill>}
                  <span className="flex w-[140px] items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"><span className="block h-full bg-ink" style={{ width: `${pr.pct}%` }} /></span>
                    <span className="font-mono fs-11 text-ink-3">{pr.done}/{pr.total}</span>
                  </span>
                  <Pill tone={STATUS_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Pill>
                  {manager && <Avatar name={manager.name} me={manager.id === ME_ID} size="sm" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** One project: its functions, crew, checklist, deliverables and links. */
export function ProjectRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const s = useCrm();
  // Admins and project managers change the project; others see it and update the tasks given to them.
  const canEdit = useAccess("projects") === "edit";
  const canSeeFinance = useAccess("finance") === "edit";
  const canSeeCommunication = useAccess("sales") !== "none";
  const canSeeSchedule = useAccess("sales") !== "none" && useAccess("finance") !== "none";
  const p = s.projects.find((x) => x.id === id);
  if (!p)
    return (
      <EmptyState
        icon={FolderKanban}
        title="Project not found"
        body={s.businessView !== "all" ? "It may belong to the other business — switch the top bar to Both." : "It may have been removed, or the link is old."}
        action={<Button asChild><Link to="/projects">All projects</Link></Button>}
      />
    );
  const set = (patch: Partial<Project>) => useCrm.getState().updateProject(p.id, patch);
  const client = s.companies.find((c) => c.id === p.companyId);
  const deal = s.deals.find((d) => d.id === p.dealId);
  const tasks = s.tasks.filter((t) => t.projectId === p.id).sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
  const pr = progress(tasks);
  const wedding = p.business === "photography";

  return (
    <>
      <button onClick={() => navigate(-1)} className="t-meta mb-2 inline-flex items-center gap-1 text-ink-3 hover:text-ink-2">
        <ArrowLeft size={13} strokeWidth={1.5} /> Back
      </button>
      <PageHeader
        eyebrow={<span className="inline-flex flex-wrap items-center gap-x-2"><BusinessIcon business={p.business} size="sm" />{BUSINESS_LABEL[p.business]} · {p.name} · {pr.done}/{pr.total} tasks done</span>}
        title={client ? <Link to={`/clients/${client.id}`} className="font-semibold hover:underline">{client.name}</Link> : <span className="font-semibold">{p.name}</span>}
        media={client && <ClientPhoto company={client} size="lg" />}
        actions={
          <>
            <Select aria-label="Project status" disabled={!canEdit} value={p.status} onChange={(e) => set({ status: e.target.value as ProjectStatus })} className="w-[140px]">
              {PROJECT_STATUSES.map((x) => <option key={x} value={x}>{PROJECT_STATUS_LABEL[x]}</option>)}
            </Select>
            {canEdit && <DeleteProject p={p} taskCount={tasks.length} />}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-10">
          <Services p={p} />
          {!wedding && <fieldset disabled={!canEdit} className="contents"><Campaign p={p} set={set} /></fieldset>}
          {wedding && <fieldset disabled={!canEdit} className="contents"><Functions p={p} set={set} tasks={tasks} /></fieldset>}
          <Checklist p={p} tasks={tasks} canEdit={canEdit} />
          <fieldset disabled={!canEdit} className="contents"><Deliverables p={p} set={set} /></fieldset>
          {deal && canSeeSchedule && <DealPayments deal={deal} />}
        </div>
        <fieldset disabled={!canEdit} className="contents">
        <aside className="flex min-w-0 flex-col gap-8">
          <section>
            <h2 className="t-eyebrow m-0 mb-3 text-ink-3">Details</h2>
            <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2.5">
              <span className="t-meta text-ink-3">Manager</span>
              <Select aria-label="Manager" value={p.managerId ?? ""} onChange={(e) => set({ managerId: e.target.value || undefined })}>
                <option value="">Nobody yet</option>
                {s.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
              <span className="t-meta text-ink-3">Started</span>
              <Input type="date" aria-label="Start date" value={p.startDate ?? ""} onChange={(e) => set({ startDate: e.target.value || undefined })} />
              <span className="t-meta text-ink-3">{wedding ? "Wedding date" : "Due"}</span>
              <Input type="date" aria-label="Due date" value={p.dueDate ?? ""} onChange={(e) => moveDate(p, tasks, e.target.value || undefined)} />
              {wedding && (
                <>
                  <span className="t-meta text-ink-3">Guests</span>
                  <Input inputMode="numeric" aria-label="Guest count" key={`g${p.guests ?? ""}`} defaultValue={p.guests ?? ""} placeholder="e.g. 350" onBlur={(e) => { const n = Number(e.target.value.replace(/\D/g, "")) || undefined; if (n !== p.guests) set({ guests: n }); }} />
                  <span className="t-meta text-ink-3">Photos selected</span>
                  <Input type="date" aria-label="Photos selected on" value={p.selectionDate ?? ""} onChange={(e) => set({ selectionDate: e.target.value || undefined })} />
                </>
              )}
              {!wedding && (
                <>
                  <span className="t-meta text-ink-3">Retainer / month</span>
                  <Input
                    inputMode="numeric"
                    aria-label="Monthly retainer in rupees"
                    defaultValue={p.retainerPaise ? p.retainerPaise / 100 : ""}
                    onBlur={(e) => {
                      const r = parseRupees(e.target.value) || undefined; // exact rupees, or "75k"
                      if (r !== p.retainerPaise) set({ retainerPaise: r });
                    }}
                    placeholder="₹"
                  />
                  <span className="t-meta text-ink-3">Content calendar</span>
                  <UrlField value={p.calendarUrl} label="Content calendar link" onSave={(calendarUrl) => set({ calendarUrl })} placeholder="Notion or Sheets link" />
                </>
              )}
            </div>
          </section>
          <Fold id="team" title={`Team · ${p.crew.length}`} summary={p.crew.length ? p.crew.map((c) => `${(s.members.find((m) => m.id === c.memberId) ?? usePeople.getState().freelancers.find((f) => f.id === c.freelancerId))?.name.split(" ")[0] ?? "?"} (${c.role})`).join(", ") : "Nobody added yet"}>
            <Crew p={p} set={set} />
          </Fold>
          {canSeeFinance && <ProjectFinance p={p} />}
          {canSeeCommunication && <ProjectCommunication p={p} />}
          <Fold id="other" title="Other details" summary={[p.notes ? "Notes" : "", p.links.length ? `${p.links.length} ${p.links.length === 1 ? "link" : "links"}` : ""].filter(Boolean).join(" · ") || "Notes and links"}>
            <section>
              <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Notes</h2>
              <Textarea key={p.id} rows={4} defaultValue={p.notes ?? ""} placeholder="Brief, special requests, things to remember…" onBlur={(e) => e.target.value.trim() !== (p.notes ?? "") && set({ notes: e.target.value.trim() || undefined })} />
            </section>
            <Links p={p} set={set} />
          </Fold>
          <ClientPortal p={p} canShare={canEdit} />
          {canEdit && <ClientUpdates p={p} />}
        </aside>
        </fieldset>
      </div>
    </>
  );
}

/** One-project financial truth: confirmed value, invoicing, collections, costs and profit. */
function ProjectFinance({ p }: { p: Project }) {
  const s = useCrm();
  const deal = p.dealId ? s.deals.find((d) => d.id === p.dealId) : undefined;
  const invoices = s.invoices.filter((i) => i.dealId === p.dealId && i.sent && !i.cancelled);
  const expenses = s.expenses.filter((e) => e.projectId === p.id);
  const invoiced = invoices.reduce((sum, invoice) => sum + invoiceTotals(invoice).subtotal - (invoice.credits ?? []).reduce((n, credit) => n + credit.taxablePaise, 0), 0);
  const received = invoices.reduce((sum, invoice) => sum + invoice.payments.reduce((n, payment) => n + payment.amountPaise, 0), 0);
  const outstanding = invoices.reduce((sum, invoice) => sum + invoiceTotals(invoice).due, 0);
  const costs = expenses.reduce((sum, expense) => sum + expense.amountPaise, 0);
  const peopleCosts = expenses.filter((e) => PEOPLE_COST_CATEGORIES.includes(e.category)).reduce((sum, e) => sum + e.amountPaise, 0);
  const confirmed = deal?.valuePaise ?? p.retainerPaise ?? 0;
  // The next stage of the payment schedule not yet paid.
  const nextDue = (deal?.schedule ?? []).filter((m) => stageState(m, s.invoices) !== "paid").sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))[0];
  const actualProfit = invoiced - costs;
  const stat = (label: string, value: number, tone?: string) => (
    <span className="flex flex-col gap-0.5 rounded-card bg-sunken px-3 py-2">
      <span className="t-eyebrow text-ink-3">{label}</span>
      <span className={`font-mono fs-13 tnum ${tone ?? ""}`}>{formatFull(value)}</span>
    </span>
  );
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Finance</h2>
      <div className="grid grid-cols-2 gap-2">
        {stat("Confirmed value", confirmed)}
        {stat("Invoiced before GST", invoiced)}
        {stat("Received incl. GST", received, "text-ok")}
        {stat("Outstanding incl. GST", outstanding, outstanding ? "text-warn" : undefined)}
        {stat("Team & freelancer costs", peopleCosts)}
        {stat("Other costs", costs - peopleCosts)}
        {stat("Actual profit", actualProfit, actualProfit < 0 ? "text-risk" : "text-ok")}
        <span className="col-span-2 flex flex-col gap-0.5 rounded-card bg-sunken px-3 py-2">
          <span className="t-eyebrow text-ink-3">Next payment due</span>
          <span className="t-dense">{nextDue ? `${nextDue.label} · ${formatFull(nextDue.amountPaise)} + GST${nextDue.dueDate ? ` · ${fmtDate(nextDue.dueDate)}` : ""}` : "Nothing scheduled"}</span>
        </span>
        {stat("Estimated profit", confirmed - costs, confirmed - costs < 0 ? "text-risk" : undefined)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 fs-12 text-ink-3">
        <Link to="/invoices" className="hover:text-ink hover:underline">{invoices.length} sent {invoices.length === 1 ? "invoice" : "invoices"}</Link>
        <Link to="/expenses" className="hover:text-ink hover:underline">{expenses.length} project {expenses.length === 1 ? "expense" : "expenses"}</Link>
      </div>
    </section>
  );
}

/** Project communication joins the linked Inbox threads and activity timeline in the operating view. */
function ProjectCommunication({ p }: { p: Project }) {
  const s = useCrm();
  const conversations = s.conversations.filter((conversation) => conversation.dealId === p.dealId);
  const activity = s.activities.filter((item) => item.dealId === p.dealId || item.companyId === p.companyId).slice(0, 8);
  if (!conversations.length && !activity.length) return null;
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Communication</h2>
      {conversations.map((conversation) => (
        <Link key={conversation.id} to={`/inbox/${conversation.id}`} className="mb-2 flex items-start gap-2 rounded-card bg-sunken px-3 py-2 hover:bg-hover">
          <MessageSquare size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1">
            <span className="t-dense block truncate">{conversation.name}</span>
            <span className="block truncate fs-11.5 text-ink-3">{conversation.messages.at(-1)?.body ?? conversation.subject ?? "Open conversation"}</span>
          </span>
        </Link>
      ))}
      {!!activity.length && <Timeline items={activity} />}
    </section>
  );
}

/** A link field that saves on blur, only when it's a real web address. */
function UrlField({ value, label, onSave, placeholder }: { value?: string; label: string; onSave: (v?: string) => void; placeholder?: string }) {
  return (
    <span className="flex items-center gap-1">
      <Input
        aria-label={label}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v === (value ?? "")) return;
          if (v && !/^https?:\/\/\S+$/.test(v)) return toast("Enter a full web address, starting https://");
          onSave(v || undefined);
        }}
      />
      {value && <a href={value} target="_blank" rel="noreferrer" aria-label={`Open ${label}`} className="grid size-8 shrink-0 place-items-center text-ink-3 hover:text-ink"><ExternalLink size={14} strokeWidth={1.5} /></a>}
    </span>
  );
}

/** Photographers or cinematographers on one function: how many, and who (names can come later). */
function CrewSlot({ label, count, names, onChange }: { label: string; count?: number; names?: string[]; onChange: (count: number | undefined, names: string[] | undefined) => void }) {
  const shown = Math.max(count ?? 0, names?.length ?? 0);
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="t-meta w-[9em] shrink-0 text-ink-3">{label}</span>
      <Input
        aria-label={`${label}: how many`}
        inputMode="numeric"
        defaultValue={shown || ""}
        key={`n${shown}`}
        placeholder="0"
        onBlur={(x) => {
          const n = Math.min(20, Math.max(0, Number(x.target.value.replace(/\D/g, "")) || 0));
          if (n !== shown) onChange(n || undefined, names);
        }}
        className="h-8 w-12 text-center font-mono"
      />
      <Input
        aria-label={`${label}: names`}
        defaultValue={names?.join(", ") ?? ""}
        key={`c${names?.join()}`}
        placeholder="Names, e.g. Aniketh, Arun"
        list="crew-names"
        onBlur={(x) => {
          const list = splitNames(x.target.value);
          if (list.join() !== (names ?? []).join()) onChange(Math.max(count ?? 0, list.length) || undefined, list.length ? list : undefined);
        }}
        className="h-8 min-w-0 flex-1"
      />
    </label>
  );
}

/** Adds one of the studio's own function columns; it shows on every project of this business. */
async function addColumn(business: Project["business"], label: string) {
  const templates = useCrm.getState().templates;
  const t = templates[business];
  const draft = { ...templates, [business]: { ...t, columns: [...(t.columns ?? []), { id: newId("col"), label }] } };
  const next = IS_DEMO ? draft : await api<typeof templates>("/project-templates", { method: "PUT", body: draft });
  useCrm.setState({ templates: next });
}

/** "Haldi · 14 Oct · 5 hrs · Fishermanwarf · 2 photo, 1 video" */
const eventLine = (e: ProjectEvent) => {
  const n = (count?: number, names?: string[]) => Math.max(count ?? 0, names?.length ?? 0);
  const team = [n(e.photo, e.photoCrew) && `${n(e.photo, e.photoCrew)} photo`, n(e.video, e.videoCrew) && `${n(e.video, e.videoCrew)} video`].filter(Boolean).join(", ");
  return [e.date ? fmtDate(e.date) : "date to confirm", e.duration, e.venue, team, e.addOns].filter(Boolean).join(" · ");
};

/** The first time a function gets crew names, someone has to book and confirm them. */
function crewTask(p: Project, tasks: Task[], before: ProjectEvent, after: ProjectEvent) {
  const names = [...(after.photoCrew ?? []), ...(after.videoCrew ?? [])];
  if ((before.photoCrew?.length ?? 0) + (before.videoCrew?.length ?? 0) > 0 || !names.length) return;
  const title = `Book & confirm crew · ${after.name}`;
  if (tasks.some((t) => t.title.startsWith(title))) return;
  const today = istDay(new Date());
  const week = after.date ? addDays(after.date, -7) : addDays(today, 2);
  useCrm.getState().addTask({ title: `${title} (${names.join(", ")})`, dueAt: dueOn(week < today ? today : week), assigneeId: p.managerId ?? ME_ID, projectId: p.id, dealId: p.dealId, companyId: p.companyId, business: p.business, status: "todo", priority: "high", approval: "none" });
  toast(`Added a task to book and confirm the ${after.name} crew`);
}

function Functions({ p, set, tasks }: { p: Project; set: (patch: Partial<Project>) => void; tasks: Task[] }) {
  const columns = useCrm((s) => s.templates[p.business].columns) ?? [];
  const canAddColumn = useAccess("projects") === "edit";
  const [column, setColumn] = useState<string>();
  const freelancers = useFreelancers();
  const crewNames = [...new Set([...freelancers.map((f) => f.name), ...useCrm.getState().members.map((m) => m.name.split(" ")[0]!)])];
  const change = (id: string, patch: Partial<ProjectEvent>) => {
    const before = p.events.find((e) => e.id === id);
    set({ events: p.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
    if (before) crewTask(p, tasks, before, { ...before, ...patch });
  };
  const text = (e: ProjectEvent, key: "venue" | "duration" | "addOns") => ({
    defaultValue: e[key] ?? "",
    onBlur: (x: React.FocusEvent<HTMLInputElement>) => x.target.value.trim() !== (e[key] ?? "") && change(e.id, { [key]: x.target.value.trim() || undefined }),
  });
  const summary = p.events.length ? (
    <ul className="m-0 list-none border-t border-line p-0">
      {p.events.map((e) => (
        <li key={e.id} className="flex gap-3 border-b border-line py-2">
          <span className="t-dense w-[110px] shrink-0 truncate font-medium text-ink">{e.name}</span>
          <span className="min-w-0 flex-1 truncate">{eventLine(e)}</span>
        </li>
      ))}
    </ul>
  ) : "No functions yet — open to add haldi, mehendi, sangeet, reception…";
  return (
    <Fold id="events" title={`Functions · ${p.events.length}`} summary={summary}>
    <section>
      <datalist id="crew-names">{crewNames.map((n) => <option key={n} value={n} />)}</datalist>
      <ul className="m-0 list-none border-t border-line p-0">
        {p.events.map((e) => (
          <li key={e.id} className="border-b border-line py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="Function" defaultValue={e.name} onBlur={(x) => x.target.value.trim() && x.target.value.trim() !== e.name && change(e.id, { name: x.target.value.trim() })} className="h-8 w-[160px] font-medium" />
              <Input type="date" aria-label={`${e.name} date`} value={e.date ?? ""} onChange={(x) => change(e.id, { date: x.target.value || undefined })} className="h-8 w-[150px]" />
              <Input aria-label={`${e.name} duration`} placeholder="Duration, e.g. 6 hrs" {...text(e, "duration")} className="h-8 w-[170px]" />
              <Input aria-label={`${e.name} venue`} placeholder="Venue" {...text(e, "venue")} className="h-8 min-w-0 flex-1 basis-[160px]" />
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${e.name}`} onClick={() => set({ events: p.events.filter((x) => x.id !== e.id) })}><Trash2 strokeWidth={1.5} /></Button>
            </div>
            <div className="mt-2 flex flex-col gap-2 pl-1">
              <CrewSlot label="Photographers" count={e.photo} names={e.photoCrew} onChange={(photo, photoCrew) => change(e.id, { photo, photoCrew })} />
              <CrewSlot label="Cinematographers" count={e.video} names={e.videoCrew} onChange={(video, videoCrew) => change(e.id, { video, videoCrew })} />
              <label className="flex min-w-0 items-center gap-2">
                <span className="t-meta w-[9em] shrink-0 text-ink-3">Add-ons</span>
                <Input aria-label={`${e.name} add-ons`} placeholder="Drone, LED wall, same-day edit…" {...text(e, "addOns")} className="h-8 min-w-0 flex-1" />
              </label>
              {columns.map((c) => (
                <label key={c.id} className="flex min-w-0 items-center gap-2">
                  <span className="t-meta w-[9em] shrink-0 truncate text-ink-3" title={c.label}>{c.label}</span>
                  <Input
                    aria-label={`${e.name} ${c.label}`}
                    defaultValue={e.extra?.[c.id] ?? ""}
                    maxLength={200}
                    onBlur={(x) => {
                      const v = x.target.value.trim();
                      if (v === (e.extra?.[c.id] ?? "")) return;
                      const { [c.id]: _, ...rest } = e.extra ?? {};
                      change(e.id, { extra: v ? { ...rest, [c.id]: v } : rest });
                    }}
                    className="h-8 min-w-0 flex-1"
                  />
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => set({ events: [...p.events, { id: newId("e"), name: p.events.length ? "Function" : "Wedding" }] })}>
        <Plus strokeWidth={1.5} /> Add function
      </Button>
      {canAddColumn && column === undefined && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setColumn("")}>
          <Plus strokeWidth={1.5} /> Add column
        </Button>
      )}
      <span className="t-meta ml-2 text-ink-3">Haldi, mehendi, sangeet, reception…</span>
      {column !== undefined && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={async (x) => {
            x.preventDefault();
            const label = column.trim();
            if (!label) return;
            if (columns.some((c) => c.label.toLowerCase() === label.toLowerCase())) return toast(`There's already a ${label} column`);
            try {
              await addColumn(p.business, label);
              setColumn(undefined);
              toast(`${label} added to every ${BUSINESS_LABEL[p.business]} project`);
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        >
          <Input autoFocus aria-label="New column name" value={column} maxLength={40} placeholder="Column name, e.g. Makeup artist" onChange={(x) => setColumn(x.target.value)} className="h-8 w-[240px]" />
          <Button size="sm" variant="ink" type="submit" disabled={!column.trim()}>Add</Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setColumn(undefined)}>Cancel</Button>
          <span className="t-meta text-ink-3">Shows on every project; rename or remove in Settings → Project templates.</span>
        </form>
      )}
    </section>
    </Fold>
  );
}

function Checklist({ p, tasks, canEdit }: { p: Project; tasks: Task[]; canEdit: boolean }) {
  const s = useCrm();
  const [open, setOpen] = useState<string>();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(() => p.dueDate ?? istDay(new Date()));
  const crewIds = new Set([p.managerId, ...p.crew.map((c) => c.memberId)]);
  const people = [...s.members].sort((a, b) => Number(crewIds.has(b.id)) - Number(crewIds.has(a.id)));
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Checklist · {tasks.length}</h2>
      <ul className="m-0 list-none border-t border-line p-0">
        {tasks.map((t) => {
          const upd = (patch: Partial<Task>) => useCrm.getState().updateTask(t.id, patch);
          const expanded = open === t.id;
          const mine = canEdit || t.assigneeId === ME_ID;
          return (
            <li key={t.id} className="border-b border-line">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                <fieldset disabled={!mine} className="contents"><Checkbox checked={t.done} label={t.title} onCheckedChange={() => useCrm.getState().toggleTask(t.id)} /></fieldset>
                <button onClick={() => setOpen(expanded ? undefined : t.id)} className="flex min-w-0 flex-1 basis-[200px] items-center gap-1.5 text-left" aria-expanded={expanded}>
                  <StrikeText done={t.done} className="t-dense truncate">{t.title}</StrikeText>
                  {!!t.comments?.length && <span className="flex items-center gap-0.5 font-mono fs-11 text-ink-3"><MessageSquare size={11} strokeWidth={1.5} />{t.comments.length}</span>}
                  <ChevronDown size={13} strokeWidth={1.5} className={cn("shrink-0 text-ink-3 transition-transform", expanded && "rotate-180")} />
                </button>
                {t.priority && t.priority !== "normal" && t.priority !== "low" && <Pill tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Pill>}
                {t.approval && t.approval !== "none" && <Pill tone={t.approval === "approved" ? "ok" : t.approval === "changes" ? "risk" : "warn"}>{APPROVAL_LABEL[t.approval]}</Pill>}
                {t.done ? (
                  <DoneBy t={t} short />
                ) : (
                  <Input type="date" aria-label={`${t.title} due`} disabled={!mine} value={istDay(t.dueAt)} onChange={(e) => e.target.value && upd({ dueAt: dueOn(e.target.value) })} className={cn("h-8 w-[140px] font-mono fs-11.5", overdue(t) ? "text-risk" : "text-ink-2")} />
                )}
                <Select aria-label={`Who does ${t.title}`} disabled={!canEdit} value={t.assigneeId} onChange={(e) => upd({ assigneeId: e.target.value })} className="w-[130px]">
                  {people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </div>
              {expanded && (
                <div className="mb-3 ml-7 flex flex-col gap-3 rounded-card bg-sunken p-3">
                  <fieldset disabled={!mine} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <label className="flex flex-col gap-1"><span className="t-meta text-ink-3">Status</span>
                      <Select value={statusOf(t)} onChange={(e) => upd({ status: e.target.value as TaskStatus, done: e.target.value === "done" })}>
                        {TASK_STATUSES.map((x) => <option key={x} value={x}>{TASK_STATUS_LABEL[x]}</option>)}
                      </Select>
                    </label>
                    <label className="flex flex-col gap-1"><span className="t-meta text-ink-3">Priority</span>
                      <Select value={t.priority ?? "normal"} onChange={(e) => upd({ priority: e.target.value as Priority })}>
                        {PRIORITIES.map((x) => <option key={x} value={x}>{PRIORITY_LABEL[x]}</option>)}
                      </Select>
                    </label>
                    <label className="flex flex-col gap-1"><span className="t-meta text-ink-3">Client approval</span>
                      <Select value={t.approval ?? "none"} onChange={(e) => upd({ approval: e.target.value as Approval })}>
                        {APPROVALS.map((x) => <option key={x} value={x}>{APPROVAL_LABEL[x]}</option>)}
                      </Select>
                    </label>
                    <label className="flex flex-col gap-1"><span className="t-meta text-ink-3">Start</span>
                      <Input type="date" value={t.startAt ? istDay(t.startAt) : ""} onChange={(e) => upd({ startAt: e.target.value ? `${e.target.value}T09:00:00+05:30` : undefined })} />
                    </label>
                    <label className="flex flex-col gap-1"><span className="t-meta text-ink-3">Due</span>
                      <Input type="date" value={istDay(t.dueAt)} onChange={(e) => e.target.value && upd({ dueAt: dueOn(e.target.value) })} />
                    </label>
                  </fieldset>
                  <TaskAttachments t={t} canEdit={mine} />
                  <Comments t={t} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && <form
        className="mt-2 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          useCrm.getState().addTask({ title: title.trim(), dueAt: dueOn(due), assigneeId: p.managerId ?? ME_ID, projectId: p.id, dealId: p.dealId, companyId: p.companyId, business: p.business, status: "todo", priority: "normal", approval: "none" });
          setTitle("");
        }}
      >
        <Input aria-label="New task" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task to this project…" className="h-8 min-w-0 flex-1 basis-[200px]" />
        <Input type="date" aria-label="Due" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 w-[150px]" />
        <Button type="submit" size="sm" variant="ink" disabled={!title.trim()}><Plus strokeWidth={1.5} /> Add</Button>
      </form>}
    </section>
  );
}

function Comments({ t }: { t: Task }) {
  const members = useCrm((s) => s.members);
  const [body, setBody] = useState("");
  return (
    <div className="flex flex-col gap-2">
      {(t.comments ?? []).map((c) => (
        <div key={c.id} className="flex gap-2">
          <Avatar name={(c.authorId === "client" ? `${c.authorName ?? "Client"} (client)` : (members.find((m) => m.id === c.authorId)?.name ?? "Support"))} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="fs-11.5 text-ink-3">{(c.authorId === "client" ? `${c.authorName ?? "Client"} (client)` : (members.find((m) => m.id === c.authorId)?.name ?? "Support"))} · {fmtAgo(c.at)}</div>
            <p className="t-dense m-0 whitespace-pre-wrap">{c.body}</p>
          </div>
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          useCrm.getState().commentOnTask(t.id, body.trim());
          setBody("");
        }}
      >
        <Input aria-label="Comment" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Comment or update…" className="h-8 flex-1" />
        <Button type="submit" size="sm" disabled={!body.trim()}>Post</Button>
      </form>
    </div>
  );
}

function Deliverables({ p, set }: { p: Project; set: (patch: Partial<Project>) => void }) {
  const window_ = deliveryWindow(p.selectionDate);
  const change = (id: string, patch: Partial<Project["deliverables"][number]>) => set({ deliverables: p.deliverables.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Deliverables · {p.deliverables.filter((d) => d.status === "delivered").length}/{p.deliverables.length} delivered</h2>
      {window_ && (
        <p className="t-dense m-0 mb-2 rounded-card bg-ok-wash px-3 py-2 text-ink">
          Photos selected {fmtDate(p.selectionDate!)} · delivery in 3–5 weeks: <b>{fmtDate(window_.from)}</b> to <b>{fmtDate(window_.to)}</b>. The client sees this in their portal.
        </p>
      )}
      <ul className="m-0 list-none border-t border-line p-0">
        {p.deliverables.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 border-b border-line py-2">
            <Input aria-label="Deliverable" defaultValue={d.name} onBlur={(x) => x.target.value.trim() && x.target.value.trim() !== d.name && change(d.id, { name: x.target.value.trim() })} className="h-8 min-w-0 flex-1 basis-[160px]" />
            <Input type="date" aria-label={`${d.name} due`} value={d.dueDate ?? ""} onChange={(x) => change(d.id, { dueDate: x.target.value || undefined })} className="h-8 w-[150px]" />
            <Select aria-label={`${d.name} status`} value={d.status} onChange={(x) => change(d.id, { status: x.target.value as DeliverableStatus })} className="w-[130px]">
              {DELIVERABLE_STATUSES.map((x) => <option key={x} value={x}>{DELIVERABLE_LABEL[x]}</option>)}
            </Select>
            <span className="w-full sm:w-[220px]"><UrlField value={d.url} label={`${d.name} link`} placeholder="Drive / gallery link" onSave={(url) => change(d.id, { url })} /></span>
            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${d.name}`} onClick={() => set({ deliverables: p.deliverables.filter((x) => x.id !== d.id) })}><Trash2 strokeWidth={1.5} /></Button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => set({ deliverables: [...p.deliverables, { id: newId("d"), name: "New deliverable", status: "pending" }] })}>
        <Plus strokeWidth={1.5} /> Add deliverable
      </Button>
    </section>
  );
}

function Crew({ p, set }: { p: Project; set: (patch: Partial<Project>) => void }) {
  const members = useCrm((s) => s.members);
  const freelancers = useFreelancers();
  // "m:<id>" a team member, "f:<id>" a freelancer.
  const [who, setWho] = useState("");
  const [role, setRole] = useState("");
  const [fee, setFee] = useState("");
  const roles = CREW_ROLES[p.business];
  const isFreelancer = who.startsWith("f:");
  return (
    <section>
      <ul className="m-0 list-none p-0">
        {p.crew.map((c, i) => {
          const m = c.memberId ? members.find((x) => x.id === c.memberId) : undefined;
          const f = c.freelancerId ? freelancers.find((x) => x.id === c.freelancerId) : undefined;
          const name = m?.name ?? f?.name ?? (c.freelancerId ? "Freelancer" : "Former teammate");
          return (
            <li key={`${c.memberId ?? c.freelancerId}-${i}`} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
              <Avatar name={name} me={c.memberId === ME_ID} size="sm" />
              <span className="t-dense min-w-0 flex-1 truncate">
                {name} <span className="fs-11.5 text-ink-3">· {c.role}{c.freelancerId ? " · freelancer" : ""}</span>
              </span>
              {c.freelancerId && (
                <Input
                  aria-label={`${name}'s fee for this project`}
                  inputMode="decimal"
                  key={`fee${c.feePaise ?? ""}`}
                  defaultValue={c.feePaise ? String(c.feePaise / 100) : ""}
                  placeholder="Fee ₹"
                  onBlur={(e) => {
                    const v = e.target.value.trim() ? parseRupees(e.target.value) : undefined;
                    if (v !== c.feePaise) set({ crew: p.crew.map((x, k) => (k === i ? { ...x, feePaise: v } : x)) });
                  }}
                  className="h-8 w-[110px] font-mono"
                />
              )}
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${name}`} onClick={() => set({ crew: p.crew.filter((_, k) => k !== i) })}><Trash2 strokeWidth={1.5} /></Button>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-2 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!who || !role.trim()) return toast("Pick a person and their role");
          const [kind, id] = who.split(":") as ["m" | "f", string];
          const feePaise = kind === "f" && fee.trim() ? parseRupees(fee) : undefined;
          set({ crew: [...p.crew, kind === "m" ? { memberId: id, role: role.trim() } : { freelancerId: id, role: role.trim(), ...(feePaise && { feePaise }) }] });
          setWho("");
          setRole("");
          setFee("");
        }}
      >
        <Select aria-label="Person" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Add someone…</option>
          <optgroup label="Team">{members.map((m) => <option key={m.id} value={`m:${m.id}`}>{m.name}</option>)}</optgroup>
          {!!freelancers.length && <optgroup label="Freelancers">{freelancers.map((f) => <option key={f.id} value={`f:${f.id}`}>{f.name}{f.skill ? ` · ${f.skill}` : ""}</option>)}</optgroup>}
        </Select>
        {who && (
          <span className="flex flex-wrap gap-2">
            <Input aria-label="Role" list={`roles-${p.business}`} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className="min-w-0 flex-1" />
            <datalist id={`roles-${p.business}`}>{roles.map((r) => <option key={r} value={r} />)}</datalist>
            {isFreelancer && <Input aria-label="Fee for this project" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Fee ₹" className="w-[110px] font-mono" />}
            <Button type="submit" size="sm" variant="ink">Add</Button>
          </span>
        )}
        <Link to="/team" className="t-meta text-ink-3 hover:text-ink">New freelancer? Add them under Team &amp; freelancers.</Link>
      </form>
    </section>
  );
}

function Links({ p, set }: { p: Project; set: (patch: Partial<Project>) => void }) {
  const [draft, setDraft] = useState({ label: "", url: "" });
  const [driveBusy, setDriveBusy] = useState(false);
  const drive = p.links.find((l) => l.label === "Google Drive folder");
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Files & links</h2>
      {!drive && (
        <div className="mb-3 rounded-card bg-sunken p-3">
          <p className="t-meta m-0 mb-2 text-ink-2">Create one project folder in the connected Google account. The CRM can manage only folders it creates.</p>
          {p.driveFolderError && <p className="t-meta m-0 mb-2 text-warn">{p.driveFolderError}</p>}
          <Button
            size="sm"
            variant="outline"
            disabled={driveBusy}
            onClick={async () => {
              setDriveBusy(true);
              try {
                const saved = await api<Project>(`/projects/${p.id}/drive-folder`, { method: "POST" });
                useCrm.setState((s) => ({ projects: s.projects.map((x) => (x.id === saved.id ? saved : x)) }));
                toast("Google Drive folder created");
              } catch (e) {
                toast(`Couldn't create Drive folder — ${(e as Error).message}`);
              } finally {
                setDriveBusy(false);
              }
            }}
          >
            <FolderPlus strokeWidth={1.5} /> {driveBusy ? "Creating…" : p.driveFolderError ? "Retry Drive folder" : "Create Drive folder"}
          </Button>
        </div>
      )}
      <ul className="m-0 list-none p-0">
        {p.links.map((l, i) => (
          <li key={i} className="flex items-center gap-2 border-b border-line py-2 last:border-0">
            <a href={l.url} target="_blank" rel="noreferrer" className="t-dense min-w-0 flex-1 truncate hover:underline">{l.label}</a>
            <label className="flex items-center gap-1 fs-11.5 text-ink-3" title="Show this link in the client's portal">
              <input type="checkbox" checked={!!l.client} onChange={(e) => set({ links: p.links.map((x, k) => (k === i ? { ...x, client: e.target.checked || undefined } : x)) })} className="size-3.5 accent-[var(--ink)]" />
              Client sees
            </label>
            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${l.label}`} onClick={() => set({ links: p.links.filter((_, k) => k !== i) })}><Trash2 strokeWidth={1.5} /></Button>
          </li>
        ))}
        {!p.links.length && <li className="t-dense text-ink-3">Drive folders, shot lists, briefs, galleries…</li>}
      </ul>
      <form
        className="mt-2 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.label.trim() || !/^https?:\/\/\S+$/.test(draft.url.trim())) return toast("Name the link and give a full web address, starting https://");
          set({ links: [...p.links, { label: draft.label.trim(), url: draft.url.trim() }] });
          setDraft({ label: "", url: "" });
        }}
      >
        <Input aria-label="Link name" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Name, e.g. Raw photos folder" />
        <span className="flex gap-2">
          <Input aria-label="Link address" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://" className="flex-1" />
          <Button type="submit" size="sm">Add</Button>
        </span>
      </form>
    </section>
  );
}

/** The client page's list of their projects. */
export function ProjectList({ projects }: { projects: Project[] }) {
  const tasks = useCrm((s) => s.tasks);
  if (!projects.length) return <p className="t-dense m-0 text-ink-3">No projects yet — one starts when a lead is confirmed.</p>;
  return (
    <ul className="m-0 list-none border-t border-line p-0">
      {projects.map((p) => {
        const pr = progress(tasks.filter((t) => t.projectId === p.id));
        return (
          <li key={p.id}>
            <Link to={`/projects/${p.id}`} className="flex items-center gap-3 border-b border-line py-2.5 hover:bg-hover">
              <span className="t-dense min-w-0 flex-1 truncate font-medium">{p.name}</span>
              {p.dueDate && <span className="font-mono fs-11 text-ink-3">{fmtDate(p.dueDate)}</span>}
              <span className="font-mono fs-11 text-ink-3">{pr.done}/{pr.total}</span>
              <Pill tone={STATUS_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Pill>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The client's private link to this project: progress, approvals, deliverables and payments — no account needed. */
function ClientPortal({ p, canShare }: { p: Project; canShare: boolean }) {
  const s = useCrm();
  const [link, setLink] = useState<{ url?: string; lastViewedAt?: string; loaded: boolean }>({ loaded: IS_DEMO });
  const [busy, setBusy] = useState(false);
  const deal = s.deals.find((d) => d.id === p.dealId);
  const contact = s.contacts.find((c) => c.id === deal?.contactId) ?? s.contacts.find((c) => c.companyId === p.companyId && c.phone);
  const site = window.location.origin;
  useEffect(() => {
    if (IS_DEMO) return;
    api<{ token?: string; lastViewedAt?: string }>(`/projects/${p.id}/portal`).then(
      (r) => setLink({ url: r.token ? `${site}/portal/${r.token}` : undefined, lastViewedAt: r.lastViewedAt, loaded: true }),
      () => setLink({ loaded: true }),
    );
  }, [p.id, site]);
  const make = async (reset = false) => {
    setBusy(true);
    try {
      if (IS_DEMO) setLink({ url: `${site}/portal/demo`, loaded: true });
      else {
        const r = await api<{ url: string; lastViewedAt?: string }>(`/projects/${p.id}/portal`, { method: "POST", body: { origin: site, reset } });
        setLink({ url: r.url, lastViewedAt: r.lastViewedAt, loaded: true });
      }
      toast(reset ? "New link made — the old one no longer works" : "Client link ready");
    } catch (e) {
      toast(`Couldn't make the link — ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const off = async () => {
    setBusy(true);
    try {
      if (!IS_DEMO) await api(`/projects/${p.id}/portal`, { method: "DELETE" });
      setLink({ loaded: true });
      toast("Client link turned off");
    } catch (e) {
      toast(`Couldn't turn it off — ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  if (!link.loaded) return null;
  const message = link.url && `Hello${contact ? ` ${contact.name.split(" ")[0]}` : ""}! Here's your private page for ${p.name} — see progress, approve items and check payments any time: ${link.url}`;
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Client portal</h2>
      {link.url ? (
        <div className="flex flex-col gap-2">
          <span className="flex gap-2">
            <Input readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Client link" className="h-8 flex-1 font-mono fs-11" />
            <Button size="sm" onClick={() => void navigator.clipboard.writeText(link.url!).then(() => toast("Copied"))}>Copy</Button>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {contact?.phone && (
              <Button size="sm" variant="ghost" asChild>
                <a href={`https://wa.me/${contact.phone.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(message!)}`} target="_blank" rel="noreferrer"><MessageSquare strokeWidth={1.5} /> Send on WhatsApp</a>
              </Button>
            )}
            <Button size="sm" variant="ghost" asChild><a href={link.url} target="_blank" rel="noreferrer"><ExternalLink strokeWidth={1.5} /> Preview</a></Button>
          </span>
          <p className="t-meta m-0 text-ink-3">{link.lastViewedAt ? `Client last opened it ${fmtAgo(link.lastViewedAt)}.` : "Not opened yet."} Anyone with the link can see this project's progress, approvals, deliverables and payments — never internal notes, crew, costs or staff comments.</p>
          {canShare && (
            <span className="flex gap-3">
              <button className="t-meta text-ink-3 hover:text-ink" disabled={busy} onClick={() => void make(true)}>Replace link</button>
              <button className="t-meta text-risk hover:underline" disabled={busy} onClick={() => void off()}>Turn off</button>
            </span>
          )}
        </div>
      ) : canShare ? (
        <>
          <p className="t-meta m-0 mb-2 text-ink-3">A private page for the client: progress, items to approve, deliverables and payments. No account needed.</p>
          <Button size="sm" disabled={busy} onClick={() => void make()}>Create client link</Button>
        </>
      ) : (
        <p className="t-meta m-0 text-ink-3">No client link yet. An admin or project manager can create one.</p>
      )}
    </section>
  );
}

/** What was booked: the deal's service and the accepted quotation's items. */
function Services({ p }: { p: Project }) {
  const s = useCrm();
  const deal = s.deals.find((d) => d.id === p.dealId);
  const accepted = s.quotes.filter((q) => q.dealId === p.dealId && q.status === "accepted");
  const lines = accepted.flatMap((q) => q.lines);
  if (!deal && !lines.length) return null;
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Services booked</h2>
      {lines.length ? (
        <ul className="m-0 list-none border-t border-line p-0">
          {lines.map((l, i) => (
            <li key={i} className="flex items-center gap-3 border-b border-line py-2">
              <span className="t-dense min-w-0 flex-1">{l.desc}{l.qty !== 1 && <span className="text-ink-3"> × {l.qty}</span>}</span>
              <span className="font-mono fs-12 text-ink-2">{formatFull(Math.round(l.qty * l.ratePaise))}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-dense m-0">{deal?.service || deal?.title}{deal?.requirements && <span className="block fs-12 text-ink-3">{deal.requirements}</span>}</p>
      )}
      {accepted.map((q) => <Link key={q.id} to={`/quotes/${q.id}/agreement`} className="t-meta mt-1 mr-3 inline-block text-ink-3 hover:text-ink hover:underline">Agreement {q.number}{q.signature ? ` · signed by ${q.signature.name}` : ""}</Link>)}
    </section>
  );
}

/** Marketing: the campaign brief and the retainer's monthly cycle (each month's checklist and deliverables). */
function Campaign({ p, set }: { p: Project; set: (patch: Partial<Project>) => void }) {
  const [busy, setBusy] = useState(false);
  const cycles = p.cycles ?? [];
  const monthLabel = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Campaign</h2>
      <Textarea key={p.id} rows={3} defaultValue={p.campaign ?? ""} placeholder="Objectives, platforms, monthly ad budget, key dates…" onBlur={(e) => e.target.value.trim() !== (p.campaign ?? "") && set({ campaign: e.target.value.trim() || undefined })} />
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-card bg-sunken p-3">
        <span className="t-meta min-w-0 flex-1 text-ink-2">{cycles.length ? `Months started: ${cycles.map(monthLabel).join(", ")}.` : "Start each retainer month to get its checklist and deliverables."} The marketing template (Settings → Project templates) is used, dated from the month's 1st.</span>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            if (IS_DEMO) return void toast("Sign in to start a month");
            setBusy(true);
            try {
              const r = await api<{ project: Project; month: string; tasksCreated: number }>(`/projects/${p.id}/next-month`, { method: "POST", body: {} });
              const tasks = await api<Task[]>(`/tasks?projectId=${p.id}`);
              useCrm.setState((st) => ({ projects: st.projects.map((x) => (x.id === p.id ? r.project : x)), tasks: [...tasks, ...st.tasks.filter((t) => t.projectId !== p.id)] }));
              toast(`${monthLabel(r.month)} started · ${r.tasksCreated} tasks`);
            } catch (e) {
              toast(`Couldn't start the month — ${(e as Error).message}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Starting…" : "Start next month"}
        </Button>
      </div>
    </section>
  );
}

/** Short updates for the client, shown in their portal newest first. */
function ClientUpdates({ p }: { p: Project }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Updates for the client</h2>
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          setBusy(true);
          try {
            const saved = IS_DEMO ? { ...p, clientUpdates: [{ id: String(Date.now()), body: body.trim(), at: new Date().toISOString(), by: "You" }, ...(p.clientUpdates ?? [])] } : await api<Project>(`/projects/${p.id}/updates`, { method: "POST", body: { body: body.trim() } });
            useCrm.setState((st) => ({ projects: st.projects.map((x) => (x.id === p.id ? saved : x)) }));
            setBody("");
            toast("Shared in the client's portal");
          } catch (err) {
            toast(`Couldn't share it — ${(err as Error).message}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. Your edited photos are ready — the gallery link is in your portal." />
        {body.trim() && <Button type="submit" size="sm" variant="ink" disabled={busy} className="self-end">Share with client</Button>}
      </form>
      <ul className="m-0 mt-2 list-none p-0">
        {(p.clientUpdates ?? []).slice(0, 5).map((u) => (
          <li key={u.id} className="border-b border-line py-2 last:border-0">
            <p className="t-dense m-0 whitespace-pre-wrap">{u.body}</p>
            <span className="font-mono fs-11 text-ink-3">{u.by} · {fmtAgo(u.at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Attachments on a task: links to files kept in Drive or elsewhere (raw folders, edits, reference images). */
function TaskAttachments({ t, canEdit }: { t: Task; canEdit: boolean }) {
  const [draft, setDraft] = useState({ label: "", url: "" });
  const links = t.links ?? [];
  const save = (next: { label: string; url: string }[]) => useCrm.getState().updateTask(t.id, { links: next });
  return (
    <div className="flex flex-col gap-1.5">
      <span className="t-meta text-ink-3">Attachments</span>
      {links.map((l, i) => (
        <span key={i} className="flex items-center gap-2">
          <a href={l.url} target="_blank" rel="noreferrer" className="t-dense min-w-0 flex-1 truncate hover:underline"><ExternalLink size={12} strokeWidth={1.5} className="mr-1 inline text-ink-3" />{l.label}</a>
          {canEdit && <Button size="icon-sm" variant="ghost" aria-label={`Remove ${l.label}`} onClick={() => save(links.filter((_, k) => k !== i))}><Trash2 strokeWidth={1.5} /></Button>}
        </span>
      ))}
      {canEdit && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.label.trim() || !/^https?:\/\/\S+$/.test(draft.url.trim())) return toast("Name the file and paste a full link, starting https://");
            save([...links, { label: draft.label.trim(), url: draft.url.trim() }]);
            setDraft({ label: "", url: "" });
          }}
        >
          <Input aria-label="Attachment name" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Name, e.g. Selects v2" className="h-8 w-[160px]" />
          <Input aria-label="Attachment link" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="Drive or file link" className="h-8 min-w-0 flex-1 basis-[160px]" />
          <Button type="submit" size="sm">Attach</Button>
        </form>
      )}
    </div>
  );
}
