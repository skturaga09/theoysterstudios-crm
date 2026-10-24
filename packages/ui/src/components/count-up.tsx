import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { dur, easeOutQuart } from "../motion";

/** Counts from 0 to `value` over 900ms, quartic ease-out. Reduced motion → final value. `format` shapes each frame (e.g. money). */
export function CountUp({
  value,
  decimals = 0,
  run = true,
  className,
  format,
}: {
  value: number;
  decimals?: number;
  run?: boolean;
  className?: string;
  format?: (v: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const show = useRef(format ?? ((v: number) => v.toFixed(decimals)));
  show.current = format ?? ((v: number) => v.toFixed(decimals)); // a new function each render mustn't restart the count
  const final = show.current(value);

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
      onUpdate: (v) => (el.textContent = show.current(decimals ? v : Math.round(v))),
    });
    return () => controls.stop();
  }, [value, decimals, run, reduce, final]);

  return (
    <span ref={ref} className={className}>
      {run && !reduce ? show.current(0) : final}
    </span>
  );
}
