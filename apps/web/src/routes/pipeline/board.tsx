import { fmtDay, formatCompact, type Stage, type Business, type PipelineStage } from "@pinnacle/shared";
import { Avatar, ChannelChip, cn, HealthDot, MoneyText } from "@pinnacle/ui";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { animate, motion, useReducedMotion } from "motion/react";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { ClientPhoto } from "../../components/client-photo";
import { ME_ID } from "../../data/seed";
import { useCrm } from "../../data/store";
import type { Deal } from "../../data/types";
import { changeStage } from "../../lib/actions";
import { useUi } from "../../lib/ui-store";


/** Column totals tween when deals move in or out. */
function TweenMoney({ paise }: { paise: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(paise);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || prev.current === paise) {
      el.textContent = formatCompact(paise);
      prev.current = paise;
      return;
    }
    const c = animate(prev.current, paise, { duration: 0.45, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => (el.textContent = formatCompact(Math.round(v))) });
    prev.current = paise;
    return () => c.stop();
  }, [paise, reduce]);
  return <span ref={ref} className="font-mono fs-11.5 text-ink-2 tnum">{formatCompact(paise)}</span>;
}

/** One business's pipeline: a column per stage, Lost folded at the end. */
export function Board({ deals, stages, business }: { deals: Deal[]; stages: PipelineStage[]; business: Business }) {
  // The stages being worked get full columns; Confirmed and Lost fold into slim rails at the end (both still take a drop).
  const COLUMNS = stages.filter((s) => s.kind === "open");
  const WON = stages.find((s) => s.kind === "won");
  const label = (id: Stage) => stages.find((s) => s.id === id)?.label ?? id;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const [allWins, setAllWins] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  // The board takes the height left under the header; each column scrolls on its own, so the page doesn't.
  const frame = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    const fit = () => frame.current && setHeight(Math.max(420, window.innerHeight - frame.current.getBoundingClientRect().top - 36));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const monthStart = `${istDay(new Date().toISOString()).slice(0, 7)}-01`;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byStage = (s: Stage) => deals.filter((d) => d.stage === s).sort((a, b) => a.position - b.position);
  // Confirmed piles up for ever: this month's wins unless asked for all of them.
  const shown = (s: PipelineStage) => (s.kind === "won" && !allWins ? byStage(s.id).filter((d) => !d.wonAt || istDay(d.wonAt) >= monthStart) : byStage(s.id));
  const stageOf = (id: string | number | undefined): Stage | null => {
    if (id === undefined) return null;
    const sid = String(id);
    if (sid.startsWith("col:")) return sid.slice(4) as Stage;
    return deals.find((d) => d.id === sid)?.stage ?? null;
  };
  const totals = [...COLUMNS.map((s) => s.id), "lost" as Stage].map((s) => byStage(s).reduce((a, d) => a + d.valuePaise, 0));
  const wonDeals = WON ? shown(WON) : [];
  const maxTotal = Math.max(...totals.slice(0, -1), 1);
  const active = deals.find((d) => d.id === activeId);

  const onStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onOver = (e: DragOverEvent) => setOverStage(stageOf(e.over?.id));
  const onEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const target = stageOf(e.over?.id);
    setActiveId(null);
    setOverStage(null);
    if (!target) return;
    const col = byStage(target).filter((d) => d.id !== id);
    const overId = e.over ? String(e.over.id) : "";
    const idx = overId.startsWith("col:") ? col.length : Math.max(0, col.findIndex((d) => d.id === overId));
    changeStage(id, target, idx);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onStart}
      onDragOver={onOver}
      onDragEnd={onEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOverStage(null);
      }}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${deals.find((d) => d.id === active.id)?.title}.`,
          onDragOver: ({ over }) => (over ? `Over ${label(stageOf(over.id) ?? "new")}.` : ""),
          onDragEnd: ({ over }) => (over ? `Moved to ${label(stageOf(over.id) ?? "new")}.` : "Cancelled."),
          onDragCancel: () => "Cancelled.",
        },
      }}
    >
      <StageStrip stages={COLUMNS} counts={COLUMNS.map((s) => byStage(s.id).length)} totals={totals.slice(0, -1)} />
      <div ref={frame} style={{ height }} className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:-mx-8 md:snap-none md:px-8">
        {COLUMNS.map((s, i) => (
          <Column
            key={s.id}
            stage={s.id}
            name={s.label}
            business={business}
            deals={shown(s)}
            total={totals[i]!}
            share={totals[i]! / maxTotal}
            highlight={overStage === s.id && activeId !== null && active?.stage !== s.id}
          />
        ))}
        {WON && (
          <Rail
            stage={WON.id}
            name={WON.label}
            tone="ok"
            deals={wonDeals}
            open={wonOpen}
            onToggle={() => setWonOpen((o) => !o)}
            highlight={overStage === WON.id && activeId !== null && active?.stage !== WON.id}
            total={wonDeals.reduce((a, d) => a + d.valuePaise, 0)}
            note={<button onClick={() => setAllWins((v) => !v)} className="fs-11 text-ink-3 hover:text-ink">{allWins ? "Show this month only" : `This month · show all ${byStage(WON.id).length}`}</button>}
          />
        )}
        <Rail stage="lost" name="Lost" tone="risk" deals={byStage("lost")} open={lostOpen} onToggle={() => setLostOpen((o) => !o)} highlight={overStage === "lost" && activeId !== null} total={totals.at(-1)!} />
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
        {active ? (
          <div style={{ transform: "rotate(1.5deg)" }} className="cursor-grabbing">
            <DealCard deal={active} lifted />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ stage, name, business, deals, total, share, highlight, note }: { stage: Stage; name: string; business: Business; deals: Deal[]; total: number; share: number; highlight: boolean; note?: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `col:${stage}` });
  return (
    <section
      ref={setNodeRef}
      id={`stage-${stage}`}
      aria-label={`${name}: ${deals.length} deals`}
      className={cn(
        "flex h-full w-[82vw] shrink-0 snap-start flex-col rounded-[18px] bg-sunken p-2 transition-[background-color,box-shadow] duration-150 md:w-auto md:min-w-[180px] md:flex-1 md:shrink",
        highlight && "bg-signal-wash shadow-[inset_0_0_0_1.5px_var(--signal)]",
      )}
    >
      <header className="px-1.5 pt-1 pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className={cn("m-0 min-w-0 truncate fs-12.5 font-medium", stage === "won" && "text-ok")} title={name}>{name}</h2>
          <span className="font-mono fs-11 text-ink-3 tnum">{deals.length}</span>
          <span className="ml-auto whitespace-nowrap"><TweenMoney paise={total} /></span>
          <button
            aria-label={`New lead in ${name}`}
            onClick={() => useUi.getState().openComposer("deal", { stage, business })}
            className="-mr-1 grid size-6 place-items-center rounded-control text-ink-3 hover:bg-hover hover:text-ink"
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
        </div>
        <div className="mt-2 h-[2px] w-full rounded-full bg-line">
          <motion.div
            className={cn("h-full rounded-full", stage === "won" ? "bg-ok" : "bg-signal")}
            initial={false}
            animate={{ width: `${Math.max(2, share * 100)}%` }}
            transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </div>
        {note && <div className="mt-1.5">{note}</div>}
      </header>
      <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <div className="-mx-1 flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-1">
          {deals.map((d) => (
            <SortableCard key={d.id} deal={d} />
          ))}
          {!deals.length && (
            <p className="m-0 rounded-card border border-dashed border-line-2 px-3 py-5 text-center fs-12 text-ink-3">Drop a deal here</p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

/** Confirmed or Lost: a slim rail that still takes a drop, opening into a column of its deals. */
function Rail({ stage, name, tone, deals, open, onToggle, highlight, total, note }: { stage: Stage; name: string; tone: "ok" | "risk"; deals: Deal[]; open: boolean; onToggle: () => void; highlight: boolean; total: number; note?: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `col:${stage}` });
  return (
    <section
      ref={setNodeRef}
      id={`stage-${stage}`}
      aria-label={`${name}: ${deals.length} deals`}
      className={cn(
        "flex h-full shrink-0 flex-col rounded-[18px] border border-dashed p-2 transition-[width,background-color,box-shadow] duration-200",
        tone === "ok" ? "border-ok/40" : "border-line-2",
        open ? "w-[240px]" : "w-[52px]",
        highlight && (tone === "ok" ? "bg-ok-wash shadow-[inset_0_0_0_1.5px_var(--ok)]" : "bg-risk-wash shadow-[inset_0_0_0_1.5px_var(--risk)]"),
      )}
    >
      <button onClick={onToggle} aria-expanded={open} className={cn("flex items-center gap-2 px-1 pt-1 pb-2 text-left", !open && "flex-col")}>
        {open ? <ChevronLeft size={14} strokeWidth={1.5} className="text-ink-3" /> : <ChevronRight size={14} strokeWidth={1.5} className="text-ink-3" />}
        <span className={cn("fs-12.5 font-medium", tone === "ok" ? "text-ok" : "text-ink-2", !open && "[writing-mode:vertical-rl]")}>{name}</span>
        <span className="font-mono fs-11 text-ink-3">{deals.length}</span>
        {open && <span className="ml-auto font-mono fs-11.5 text-ink-3">{formatCompact(total)}</span>}
      </button>
      {open && note && <div className="px-1 pb-2">{note}</div>}
      {open && (
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          <div className={cn("flex flex-1 flex-col gap-2 overflow-y-auto", tone === "risk" && "opacity-70")}>
            {deals.map((d) => <SortableCard key={d.id} deal={d} />)}
          </div>
        </SortableContext>
      )}
    </section>
  );
}

function SortableCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id });
  return (
    <motion.div layout="position" transition={{ type: "spring", stiffness: 520, damping: 38 }}>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        {...attributes}
        {...listeners}
        aria-roledescription="Draggable deal"
        className={cn("touch-manipulation rounded-card", isDragging && "opacity-35")}
        onClick={() => useUi.getState().openDeal(deal.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter") useUi.getState().openDeal(deal.id);
          listeners?.onKeyDown?.(e);
        }}
      >
        <DealCard deal={deal} />
      </div>
    </motion.div>
  );
}

const istDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const DealCard = memo(function DealCard({ deal, lifted }: { deal: Deal; lifted?: boolean }) {
  const company = useCrm((s) => s.companies.find((c) => c.id === deal.companyId));
  const owner = useCrm((s) => s.members.find((m) => m.id === deal.ownerId));
  const pulse = useUi((s) => s.wonPulse === deal.id);
  const overdue = deal.stage !== "won" && deal.stage !== "lost" && new Date(deal.closeAt) < new Date(new Date().toDateString());
  const today = istDay(new Date().toISOString());
  const followUp = deal.nextFollowUpAt && istDay(deal.nextFollowUpAt) <= today ? (istDay(deal.nextFollowUpAt) < today ? "risk" : "warn") : undefined;
  return (
    <article
      className={cn(
        "cursor-grab rounded-[14px] bg-surface px-2.5 py-2 shadow-rest transition-[box-shadow,transform] duration-150 select-none",
        lifted ? "shadow-pop" : "hover:-translate-y-px hover:shadow-pop",
        pulse && "won-pulse",
      )}
    >
      <div className="flex items-center gap-2">
        <ClientPhoto company={company} size="sm" />
        <span className="min-w-0 flex-1 truncate fs-13 font-medium" title={company?.name}>{company?.name ?? deal.title}</span>
        <HealthDot health={deal.health} />
      </div>
      <div className="mt-0.5 truncate pl-8 fs-11.5 text-ink-3" title={deal.title}>{deal.title}</div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <MoneyText paise={deal.valuePaise} className="fs-12.5 whitespace-nowrap" />
        <span className={cn("font-mono fs-10.5 whitespace-nowrap", overdue ? "text-risk" : "text-ink-3")}>{fmtDay(deal.eventDate ?? deal.closeAt)}</span>
        {followUp && <span className={cn("size-1.5 rounded-full", followUp === "risk" ? "bg-risk" : "bg-warn")} title={`Follow up ${fmtDay(deal.nextFollowUpAt!)}`} />}
        <span className="ml-auto flex items-center gap-1">
          <ChannelChip channel={deal.channel} className="h-4 min-w-4" />
          {owner && <Avatar name={owner.name} me={owner.id === ME_ID} size="sm" />}
        </span>
      </div>
    </article>
  );
});

/** Every stage's share of the open pipeline in one bar; click a stage to jump to its column. */
function StageStrip({ stages, counts, totals }: { stages: PipelineStage[]; counts: number[]; totals: number[] }) {
  const sum = totals.reduce((a, b) => a + b, 0) || 1;
  const go = (id: Stage) => {
    const el = document.getElementById(`stage-${id}`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    el?.animate([{ boxShadow: "inset 0 0 0 2px var(--signal)" }, { boxShadow: "inset 0 0 0 0 transparent" }], { duration: 900 });
  };
  return (
    <div className="mb-3 flex h-9 w-full gap-1 overflow-hidden rounded-full bg-sunken p-1" role="list" aria-label="Pipeline by stage">
      {stages.map((st, i) => (
        <button
          key={st.id}
          role="listitem"
          onClick={() => go(st.id)}
          title={`${st.label}: ${counts[i]} · ${formatCompact(totals[i]!)}`}
          style={{ flexGrow: Math.max(0.6, (totals[i]! / sum) * 10), opacity: st.kind === "won" ? 1 : 0.55 + (0.45 * (i + 1)) / stages.length }}
          className={cn("flex min-w-0 basis-0 items-center justify-center gap-1.5 rounded-full px-2 fs-11.5 transition-[filter] hover:brightness-110", st.kind === "won" ? "bg-ok text-white" : "bg-signal text-white")}
        >
          <span className="truncate">{st.label}</span>
          <span className="font-mono opacity-80">{counts[i]}</span>
        </button>
      ))}
    </div>
  );
}
