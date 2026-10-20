import { formatFull, parseRupees } from "@pinnacle/shared";
import { cn } from "@pinnacle/ui";
import type { ComponentProps } from "react";

/**
 * A rupee amount, typed exactly as people say it: "58,950", "1,18,000.50" — or shorthand like "2.5L", "75k".
 * Shows what it read (₹2,50,000) under the field when the typing differs, so a slip is caught before saving.
 */
export function AmountInput({ value, onValue, hint = true, className, ...props }: Omit<ComponentProps<"input">, "value" | "onChange"> & { value: string; onValue: (text: string) => void; hint?: boolean }) {
  const paise = value.trim() ? parseRupees(value) : undefined;
  const bad = value.trim() !== "" && paise === undefined;
  const plain = value.replace(/[₹,\s]/g, "");
  const showRead = hint && paise !== undefined && !/^\d+(\.\d+)?$/.test(plain); // shorthand typed: say what it means
  return (
    <span className={cn("flex flex-col gap-0.5", className)}>
      <span className="flex items-center rounded-control border border-transparent bg-sunken pl-3 focus-within:border-line-2 focus-within:bg-surface">
        <span className="font-mono text-[12.5px] text-ink-3">₹</span>
        <input inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onValue(e.target.value)} aria-invalid={bad || undefined} className="h-[34px] w-full min-w-0 bg-transparent px-1.5 font-mono text-[12.5px] tnum text-ink outline-none placeholder:text-ink-3" {...props} />
      </span>
      {hint && bad && <span className="text-[11px] text-risk">Enter an amount like 58,950</span>}
      {showRead && <span className="font-mono text-[11px] text-ink-3">= {formatFull(paise!)}</span>}
    </span>
  );
}
