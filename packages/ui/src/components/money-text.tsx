import { formatCompact, formatFull, type Paise } from "@pinnacle/shared";
import { useState } from "react";
import { cn } from "../lib/cn";

/** Lakh/crore by default; full ₹13,00,000 on hover or focus. */
export function MoneyText({
  paise,
  full = false,
  mono = true,
  className,
}: {
  paise: Paise;
  /** Always show the full amount (detail views). */
  full?: boolean;
  mono?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const show = full || expanded;
  return (
    <span
      tabIndex={full ? undefined : 0}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={() => setExpanded(false)}
      aria-label={formatFull(paise)}
      className={cn("tnum whitespace-nowrap", mono && "font-mono", className)}
    >
      {show ? formatFull(paise) : formatCompact(paise)}
    </span>
  );
}
