import { cn } from "../lib/cn";

const sizes = { sm: "size-5 text-[9px]", md: "size-6 text-[10px]", lg: "size-8 text-[11.5px]" } as const;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/** Initials on sunken with inset hairline. Current user is inverted. No per-person colours. */
export function Avatar({
  name,
  me = false,
  size = "md",
  className,
}: {
  name: string;
  me?: boolean;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      title={name}
      aria-label={name}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-medium tracking-[0.02em] select-none",
        me ? "bg-ink text-on-ink" : "bg-sunken text-ink-2 shadow-[inset_0_0_0_1px_var(--line-2)]",
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
