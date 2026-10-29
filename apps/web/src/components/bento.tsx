import { formatCompact } from "@pinnacle/shared";
import { cn, CountUp } from "@pinnacle/ui";
import { motion } from "motion/react";
import type { ReactNode } from "react";

/* Bento tiles: rounded cards that rise in, one solid highlight, a dial and bars (Owner dashboard, Profit & loss). */
export const tile = "rounded-[20px] border border-line bg-surface p-5 shadow-rest";
export const Tile = ({ i, className, children }: { i: number; className?: string; children: ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: i * 0.06 }}
    whileHover={{ y: -3 }}
    className={cn(tile, "transition-shadow duration-300 hover:shadow-pop", className)}
  >
    {children}
  </motion.div>
);
export const Label = ({ children, light }: { children: ReactNode; light?: boolean }) => <p className={cn("t-eyebrow m-0", light ? "text-white/80" : "text-ink-3")}>{children}</p>;
export const Big = ({ paise, value, className }: { paise?: number; value?: number; className?: string }) => (
  <p className={cn("m-0 mt-2 font-serif fs-44 leading-none tnum", className)}>
    {paise !== undefined ? <CountUp value={paise} format={formatCompact} /> : <CountUp value={value ?? 0} />}
  </p>
);

/** A half-circle dial for a percentage, drawn in on load. */
export function Dial({ pct, label = `${pct}% of decided leads confirmed` }: { pct: number; label?: string }) {
  const r = 52;
  const arc = Math.PI * r;
  return (
    <svg viewBox="0 0 128 72" className="w-full max-w-[180px]" role="img" aria-label={label}>
      <path d={`M 12 64 A ${r} ${r} 0 0 1 116 64`} fill="none" stroke="var(--sunken)" strokeWidth="12" strokeLinecap="round" />
      <motion.path
        d={`M 12 64 A ${r} ${r} 0 0 1 116 64`}
        fill="none"
        stroke="var(--signal)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={arc}
        initial={{ strokeDashoffset: arc }}
        animate={{ strokeDashoffset: arc * (1 - Math.min(100, Math.max(0, pct)) / 100) }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      />
      <text x="64" y="60" textAnchor="middle" className="font-serif" fontSize="22" fill="var(--ink)">{pct}%</text>
    </svg>
  );
}

