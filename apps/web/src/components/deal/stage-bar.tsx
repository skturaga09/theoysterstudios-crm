import type { Business, Stage } from "@pinnacle/shared";
import { cn } from "@pinnacle/ui";
import { runFor } from "../../data/pipeline";
import { useCrm } from "../../data/store";
import { changeStage } from "../../lib/actions";

/** Clickable stage bar (the deal's business pipeline, without Lost) used in the deal sheet and record page. */
export function StageBar({ dealId, stage, business }: { dealId: string; stage: Stage; business?: Business }) {
  const run = runFor(useCrm((s) => s.pipelines), business);
  const idx = run.findIndex((s) => s.id === stage);
  return (
    <div role="group" aria-label="Stage" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${run.length}, minmax(0, 1fr))` }}>
      {run.map((s, i) => {
        const tone = stage === "won" ? "bg-ok" : stage === "lost" ? "bg-risk/50" : i < idx ? "bg-ink" : i === idx ? "bg-grad" : "bg-line-2";
        const current = s.id === stage;
        return (
          <button key={s.id} aria-pressed={current} onClick={() => changeStage(dealId, s.id)} className="group flex min-w-0 flex-col gap-1.5 rounded-[4px] pt-1 text-left">
            <span className={cn("h-1.5 w-full rounded-[2px] transition-[filter] duration-150 group-hover:brightness-90", tone)} />
            <span className={cn("truncate fs-11.5", current ? "font-medium text-ink" : "text-ink-3 group-hover:text-ink-2")}>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
