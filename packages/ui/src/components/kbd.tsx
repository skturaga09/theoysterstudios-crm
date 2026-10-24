import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line px-1",
        "font-mono fs-10.5 leading-none text-ink-3",
        className,
      )}
      {...props}
    />
  );
}
