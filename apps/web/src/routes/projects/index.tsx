import {
  APPROVAL_LABEL,
  APPROVALS,
  BUSINESS_LABEL,
  BUSINESS_SHORT,
  CREW_ROLES,
  DELIVERABLE_STATUSES,
  fmtAgo,
  fmtDate,
  fmtDay,
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
import { ArrowLeft, ChevronDown, ExternalLink, FolderKanban, MessageSquare, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/page-header";
import { ME_ID } from "../../data/seed";
import { useAccess, useCrm } from "../../data/store";
import type { Project, Task } from "../../data/types";
import { usePref } from "../../lib/hooks";

const DELIVERABLE_LABEL: Record<DeliverableStatus, string> = { pending: "Pending", in_progress: "In progress", delivered: "Delivered" };
const PRIORITY_TONE: Record<Priority, "mute" | "warn" | "risk"> = { low: "mute", normal: "mute", high: "warn", urgent: "risk" };
const STATUS_TONE: Record<ProjectStatus, "mute" | "ok" | "warn"> = { planning: "mute", active: "warn", delivered: "ok", closed: "mute" };
const statusOf = (t: Task): TaskStatus => t.status ?? (t.done ? "done" : "todo");
const dueOn = (day: string) => `${day}T18:00:00+05:30`;
const overdue = (t: Task) => !t.done && +new Date(t.dueAt) < Date.now();
const newId = (p: string) => `${p}${Date.now().toString(36)}`;

function progress(tasks: Task[]) {
  const done = tasks.filter((t) => t.done).length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

/** All projects, started automatically when a lead is confirmed. */
export function ProjectsRoute() {
  const s = useCrm();
  const [show, setShow] = usePref<"open" | "all">("projects.show", "open");
  const projects = s.projects
    .filter((p) => show === "all" || p.status === "planning" || p.status === "active")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  return (
    <>
      <PageHeader
        eyebrow={`${s.projects.filter((p) => p.status === "active").length} active`}
        title="Projects"
        actions={<Segmented label="Show" value={show} onChange={setShow} options={[{ value: "open", label: "In progress" }, { value: "all", label: "All" }]} />}
      />
      {!projects.length ? (
        <EmptyState icon={FolderKanban} title="No projects yet" body="When a lead is moved to Confirmed, its project starts here with the standard checklist for that business." />
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
                <Link to={`/projects/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3 hover:bg-hover">
                  <span className="min-w-0 flex-1 basis-[220px]">
                    <span className="t-dense block truncate font-medium">{p.name}</span>
                    <span className="text-[11.5px] text-ink-3">{client?.name ?? "—"} · {BUSINESS_SHORT[p.business]}{p.dueDate ? ` · ${p.business === "photography" ? "event" : "due"} ${fmtDate(p.dueDate)}` : ""}</span>
                  </span>
                  {late > 0 && <Pill tone="risk">{late} overdue</Pill>}
                  <span className="flex w-[140px] items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"><span className="block h-full bg-ink" style={{ width: `${pr.pct}%` }} /></span>
                    <span className="font-mono text-[11px] text-ink-3">{pr.done}/{pr.total}</span>
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
  const tasks = s.tasks.filter((t) => t.projectId === p.id).sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
  const pr = progress(tasks);
  const wedding = p.business === "photography";

  return (
    <>
      <button onClick={() => navigate(-1)} className="t-meta mb-2 inline-flex items-center gap-1 text-ink-3 hover:text-ink-2">
        <ArrowLeft size={13} strokeWidth={1.5} /> Back
      </button>
      <PageHeader
        eyebrow={<>{BUSINESS_LABEL[p.business]} · {client ? <Link to={`/clients/${client.id}`} className="hover:underline">{client.name}</Link> : "—"} · {pr.done}/{pr.total} tasks done</>}
        title={p.name}
        actions={
          <Select aria-label="Project status" disabled={!canEdit} value={p.status} onChange={(e) => set({ status: e.target.value as ProjectStatus })} className="w-[140px]">
            {PROJECT_STATUSES.map((x) => <option key={x} value={x}>{PROJECT_STATUS_LABEL[x]}</option>)}
          </Select>
        }
      />

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-10">
          {wedding && <fieldset disabled={!canEdit} className="contents"><Functions p={p} set={set} /></fieldset>}
          <Checklist p={p} tasks={tasks} canEdit={canEdit} />
          <fieldset disabled={!canEdit} className="contents"><Deliverables p={p} set={set} /></fieldset>
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
              <Input type="date" aria-label="Due date" value={p.dueDate ?? ""} onChange={(e) => set({ dueDate: e.target.value || undefined })} />
              {!wedding && (
                <>
                  <span className="t-meta text-ink-3">Retainer / month</span>
                  <Input
                    inputMode="numeric"
                    aria-label="Monthly retainer in rupees"
                    defaultValue={p.retainerPaise ? p.retainerPaise / 100 : ""}
                    onBlur={(e) => {
                      const r = Number(e.target.value.replace(/[^\d.]/g, ""));
                      if ((r ? Math.round(r * 100) : undefined) !== p.retainerPaise) set({ retainerPaise: r ? Math.round(r * 100) : undefined });
                    }}
                    placeholder="₹"
                  />
                  <span className="t-meta text-ink-3">Content calendar</span>
                  <UrlField value={p.calendarUrl} label="Content calendar link" onSave={(calendarUrl) => set({ calendarUrl })} placeholder="Notion or Sheets link" />
                </>
              )}
            </div>
          </section>
          <Crew p={p} set={set} />
          <section>
            <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Notes</h2>
            <Textarea key={p.id} rows={4} defaultValue={p.notes ?? ""} placeholder="Brief, special requests, things to remember…" onBlur={(e) => e.target.value.trim() !== (p.notes ?? "") && set({ notes: e.target.value.trim() || undefined })} />
          </section>
          <Links p={p} set={set} />
        </aside>
        </fieldset>
      </div>
    </>
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

function Functions({ p, set }: { p: Project; set: (patch: Partial<Project>) => void }) {
  const change = (id: string, patch: Partial<Project["events"][number]>) => set({ events: p.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Functions · {p.events.length}</h2>
      <ul className="m-0 list-none border-t border-line p-0">
        {p.events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-2 border-b border-line py-2">
            <Input aria-label="Function" defaultValue={e.name} onBlur={(x) => x.target.value.trim() && x.target.value.trim() !== e.name && change(e.id, { name: x.target.value.trim() })} className="h-8 w-[160px]" />
            <Input type="date" aria-label={`${e.name} date`} value={e.date ?? ""} onChange={(x) => change(e.id, { date: x.target.value || undefined })} className="h-8 w-[150px]" />
            <Input aria-label={`${e.name} venue`} defaultValue={e.venue ?? ""} placeholder="Venue" onBlur={(x) => x.target.value.trim() !== (e.venue ?? "") && change(e.id, { venue: x.target.value.trim() || undefined })} className="h-8 min-w-0 flex-1 basis-[160px]" />
            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${e.name}`} onClick={() => set({ events: p.events.filter((x) => x.id !== e.id) })}><Trash2 strokeWidth={1.5} /></Button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => set({ events: [...p.events, { id: newId("e"), name: p.events.length ? "Function" : "Wedding" }] })}>
        <Plus strokeWidth={1.5} /> Add function
      </Button>
      <span className="t-meta ml-2 text-ink-3">Haldi, mehendi, sangeet, reception…</span>
    </section>
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
                  {!!t.comments?.length && <span className="flex items-center gap-0.5 font-mono text-[11px] text-ink-3"><MessageSquare size={11} strokeWidth={1.5} />{t.comments.length}</span>}
                  <ChevronDown size={13} strokeWidth={1.5} className={cn("shrink-0 text-ink-3 transition-transform", expanded && "rotate-180")} />
                </button>
                {t.priority && t.priority !== "normal" && t.priority !== "low" && <Pill tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Pill>}
                {t.approval && t.approval !== "none" && <Pill tone={t.approval === "approved" ? "ok" : t.approval === "changes" ? "risk" : "warn"}>{APPROVAL_LABEL[t.approval]}</Pill>}
                <span className={cn("w-[56px] text-right font-mono text-[11.5px]", overdue(t) ? "text-risk" : "text-ink-2")}>{fmtDay(t.dueAt)}</span>
                <Select aria-label={`Who does ${t.title}`} disabled={!canEdit} value={t.assigneeId} onChange={(e) => upd({ assigneeId: e.target.value })} className="w-[130px]">
                  {people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </div>
              {expanded && (
                <div className="mb-3 ml-7 flex flex-col gap-3 rounded-card bg-sunken p-3">
                  <fieldset disabled={!mine} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                    <label className="flex flex-col gap-1"><span className="t-meta text-ink-3">Due</span>
                      <Input type="date" value={istDay(t.dueAt)} onChange={(e) => e.target.value && upd({ dueAt: dueOn(e.target.value) })} />
                    </label>
                  </fieldset>
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
          <Avatar name={members.find((m) => m.id === c.authorId)?.name ?? "Support"} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] text-ink-3">{members.find((m) => m.id === c.authorId)?.name ?? "Support"} · {fmtAgo(c.at)}</div>
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
  const change = (id: string, patch: Partial<Project["deliverables"][number]>) => set({ deliverables: p.deliverables.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Deliverables · {p.deliverables.filter((d) => d.status === "delivered").length}/{p.deliverables.length} delivered</h2>
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
  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState("");
  const roles = CREW_ROLES[p.business];
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Crew · {p.crew.length}</h2>
      <ul className="m-0 list-none p-0">
        {p.crew.map((c, i) => {
          const m = members.find((x) => x.id === c.memberId);
          return (
            <li key={`${c.memberId}-${i}`} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
              <Avatar name={m?.name ?? "?"} me={c.memberId === ME_ID} size="sm" />
              <span className="t-dense min-w-0 flex-1 truncate">{m?.name ?? "Former teammate"} <span className="text-[11.5px] text-ink-3">· {c.role}</span></span>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${m?.name ?? "crew member"}`} onClick={() => set({ crew: p.crew.filter((_, k) => k !== i) })}><Trash2 strokeWidth={1.5} /></Button>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-2 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!memberId || !role.trim()) return toast("Pick a person and their role");
          set({ crew: [...p.crew, { memberId, role: role.trim() }] });
          setMemberId("");
          setRole("");
        }}
      >
        <Select aria-label="Person" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Add someone…</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
        {memberId && (
          <span className="flex gap-2">
            <Input aria-label="Role" list={`roles-${p.business}`} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className="flex-1" />
            <datalist id={`roles-${p.business}`}>{roles.map((r) => <option key={r} value={r} />)}</datalist>
            <Button type="submit" size="sm" variant="ink">Add</Button>
          </span>
        )}
      </form>
    </section>
  );
}

function Links({ p, set }: { p: Project; set: (patch: Partial<Project>) => void }) {
  const [draft, setDraft] = useState({ label: "", url: "" });
  return (
    <section>
      <h2 className="t-eyebrow m-0 mb-2 text-ink-3">Files & links</h2>
      <ul className="m-0 list-none p-0">
        {p.links.map((l, i) => (
          <li key={i} className="flex items-center gap-2 border-b border-line py-2 last:border-0">
            <a href={l.url} target="_blank" rel="noreferrer" className="t-dense min-w-0 flex-1 truncate hover:underline">{l.label}</a>
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
              {p.dueDate && <span className="font-mono text-[11px] text-ink-3">{fmtDate(p.dueDate)}</span>}
              <span className="font-mono text-[11px] text-ink-3">{pr.done}/{pr.total}</span>
              <Pill tone={STATUS_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Pill>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
