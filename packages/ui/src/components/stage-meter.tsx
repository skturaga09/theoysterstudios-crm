import { DEFAULT_STAGES, type PipelineStage, type Stage } from "@pinnacle/shared";
import { cn } from "../lib/cn";

/**
 * One segment per stage of the deal's pipeline (Lost excluded). Past = ink, current = signal, future = line-2.
 * Won = all ok. Lost = all risk at 50%. Replaces stage badges everywhere.
 */
export function StageMeter({
  stage,
  stages = DEFAULT_STAGES,
  label = true,
  className,
}: {
  stage: Stage;
  /** The deal's business pipeline; defaults to the starting list. */
  stages?: PipelineStage[];
  label?: boolean;
  className?: string;
}) {
  const run = stages.filter((s) => s.kind !== "lost");
  const idx = run.findIndex((s) => s.id === stage);
  const name = stages.find((s) => s.id === stage)?.label ?? stage;
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
      aria-label={`Stage: ${name}${idx >= 0 ? `, ${idx + 1} of ${run.length}` : ""}`}
    >
      <span aria-hidden className="inline-flex gap-[2px]">
        {run.map((s, i) => (
          <span key={s.id} className={cn("h-1 w-3 rounded-[1px]", seg(i))} />
        ))}
      </span>
      {label && (
        <span className={cn("t-meta", stage === "lost" ? "text-ink-3" : "text-ink-2")}>{name}</span>
      )}
    </span>
  );
}
