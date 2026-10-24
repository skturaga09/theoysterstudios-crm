import { addDays, fmtDay, istDay } from "@pinnacle/shared";
import { Button, cn, Input, Segmented, toast } from "@pinnacle/ui";
import { CalendarPlus, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "../../components/page-header";
import { stageState } from "../../data/finance";
import { ME_ID } from "../../data/seed";
import { useAccess, useCrm } from "../../data/store";
import { api } from "../../lib/api";
import { IS_DEMO } from "../../lib/demo";
import { usePref } from "../../lib/hooks";
import type { ProjectEvent } from "../../data/types";

type Kind = "event" | "enquiry" | "meeting" | "task" | "followup" | "payment" | "deliverable";
type Item = { id: string; kind: Kind; day: string; title: string; link: string; time?: string; clash?: boolean };

const KIND: Record<Kind, { label: string; dot: string }> = {
  event: { label: "Weddings & functions", dot: "bg-signal" },
  enquiry: { label: "Enquiry dates", dot: "bg-ink-3" },
  meeting: { label: "Client meetings", dot: "bg-[var(--cds-chart-categorical-2,#6b8afd)]" },
  task: { label: "Tasks", dot: "bg-ink" },
  followup: { label: "Follow-ups", dot: "bg-warn" },
  payment: { label: "Payments due", dot: "bg-ok" },
  deliverable: { label: "Deliverables", dot: "bg-risk" },
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Everything with a date, in one place: weddings and functions, tasks, follow-ups, payments and deliverables. */
const ROLE_WORDS = /photographer|cinematographer|videographer|\blead\b|assistant|\btbd\b|\bto be\b/i;

export function CalendarRoute() {
  const s = useCrm();
  const canMoney = useAccess("finance") === "edit";
  const today = istDay(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState(today);
  const [who, setWho] = usePref<"all" | "me">("calendar.who", "all");
  const [hidden, setHidden] = useState<Set<Kind>>(new Set());
  const mine = who === "me";

  // Who is booked on which day: the manager and crew of every project with a function that day, plus the
  // photographers and cinematographers named on that function.
  // shortcut: crew are matched by the name as typed ("Arun" ≠ "Arun K"); link names to team members if that misleads.
  const memberName = (id?: string) => s.members.find((m) => m.id === id)?.name;
  const firstName = (id: string) => memberName(id)?.split(" ")[0];
  const people = (p: (typeof s.projects)[number]) => [...new Set([p.managerId, ...p.crew.map((c) => c.memberId)].filter((x): x is string => !!x))];
  const booked = new Map<string, Map<string, { name: string; projects: Set<string> }>>(); // day → person → projects
  for (const p of s.projects.filter((x) => x.status === "planning" || x.status === "active"))
    for (const e of p.events.filter((x) => x.date))
      for (const name of [...people(p).map(memberName), ...(e.photoCrew ?? []), ...(e.videoCrew ?? [])]) {
        if (!name || ROLE_WORDS.test(name)) continue; // "Lead photographer", "TBD" aren't people
        const day = booked.get(e.date!) ?? new Map<string, { name: string; projects: Set<string> }>();
        const who = day.get(name.toLowerCase()) ?? { name, projects: new Set<string>() };
        who.projects.add(p.id);
        day.set(name.toLowerCase(), who);
        booked.set(e.date!, day);
      }
  const clashes = [...booked].flatMap(([day, byPerson]) => [...byPerson.values()].filter((w) => w.projects.size > 1).map((w) => ({ day, member: w.name, projects: [...w.projects] })));
  const lineup = (e: ProjectEvent) =>
    [
      (e.photo || e.photoCrew?.length) && `${Math.max(e.photo ?? 0, e.photoCrew?.length ?? 0)} photo${e.photoCrew?.length ? ` (${e.photoCrew.join(", ")})` : ""}`,
      (e.video || e.videoCrew?.length) && `${Math.max(e.video ?? 0, e.videoCrew?.length ?? 0)} video${e.videoCrew?.length ? ` (${e.videoCrew.join(", ")})` : ""}`,
    ].filter(Boolean).join(" · ");
  const clashOn = (day: string, projectId: string) => clashes.some((c) => c.day === day && c.projects.includes(projectId));

  const items: Item[] = [
    ...s.projects
      .filter((p) => !mine || p.managerId === ME_ID || p.crew.some((c) => c.memberId === ME_ID))
      .flatMap((p) => [
        ...p.events.filter((e) => e.date).map((e): Item => {
          const team = lineup(e) || people(p).map(firstName).filter(Boolean).join(", ");
          return { id: `e-${p.id}-${e.id}`, kind: "event", day: e.date!, title: `${e.name}${e.duration ? ` (${e.duration})` : ""} · ${p.name}${e.venue ? ` · ${e.venue}` : ""}${team ? ` · ${team}` : ""}`, link: `/projects/${p.id}`, clash: clashOn(e.date!, p.id) };
        }),
        ...(p.business === "marketing" && p.dueDate ? [{ id: `pd-${p.id}`, kind: "deliverable" as Kind, day: p.dueDate, title: `Project due · ${p.name}`, link: `/projects/${p.id}` }] : []),
        ...p.deliverables.filter((d) => d.dueDate && d.status !== "delivered").map((d): Item => ({ id: `d-${p.id}-${d.id}`, kind: "deliverable", day: d.dueDate!, title: `${d.name} · ${p.name}`, link: `/projects/${p.id}` })),
      ]),
    ...s.deals
      .filter((d) => d.eventDate && d.stage !== "won" && d.stage !== "lost" && (!mine || d.ownerId === ME_ID))
      .map((d): Item => ({ id: `q-${d.id}`, kind: "enquiry", day: d.eventDate!, title: `Enquiry: ${d.title} (not booked)`, link: `/deals/${d.id}` })),
    // Client meetings from Google Calendar: with known contacts (activities) and new bookings (Inbox).
    ...s.activities
      .filter((a) => a.type === "meeting" && a.meetingAt)
      .map((a): Item => ({ id: `m-${a.id}`, kind: "meeting", day: istDay(a.meetingAt!), time: time(a.meetingAt!), title: a.text.replace(/^has a meeting with /, "Meeting: "), link: a.dealId ? `/deals/${a.dealId}` : a.companyId ? `/clients/${a.companyId}` : "/calendar" })),
    ...s.conversations
      .filter((c) => c.channel === "calendar" && c.meetingAt)
      .map((c): Item => ({ id: `mc-${c.id}`, kind: "meeting", day: istDay(c.meetingAt!), time: time(c.meetingAt!), title: `Booking: ${c.name}${c.subject ? ` · ${c.subject}` : ""}`, link: `/inbox/${c.id}` })),
    ...s.tasks
      .filter((t) => !t.done && (!mine || t.assigneeId === ME_ID))
      .map((t): Item => ({ id: `t-${t.id}`, kind: "task", day: istDay(t.dueAt), time: time(t.dueAt), title: t.title, link: t.projectId ? `/projects/${t.projectId}` : "/tasks" })),
    ...s.deals
      .filter((d) => d.nextFollowUpAt && d.stage !== "won" && d.stage !== "lost" && (!mine || d.ownerId === ME_ID))
      .map((d): Item => ({ id: `f-${d.id}`, kind: "followup", day: istDay(d.nextFollowUpAt!), time: time(d.nextFollowUpAt!), title: `Follow up: ${d.title}`, link: `/deals/${d.id}` })),
    ...(canMoney
      ? s.deals.flatMap((d) =>
          (d.schedule ?? [])
            .filter((m) => m.dueDate && stageState(m, s.invoices) !== "paid")
            .map((m): Item => ({ id: `p-${d.id}-${m.id}`, kind: "payment", day: m.dueDate!, title: `${m.label} · ${d.title}`, link: `/deals/${d.id}` })),
        )
      : []),
  ].filter((i) => !hidden.has(i.kind));

  // Monday-first grid covering the month.
  const first = `${month}-01`;
  const lead = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(first, -lead);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i)).filter((d, i) => i < 35 || d.startsWith(month));
  const on = (day: string) => items.filter((i) => i.day === day).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const shift = (n: number) => {
    const d = new Date(`${first}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const label = new Date(`${first}T12:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader
        eyebrow={`${items.filter((i) => i.day >= today && i.day <= addDays(today, 6)).length} things in the next 7 days`}
        title="Calendar"
        actions={
          <>
            <Segmented label="Whose" value={who} onChange={setWho} options={[{ value: "all", label: "Everyone" }, { value: "me", label: "Mine" }]} />
            <FeedButton />
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="ghost" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft strokeWidth={1.5} /></Button>
        <h2 className="t-sheet m-0 w-[170px] text-center">{label}</h2>
        <Button size="icon-sm" variant="ghost" aria-label="Next month" onClick={() => shift(1)}><ChevronRight strokeWidth={1.5} /></Button>
        <Button size="sm" variant="ghost" onClick={() => { setMonth(today.slice(0, 7)); setPicked(today); }}>Today</Button>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {(Object.keys(KIND) as Kind[]).filter((k) => k !== "payment" || canMoney).map((k) => (
            <button
              key={k}
              aria-pressed={!hidden.has(k)}
              onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
              className={cn("flex items-center gap-1.5 rounded-control px-2 py-1 fs-12", hidden.has(k) ? "text-ink-3 line-through" : "bg-sunken text-ink-2")}
            >
              <span className={cn("size-2 rounded-full", KIND[k].dot)} /> {KIND[k].label}
            </button>
          ))}
        </span>
      </div>

      {clashes.filter((c) => c.day.startsWith(month)).length > 0 && (
        <div role="alert" className="t-dense mb-3 rounded-card bg-risk-wash px-4 py-3 text-risk">
          Double-booked this month:{" "}
          {clashes.filter((c) => c.day.startsWith(month)).map((c, i) => (
            <span key={`${c.day}-${c.member}`}>{i > 0 && "; "}<b>{c.member}</b> on {fmtDay(c.day)} ({c.projects.map((id) => s.projects.find((p) => p.id === id)?.name).join(" and ")})</span>
          ))}
          . Change the crew on one of the projects.
        </div>
      )}

      <div className="grid grid-cols-7 border-t border-l border-line">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="t-eyebrow border-r border-b border-line px-2 py-1.5 text-ink-3">{d}</div>)}
        {days.map((day) => {
          const list = on(day);
          return (
            <button
              key={day}
              onClick={() => setPicked(day)}
              className={cn("flex min-h-[64px] flex-col items-stretch gap-0.5 border-r border-b border-line p-1 text-left md:min-h-[104px]", !day.startsWith(month) && "bg-sunken/60 text-ink-3", picked === day && "outline-2 -outline-offset-2 outline-ink")}
            >
              <span className={cn("font-mono fs-11", day === today && "self-start rounded-full bg-ink px-1.5 text-on-ink")}>{Number(day.slice(8))}</span>
              {/* Phones: dots only; wider screens: the first few titles. */}
              <span className="flex flex-wrap gap-0.5 md:hidden">{list.slice(0, 6).map((i) => <span key={i.id} className={cn("size-1.5 rounded-full", KIND[i.kind].dot)} />)}</span>
              <span className="hidden flex-col gap-0.5 md:flex">
                {list.slice(0, 3).map((i) => (
                  <span key={i.id} className="flex items-center gap-1 truncate fs-11 leading-tight">
                    <span className={cn("size-1.5 shrink-0 rounded-full", KIND[i.kind].dot)} />
                    <span className={cn("truncate", i.clash && "text-risk")}>{i.clash && "⚠ "}{i.title}</span>
                  </span>
                ))}
                {list.length > 3 && <span className="fs-11 text-ink-3">+{list.length - 3} more</span>}
              </span>
            </button>
          );
        })}
      </div>

      <section className="mt-6">
        <h2 className="t-eyebrow m-0 mb-2 text-ink-2">{new Date(`${picked}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</h2>
        <ul className="m-0 list-none border-t border-line p-0">
          {on(picked).map((i) => (
            <li key={i.id}>
              <Link to={i.link} className="flex items-center gap-3 border-b border-line py-2.5 hover:bg-hover">
                <span className={cn("size-2 shrink-0 rounded-full", KIND[i.kind].dot)} />
                <span className={cn("t-dense min-w-0 flex-1 truncate", i.clash && "text-risk")}>{i.clash && "⚠ Double-booked · "}{i.title}</span>
                <span className="font-mono fs-11.5 text-ink-3">{i.time ?? KIND[i.kind].label}</span>
              </Link>
            </li>
          ))}
          {!on(picked).length && <li className="t-dense py-3 text-ink-3">Nothing on this day.</li>}
        </ul>
      </section>
    </>
  );
}

/** My private calendar address, to subscribe to in Google Calendar (Other calendars → From URL). */
function FeedButton() {
  const [url, setUrl] = useState<string>();
  const load = async (reset = false) => {
    if (IS_DEMO) return void toast("Your calendar address is made when you're signed in");
    try {
      setUrl((await api<{ url: string }>("/calendar/feed", { method: "POST", body: { origin: window.location.origin, reset } })).url);
      if (reset) toast("New address made — the old one stops working");
    } catch (e) {
      toast(`Couldn't get your calendar address — ${(e as Error).message}`);
    }
  };
  if (!url) return <Button onClick={() => void load()}><CalendarPlus strokeWidth={1.5} /> Add to Google Calendar</Button>;
  return (
    <div className="flex w-full flex-col gap-2 rounded-card bg-sunken p-3 md:w-[460px]">
      <p className="t-meta m-0 text-ink-2">In Google Calendar: <b>Other calendars → + → From URL</b>, paste this, then <b>Add calendar</b>. It updates every few hours. Keep it private — anyone with it can see your items.</p>
      <span className="flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.target.select()} className="h-8 flex-1 font-mono fs-11" />
        <Button size="sm" onClick={() => void navigator.clipboard.writeText(url).then(() => toast("Copied"))}><Copy strokeWidth={1.5} /> Copy</Button>
      </span>
      <button className="t-meta self-start text-ink-3 hover:text-ink" onClick={() => void load(true)}>Make a new address (stops the old one)</button>
    </div>
  );
}
