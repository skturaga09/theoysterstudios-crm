import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/** Flat ledger table: no zebra, hairline rows, mono uppercase headers, 44px rows. */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full border-collapse t-dense", className)} {...props} />
    </div>
  );
}
export const THead = ({ className, ...p }: ComponentProps<"thead">) => <thead className={cn(className)} {...p} />;
export const TBody = ({ className, ...p }: ComponentProps<"tbody">) => <tbody className={cn(className)} {...p} />;

export function TR({ className, interactive = true, ...props }: ComponentProps<"tr"> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        "border-b border-line last:border-b-0 transition-colors duration-150",
        interactive && "cursor-pointer hover:bg-hover",
        className,
      )}
      {...props}
    />
  );
}

export function TH({ className, align = "left", ...props }: ComponentProps<"th"> & { align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={cn(
        "h-9 border-b border-line px-3 font-mono fs-10.5 font-medium tracking-[0.08em] text-ink-3 uppercase whitespace-nowrap",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  align = "left",
  numeric,
  ...props
}: ComponentProps<"td"> & { align?: "left" | "right"; numeric?: boolean }) {
  return (
    <td
      className={cn(
        "h-11 px-3 align-middle whitespace-nowrap",
        align === "right" && "text-right",
        numeric && "font-mono tnum",
        className,
      )}
      {...props}
    />
  );
}
