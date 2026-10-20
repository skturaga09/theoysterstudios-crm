import { roleOf, type Role } from "@pinnacle/shared";
import { Button, Segmented } from "@pinnacle/ui";
import { Camera, Megaphone, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { useMe } from "../../data/store";
import { SettingsHeader } from "./layout";

/** How the studio works in the CRM: five rules, each role's day, a booking from start to finish, and fixes for common slips. */

const RULES: [string, string][] = [
  ["Every enquiry lives in the CRM.", "Instagram, WhatsApp, email and the website form arrive by themselves. Phone calls and walk-ins: add them with New."],
  ["Every open lead has an owner and a next follow-up date.", "If you can't say what happens next, set a date to decide. A lead with no date gets forgotten."],
  ["Move a lead to Confirmed only when the booking is agreed.", "That one step creates the client, the project, its dated checklist and the payment schedule."],
  ["Tick work off in the CRM, not on WhatsApp.", "The owner sees progress without asking, and the CRM records who finished what and when."],
  ["Every rupee spent goes into Expenses, against its project.", "Otherwise the profit figures are guesses."],
];

type Day = { morning: ReactNode[]; during: ReactNode[]; weekly: ReactNode[] };
const L = ({ to, children }: { to: string; children: ReactNode }) => <Link to={to} className="font-medium text-ink underline decoration-line-2 underline-offset-2 hover:decoration-ink">{children}</Link>;

const DAYS: Record<Role, { label: string; day: Day }> = {
  admin: {
    label: "Owner",
    day: {
      morning: [
        <>Open the <L to="/dashboard">Owner dashboard</L>: new leads, bookings, money in and money due.</>,
        <>Check <L to="/">Home</L> for replies running late and leads with nobody on them.</>,
        "Read the morning summary in the bell (sent at 8:30).",
      ],
      during: [
        "Review quotations on big leads, and step in where a lead is stuck.",
        <>Watch the <L to="/calendar">Calendar</L> for clashes when two weddings want the same crew.</>,
      ],
      weekly: [
        <><L to="/profit">Profit &amp; loss</L>: which projects and which business made money.</>,
        <><L to="/reports">Reports</L>: where good leads come from, and why leads are lost.</>,
        "Look at team workload on the dashboard before taking on more bookings.",
      ],
    },
  },
  sales: {
    label: "Sales",
    day: {
      morning: [
        <>Start on <L to="/">Home</L>: clear overdue follow-ups first, then today's.</>,
        <>Answer everything new in the <L to="/inbox">Inbox</L>; the CRM warns the owner when a reply runs late.</>,
      ],
      during: [
        "After every call or chat: log it on the lead (Log call, or a note) and set the next follow-up date.",
        "Keep the lead details complete: business, service, budget, event date and city.",
        <>Send the <L to="/quotes">quotation</L>, then share it with Sign online, so the couple or client accepts it from their phone.</>,
        "When it's agreed, move the lead to Confirmed.",
      ],
      weekly: [
        <>Go through the <L to="/pipeline">Pipeline</L>: move every lead to its real stage.</>,
        "Close dead leads as Lost and give the reason, so the owner learns why.",
      ],
    },
  },
  pm: {
    label: "Project manager",
    day: {
      morning: [
        <>Open <L to="/tasks">Tasks</L> grouped By client: deal with overdue tasks first.</>,
        <>Check the <L to="/calendar">Calendar</L> for the next few days: crew assigned, no double bookings.</>,
      ],
      during: [
        "On each new project: check the checklist dates, assign the crew and an owner for every task.",
        "Share progress with Share with client updates; the client reads them in their portal.",
        "Ask for the client's approval on the portal instead of over WhatsApp, so there's a record.",
        "Attach files and Drive links to the task or project they belong to.",
      ],
      weekly: [
        "Look at the deliverables due next week on each project.",
        "Marketing retainers: at month end, Start next month on the project to create the new month's tasks.",
      ],
    },
  },
  finance: {
    label: "Finance",
    day: {
      morning: [<><L to="/invoices">Invoices</L>: see what is due and overdue today.</>],
      during: [
        "When a payment stage is due, raise the invoice from the booking's payment schedule.",
        "Send a Payment link with it (Razorpay), or Remind on WhatsApp when it's late.",
        "Record payments as they come in, and part payments too.",
        <>Add every bill to <L to="/expenses">Expenses</L> with its project and client.</>,
      ],
      weekly: [
        <>Check <L to="/profit">Profit &amp; loss</L> for projects running over cost.</>,
        "Monthly: export the GST sales register for the CA.",
      ],
    },
  },
  crew: {
    label: "Team",
    day: {
      morning: [<>Open <L to="/tasks">Tasks</L> on your phone: your work for today and anything late.</>],
      during: [
        "Tick a task the moment it's done. Your name and the time are saved with it.",
        "Use comments on a task for questions, so the next person sees the history.",
        "Attach your files or Drive links to the task.",
      ],
      weekly: ["Check the Calendar for your shoots and events next week."],
    },
  },
};

const WEDDING: [string, string][] = [
  ["Enquiry", "A DM, WhatsApp message, email or website form lands in the Inbox as a lead, already assigned by lead routing. It gets an owner and a follow-up for tomorrow."],
  ["Follow up", "Sales talks to the couple, logs each call and moves the lead through Contacted and Qualified."],
  ["Quotation", "Sales builds the quotation from a package and shares it with Sign online. The couple reads it, types their name and accepts. The CRM keeps a signed copy with the time and their details."],
  ["Confirmed", "Moving the lead to Confirmed creates the client, the project with its dated checklist and deliverables, and the payment schedule (by default 30% now, 50% a week before, 20% on delivery)."],
  ["Advance", "Finance raises the first invoice and sends a Payment link. The payment is recorded against the booking."],
  ["Planning", "The project manager assigns photographers and videographers to each function. The Calendar warns if anyone is booked twice."],
  ["The wedding", "Crew tick tasks off on their phones on the day."],
  ["After the event", "Back up the cards, cull (pick the best shots), edit, and send for approval through the client portal."],
  ["Delivery", "Deliverables are marked done, the final invoice goes out, and the project shows its real profit after expenses."],
];

const RETAINER: [string, string][] = [
  ["Lead to Confirmed", "Same as a wedding, under the Marketing business, with a monthly retainer package."],
  ["Project", "The project carries the services booked, campaign details, the content calendar link and the account manager."],
  ["Each month", "The team works through the month's tasks. At month end, Start next month creates the next month's tasks, and Finance invoices the retainer."],
  ["Client", "The client sees progress, updates and approvals in the portal."],
];

const SETUP: [string, string][] = [
  ["Team & access", "/settings/team"],
  ["Workspace (GSTIN, address)", "/settings/workspace"],
  ["Packages & payments", "/settings/packages"],
  ["Project templates", "/settings/templates"],
  ["Pipelines & stages", "/settings/pipeline"],
  ["Lead routing", "/settings/routing"],
  ["Integrations", "/settings/integrations"],
];

const FAQ: [string, ReactNode][] = [
  ["A message didn't show up in the Inbox.", <>New messages appear within about 30 seconds. If the channel says "waiting" in the sidebar, it hasn't received its first message yet: check its setup in <L to="/settings/integrations">Integrations</L>.</>],
  ["The wedding date changed.", "Change the event date on the lead. Tasks already created keep their dates, so move the ones that matter on the project page."],
  ["A lead was entered under the wrong business.", "Open the lead and change Business. Do it before confirming, so the project is created under the right one."],
  ["I ticked a task by mistake.", "Untick it. Turn on Show completed on the Tasks page to find it."],
  ["The client wants their portal link again.", "Open the project, find Client portal and copy the link. Replace link makes a new one and stops the old one working."],
  ["Someone has left the team.", <>An admin removes or changes them in <L to="/settings/team">Team &amp; access</L>. Reassign their open leads and tasks first.</>],
];

const ROLE_TABS = (Object.keys(DAYS) as Role[]).map((r) => ({ value: r, label: DAYS[r].label }));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10 break-inside-avoid-page">
      <h3 className="t-eyebrow m-0 mb-3 text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

function Steps({ steps }: { steps: [string, string][] }) {
  return (
    <ol className="m-0 list-none p-0">
      {steps.map(([title, body], i) => (
        <li key={title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 border-b border-line py-3">
          <span className="font-mono text-[12px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
          <span className="t-dense"><span className="font-medium">{title}.</span> <span className="text-ink-2">{body}</span></span>
        </li>
      ))}
    </ol>
  );
}

export function PlaybookRoute() {
  const myRole = roleOf(useMe().role);
  const [params, setParams] = useSearchParams();
  const asked = params.get("role") as Role | null;
  const role: Role = asked && asked in DAYS ? asked : myRole;
  const { day } = DAYS[role];
  return (
    <>
      <SettingsHeader
        title="Playbook"
        body="How the studio runs on the CRM: the five rules, what each person does every day, and how a booking travels from first message to final payment."
        action={<Button size="sm" variant="ghost" className="print:hidden" onClick={() => window.print()}><Printer strokeWidth={1.5} /> Print</Button>}
      />

      <Section title="The five rules">
        <ol className="m-0 list-none p-0">
          {RULES.map(([rule, why], i) => (
            <li key={rule} className="flex gap-3 border-b border-line py-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink font-mono text-[11px] text-on-ink">{i + 1}</span>
              <span className="t-dense"><span className="font-medium">{rule}</span> <span className="text-ink-2">{why}</span></span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Your day">
        <Segmented label="Role" value={role} onChange={(r) => setParams(r === myRole ? {} : { role: r }, { replace: true })} options={ROLE_TABS} className="mb-4 max-w-full overflow-x-auto print:hidden" />
        <p className="t-dense m-0 mb-3 hidden font-medium print:block">{DAYS[role].label}</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {([["Every morning", day.morning], ["During the day", day.during], ["Every week", day.weekly]] as const).map(([when, items]) => (
            <div key={when} className="rounded-card border border-line bg-surface p-4">
              <h4 className="t-dense m-0 mb-2 font-medium">{when}</h4>
              <ul className="m-0 flex list-disc flex-col gap-2 pl-4 t-dense text-ink-2 marker:text-ink-3">
                {items.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="A wedding, start to finish">
        <p className="t-dense m-0 mb-1 flex items-center gap-2 text-ink-2"><Camera size={15} strokeWidth={1.5} className="text-signal" aria-hidden /> Wedding Photography</p>
        <Steps steps={WEDDING} />
      </Section>

      <Section title="A marketing retainer">
        <p className="t-dense m-0 mb-1 flex items-center gap-2 text-ink-2"><Megaphone size={15} strokeWidth={1.5} className="text-ok" aria-hidden /> Marketing</p>
        <Steps steps={RETAINER} />
      </Section>

      {myRole === "admin" && (
        <Section title="First week (owner)">
          <p className="t-dense m-0 mb-3 text-ink-2">Set these up once, in this order. Prices, payment split and checklists are yours to change at any time; changes apply to new bookings.</p>
          <ol className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
            {SETUP.map(([label, to], i) => (
              <li key={to}>
                <Link to={to} className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 t-dense hover:bg-hover">
                  <span className="font-mono text-[12px] text-ink-3">{i + 1}</span>{label}
                </Link>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section title="When something goes wrong">
        <dl className="m-0">
          {FAQ.map(([q, a]) => (
            <div key={q} className="border-b border-line py-3">
              <dt className="t-dense font-medium">{q}</dt>
              <dd className="t-dense m-0 mt-1 text-ink-2">{a}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </>
  );
}
