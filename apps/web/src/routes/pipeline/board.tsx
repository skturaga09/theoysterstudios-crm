import { fmtDay, formatCompact, STAGE_LABEL, type Stage } from "@pinnacle/shared";
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
import { memo, useEffect, useRef, useState } from "react";
import { ME_ID } from "../../data/seed";
import { useCrm } from "../../data/store";
import type { Deal } from "../../data/types";
import { changeStage } from "../../lib/actions";
import { useUi } from "../../lib/ui-store";

const COLUMNS: Stage[] = ["new", "qualified", "proposal", "negotiation", "won"];

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
  return <span ref={ref} className="font-mono text-[11.5px] text-ink-2 tnum">{formatCompact(paise)}</span>;
}

export function Board({ deals }: { deals: Deal[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byStage = (s: Stage) => deals.filter((d) => d.stage === s).sort((a, b) => a.position - b.position);
  const stageOf = (id: string | number | undefined): Stage | null => {
    if (id === undefined) return null;
    const sid = String(id);
    if (sid.startsWith("col:")) return sid.slice(4) as Stage;
    return deals.find((d) => d.id === sid)?.stage ?? null;
  };
  const totals = [...COLUMNS, "lost" as Stage].map((s) => byStage(s).reduce((a, d) => a + d.valuePaise, 0));
  const maxTotal = Math.max(...totals.slice(0, 5), 1);
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
          onDragOver: ({ over }) => (over ? `Over ${STAGE_LABEL[stageOf(over.id) ?? "new"]}.` : ""),
          onDragEnd: ({ over }) => (over ? `Moved to ${STAGE_LABEL[stageOf(over.id) ?? "new"]}.` : "Cancelled."),
          onDragCancel: () => "Cancelled.",
        },
      }}
    >
      <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
        <div className="flex min-w-max items-start gap-3">
          {COLUMNS.map((s, i) => (
            <Column key={s} stage={s} deals={byStage(s)} total={totals[i]!} share={totals[i]! / maxTotal} highlight={overStage === s && activeId !== null && active?.stage !== s} />
          ))}
          <LostColumn deals={byStage("lost")} open={lostOpen} onToggle={() => setLostOpen((o) => !o)} highlight={overStage === "lost" && activeId !== null} total={totals[5]!} />
        </div>
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

function Column({ stage, deals, total, share, highlight }: { stage: Stage; deals: Deal[]; total: number; share: number; highlight: boolean }) {
  const { setNodeRef } = useDroppable({ id: `col:${stage}` });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${STAGE_LABEL[stage]}: ${deals.length} deals`}
      className={cn(
        "flex w-[272px] shrink-0 flex-col rounded-panel bg-sunken p-2 transition-[background-color,box-shadow] duration-150",
        highlight && "bg-signal-wash shadow-[inset_0_0_0_1.5px_var(--signal)]",
      )}
    >
      <header className="px-1.5 pt-1 pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className={cn("m-0 text-[12.5px] font-medium", stage === "won" && "text-ok")}>{STAGE_LABEL[stage]}</h2>
          <span className="font-mono text-[11px] text-ink-3 tnum">{deals.length}</span>
          <span className="ml-auto"><TweenMoney paise={total} /></span>
          <button
            aria-label={`New deal in ${STAGE_LABEL[stage]}`}
            onClick={() => useUi.getState().openComposer("deal", { stage })}
            className="-mr-1 grid size-6 place-items-center rounded-control text-ink-3 hover:bg-hover hover:text-ink"
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
        </div>
        <div className="mt-2 h-[2px] w-full rounded-full bg-line">
          <motion.div
            className={cn("h-full rounded-full", stage === "won" ? "bg-ok" : "bg-ink-3")}
            initial={false}
            animate={{ width: `${Math.max(2, share * 100)}%` }}
            transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </div>
      </header>
      <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-16 flex-col gap-2">
          {deals.map((d) => (
            <SortableCard key={d.id} deal={d} />
          ))}
          {!deals.length && (
            <p className="m-0 rounded-card border border-dashed border-line-2 px-3 py-5 text-center text-[12px] text-ink-3">Drop a deal here</p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function LostColumn({ deals, open, onToggle, highlight, total }: { deals: Deal[]; open: boolean; onToggle: () => void; highlight: boolean; total: number }) {
  const { setNodeRef } = useDroppable({ id: "col:lost" });
  return (
    <section
      ref={setNodeRef}
      aria-label={`Lost: ${deals.length} deals`}
      className={cn(
        "flex shrink-0 flex-col rounded-panel border border-dashed border-line-2 p-2 transition-[width,background-color,box-shadow] duration-200",
        open ? "w-[272px]" : "w-[52px]",
        highlight && "bg-risk-wash shadow-[inset_0_0_0_1.5px_var(--risk)]",
      )}
    >
      <button onClick={onToggle} aria-expanded={open} className={cn("flex items-center gap-2 px-1 pt-1 pb-2 text-left", !open && "flex-col")}>
        {open ? <ChevronLeft size={14} strokeWidth={1.5} className="text-ink-3" /> : <ChevronRight size={14} strokeWidth={1.5} className="text-ink-3" />}
        <span className={cn("text-[12.5px] font-medium text-ink-2", !open && "[writing-mode:vertical-rl]")}>Lost</span>
        <span className="font-mono text-[11px] text-ink-3">{deals.length}</span>
        {open && <span className="ml-auto font-mono text-[11.5px] text-ink-3">{formatCompact(total)}</span>}
      </button>
      {open && (
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2 opacity-70">
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

const DealCard = memo(function DealCard({ deal, lifted }: { deal: Deal; lifted?: boolean }) {
  const company = useCrm((s) => s.companies.find((c) => c.id === deal.companyId));
  const owner = useCrm((s) => s.members.find((m) => m.id === deal.ownerId));
  const pulse = useUi((s) => s.wonPulse === deal.id);
  const overdue = deal.stage !== "won" && deal.stage !== "lost" && new Date(deal.closeAt) < new Date(new Date().toDateString());
  return (
    <article
      className={cn(
        "cursor-grab rounded-card bg-surface p-3 shadow-rest transition-[box-shadow,transform] duration-150 select-none",
        lifted ? "shadow-pop" : "hover:-translate-y-px hover:shadow-pop",
        pulse && "won-pulse",
      )}
    >
      <div className="flex items-center gap-2">
        <HealthDot health={deal.health} />
        <span className="truncate text-[13px] font-medium">{company?.name}</span>
        <ChannelChip channel={deal.channel} className="ml-auto" />
      </div>
      <div className="mt-0.5 truncate pl-4 text-[12.5px] text-ink-2">{deal.title}</div>
      <div className="mt-3 flex items-center gap-2 pl-4">
        <MoneyText paise={deal.valuePaise} className="text-[13px]" />
        <span className={cn("font-mono text-[11px]", overdue ? "text-risk" : "text-ink-3")}>{fmtDay(deal.closeAt)}</span>
        {owner && <Avatar name={owner.name} me={owner.id === ME_ID} size="sm" className="ml-auto" />}
      </div>
    </article>
  );
});
