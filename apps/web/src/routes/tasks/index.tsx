import { fmtDay } from "@pinnacle/shared";
import { Avatar, Button, Checkbox, cn, Pill, Segmented, StrikeText, toast, Tooltip } from "@pinnacle/ui";
import { Bell, BellOff, CheckSquare, Columns3, List, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { PageHeader } from "../../components/page-header";
import { taskGroup, type TaskGroup } from "../../data/derive";
import { ME_ID } from "../../data/seed";
import { useCrm } from "../../data/store";
import type { Task } from "../../data/types";
import { useCreateAction, usePref } from "../../lib/hooks";
import { useUi } from "../../lib/ui-store";

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

export function TasksRoute() {
  const tasks = useCrm((s) => s.tasks);
  const [view, setView] = usePref<"list" | "board">("tasks.view", "list");
  const [who, setWho] = usePref<"me" | "all">("tasks.who", "all");
  useCreateAction(() => useUi.getState().openComposer("task"));

  const visible = tasks.filter((t) => who === "all" || t.assigneeId === ME_ID).sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
  const grouped = GROUPS.map((g) => ({ ...g, items: visible.filter((t) => taskGroup(t) === g.id) }));
  const overdue = grouped[0]!.items.length;
  const today = grouped[1]!.items.length;

  return (
    <>
      <PageHeader
        eyebrow={<><span className={overdue ? "text-risk" : ""}>{overdue} overdue</span> · {today} due today</>}
        title="Tasks"
        actions={
          <>
            <Segmented label="Whose" value={who} onChange={setWho} options={[{ value: "all", label: "Everyone" }, { value: "me", label: "Mine" }]} />
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
                <h2 className={cn("m-0 flex items-center gap-2 px-1.5 pt-1 pb-2.5 text-[12.5px] font-medium", g.id === "overdue" && "text-risk")}>
                  {g.label} <span className="font-mono text-[11px] font-normal text-ink-3">{g.items.length}</span>
                </h2>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {g.items.map((t) => <TaskCard key={t.id} t={t} />)}
                  {!g.items.length && <li className="rounded-card border border-dashed border-line-2 px-3 py-5 text-center text-[12px] text-ink-3">Nothing here</li>}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function useTaskBits(t: Task) {
  const s = useCrm();
  return {
    toggle: () => s.toggleTask(t.id),
    assignee: s.members.find((m) => m.id === t.assigneeId),
    company: s.companies.find((c) => c.id === t.companyId),
    deal: s.deals.find((d) => d.id === t.dealId),
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
          useCrm.setState((s) => ({ tasks: s.tasks.map((x) => (x.id === t.id ? { ...x, remind: !x.remind } : x)) }));
          toast(t.remind ? "Reminder removed" : `Reminder set in Google Calendar · ${dueLabel(t)}`);
        }}
        className={cn("grid size-7 place-items-center rounded-control hover:bg-hover", t.remind ? "text-ink" : "text-ink-3")}
      >
        {t.remind ? <Bell size={14} strokeWidth={1.5} /> : <BellOff size={14} strokeWidth={1.5} />}
      </button>
    </Tooltip>
  );
}

function TaskRow({ t }: { t: Task }) {
  const { toggle, assignee, company, deal } = useTaskBits(t);
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
        <div className="text-[11.5px] text-ink-3">
          {deal ? (
            <button className="hover:text-ink hover:underline" onClick={() => useUi.getState().openDeal(deal.id)}>{company?.name} · {deal.title}</button>
          ) : (
            company?.name ?? "Internal"
          )}
        </div>
      </div>
      <RemindToggle t={t} />
      <span className={cn("hidden w-[120px] text-right font-mono text-[11.5px] sm:block", g === "overdue" ? "text-risk" : "text-ink-2")}>{dueLabel(t)}</span>
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
          <div className="mt-0.5 text-[11.5px] text-ink-3">{company?.name ?? "Internal"}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 pl-6.5">
        <Pill tone={t.done ? "mute" : g === "overdue" ? "risk" : g === "today" ? "warn" : "mute"}>{dueLabel(t)}</Pill>
        {assignee && <Avatar name={assignee.name} me={assignee.id === ME_ID} size="sm" className="ml-auto" />}
      </div>
    </li>
  );
}
