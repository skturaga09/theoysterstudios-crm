import { addDays, fmtDate, istDay } from "@pinnacle/shared";
import { Button, cn, Tooltip } from "@pinnacle/ui";
import { ArrowRight, CalendarHeart, CheckSquare, MessageSquare, PhoneCall, Sparkles, Users } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Tile } from "../../components/bento";
import { taskGroup } from "../../data/derive";
import { ME_ID } from "../../data/seed";
import { useCrm } from "../../data/store";
import { trackSpotlight } from "../../lib/spotlight";
import { useUi } from "../../lib/ui-store";
import { Cover } from "../records/client-cards";

/** Hours since midnight in India, e.g. 14.5 for 2:30 pm. */
const istHours = (d: Date | string) => {
  const [h, m] = new Date(d).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number) as [number, number];
  return h + m / 60;
};
/** 14.5 → "2:30 pm" */
const clock = (h: number) => {
  const m = Math.round((h % 1) * 60);
  const hh = Math.floor(h);
  return `${hh % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${hh < 12 ? "am" : "pm"}`;
};

/* ---------- Do this next: the single most pressing thing ---------- */

type Next = { why: string; title: string; detail?: string; action: string; icon: ReactNode; go: () => void };

/** One thing to do now: an overdue follow-up, then a quote request nobody has answered, then late work, then today's. */
export function NextUp() {
  const s = useCrm();
  const navigate = useNavigate();
  const today = istDay(new Date());
  const company = (id?: string) => s.companies.find((c) => c.id === id)?.name;
  const late = s.deals.filter((d) => d.ownerId === ME_ID && d.nextFollowUpAt && d.stage !== "won" && d.stage !== "lost" && istDay(d.nextFollowUpAt) < today).sort((a, b) => a.nextFollowUpAt!.localeCompare(b.nextFollowUpAt!))[0];
  const quote = s.conversations.filter((c) => c.unread && !c.dealId && c.extracted?.intent === "quote").sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt))[0];
  const mine = s.tasks.filter((t) => t.assigneeId === ME_ID && !t.done).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const lateTask = mine.find((t) => taskGroup(t) === "overdue");
  const todayTask = mine.find((t) => taskGroup(t) === "today");
  const next: Next | undefined = late
    ? { why: "Follow-up overdue", title: company(late.companyId) ?? late.title, detail: `${late.title} · was due ${fmtDate(late.nextFollowUpAt!)}`, action: "Open the lead", icon: <PhoneCall strokeWidth={1.5} />, go: () => useUi.getState().openDeal(late.id) }
    : quote
      ? { why: "Waiting for a quote", title: quote.name, detail: quote.messages.at(-1)?.body, action: "Reply now", icon: <MessageSquare strokeWidth={1.5} />, go: () => navigate(`/inbox/${quote.id}`) }
      : lateTask ?? todayTask
        ? { why: lateTask ? "Overdue task" : "Due today", title: (lateTask ?? todayTask)!.title, detail: company((lateTask ?? todayTask)!.companyId) ?? "", action: "Open", icon: <CheckSquare strokeWidth={1.5} />, go: () => navigate((lateTask ?? todayTask)!.projectId ? `/projects/${(lateTask ?? todayTask)!.projectId}` : "/tasks") }
        : undefined;
  return (
    <Tile i={0} className="flex flex-col border-transparent bg-signal text-white">
      <p className="t-eyebrow m-0 flex items-center gap-1.5 text-white/80"><Sparkles size={13} strokeWidth={1.5} /> Do this next</p>
      {next ? (
        <>
          <p className="m-0 mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-white/20 px-2.5 py-0.5 fs-11.5 font-medium [&_svg]:size-3.5">{next.icon}{next.why}</p>
          <p className="m-0 mt-2 font-serif fs-30 leading-tight">{next.title}</p>
          {next.detail && <p className="m-0 mt-1 line-clamp-2 fs-12.5 text-white/85">{next.detail}</p>}
          <Button onClick={next.go} className="mt-auto self-start border-0 bg-white text-[var(--signal)] hover:bg-white/90">{next.action} <ArrowRight strokeWidth={1.5} /></Button>
        </>
      ) : (
        <>
          <p className="m-0 mt-3 font-serif fs-30 leading-tight">You're all caught up.</p>
          <p className="m-0 mt-1 fs-12.5 text-white/85">No overdue follow-ups, unanswered quotes or late tasks. A good moment to chase a proposal.</p>
          <Link to="/pipeline" className="mt-auto inline-flex self-start rounded-full bg-white/20 px-3 py-1 fs-12 font-medium hover:bg-white/30">Open pipeline →</Link>
        </>
      )}
    </Tile>
  );
}

/* ---------- Your day: a timeline from 8 am to 9 pm with a moving "now" ---------- */

type Dot = { id: string; at: number; label: string; kind: "meeting" | "follow-up" | "task"; go: () => void };
const DAY_START = 8;
const DAY_END = 21;
const KIND = {
  meeting: { tone: "bg-ok", label: "Meeting" },
  "follow-up": { tone: "bg-signal", label: "Follow-up" },
  task: { tone: "bg-ink", label: "Task" },
} as const;

export function TodayRail() {
  const s = useCrm();
  const navigate = useNavigate();
  const today = istDay(new Date());
  const [now, setNow] = useState(() => istHours(new Date()));
  useEffect(() => {
    const t = window.setInterval(() => setNow(istHours(new Date())), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const company = (id?: string) => s.companies.find((c) => c.id === id)?.name;
  const dots: Dot[] = [
    ...s.activities.filter((a) => a.type === "meeting" && a.meetingAt && istDay(a.meetingAt) === today).map((a): Dot => ({ id: `m${a.id}`, at: istHours(a.meetingAt!), label: a.text.replace(/^has a meeting with /, ""), kind: "meeting", go: () => navigate(a.dealId ? `/deals/${a.dealId}` : "/calendar") })),
    ...s.conversations.filter((c) => c.channel === "calendar" && c.meetingAt && istDay(c.meetingAt) === today).map((c): Dot => ({ id: `c${c.id}`, at: istHours(c.meetingAt!), label: c.name, kind: "meeting", go: () => navigate(`/inbox/${c.id}`) })),
    ...s.deals.filter((d) => d.ownerId === ME_ID && d.nextFollowUpAt && d.stage !== "won" && d.stage !== "lost" && istDay(d.nextFollowUpAt) === today).map((d): Dot => ({ id: `d${d.id}`, at: istHours(d.nextFollowUpAt!), label: company(d.companyId) ?? d.title, kind: "follow-up", go: () => useUi.getState().openDeal(d.id) })),
    ...s.tasks.filter((t) => t.assigneeId === ME_ID && !t.done && istDay(t.dueAt) === today).map((t): Dot => ({ id: `t${t.id}`, at: istHours(t.dueAt), label: t.title, kind: "task", go: () => navigate(t.projectId ? `/projects/${t.projectId}` : "/tasks") })),
  ].sort((a, b) => a.at - b.at);
  const functions = s.projects.flatMap((p) => p.events.filter((e) => e.date === today).map((e) => ({ id: `${p.id}${e.id}`, label: `${e.name} · ${company(p.companyId) ?? p.name}`, to: `/projects/${p.id}` })));
  const pos = (h: number) => `${((Math.min(DAY_END, Math.max(DAY_START, h)) - DAY_START) / (DAY_END - DAY_START)) * 100}%`;
  const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, k) => DAY_START + k);
  return (
    <Tile i={1} className="flex flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="t-eyebrow m-0 text-ink-3">Your day</p>
        {(Object.keys(KIND) as (keyof typeof KIND)[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 fs-11.5 text-ink-3"><span className={cn("size-2 rounded-full", KIND[k].tone)} />{KIND[k].label}s</span>
        ))}
        <Link to="/calendar" className="t-meta ml-auto text-ink-3 hover:text-ink">Calendar →</Link>
      </div>
      {functions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {functions.map((f) => (
            <Link key={f.id} to={f.to} className="inline-flex items-center gap-1.5 rounded-full bg-signal-wash px-2.5 py-1 fs-12 font-medium text-signal hover:opacity-80"><CalendarHeart size={13} strokeWidth={1.5} />{f.label}</Link>
          ))}
        </div>
      )}
      {/* The rail: hours, a dot per thing at its time, and where the day is now. */}
      <div className="relative mt-8 mb-2 h-16">
        <div className="absolute inset-x-0 top-6 h-1.5 rounded-full bg-sunken" />
        <motion.div className="absolute top-6 left-0 h-1.5 rounded-full bg-signal/35" initial={{ width: 0 }} animate={{ width: pos(now) }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
        {now >= DAY_START && now <= DAY_END && (
          <span className="absolute top-3 -ml-px h-7 w-0.5 rounded-full bg-signal" style={{ left: pos(now) }}>
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full bg-signal px-1.5 font-mono fs-10 whitespace-nowrap text-white">now</span>
          </span>
        )}
        {dots.map((d, k) => (
          <Tooltip key={d.id} content={`${clock(d.at)} · ${KIND[d.kind].label}: ${d.label}`}>
            <motion.button
              type="button"
              onClick={d.go}
              aria-label={`${KIND[d.kind].label}: ${d.label}`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.3 + k * 0.05 }}
              whileHover={{ scale: 1.35 }}
              className={cn("absolute top-[18px] -ml-[9px] size-[18px] rounded-full border-[3px] border-surface shadow-rest", KIND[d.kind].tone, d.at < now && "opacity-45")}
              style={{ left: pos(d.at) }}
            />
          </Tooltip>
        ))}
        {hours.filter((h) => h % 2 === 0).map((h) => (
          <span key={h} className="absolute top-11 -translate-x-1/2 font-mono fs-10 text-ink-3" style={{ left: pos(h) }}>{clock(h)}</span>
        ))}
      </div>
      {dots.length ? (
        <ul className="m-0 mt-2 grid list-none grid-cols-1 gap-x-6 gap-y-1 p-0 sm:grid-cols-2">
          {dots.slice(0, 6).map((d) => (
            <li key={d.id}>
              <button type="button" onClick={d.go} className={cn("flex w-full items-center gap-2.5 rounded-control px-1 py-1 text-left hover:bg-hover", d.at < now && "text-ink-3")}>
                <span className={cn("size-2 shrink-0 rounded-full", KIND[d.kind].tone)} />
                <span className="w-[62px] shrink-0 font-mono fs-11.5 text-ink-3">{clock(d.at)}</span>
                <span className="t-dense truncate">{d.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-meta m-0 mt-1 text-ink-3">Nothing timed for you today. Meetings, follow-ups and tasks due today land on this line.</p>
      )}
    </Tile>
  );
}

/* ---------- This week's weddings: photo cards with a countdown ---------- */

export function ThisWeek() {
  const s = useCrm();
  const today = istDay(new Date());
  const end = addDays(today, 7);
  const items = s.projects
    .filter((p) => p.status === "planning" || p.status === "active")
    .flatMap((p) => p.events.filter((e) => e.date && e.date >= today && e.date <= end).map((e) => ({ p, e, client: s.companies.find((c) => c.id === p.companyId) })))
    .sort((a, b) => a.e.date!.localeCompare(b.e.date!));
  if (!items.length) return null;
  const days = (d: string) => Math.round((Date.parse(d) - Date.parse(today)) / 86400_000);
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="t-eyebrow m-0 text-ink-2">Coming up this week</h2>
        <span className="t-meta text-ink-3">{items.length} {items.length === 1 ? "function" : "functions"}</span>
        <Link to="/calendar" className="t-meta ml-auto text-ink-3 hover:text-ink">Calendar →</Link>
      </div>
      <ul className="-mx-4 m-0 flex list-none snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        {items.map(({ p, e, client }, k) => {
          const n = days(e.date!);
          const crew = Math.max(e.photo ?? 0, e.photoCrew?.length ?? 0) + Math.max(e.video ?? 0, e.videoCrew?.length ?? 0);
          return (
            <motion.li key={`${p.id}${e.id}`} className="w-[240px] shrink-0 snap-start" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + k * 0.06, duration: 0.4 }} whileHover={{ y: -4 }}>
              <Link to={`/projects/${p.id}`} onMouseMove={trackSpotlight} className="spotlight block overflow-hidden rounded-[20px] border border-line bg-surface shadow-rest transition-shadow hover:shadow-pop">
                {client ? (
                  <Cover company={client} canUpload={false} hoverZoom className="h-[130px]">
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-8 pb-2.5 font-serif fs-20 leading-tight text-white">{client.name}</span>
                    <span className={cn("absolute top-2.5 right-2.5 rounded-full px-2.5 py-0.5 fs-11.5 font-medium", n === 0 ? "bg-signal text-white" : "bg-white/90 text-black")}>{n === 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`}</span>
                  </Cover>
                ) : <div className="h-[130px] bg-sunken" />}
                <div className="flex flex-col gap-1 p-3">
                  <span className="t-dense font-medium">{e.name} <span className="font-normal text-ink-3">· {fmtDate(e.date!)}</span></span>
                  <span className="truncate fs-12 text-ink-3">{[e.venue, e.duration].filter(Boolean).join(" · ") || "Venue to confirm"}</span>
                  <span className={cn("mt-1 inline-flex items-center gap-1 fs-11.5", crew ? "text-ink-2" : "text-warn")}><Users size={12} strokeWidth={1.5} />{crew ? `${crew} crew` : "Crew not set"}</span>
                </div>
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
