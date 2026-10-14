import { STAGES, STAGE_LABEL, type Stage } from "@pinnacle/shared";
import { cn } from "@pinnacle/ui";
import { changeStage } from "../../lib/actions";

/** Clickable five-step stage bar used in the deal sheet and record page. */
export function StageBar({ dealId, stage }: { dealId: string; stage: Stage }) {
  const idx = STAGES.indexOf(stage as (typeof STAGES)[number]);
  return (
    <div role="group" aria-label="Stage" className="grid grid-cols-5 gap-1">
      {STAGES.map((s, i) => {
        const tone =
          stage === "won" ? "bg-ok" : stage === "lost" ? "bg-risk/50" : i < idx ? "bg-ink" : i === idx ? "bg-grad" : "bg-line-2";
        const current = s === stage;
        return (
          <button
            key={s}
            aria-pressed={current}
            onClick={() => changeStage(dealId, s)}
            className="group flex flex-col gap-1.5 rounded-[4px] pt-1 text-left"
          >
            <span className={cn("h-1.5 w-full rounded-[2px] transition-[filter] duration-150 group-hover:brightness-90", tone)} />
            <span className={cn("text-[11.5px]", current ? "font-medium text-ink" : "text-ink-3 group-hover:text-ink-2")}>
              {STAGE_LABEL[s]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
