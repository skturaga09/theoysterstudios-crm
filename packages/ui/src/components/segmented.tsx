import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/** Two-to-four way toggle (Board / Table, 30 days / Quarter). */
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
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-control bg-sunken p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 fs-12.5 transition-[background-color,color,box-shadow] duration-150 [&_svg]:size-3.5",
            value === o.value ? "bg-surface font-medium text-ink shadow-rest" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
