import { fmtAgo, fmtDay, fmtEyebrow, greeting, type Health } from "@pinnacle/shared";
import {
  Avatar,
  ChannelChip,
  Checkbox,
  cn,
  HealthDot,
  Ledger,
  MoneyText,
  Pill,
  rise,
  spring,
  StageMeter,
  StrikeText,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type LedgerCell,
} from "@pinnacle/ui";
import { ArrowRight, Waypoints } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { EmptyState } from "../../components/empty-state";
import { closingThisMonth, countWord, invoiceStatus, invoiceTotals, pipelineMetrics, plural, sum, taskGroup } from "../../data/derive";
import { ME_ID } from "../../data/seed";
import { useCrm, useMe } from "../../data/store";
import type { Conversation } from "../../data/types";
import { IS_DEMO } from "../../lib/demo";
import { useOncePerSession } from "../../lib/hooks";
import { useUi } from "../../lib/ui-store";
import { LeadFlow } from "./lead-flow";

/** Sparkline that ends at the live value. */
const trend = (v: number, shape: number[]) => [...shape.map((k) => k * v), v];
const istTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const INTENT_LABEL = { quote: "Quote", meeting: "Meeting", question: "Question", other: "Other" } as const;

function useSummary() {
  const convs = useCrm((s) => s.conversations);
  const deals = useCrm((s) => s.deals);
  return useMemo(() => {
    const unread = convs.filter((c) => c.unread);
    if (!unread.length) {
      const n = closingThisMonth(deals).length;
      return `Inbox is clear. ${countWord(n)} ${plural(n, "deal")} close${n === 1 ? "s" : ""} this month.`;
    }
    const earliest = new Date(Math.min(...unread.map((c) => +new Date(c.lastMessageAt))));
    const ist = new Date(earliest.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const h = ist.getHours();
    const since = `${h % 12 || 12}${ist.getMinutes() >= 30 ? ":30" : ""} ${h < 12 ? "am" : "pm"}`;
    const quotes = unread.filter((c) => c.extracted?.intent === "quote").length;
    const tail = quotes
      ? ` ${countWord(quotes)} asked for a quote and ${quotes === 1 ? "is" : "are"} waiting on a reply.`
      : "";
    return `${countWord(unread.length)} unread ${plural(unread.length, "lead")} since ${since}.${tail}`;
  }, [convs, deals]);
}

export function HomeRoute() {
  const me = useMe();
  const deals = useCrm((s) => s.deals);
  const summary = useSummary();
  const firstView = useOncePerSession("pinnacle.home.countup");
  const m = pipelineMetrics(deals);
  const leads = useCrm((s) => s.leads);
  const openInvoices = useCrm((s) => s.invoices).filter((i) => ["sent", "partial", "overdue"].includes(invoiceStatus(i)));
  const openInvoicePaise = sum(openInvoices.map((i) => invoiceTotals(i).due));

  // The demo's comparisons, goal and trend lines are illustrative; the live app shows only what the data supports.
  const ledger: LedgerCell[] = IS_DEMO
    ? [
        { label: "Open pipeline", paise: m.openPaise, delta: `${m.openCount} open deals`, deltaTone: "mute", spark: trend(m.openPaise, [0.82, 0.86, 0.84, 0.9, 0.93, 0.91, 0.97]) },
        { label: "Weighted forecast", paise: m.weightedPaise, delta: "goal ₹70.0 L", deltaTone: "mute", spark: trend(m.weightedPaise, [0.78, 0.8, 0.86, 0.83, 0.9, 0.94, 0.96]) },
        { label: "Won this month", paise: m.wonPaise, delta: `${m.wonCount} ${plural(m.wonCount, "deal")} · +18% vs Sep`, deltaTone: "ok", spark: trend(m.wonPaise, [0.2, 0.32, 0.3, 0.48, 0.55, 0.7, 0.84]) },
        { label: "Median first reply", value: 38, unit: "min", delta: "+6 min vs Sep", deltaTone: "risk", spark: [52, 48, 41, 36, 33, 35, 31, 38] },
      ]
    : [
        { label: "Open pipeline", paise: m.openPaise, delta: `${m.openCount} open ${plural(m.openCount, "deal")}`, deltaTone: "mute" },
        { label: "Weighted forecast", paise: m.weightedPaise, delta: "open deals × stage likelihood", deltaTone: "mute" },
        { label: "Won this month", paise: m.wonPaise, delta: `${m.wonCount} ${plural(m.wonCount, "deal")}`, deltaTone: "mute" },
        { label: "Open invoices", paise: openInvoicePaise, delta: `${openInvoices.length} awaiting payment`, deltaTone: openInvoices.some((i) => invoiceStatus(i) === "overdue") ? "risk" : "mute" },
      ];

  let i = 0;
  const r = () => ({ variants: rise, initial: "hidden", animate: "show", custom: i++ }) as const;

  return (
    <div className="flex flex-col gap-10">
      <motion.header {...r()}>
        <p className="t-eyebrow m-0 mb-3 text-ink-3">{fmtEyebrow(new Date())}</p>
        <h1 className="t-greeting m-0">
          {greeting()}, <em className="text-grad italic">{me.name.split(" ")[0]}</em>.
        </h1>
        <p className="t-body m-0 mt-3 max-w-[62ch] text-ink-2">{summary}</p>
      </motion.header>

      <motion.div {...r()}>
        <Ledger cells={ledger} countUp={firstView} />
      </motion.div>

      <motion.div {...r()} className="grid grid-cols-1 gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {IS_DEMO || leads.length ? (
          <LeadFlow />
        ) : (
          <EmptyState icon={Waypoints} title="Lead flow" body="Shows where leads come from and how far they get, once Instagram, Gmail and the other channels are connected." />
        )}
        <ArrivingNow />
      </motion.div>

      <motion.div {...r()} className="grid grid-cols-1 gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ClosingThisMonth />
        <FollowUps />
      </motion.div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function SectionHead({ title, meta, to, linkLabel }: { title: string; meta?: React.ReactNode; to?: string; linkLabel?: string }) {
  return (
    <header className="mb-3 flex items-center gap-3">
      <h2 className="t-eyebrow m-0 text-ink-2">{title}</h2>
      {meta && <span className="t-meta text-ink-3">{meta}</span>}
      {to && (
        <Link to={to} viewTransition className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink">
          {linkLabel} <ArrowRight size={13} strokeWidth={1.5} />
        </Link>
      )}
    </header>
  );
}

function ArrivingNow() {
  const convs = useCrm((s) => s.conversations);
  const lastArrival = useCrm((s) => s.lastArrival);
  const navigate = useNavigate();
  const rows = [...convs].sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)).slice(0, 6);
  return (
    <section aria-labelledby="arriving-h" className="flex min-w-0 flex-col">
      <header className="mb-4 flex items-center gap-2.5">
        <span className="relative flex size-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-signal opacity-50 motion-reduce:hidden" />
          <span className="relative size-2 rounded-full bg-signal" />
        </span>
        <h2 id="arriving-h" className="t-eyebrow m-0 text-ink-2">Arriving now</h2>
        <Link to="/inbox" viewTransition className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink">
          Inbox <ArrowRight size={13} strokeWidth={1.5} />
        </Link>
      </header>
      <ul className="m-0 list-none border-t border-line p-0">
        <AnimatePresence initial={false}>
          {rows.map((c) => (
            <FeedRow key={c.id} c={c} fresh={lastArrival?.conversationId === c.id} onOpen={() => navigate(`/inbox/${c.id}`, { viewTransition: true })} />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function FeedRow({ c, fresh, onOpen }: { c: Conversation; fresh: boolean; onOpen: () => void }) {
  const last = c.messages[c.messages.length - 1];
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      className={cn("border-b border-line", fresh && "flash-new")}
    >
      <button onClick={onOpen} className="flex w-full items-start gap-3 px-1 py-3 text-left transition-colors duration-150 hover:bg-hover">
        <ChannelChip channel={c.channel} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {c.unread && <span aria-label="Unread" className="size-1.5 shrink-0 rounded-full bg-signal" />}
            <span className={cn("t-dense truncate", c.unread ? "font-medium" : "text-ink-2")}>{c.name}</span>
            <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-3">{fmtAgo(c.lastMessageAt)}</span>
          </div>
          <p className="m-0 mt-0.5 line-clamp-1 text-[12.5px] text-ink-3">{last?.body}</p>
          {c.extracted && !c.dealId && (
            <div className="mt-1.5 flex items-center gap-2">
              <Pill tone={c.extracted.intent === "quote" ? "new" : "mute"}>{INTENT_LABEL[c.extracted.intent]}</Pill>
              <span className="font-mono text-[11px] text-ink-3">est. <MoneyText paise={c.extracted.estValuePaise} /></span>
            </div>
          )}
        </div>
      </button>
    </motion.li>
  );
}

function ClosingThisMonth() {
  const deals = useCrm((s) => s.deals);
  const companies = useCrm((s) => s.companies);
  const members = useCrm((s) => s.members);
  const wonPulse = useUi((s) => s.wonPulse);
  const rows = closingThisMonth(deals);
  const total = rows.reduce((a, d) => a + d.valuePaise, 0);
  return (
    <section className="min-w-0">
      <SectionHead title="Closing this month" meta={<>{rows.length} deals · <MoneyText paise={total} /></>} to="/pipeline" linkLabel="Pipeline" />
      {rows.length ? (
        <Table className="border-t border-line">
          <THead>
            <tr>
              <TH>Deal</TH>
              <TH className="hidden md:table-cell">Stage</TH>
              <TH align="right">Value</TH>
              <TH>Close</TH>
              <TH className="hidden sm:table-cell">Owner</TH>
              <TH className="w-6"><span className="sr-only">Health</span></TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((d) => {
              const owner = members.find((m) => m.id === d.ownerId);
              const overdue = new Date(d.closeAt) < new Date(new Date().toDateString());
              return (
                <TR key={d.id} onClick={() => useUi.getState().openDeal(d.id)} className={cn(wonPulse === d.id && "won-pulse")}>
                  <TD>
                    <div className="font-medium">{companies.find((c) => c.id === d.companyId)?.name}</div>
                    <div className="text-[11.5px] text-ink-3">{d.title}</div>
                  </TD>
                  <TD className="hidden md:table-cell"><StageMeter stage={d.stage} /></TD>
                  <TD align="right"><MoneyText paise={d.valuePaise} /></TD>
                  <TD numeric className={overdue ? "text-risk" : "text-ink-2"}>{fmtDay(d.closeAt)}</TD>
                  <TD className="hidden sm:table-cell">{owner && <Avatar name={owner.name} me={owner.id === ME_ID} />}</TD>
                  <TD><HealthDot health={d.health as Health} /></TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      ) : (
        <p className="t-dense m-0 border-t border-line py-6 text-ink-3">Nothing closes this month. Deals with a close date before month end will show here.</p>
      )}
    </section>
  );
}

function FollowUps() {
  const tasks = useCrm((s) => s.tasks);
  const toggle = useCrm((s) => s.toggleTask);
  const companies = useCrm((s) => s.companies);
  const rows = tasks
    .filter((t) => t.assigneeId === ME_ID || ["overdue", "today"].includes(taskGroup(t)))
    .filter((t) => taskGroup(t) !== "upcoming" && (taskGroup(t) !== "done" || (t.doneAt && Date.now() - +new Date(t.doneAt) < 6 * 3600_000)))
    .sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt))
    .slice(0, 7);
  const open = rows.filter((t) => !t.done).length;
  return (
    <section className="min-w-0">
      <SectionHead title="Follow-ups" meta={`${open} due`} to="/tasks" linkLabel="All tasks" />
      <ul className="m-0 list-none border-t border-line p-0">
        {rows.map((t) => {
          const g = taskGroup(t);
          return (
            <li key={t.id} className="flex min-h-11 items-center gap-3 border-b border-line py-2">
              <Checkbox checked={t.done} label={t.title} onCheckedChange={() => toggle(t.id)} />
              <div className="min-w-0 flex-1 leading-tight">
                <StrikeText done={t.done} className="t-dense">{t.title}</StrikeText>
                <div className="text-[11.5px] text-ink-3">{companies.find((c) => c.id === t.companyId)?.name ?? "Internal"}</div>
              </div>
              <Pill tone={t.done ? "mute" : g === "overdue" ? "risk" : "warn"}>
                {t.done ? "Done" : g === "overdue" ? `Overdue · ${fmtDay(t.dueAt)}` : istTime(t.dueAt)}
              </Pill>
            </li>
          );
        })}
        {!rows.length && <li className="t-dense py-6 text-ink-3">Nothing due. Tasks you add to deals show up here on their due date.</li>}
      </ul>
    </section>
  );
}
