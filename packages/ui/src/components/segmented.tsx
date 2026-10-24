import { LayoutGroup, motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { spring } from "../motion";

/** Two-to-four way toggle (Board / Table, 30 days / Quarter). The selected pill glides to the choice. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}) {
  const group = useId();
  return (
    <LayoutGroup id={group}>
      <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-control bg-sunken p-0.5", className)}>
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative isolate inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 fs-12.5 transition-colors duration-150 [&_svg]:size-3.5",
              value === o.value ? "font-medium text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {value === o.value && <motion.span layoutId="segmented-pill" aria-hidden className="absolute inset-0 -z-[1] rounded-[5px] bg-surface shadow-rest" transition={spring.snappy} />}
            {o.label}
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}
