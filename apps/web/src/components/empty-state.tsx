import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Says what will appear here and how to add the first item. */
export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 border-t border-line py-10">
      <Icon size={20} strokeWidth={1.5} className="text-ink-3" aria-hidden />
      <h2 className="t-sheet m-0">{title}</h2>
      <p className="t-body m-0 max-w-[52ch] text-ink-2">{body}</p>
      {action}
    </div>
  );
}
