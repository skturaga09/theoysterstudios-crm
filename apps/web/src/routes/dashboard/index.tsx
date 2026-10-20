import { BUSINESS_LABEL, BUSINESSES, formatCompact, onlyBusiness, ownerSummary, ROLE_LABEL, roleOf, type DashboardInput } from "@pinnacle/shared";
import { Avatar, Ledger, Table, TBody, TD, TH, THead, TR } from "@pinnacle/ui";
import type { ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { PageHeader } from "../../components/page-header";
import { PaymentsDue } from "../../components/payments-due";
import { ME_ID } from "../../data/seed";
import { useCrm, useMe } from "../../data/store";

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
  };
  const sum = ownerSummary(input);
  const month = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const team = s.members.map((m) => ({ m, n: sum.person(m.id) }));

  return (
    <div className="flex flex-col gap-12">
      <PageHeader eyebrow={`${s.businessView === "all" ? "Both businesses" : BUSINESS_LABEL[s.businessView]} · ${month}`} title="Owner dashboard" />

      <Section title="Sales" link={<Link to="/pipeline">Pipeline →</Link>}>
        <Ledger
          cells={[
            { label: "New leads this month", value: sum.sales.newLeads, delta: `${sum.sales.openLeads} open in total`, deltaTone: "mute" },
            { label: "Confirmed this month", paise: sum.sales.confirmedPaise, delta: `${sum.sales.confirmed} ${sum.sales.confirmed === 1 ? "booking" : "bookings"}`, deltaTone: "mute" },
            { label: "Open pipeline", paise: sum.sales.pipelinePaise, delta: sum.sales.followUpsOverdue ? `${sum.sales.followUpsOverdue} follow-ups overdue` : "follow-ups on time", deltaTone: sum.sales.followUpsOverdue ? "risk" : "ok" },
            { label: "Conversion", value: sum.sales.conversion ?? 0, unit: "%", delta: sum.sales.conversion === null ? "no closed leads yet" : "of closed leads, won", deltaTone: "mute" },
          ]}
        />
      </Section>

      <Section title="Projects" link={<Link to="/projects">Projects →</Link>}>
        <Ledger
          cells={[
            { label: "Active projects", value: sum.projects.active, delta: `${sum.projects.eventsNext30} ${sum.projects.eventsNext30 === 1 ? "wedding" : "weddings"} in the next 30 days`, deltaTone: "mute" },
            { label: "Overdue tasks", value: sum.projects.overdueTasks, delta: sum.projects.overdueTasks ? "past their due date" : "all on time", deltaTone: sum.projects.overdueTasks ? "risk" : "ok" },
            { label: "Awaiting client approval", value: sum.projects.awaitingApproval, delta: "tasks waiting on clients", deltaTone: "mute" },
            { label: "Deliverables due", value: sum.projects.deliverablesDue, delta: "within 7 days or late", deltaTone: sum.projects.deliverablesDue ? "risk" : "mute" },
          ]}
        />
      </Section>

      <Section title="Money" link={<Link to="/invoices">Invoices →</Link>}>
        <Ledger
          cells={[
            { label: "Invoiced this month", paise: sum.finance.invoicedPaise, delta: "sent invoices, incl. GST", deltaTone: "mute" },
            { label: "Received this month", paise: sum.finance.receivedPaise, delta: "payments recorded", deltaTone: "ok" },
            { label: "Outstanding", paise: sum.finance.outstandingPaise, delta: "still to collect", deltaTone: "mute" },
            { label: "Overdue", paise: sum.finance.overduePaise, delta: sum.finance.overduePaise ? "past the due date" : "nothing overdue", deltaTone: sum.finance.overduePaise ? "risk" : "ok" },
          ]}
        />
      </Section>

      <PaymentsDue />

      {s.businessView === "all" && <ByBusiness input={input} />}

      <Section title="Team">
        <Table className="border-t border-line">
          <THead>
            <TR interactive={false}>
              <TH>Person</TH>
              <TH align="right">Open leads</TH>
              <TH align="right">Confirmed this month</TH>
              <TH align="right">Projects</TH>
              <TH align="right">Open tasks</TH>
              <TH align="right">Overdue</TH>
            </TR>
          </THead>
          <TBody>
            {team.map(({ m, n }) => (
              <TR key={m.id} interactive={false}>
                <TD>
                  <span className="flex items-center gap-2">
                    <Avatar name={m.name} me={m.id === ME_ID} size="sm" />
                    <span>{m.name} <span className="text-[11.5px] text-ink-3">· {ROLE_LABEL[roleOf(m.role)]}</span></span>
                  </span>
                </TD>
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
