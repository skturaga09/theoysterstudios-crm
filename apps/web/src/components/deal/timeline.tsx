import { fmtAgo } from "@pinnacle/shared";
import { ArrowRight, Calendar, Check, FileText, Mail, Phone, Sparkles, SquarePen, Trophy } from "lucide-react";
import type { Activity } from "../../data/types";
import { useCrm } from "../../data/store";

const ICON = {
  stage: ArrowRight,
  email: Mail,
  call: Phone,
  meeting: Calendar,
  note: SquarePen,
  task: Check,
  lead: Sparkles,
  won: Trophy,
  invoice: FileText,
} as const;

export function Timeline({ items, showSubject = false }: { items: Activity[]; showSubject?: boolean }) {
  const members = useCrm((s) => s.members);
  const deals = useCrm((s) => s.deals);
  if (!items.length) return <p className="t-meta m-0 py-4 text-ink-3">No activity yet. Notes, emails, calls and stage changes will appear here.</p>;
  return (
    <ol className="m-0 list-none p-0">
      {items.map((a, i) => {
        const Icon = ICON[a.type];
        const who = members.find((m) => m.id === a.actorId);
        const deal = showSubject ? deals.find((d) => d.id === a.dealId) : undefined;
        return (
          <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < items.length - 1 && <span aria-hidden className="absolute top-7 bottom-0 left-[11px] w-px bg-line" />}
            <span className={`grid size-6 shrink-0 place-items-center rounded-full border border-line bg-surface ${a.type === "won" ? "text-ok" : "text-ink-3"}`}>
              <Icon size={12} strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="t-dense m-0 text-ink-2">
                <span className="font-medium text-ink">{who?.name ?? (a.actorId === "support" ? "Support" : "Someone")}</span> {a.text}
                {deal && <span className="text-ink-3"> · {deal.title}</span>}
              </p>
              <p className="m-0 mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-ink-3">{fmtAgo(a.at)}</p>
              {a.body && <p className="t-dense m-0 mt-2 rounded-card bg-sunken px-3 py-2 whitespace-pre-line text-ink-2">{a.body}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
