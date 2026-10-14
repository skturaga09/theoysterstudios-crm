import { motion } from "motion/react";
import { cn } from "../lib/cn";

/** Tick draws on (300ms). Pair with <StrikeText> for completed tasks. */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors duration-150",
        checked ? "border-ink bg-ink text-on-ink" : "border-line-2 bg-surface hover:border-ink-3",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="size-3" aria-hidden>
        <motion.path
          d="M3.5 8.5 6.5 11.5 12.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
    </button>
  );
}

/** Strikethrough that grows left → right over 350ms. */
export function StrikeText({ done, children, className }: { done: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("relative inline-block transition-colors duration-300", done ? "text-ink-3" : "text-ink", className)}>
      {children}
      <motion.span
        aria-hidden
        className="absolute top-1/2 left-0 h-px w-full origin-left bg-current"
        initial={false}
        animate={{ scaleX: done ? 1 : 0 }}
        transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
      />
    </span>
  );
}
