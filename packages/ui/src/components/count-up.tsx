import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { dur, easeOutQuart } from "../motion";

/** Counts from 0 to `value` over 900ms, quartic ease-out. Reduced motion → final value. */
export function CountUp({
  value,
  decimals = 0,
  run = true,
  className,
}: {
  value: number;
  decimals?: number;
  run?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const final = value.toFixed(decimals);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!run || reduce) {
      el.textContent = final;
      return;
    }
    const controls = animate(0, value, {
      duration: dur.count,
      ease: easeOutQuart,
      onUpdate: (v) => (el.textContent = v.toFixed(decimals)),
    });
    return () => controls.stop();
  }, [value, decimals, run, reduce, final]);

  return (
    <span ref={ref} className={className}>
      {run && !reduce ? (0).toFixed(decimals) : final}
    </span>
  );
}
