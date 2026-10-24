import { cn } from "@pinnacle/ui";
import type { Company } from "../data/types";

const SIZE = { sm: "size-6 fs-10", md: "size-9 fs-13", lg: "size-14 fs-20" } as const;

/** A client's photo in a circle, or their initials on their business colour when there's no photo yet. */
export function ClientPhoto({ company, size = "md", className }: { company?: Company; size?: keyof typeof SIZE; className?: string }) {
  if (!company) return null;
  const base = cn("shrink-0 rounded-full", SIZE[size], className);
  if (company.photo) return <img src={company.photo} alt="" loading="lazy" className={cn(base, "object-cover")} />;
  const initials = company.name.split(/\s+/).filter((w) => /\w/.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span aria-hidden className={cn(base, "grid place-items-center font-medium text-white", company.business === "marketing" ? "bg-ok" : "bg-signal")}>
      {initials}
    </span>
  );
}
