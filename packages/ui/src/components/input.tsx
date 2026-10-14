import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-[34px] w-full rounded-control border border-transparent bg-sunken px-3 t-dense text-ink",
        "placeholder:text-ink-3 transition-colors duration-150",
        "hover:border-line-2 focus-visible:border-line-2 focus-visible:bg-surface",
        className,
      )}
      {...props}
    />
  );
}
