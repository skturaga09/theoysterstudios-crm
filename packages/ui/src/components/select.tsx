import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/** Native select, restyled. Accessible and fast; used in forms and property lists. */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <span className={cn("relative inline-flex w-full", className)}>
      <select
        className="h-[34px] w-full appearance-none rounded-control border border-transparent bg-sunken pr-8 pl-3 t-dense text-ink transition-colors duration-150 hover:border-line-2 focus-visible:border-line-2"
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={14} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-3" />
    </span>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-[84px] w-full resize-y rounded-control border border-transparent bg-sunken px-3 py-2 t-dense text-ink placeholder:text-ink-3",
        "transition-colors duration-150 hover:border-line-2 focus-visible:border-line-2 focus-visible:bg-surface",
        className,
      )}
      {...props}
    />
  );
}
