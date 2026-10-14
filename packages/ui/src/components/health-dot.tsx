import { HEALTH_LABEL, type Health } from "@pinnacle/shared";
import { cn } from "../lib/cn";
import { Tooltip } from "./tooltip";

const tone: Record<Health, string> = { ok: "bg-ok", warn: "bg-warn", risk: "bg-risk" };

export function HealthDot({ health, className }: { health: Health; className?: string }) {
  return (
    <Tooltip content={HEALTH_LABEL[health]}>
      <span
        tabIndex={0}
        role="img"
        aria-label={HEALTH_LABEL[health]}
        className={cn("inline-block size-2 shrink-0 rounded-full", tone[health], className)}
      />
    </Tooltip>
  );
}
