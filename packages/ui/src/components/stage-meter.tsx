import { STAGES, STAGE_LABEL, type Stage } from "@pinnacle/shared";
import { cn } from "../lib/cn";

/**
 * Five segments, New → Won. Past = ink, current = signal, future = line-2.
 * Won = all ok. Lost = all risk at 50%. Replaces stage badges everywhere.
 */
export function StageMeter({
  stage,
  label = true,
  className,
}: {
  stage: Stage;
  label?: boolean;
  className?: string;
}) {
  const idx = STAGES.indexOf(stage as (typeof STAGES)[number]);
  const seg = (i: number) => {
    if (stage === "won") return "bg-ok";
    if (stage === "lost") return "bg-risk/50";
    if (i < idx) return "bg-ink";
    if (i === idx) return "bg-grad";
    return "bg-line-2";
  };
  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      role="img"
      aria-label={`Stage: ${STAGE_LABEL[stage]}${idx >= 0 ? `, ${idx + 1} of ${STAGES.length}` : ""}`}
    >
      <span aria-hidden className="inline-flex gap-[2px]">
        {STAGES.map((s, i) => (
          <span key={s} className={cn("h-1 w-3 rounded-[1px]", seg(i))} />
        ))}
      </span>
      {label && (
        <span className={cn("t-meta", stage === "lost" ? "text-ink-3" : "text-ink-2")}>{STAGE_LABEL[stage]}</span>
      )}
    </span>
  );
}
