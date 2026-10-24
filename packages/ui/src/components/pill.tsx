import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export type PillTone = "ok" | "warn" | "risk" | "new" | "mute";

const tones: Record<PillTone, string> = {
  ok: "bg-ok-wash text-ok",
  warn: "bg-warn-wash text-warn",
  risk: "bg-risk-wash text-risk",
  new: "bg-signal-wash text-signal",
  mute: "bg-sunken text-ink-2",
};

/** The only badge in the app. Five tones, nothing else. */
export function Pill({
  tone = "mute",
  dot,
  className,
  children,
  ...props
}: ComponentProps<"span"> & { tone?: PillTone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-chip px-2 fs-11.5 font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
