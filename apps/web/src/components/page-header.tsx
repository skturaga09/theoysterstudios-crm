import { cn, CountUp } from "@pinnacle/ui";
import type { ReactNode } from "react";

/** A number counts up from zero; `format` turns it into text (e.g. ₹75.7 L). */
type Stat = { label: string; value: number; format?: (v: number) => string; tone?: "signal" | "ok" | "risk" };
const STAT_TONE = { signal: "text-signal", ok: "text-ok", risk: "text-risk" } as const;

/** Page title, on a coloured band by default (`banner={false}` for a plain one) (studio rose into marketing teal) with optional headline numbers. */
export function PageHeader({ eyebrow, title, sub, actions, banner = true, stats, media }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; banner?: boolean; stats?: Stat[]; media?: ReactNode }) {
  return (
    <header
      className={cn("mb-8 flex flex-wrap items-end gap-4", banner && "relative overflow-hidden rounded-card px-6 py-6 md:px-8")}
      style={banner ? { background: "linear-gradient(120deg, color-mix(in srgb, var(--signal) 22%, var(--surface)), color-mix(in srgb, var(--ok) 18%, var(--surface)))" } : undefined}
    >
      {media}
      <div className="min-w-0 flex-1 basis-[280px]">
        {eyebrow && <p className={cn("t-eyebrow m-0 mb-3", banner ? "text-ink-2" : "text-ink-3")}>{eyebrow}</p>}
        <h1 className="t-title m-0">{title}</h1>
        {sub && <p className="t-body m-0 mt-2 max-w-[60ch] text-ink-2">{sub}</p>}
        {!!stats?.length && (
          <dl className="m-0 mt-5 flex flex-wrap gap-x-8 gap-y-3">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="t-eyebrow text-ink-2">{s.label}</dt>
                <dd className={cn("m-0 mt-1 font-serif fs-30 leading-none tnum", s.tone && STAT_TONE[s.tone])}><CountUp value={s.value} format={s.format} /></dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
