import { BUSINESS_SHORT, fmtDay } from "@pinnacle/shared";
import { Avatar, Button, Checkbox, cn, Pill, Segmented, StrikeText, toast, Tooltip } from "@pinnacle/ui";
import { Bell, BellOff, CheckSquare, Columns3, List, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { PageHeader } from "../../components/page-header";
import { DoneBy } from "../../components/done-by";
import { taskGroup, type TaskGroup } from "../../data/derive";
import { ME_ID } from "../../data/seed";
import { useCrm } from "../../data/store";
import type { Task } from "../../data/types";
import { IS_DEMO } from "../../lib/demo";
import { useCreateAction, usePref } from "../../lib/hooks";
import { useUi } from "../../lib/ui-store";
import { Link } from "react-router";

const GROUPS: { id: TaskGroup; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "done", label: "Done" },
];

function dueLabel(t: Task) {
  const g = taskGroup(t);
  const time = new Date(t.dueAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  if (g === "today") return time;
  return `${fmtDay(t.dueAt)} · ${time}`;
}

/** A task's client: set on the task, or through its project or deal (checklist tasks only know their project). */
function useClientOf() {
  const s = useCrm();
  return (t: Task) => t.companyId ?? s.projects.find((p) => p.id === t.projectId)?.companyId ?? s.deals.find((d) => d.id === t.dealId)?.companyId;
}

type ClientGroup = { id: string; name: string; business?: string; open: Task[]; doneTasks: Task[]; done: number; overdue: number };

export function TasksRoute() {
  const s = useCrm();
  const tasks = s.tasks;
  const clientOf = useClientOf();
  const [view, setView] = usePref<"list" | "board">("tasks.view", "list");
  const [who, setWho] = usePref<"me" | "all">("tasks.who", "all");
  const [by, setBy] = usePref<"due" | "client">("tasks.group", "due");
  const [showDone, setShowDone] = usePref<"yes" | "no">("tasks.showDone", "no");
  useCreateAction(() => useUi.getState().openComposer("task"));

  const visible = tasks.filter((t) => who === "all" || t.assigneeId === ME_ID).sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
  // Done: most recently completed first.
  const grouped = GROUPS.map((g) => ({ ...g, items: visible.filter((t) => taskGroup(t) === g.id).sort((a, b) => (g.id === "done" ? (b.doneAt ?? "").localeCompare(a.doneAt ?? "") : 0)) }));
  // By client: each client's open work in due order; clients with the most pressing task first, "Internal" last.
  const clients: ClientGroup[] = [...new Set(visible.map((t) => clientOf(t) ?? ""))]
    .map((id) => {
      const mine = visible.filter((t) => (clientOf(t) ?? "") === id);
      const c = s.companies.find((x) => x.id === id);
      const doneTasks = mine.filter((t) => t.done).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
      return { id, name: id ? (c?.name ?? "Client") : "Internal (no client)", business: c?.business, open: mine.filter((t) => !t.done), doneTasks, done: doneTasks.length, overdue: mine.filter((t) => taskGroup(t) === "overdue").length };
    })
    .filter((g) => g.open.length || (showDone === "yes" && g.done))
    .sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || b.overdue - a.overdue || (a.open[0]?.dueAt ?? "9999").localeCompare(b.open[0]?.dueAt ?? "9999")); // clients with only finished work go last
  const overdue = grouped[0]!.items.length;
  const today = grouped[1]!.items.length;

  return (
    <>
      <PageHeader
        eyebrow={<><span className={overdue ? "text-risk" : ""}>{overdue} overdue</span> · {today} due today</>}
        title="Tasks"
        actions={
          <>
            <Segmented label="Whose" value={who} onChange={setWho} options={[{ value: "all", label: "Everyone" }, { value: "me", label: "My work" }]} />
            <Segmented label="Group by" value={by} onChange={setBy} options={[{ value: "due", label: "Due date" }, { value: "client", label: "Client" }]} />
            {by === "client" && (
              <label className="t-meta flex items-center gap-1.5 text-ink-2">
                <input type="checkbox" checked={showDone === "yes"} onChange={(e) => setShowDone(e.target.checked ? "yes" : "no")} className="size-4 accent-[var(--ink)]" />
                Show completed
              </label>
            )}
            <Segmented
              label="Layout"
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: <><List strokeWidth={1.5} />List</> },
                { value: "board", label: <><Columns3 strokeWidth={1.5} />Board</> },
              ]}
            />
            <Button variant="ink" onClick={() => useUi.getState().openComposer("task")}><Plus strokeWidth={1.5} /> Add task</Button>
          </>
        }
      />
      {!visible.length ? (
        <div className="flex flex-col items-start gap-3 border-t border-line py-10">
          <CheckSquare size={20} strokeWidth={1.5} className="text-ink-3" />
          <h2 className="t-sheet m-0">No tasks yet</h2>
          <p className="t-body m-0 max-w-[52ch] text-ink-2">Follow-ups you add to deals land here, grouped by when they're due. Press C to add one.</p>
        </div>
      ) : by === "client" ? (
        !clients.length ? (
          <p className="t-dense border-t border-line py-6 text-ink-3">Everything is done. Tick "Show completed" to see who finished what, and when.</p>
        ) : view === "list" ? (
          <div className="flex flex-col gap-8">
            {clients.map((g) => (
              <section key={g.id || "internal"}>
                <ClientHeader g={g} />
                <ul className="m-0 list-none border-t border-line p-0">
                  <AnimatePresence initial={false}>
                    {g.open.map((t) => <TaskRow key={t.id} t={t} />)}
                    {showDone === "yes" && g.doneTasks.map((t) => <TaskRow key={t.id} t={t} />)}
                  </AnimatePresence>
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
            <div className="flex min-w-max items-start gap-3">
              {clients.map((g) => (
                <section key={g.id || "internal"} className="w-[280px] rounded-panel bg-sunken p-2">
                  <div className="px-1.5 pt-1 pb-2.5"><ClientHeader g={g} compact /></div>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">{g.open.map((t) => <TaskCard key={t.id} t={t} />)}{showDone === "yes" && g.doneTasks.map((t) => <TaskCard key={t.id} t={t} />)}</ul>
                </section>
              ))}
            </div>
          </div>
        )
      ) : view === "list" ? (
        <div className="flex flex-col gap-8">
          {grouped.map((g) =>
            g.items.length ? (
              <section key={g.id}>
                <h2 className={cn("t-eyebrow m-0 mb-2 flex items-center gap-2", g.id === "overdue" ? "text-risk" : "text-ink-2")}>
                  {g.label} <span className="font-mono text-ink-3">{g.items.length}</span>
                </h2>
                <ul className="m-0 list-none border-t border-line p-0">
                  <AnimatePresence initial={false}>
                    {g.items.map((t) => <TaskRow key={t.id} t={t} />)}
                  </AnimatePresence>
                </ul>
              </section>
            ) : null,
          )}
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          <div className="flex min-w-max items-start gap-3">
            {grouped.map((g) => (
              <section key={g.id} className="w-[280px] rounded-panel bg-sunken p-2">
                <h2 className={cn("m-0 flex items-center gap-2 px-1.5 pt-1 pb-2.5 fs-12.5 font-medium", g.id === "overdue" && "text-risk")}>
                  {g.label} <span className="font-mono fs-11 font-normal text-ink-3">{g.items.length}</span>
                </h2>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {g.items.map((t) => <TaskCard key={t.id} t={t} />)}
                  {!g.items.length && <li className="rounded-card border border-dashed border-line-2 px-3 py-5 text-center fs-12 text-ink-3">Nothing here</li>}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** A client's heading on the Tasks page: name (to their page), business, and how much is open, late and done. */
function ClientHeader({ g, compact }: { g: ClientGroup; compact?: boolean }) {
  return (
    <h2 className={cn("m-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5", compact ? "fs-12.5 font-medium" : "t-dense mb-2 font-medium")}>
      {g.id ? <Link to={`/clients/${g.id}`} className="hover:underline">{g.name}</Link> : <span className="text-ink-2">{g.name}</span>}
      {g.business && <span className="fs-11 font-normal text-ink-3">{BUSINESS_SHORT[g.business as keyof typeof BUSINESS_SHORT]}</span>}
      <span className="font-mono fs-11 font-normal text-ink-3">{g.open.length} open</span>
      {g.overdue > 0 && <span className="font-mono fs-11 font-normal text-risk">{g.overdue} overdue</span>}
      {g.done > 0 && <span className="font-mono fs-11 font-normal text-ink-3">{g.done} done</span>}
    </h2>
  );
}

function useTaskBits(t: Task) {
  const s = useCrm();
  const clientOf = useClientOf();
  return {
    toggle: () => s.toggleTask(t.id),
    assignee: s.members.find((m) => m.id === t.assigneeId),
    company: s.companies.find((c) => c.id === clientOf(t)),
    deal: s.deals.find((d) => d.id === t.dealId),
    project: s.projects.find((p) => p.id === t.projectId),
  };
}

function RemindToggle({ t }: { t: Task }) {
  return (
    <Tooltip content={t.remind ? "Calendar reminder on" : "Add a Calendar reminder"}>
      <button
        aria-pressed={!!t.remind}
        aria-label="Calendar reminder"
        onClick={(e) => {
          e.stopPropagation();
          useCrm.getState().updateTask(t.id, { remind: !t.remind });
          toast(t.remind ? "Reminder removed" : IS_DEMO ? `Reminder set in Google Calendar · ${dueLabel(t)}` : "Reminder saved · it goes to Google Calendar once Calendar is connected");
        }}
        className={cn("grid size-7 place-items-center rounded-control hover:bg-hover", t.remind ? "text-ink" : "text-ink-3")}
      >
        {t.remind ? <Bell size={14} strokeWidth={1.5} /> : <BellOff size={14} strokeWidth={1.5} />}
      </button>
    </Tooltip>
  );
}

function TaskRow({ t }: { t: Task }) {
  const { toggle, assignee, company, deal, project } = useTaskBits(t);
  const g = taskGroup(t);
  return (
    <motion.li
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="flex min-h-12 items-center gap-3 border-b border-line py-2"
    >
      <Checkbox checked={t.done} label={t.title} onCheckedChange={toggle} />
      <div className="min-w-0 flex-1 leading-tight">
        <StrikeText done={t.done} className="t-dense">{t.title}</StrikeText>
        <div className="fs-11.5 text-ink-3">
          {project ? (
            <Link to={`/projects/${project.id}`} className="hover:text-ink hover:underline">{project.name}</Link>
          ) : deal ? (
            <button className="hover:text-ink hover:underline" onClick={() => useUi.getState().openDeal(deal.id)}>{company?.name} · {deal.title}</button>
          ) : (
            company?.name ?? "Internal"
          )}
          {t.done && <span className="sm:hidden"> · <DoneBy t={t} short /></span>}
        </div>
      </div>
      {(t.priority === "high" || t.priority === "urgent") && !t.done && <Pill tone={t.priority === "urgent" ? "risk" : "warn"}>{t.priority === "urgent" ? "Urgent" : "High"}</Pill>}
      <RemindToggle t={t} />
      {t.done ? (
        <span className="hidden w-[170px] text-right sm:block"><DoneBy t={t} /></span>
      ) : (
        <span className={cn("hidden w-[120px] text-right font-mono fs-11.5 sm:block", g === "overdue" ? "text-risk" : "text-ink-2")}>{dueLabel(t)}</span>
      )}
      {assignee && <Avatar name={assignee.name} me={assignee.id === ME_ID} />}
    </motion.li>
  );
}

function TaskCard({ t }: { t: Task }) {
  const { toggle, assignee, company } = useTaskBits(t);
  const g = taskGroup(t);
  return (
    <li className="rounded-card bg-surface p-3 shadow-rest">
      <div className="flex items-start gap-2.5">
        <Checkbox checked={t.done} label={t.title} onCheckedChange={toggle} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <StrikeText done={t.done} className="t-dense">{t.title}</StrikeText>
          <div className="mt-0.5 fs-11.5 text-ink-3">{company?.name ?? "Internal"}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 pl-6.5">
        {t.done ? <DoneBy t={t} short /> : <Pill tone={g === "overdue" ? "risk" : g === "today" ? "warn" : "mute"}>{dueLabel(t)}</Pill>}
        {assignee && <Avatar name={assignee.name} me={assignee.id === ME_ID} size="sm" className="ml-auto" />}
      </div>
    </li>
  );
}
