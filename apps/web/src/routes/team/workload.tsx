import { fmtDate, istDay, ROLE_LABEL, roleOf, TASK_STATUS_LABEL } from "@pinnacle/shared";
import { Avatar, cn, Pill, type PillTone } from "@pinnacle/ui";
import { motion } from "motion/react";
import { Link } from "react-router";
import { tile } from "../../components/bento";
import { PageHeader } from "../../components/page-header";
import { ME_ID } from "../../data/seed";
import { useCrm } from "../../data/store";
import type { Member, Task } from "../../data/types";

type Load = "function" | "overloaded" | "busy" | "available";
const LOAD: Record<Load, { label: string; tone: PillTone }> = {
  function: { label: "On a shoot today", tone: "new" },
  overloaded: { label: "Overloaded", tone: "risk" },
  busy: { label: "Busy", tone: "warn" },
  available: { label: "Available", tone: "ok" },
};
const statusOf = (t: Task) => (t.done ? "done" : (t.status ?? "todo"));

/**
 * Who is working on what: each person's work in progress (what each editor is editing right now), their open,
 * overdue, waiting and finished tasks, the projects they're on, and whether they can take on more.
 */
export function Workload({ header = true }: { header?: boolean }) {
  const s = useCrm();
  const today = istDay(new Date().toISOString());
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const live = s.projects.filter((p) => p.status === "planning" || p.status === "active");
  const where = (t: Task) => {
    const p = s.projects.find((x) => x.id === t.projectId);
    const c = s.companies.find((x) => x.id === (t.companyId ?? p?.companyId));
    return { p, label: [c?.name, p?.name].filter(Boolean).join(" · ") || "Internal" };
  };
  const people = s.members.map((m) => {
    const mine = s.tasks.filter((t) => t.assigneeId === m.id);
    const open = mine.filter((t) => !t.done);
    const first = m.name.split(" ")[0]!.toLowerCase();
    // On a function today: manager or crew of a project with a function today, or named on that function's crew.
    const shoot = live.find((p) => p.events.some((e) => e.date === today && (p.managerId === m.id || p.crew.some((c) => c.memberId === m.id) || [...(e.photoCrew ?? []), ...(e.videoCrew ?? [])].some((n) => n.toLowerCase() === first))));
    const doing = open.filter((t) => statusOf(t) === "in_progress");
    const overdue = open.filter((t) => istDay(t.dueAt) < today);
    const load: Load = shoot ? "function" : overdue.length > 2 || open.length > 10 ? "overloaded" : doing.length ? "busy" : "available";
    return {
      m,
      load,
      shoot,
      doing,
      open,
      overdue,
      review: open.filter((t) => statusOf(t) === "review"),
      pending: open.filter((t) => statusOf(t) === "pending"),
      done: mine.filter((t) => t.done && t.doneAt && t.doneAt >= weekAgo),
      projects: live.filter((p) => p.managerId === m.id || p.crew.some((c) => c.memberId === m.id) || open.some((t) => t.projectId === p.id)),
    };
  });
  const order: Load[] = ["overloaded", "busy", "function", "available"];
  people.sort((a, b) => order.indexOf(a.load) - order.indexOf(b.load) || b.open.length - a.open.length);
  const allOpen = s.tasks.filter((t) => !t.done);
  return (
    <div className="flex flex-col gap-5">
      {header && (
        <PageHeader
          title="Who's working on what"
          stats={[
            { label: "Available now", value: people.filter((p) => p.load === "available").length, tone: "ok" },
            { label: "Active projects", value: live.length, tone: "signal" },
            { label: "Open tasks", value: allOpen.length },
            { label: "Overdue", value: allOpen.filter((t) => istDay(t.dueAt) < today).length, tone: "risk" },
          ]}
        />
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {people.map((x, i) => <PersonCard key={x.m.id} x={x} i={i} where={where} />)}
      </div>
    </div>
  );
}

function PersonCard({ x, i, where }: { x: { m: Member; load: Load; shoot?: { id: string; name: string }; doing: Task[]; open: Task[]; overdue: Task[]; review: Task[]; pending: Task[]; done: Task[]; projects: { id: string; name: string }[] }; i: number; where: (t: Task) => { label: string } }) {
  const stat = (label: string, n: number, tone?: string) => (
    <div className="rounded-[12px] bg-sunken px-2.5 py-2">
      <p className={cn("m-0 font-serif fs-22 leading-none tnum", n && tone)}>{n}</p>
      <p className="m-0 mt-1 fs-11 text-ink-3">{label}</p>
    </div>
  );
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.05 }} className={cn(tile, "flex flex-col gap-3")}>
      <header className="flex items-center gap-3">
        <Avatar name={x.m.name} me={x.m.id === ME_ID} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate font-medium">{x.m.name}</p>
          <p className="m-0 truncate fs-12 text-ink-3">{x.m.title || ROLE_LABEL[roleOf(x.m.role)]}</p>
        </div>
        <Pill tone={LOAD[x.load].tone}>{LOAD[x.load].label}</Pill>
      </header>

      <div>
        <p className="t-eyebrow m-0 mb-1.5 text-ink-3">Working on now</p>
        {x.shoot && <Link to={`/projects/${x.shoot.id}`} className="mb-1 block truncate fs-12.5 font-medium text-signal hover:underline">On today's function · {x.shoot.name}</Link>}
        {x.doing.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {x.doing.slice(0, 3).map((t) => (
              <li key={t.id} className="flex items-baseline gap-2">
                <span className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-signal motion-safe:animate-pulse" />
                <span className="min-w-0 flex-1">
                  <span className="t-dense block truncate font-medium">{t.title}</span>
                  <span className="block truncate fs-11.5 text-ink-3">{where(t).label} · due {fmtDate(t.dueAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          !x.shoot && <p className="t-meta m-0 text-ink-3">Nothing marked In progress{x.open.length ? ` · next: ${x.open.sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]!.title}` : ""}</p>
        )}
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {stat("Open", x.open.length)}
        {stat("Overdue", x.overdue.length, "text-risk")}
        {stat(TASK_STATUS_LABEL.review, x.review.length, "text-warn")}
        {stat(TASK_STATUS_LABEL.pending, x.pending.length, "text-ink-2")}
        {stat("Done · 7d", x.done.length, "text-ok")}
      </div>

      {x.projects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {x.projects.slice(0, 5).map((p) => <Link key={p.id} to={`/projects/${p.id}`} className="rounded-full bg-sunken px-2.5 py-0.5 fs-11.5 text-ink-2 hover:text-ink">{p.name}</Link>)}
          {x.projects.length > 5 && <span className="fs-11.5 text-ink-3">+{x.projects.length - 5}</span>}
        </div>
      )}
    </motion.section>
  );
}
