import { fmtDate, formatCompact, istDay, type Business, type PipelineStage, type Stage } from "@pinnacle/shared";
import { Avatar, Button, ChannelChip, cn, Input, MoneyText, Tooltip } from "@pinnacle/ui";
import { AlertCircle, ArrowRight, Check, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { BusinessIcon } from "../../components/business-icon";
import { ClientPhoto } from "../../components/client-photo";
import { ME_ID } from "../../data/seed";
import { useCrm } from "../../data/store";
import type { Company, Deal } from "../../data/types";
import { changeStage } from "../../lib/actions";
import { usePref } from "../../lib/hooks";
import { useUi } from "../../lib/ui-store";

/** "attention" = overdue or missing follow-up; "open" = every stage still being worked. */
type Focus = "open" | "attention" | Stage;

const today = () => istDay(new Date().toISOString());
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000);

/** Needs a nudge: the follow-up is overdue, or nobody has set one. */
const needsAttention = (d: Deal) => !d.nextFollowUpAt || istDay(d.nextFollowUpAt) < today();

/** What happens next for a deal, in plain words, and how urgent it is. */
function nextStep(d: Deal): { text: string; tone: "risk" | "warn" | "ok" | "mute" } {
  if (d.stage === "won") return { text: d.wonAt ? `Confirmed ${fmtDate(d.wonAt)}` : "Confirmed", tone: "ok" };
  if (d.stage === "lost") return { text: d.lostReason ? `Lost · ${d.lostReason}` : "Lost", tone: "mute" };
  if (!d.nextFollowUpAt) return { text: "No follow-up set", tone: "warn" };
  const n = daysBetween(today(), istDay(d.nextFollowUpAt));
  if (n < 0) return { text: `Follow-up overdue by ${-n} ${n === -1 ? "day" : "days"}`, tone: "risk" };
  if (n === 0) return { text: "Follow up today", tone: "warn" };
  return { text: `Follow up ${n === 1 ? "tomorrow" : `in ${n} days`} · ${fmtDate(d.nextFollowUpAt)}`, tone: "mute" };
}

/**
 * The pipeline client by client: a funnel on the left picks which leads to show; each client is a card with every
 * one of their deals on a stage track. Click a step to move the deal there; one button moves it to the next stage.
 */
export function ClientPipeline({ deals, stages, business }: { deals: Deal[]; stages: PipelineStage[]; business: Business }) {
  const companies = useCrm((s) => s.companies);
  const [focus, setFocus] = usePref<string>(`pipeline.focus.${business}`, "open");
  const [query, setQuery] = useState("");
  const open = stages.filter((s) => s.kind === "open");
  const won = stages.find((s) => s.kind === "won");
  const monthStart = `${today().slice(0, 7)}-01`;
  const isOpenDeal = (d: Deal) => open.some((s) => s.id === d.stage);
  const inFocus = (d: Deal, f: Focus = focus as Focus) =>
    f === "open" ? isOpenDeal(d) : f === "attention" ? isOpenDeal(d) && needsAttention(d) : f === "lost" ? d.stage === "lost" && (!d.lostAt || istDay(d.lostAt) >= monthStart) : won && f === won.id ? d.stage === won.id && (!d.wonAt || istDay(d.wonAt) >= monthStart) : d.stage === f;
  const count = (f: Focus) => deals.filter((d) => inFocus(d, f));
  const sum = (ds: Deal[]) => ds.reduce((a, d) => a + d.valuePaise, 0);

  // Client by client: the clients with something in focus, the most urgent first.
  const q = query.trim().toLowerCase();
  const shown = deals.filter((d) => inFocus(d));
  const groups = [...new Set(shown.map((d) => d.companyId))]
    .map((id) => ({ company: companies.find((c) => c.id === id), deals: shown.filter((d) => d.companyId === id).sort((a, b) => a.closeAt.localeCompare(b.closeAt)) }))
    .filter((g) => !q || g.company?.name.toLowerCase().includes(q) || g.deals.some((d) => d.title.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.deals.some(needsAttention)) - Number(a.deals.some(needsAttention)) || a.deals[0]!.closeAt.localeCompare(b.deals[0]!.closeAt));

  const total = count("open");
  const tiles: { id: Focus; label: string; deals: Deal[]; tone?: "warn" | "ok" | "risk" }[] = [
    { id: "attention", label: "Needs attention", deals: count("attention"), tone: "warn" },
    { id: "open", label: "All open leads", deals: total },
    ...open.map((s) => ({ id: s.id as Focus, label: s.label, deals: count(s.id) })),
    ...(won ? [{ id: won.id as Focus, label: `${won.label} this month`, deals: count(won.id), tone: "ok" as const }] : []),
    { id: "lost", label: "Lost this month", deals: count("lost"), tone: "risk" },
  ];
  const label = tiles.find((t) => t.id === focus)?.label ?? "All open leads";

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* The funnel: pick what to look at. Sticky on wide screens; a strip of chips on phones. */}
      <nav aria-label="Pipeline stages" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:sticky lg:top-0 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0">
        {tiles.map((t, i) => {
          const on = focus === t.id;
          const isStage = open.some((s) => s.id === t.id);
          const share = total.length ? t.deals.length / total.length : 0;
          return (
            <div key={t.id} className="shrink-0 lg:shrink">
              {t.id === open[0]?.id && <p className="t-eyebrow mt-2 mb-1 hidden px-1 text-ink-3 lg:block">Stages</p>}
              <button
                onClick={() => setFocus(t.id)}
                aria-pressed={on}
                className={cn(
                  "relative flex w-full items-center gap-2 overflow-hidden rounded-[14px] border px-3 py-2.5 text-left transition-colors duration-150",
                  on ? "border-transparent bg-signal text-white shadow-rest" : "border-line bg-surface hover:bg-hover",
                  t.tone === "warn" && !on && t.deals.length > 0 && "border-warn/50 bg-warn-wash",
                )}
              >
                {/* How much of the open pipeline sits in this stage. */}
                {isStage && !on && <motion.span aria-hidden className="absolute inset-y-0 left-0 bg-signal/10" initial={{ width: 0 }} animate={{ width: `${share * 100}%` }} transition={{ duration: 0.6, delay: i * 0.04 }} />}
                <span className="relative flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap">
                  {t.id === "attention" && <AlertCircle size={14} strokeWidth={1.75} className={on ? "text-white" : "text-warn"} />}
                  <span className="truncate fs-12.5 font-medium">{t.label}</span>
                </span>
                <span className={cn("relative font-mono fs-12 tnum", on ? "text-white/90" : "text-ink-2")}>{t.deals.length}</span>
                <span className={cn("relative hidden w-[58px] text-right font-mono fs-11 tnum lg:inline", on ? "text-white/80" : "text-ink-3")}>{formatCompact(sum(t.deals))}</span>
              </button>
            </div>
          );
        })}
      </nav>

      <section className="min-w-0">
        <header className="mb-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="t-sheet m-0">{label}</h2>
            <p className="t-meta m-0 mt-0.5 text-ink-3">{groups.length} {groups.length === 1 ? "client" : "clients"} · {formatCompact(sum(shown))}</p>
          </div>
          <label className="relative ml-auto w-full max-w-[260px]">
            <Search size={14} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <Input aria-label="Find a client" placeholder="Find a client" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
          </label>
        </header>

        {!groups.length ? (
          <p className="t-dense rounded-[18px] border border-dashed border-line-2 px-6 py-12 text-center text-ink-3">
            {focus === "attention" ? "Every open lead has a follow-up on time. Nicely done." : q ? `No client matches “${query}”.` : "Nobody here right now."}
          </p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 2xl:grid-cols-2">
            <AnimatePresence initial={false}>
              {groups.map((g, i) => (
                <ClientCard key={g.company?.id ?? i} company={g.company} deals={g.deals} stages={stages} index={i} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </div>
  );
}

/** One client and each of their deals on a track of stages. */
function ClientCard({ company, deals, stages, index }: { company?: Company; deals: Deal[]; stages: PipelineStage[]; index: number }) {
  const total = deals.reduce((a, d) => a + d.valuePaise, 0);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04 }}
      className="rounded-[20px] border border-line bg-surface p-4 shadow-rest"
    >
      <div className="flex items-center gap-3">
        <ClientPhoto company={company} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="m-0 flex items-center gap-2 font-serif fs-20 leading-tight">
            <span className="truncate">{company?.name ?? "Unknown client"}</span>
            {company?.business && <BusinessIcon business={company.business} size="sm" />}
          </p>
          <p className="t-meta m-0 mt-0.5 truncate text-ink-3">{[company?.city, deals.length > 1 && `${deals.length} deals`].filter(Boolean).join(" · ") || " "}</p>
        </div>
        <span className="text-right">
          <MoneyText paise={total} className="block fs-16 font-medium" />
          {deals.length > 1 && <span className="fs-11 text-ink-3">together</span>}
        </span>
      </div>
      <div className="mt-3 flex flex-col divide-y divide-line">
        {deals.map((d) => <DealTrack key={d.id} deal={d} stages={stages} />)}
      </div>
    </motion.li>
  );
}

function DealTrack({ deal: d, stages }: { deal: Deal; stages: PipelineStage[] }) {
  const owner = useCrm((s) => s.members.find((m) => m.id === d.ownerId));
  const track = stages.filter((s) => s.kind !== "lost");
  const at = track.findIndex((s) => s.id === d.stage);
  const next = d.stage === "lost" ? undefined : track[at + 1];
  const step = nextStep(d);
  const lost = d.stage === "lost";
  return (
    <div className="py-3 first:pt-1 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <button onClick={() => useUi.getState().openDeal(d.id)} className="t-dense min-w-0 truncate text-left font-medium hover:underline">{d.title}</button>
        <span className="font-mono fs-12 text-ink-2">{formatCompact(d.valuePaise)}</span>
        <span className="ml-auto flex items-center gap-1.5 fs-11.5 text-ink-3">
          {d.eventDate && <span>Event {fmtDate(d.eventDate)}</span>}
          <ChannelChip channel={d.channel} className="h-4 min-w-4" />
          {owner && <Avatar name={owner.name} me={owner.id === ME_ID} size="sm" />}
        </span>
      </div>

      {/* The stage track: done steps filled, the current one ringed. Click a step to move the deal there. */}
      <ol className={cn("m-0 mt-3 flex list-none items-center p-0", lost && "opacity-45")} aria-label="Stage">
        {track.map((s, i) => {
          const done = !lost && i < at;
          const here = !lost && i === at;
          const isWon = s.kind === "won";
          return (
            <li key={s.id} className="flex min-w-0 flex-1 items-center last:flex-none">
              <Tooltip content={here ? `Now: ${s.label}` : `Move to ${s.label}`}>
                <button
                  type="button"
                  disabled={here}
                  onClick={() => changeStage(d.id, s.id)}
                  aria-label={here ? `Current stage: ${s.label}` : `Move to ${s.label}`}
                  className={cn(
                    "relative grid size-6 shrink-0 place-items-center rounded-full border-2 transition-transform duration-150 enabled:hover:scale-110",
                    done ? (isWon ? "border-ok bg-ok text-white" : "border-signal bg-signal text-white") : here ? (isWon ? "border-ok bg-ok text-white" : "border-signal bg-surface text-signal") : "border-line-2 bg-surface text-ink-3",
                  )}
                >
                  {done || (here && isWon) ? <Check size={12} strokeWidth={3} /> : here ? <span className="size-2 rounded-full bg-signal" /> : null}
                  {here && !isWon && <span aria-hidden className="absolute inset-0 animate-ping rounded-full border-2 border-signal opacity-30 motion-reduce:hidden" />}
                </button>
              </Tooltip>
              {i < track.length - 1 && <span className={cn("mx-1 h-0.5 min-w-2 flex-1 rounded-full", i < at && !lost ? "bg-signal" : "bg-line-2")} />}
            </li>
          );
        })}
      </ol>
      <div className="mt-1 flex justify-between gap-2 fs-10.5 text-ink-3">
        <span className="truncate">{track[0]?.label}</span>
        <span className={cn("truncate font-medium", lost ? "text-risk" : d.stage === "won" ? "text-ok" : "text-signal")}>{lost ? "Lost" : track[at]?.label}</span>
        <span className="truncate">{track.at(-1)?.label}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 fs-11.5", step.tone === "risk" ? "bg-risk-wash text-risk" : step.tone === "warn" ? "bg-warn-wash text-warn" : step.tone === "ok" ? "bg-ok-wash text-ok" : "bg-sunken text-ink-2")}>
          {step.text}
        </span>
        <span className="ml-auto flex gap-1.5">
          {!lost && d.stage !== "won" && (
            <Button size="sm" variant="ghost" onClick={() => changeStage(d.id, "lost")} aria-label={`Mark ${d.title} as lost`}>
              <X strokeWidth={1.5} /> Lost
            </Button>
          )}
          {next ? (
            <Button size="sm" variant={next.kind === "won" ? "ink" : undefined} onClick={() => changeStage(d.id, next.id)}>
              {next.kind === "won" ? "Confirm booking" : `Move to ${next.label}`} <ArrowRight strokeWidth={1.5} />
            </Button>
          ) : (
            <Button size="sm" onClick={() => useUi.getState().openDeal(d.id)}>Open</Button>
          )}
        </span>
      </div>
    </div>
  );
}
