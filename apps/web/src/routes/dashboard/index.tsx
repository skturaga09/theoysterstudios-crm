import { istDay, BUSINESS_LABEL, BUSINESSES, formatCompact, onlyBusiness, ownerSummary, ROLE_LABEL, roleOf, type DashboardInput } from "@pinnacle/shared";
import { Avatar, cn, CountUp, Table, TBody, TD, TH, THead, TR } from "@pinnacle/ui";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { Big, Dial, Label, Tile } from "../../components/bento";
import { PageHeader } from "../../components/page-header";
import { PaymentsDue } from "../../components/payments-due";
import { ME_ID } from "../../data/seed";
import { useCrm, useMe } from "../../data/store";
import { runFor } from "../../data/pipeline";
import { downloadCsv } from "../../lib/download";

type Summary = ReturnType<typeof ownerSummary>;

/**
 * The owner's view of both businesses: sales, projects, money and the team, for this month. The top bar's
 * business switch narrows it; viewing Both adds a side-by-side of the two businesses.
 */
export function DashboardRoute() {
  const me = useMe();
  const s = useCrm();
  if (roleOf(me.role) !== "admin") return <Navigate to="/" replace />;

  const input: DashboardInput = {
    deals: s.deals,
    projects: s.projects,
    // Older tasks may only know their business through their deal.
    tasks: s.tasks.map((t) => ({ ...t, business: t.business ?? s.deals.find((d) => d.id === t.dealId)?.business })),
    invoices: s.invoices.map((i) => ({ ...i, business: i.business ?? s.deals.find((d) => d.id === i.dealId)?.business })),
    expenses: s.expenses,
  };
  const sum = ownerSummary(input);
  const month = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const today = istDay(new Date());
  // Who is on a function today (and where); everyone else is free for new work today.
  const onToday = (id: string) =>
    s.projects.find((p) => (p.status === "planning" || p.status === "active") && (p.managerId === id || p.crew.some((c) => c.memberId === id)) && p.events.some((e) => e.date === today));
  const team = s.members.map((m) => ({ m, n: sum.person(m.id), today: onToday(m.id) }));
  const free = team.filter((x) => !x.today).length;
  // The open pipeline stage by stage (the business being viewed; photography's stages when viewing both).
  const run = runFor(s.pipelines, s.businessView === "all" ? undefined : s.businessView).filter((st) => st.kind === "open");
  const byStage = run.map((st) => ({ label: st.label, n: s.deals.filter((d) => d.stage === st.id).length }));

  return (
    <div className="flex flex-col gap-12">
      <PageHeader eyebrow={`${s.businessView === "all" ? "Both businesses" : BUSINESS_LABEL[s.businessView]} · ${month}`} title="Owner dashboard" />

      <Bento sum={sum} byStage={byStage} team={team} free={free} />

      <PaymentsDue />

      {s.businessView === "all" && <ByBusiness input={input} />}

      <Section
        title="Team"
        link={
          <button
            onClick={() =>
              downloadCsv("team-workload", [
                ["Person", "Role", "Today", "Open leads", "Confirmed this month (₹)", "Projects", "Open tasks", "Overdue tasks"],
                ...team.map(({ m, n, today: t }) => [m.name, ROLE_LABEL[roleOf(m.role)], t ? `On ${t.name}` : "Free", n.openLeads, n.confirmedPaise / 100, n.projects, n.openTasks, n.overdueTasks]),
              ])
            }
          >
            Workload CSV
          </button>
        }
      >
        <p className="t-meta m-0 mb-2 text-ink-3">{free} of {team.length} free today (not on a wedding or function).</p>
        <Table className="border-t border-line">
          <THead>
            <TR interactive={false}>
              <TH>Person</TH>
              <TH className="hidden sm:table-cell">Today</TH>
              <TH align="right">Open leads</TH>
              <TH align="right">Confirmed this month</TH>
              <TH align="right">Projects</TH>
              <TH align="right">Open tasks</TH>
              <TH align="right">Overdue</TH>
            </TR>
          </THead>
          <TBody>
            {team.map(({ m, n, today: t }) => (
              <TR key={m.id} interactive={false}>
                <TD>
                  <span className="flex items-center gap-2">
                    <Avatar name={m.name} me={m.id === ME_ID} size="sm" />
                    <span>{m.name} <span className="fs-11.5 text-ink-3">· {ROLE_LABEL[roleOf(m.role)]}</span></span>
                  </span>
                </TD>
                <TD className="hidden sm:table-cell">{t ? <Link to={`/projects/${t.id}`} className="text-warn hover:underline">On {t.name}</Link> : <span className="text-ok">Free</span>}</TD>
                <TD align="right" numeric>{n.openLeads}</TD>
                <TD align="right" numeric>{n.confirmedPaise ? formatCompact(n.confirmedPaise) : "—"}</TD>
                <TD align="right" numeric>{n.projects}</TD>
                <TD align="right" numeric>{n.openTasks}</TD>
                <TD align="right" numeric className={n.overdueTasks ? "text-risk" : undefined}>{n.overdueTasks}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>
    </div>
  );
}

function Section({ title, link, children }: { title: string; link?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="t-eyebrow m-0 text-ink-2">{title}</h2>
        {link && <span className="t-meta text-ink-3 hover:text-ink">{link}</span>}
      </div>
      {children}
    </section>
  );
}

/** Photography and Marketing side by side, on the same measures. */
function ByBusiness({ input }: { input: DashboardInput }) {
  const cols = BUSINESSES.map((b) => ({ b, x: ownerSummary(onlyBusiness(input, b)) }));
  const rows: [string, (x: Summary) => string][] = [
    ["New leads this month", (x) => String(x.sales.newLeads)],
    ["Confirmed this month", (x) => formatCompact(x.sales.confirmedPaise)],
    ["Open pipeline", (x) => formatCompact(x.sales.pipelinePaise)],
    ["Conversion", (x) => (x.sales.conversion === null ? "—" : `${x.sales.conversion}%`)],
    ["Active projects", (x) => String(x.projects.active)],
    ["Overdue tasks", (x) => String(x.projects.overdueTasks)],
    ["Invoiced this month", (x) => formatCompact(x.finance.invoicedPaise)],
    ["Received this month", (x) => formatCompact(x.finance.receivedPaise)],
    ["Outstanding", (x) => formatCompact(x.finance.outstandingPaise)],
  ];
  return (
    <Section title="By business">
      <Table className="border-t border-line">
        <THead>
          <TR interactive={false}>
            <TH> </TH>
            {cols.map(({ b }) => <TH key={b} align="right">{BUSINESS_LABEL[b]}</TH>)}
          </TR>
        </THead>
        <TBody>
          {rows.map(([label, get]) => (
            <TR key={label} interactive={false}>
              <TD className="text-ink-2">{label}</TD>
              {cols.map(({ b, x }) => <TD key={b} align="right" numeric>{get(x)}</TD>)}
            </TR>
          ))}
        </TBody>
      </Table>
    </Section>
  );
}

/* ---------- Bento: the month at a glance, in rounded tiles (one solid highlight, a dial and bars) ---------- */
function Bento({ sum, byStage, team, free }: { sum: Summary; byStage: { label: string; n: number }[]; team: { m: { id: string; name: string }; today?: { id: string; name: string } }[]; free: number }) {
  const max = Math.max(1, ...byStage.map((x) => x.n));
  const money = [
    { label: "Invoiced", paise: sum.finance.invoicedPaise },
    { label: "Received", paise: sum.finance.receivedPaise },
    { label: "Expenses", paise: sum.finance.expensesPaise },
  ];
  const moneyMax = Math.max(1, ...money.map((x) => x.paise));
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* The highlight: what was booked this month. */}
      <Tile i={0} className="border-transparent bg-signal text-white">
        <Label light>Confirmed this month</Label>
        <Big paise={sum.sales.confirmedPaise} />
        <p className="m-0 mt-3 fs-12.5 text-white/85">{sum.sales.confirmed} {sum.sales.confirmed === 1 ? "booking" : "bookings"} · {sum.sales.newLeads} new leads</p>
        <Link to="/pipeline" className="mt-5 inline-flex rounded-full bg-white/20 px-3 py-1 fs-12 font-medium text-white hover:bg-white/30">Open pipeline →</Link>
      </Tile>

      <Tile i={1}>
        <Label>Conversion</Label>
        <div className="mt-2 flex justify-center"><Dial pct={sum.sales.conversion ?? 0} /></div>
        <p className="t-meta m-0 mt-1 text-center text-ink-3">{sum.sales.lost} lost this month · <Link to="/reports" className="hover:text-ink">why →</Link></p>
      </Tile>

      <Tile i={2}>
        <Label>Open pipeline</Label>
        <Big paise={sum.sales.pipelinePaise} className="fs-30" />
        <div className="mt-4 flex h-[72px] items-end gap-2" aria-label="Open leads by stage">
          {byStage.map((st, k) => (
            <div key={st.label} className="flex flex-1 flex-col items-center gap-1" title={`${st.label}: ${st.n}`}>
              <span className="font-mono fs-10.5 text-ink-3">{st.n}</span>
              <motion.span
                className="w-full rounded-t-[6px] bg-signal"
                style={{ opacity: 0.45 + 0.55 * (st.n / max), originY: 1 }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.6, delay: 0.25 + k * 0.06, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="block" style={{ height: `${Math.max(4, (st.n / max) * 48)}px` }} />
              </motion.span>
            </div>
          ))}
        </div>
        <p className="t-meta m-0 mt-1 truncate text-ink-3">{byStage.map((x) => x.label).join(" · ")}</p>
        {sum.sales.followUpsOverdue > 0 && <p className="t-meta m-0 mt-1 text-risk">{sum.sales.followUpsOverdue} follow-ups overdue</p>}
      </Tile>

      <Tile i={3}>
        <Label>Profit this month</Label>
        <Big paise={sum.finance.profitPaise} className={cn("fs-30", sum.finance.profitPaise < 0 && "text-risk")} />
        <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
          {money.map((x, k) => (
            <li key={x.label} className="grid grid-cols-[64px_1fr_auto] items-center gap-2 fs-12">
              <span className="text-ink-3">{x.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-sunken">
                <motion.span className={cn("block h-full rounded-full", k === 2 ? "bg-ink-3" : "bg-signal")} initial={{ width: 0 }} animate={{ width: `${(x.paise / moneyMax) * 100}%` }} transition={{ duration: 0.8, delay: 0.3 + k * 0.08 }} />
              </span>
              <span className="font-mono tnum">{formatCompact(x.paise)}</span>
            </li>
          ))}
        </ul>
      </Tile>

      <Tile i={4} className="sm:col-span-2">
        <div className="flex items-baseline justify-between"><Label>Projects</Label><Link to="/projects" className="t-meta text-ink-3 hover:text-ink">Projects →</Link></div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Active", n: sum.projects.active, note: `${sum.projects.eventsNext30} weddings in 30 days` },
            { label: "Overdue tasks", n: sum.projects.overdueTasks, note: `${sum.projects.pendingTasks} open`, risk: sum.projects.overdueTasks > 0 },
            { label: "Awaiting client", n: sum.projects.awaitingApproval, note: "approvals" },
            { label: "Deliverables due", n: sum.projects.deliverablesDue, note: "in 7 days or late", risk: sum.projects.deliverablesDue > 0 },
          ].map((x) => (
            <div key={x.label} className="rounded-[14px] bg-sunken p-3">
              <p className="m-0 fs-11.5 text-ink-3">{x.label}</p>
              <p className={cn("m-0 mt-1 font-serif fs-30 leading-none tnum", x.risk && "text-risk")}><CountUp value={x.n} /></p>
              <p className="m-0 mt-1 fs-11 text-ink-3">{x.note}</p>
            </div>
          ))}
        </div>
      </Tile>

      <Tile i={5}>
        <div className="flex items-baseline justify-between"><Label>To collect</Label><Link to="/invoices" className="t-meta text-ink-3 hover:text-ink">Invoices →</Link></div>
        <Big paise={sum.finance.outstandingPaise} className="fs-30" />
        <p className={cn("t-meta m-0 mt-2", sum.finance.overduePaise ? "text-risk" : "text-ok")}>{sum.finance.overduePaise ? `${formatCompact(sum.finance.overduePaise)} overdue` : "Nothing overdue"}</p>
      </Tile>

      <Tile i={6}>
        <Label>Team today</Label>
        <p className="m-0 mt-2 font-serif fs-30 leading-none tnum">{free}<span className="fs-16 text-ink-3"> / {team.length} free</span></p>
        <div className="mt-4 flex -space-x-2">
          {team.slice(0, 8).map(({ m, today }) => (
            <span key={m.id} title={`${m.name}: ${today ? `on ${today.name}` : "free"}`} className={cn("rounded-full ring-2", today ? "ring-warn" : "ring-surface")}>
              <Avatar name={m.name} me={m.id === ME_ID} size="sm" />
            </span>
          ))}
        </div>
        <p className="t-meta m-0 mt-2 text-ink-3">Orange ring: on a function today.</p>
      </Tile>
    </div>
  );
}
