import { motion, type HTMLMotionProps } from "motion/react";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/** Cards are for objects (a deal). Lists and tables sit flat — don't wrap them in Card. */
export function Card({ className, lift = false, ...props }: HTMLMotionProps<"div"> & { lift?: boolean }) {
  return (
    <motion.div
      whileHover={lift ? { y: -1, boxShadow: "var(--pop)" } : undefined}
      transition={{ duration: 0.15 }}
      className={cn("rounded-card bg-surface shadow-rest", className)}
      {...props}
    />
  );
}

/** Panels group a region of a page: hairline, 10px radius, no shadow. */
export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-panel border border-line bg-surface", className)} {...props} />;
}

export function PanelHeader({
  title,
  meta,
  action,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-center gap-3 border-b border-line px-4 py-3", className)}>
      <h3 className="t-eyebrow text-ink-2">{title}</h3>
      {meta && <span className="t-meta text-ink-3">{meta}</span>}
      {action && <div className="ml-auto">{action}</div>}
    </header>
  );
}

/** Mono uppercase label used above sections and in property lists. */
export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("t-eyebrow text-ink-3", className)} {...props} />;
}
