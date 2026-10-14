import { HEALTH_LABEL } from "@pinnacle/shared";
import { Avatar, Button, cn, Tooltip, useTheme } from "@pinnacle/ui";
import { signOut } from "firebase/auth";
import { LogOut, Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { NavLink } from "react-router";
import { invoiceStatus, isOpen, taskGroup } from "../data/derive";
import { useCrm, useMe } from "../data/store";
import { auth } from "../lib/firebase";
import { NAV, SIGNAL_COUNT, type CountKey } from "./nav";

const dot = { ok: "bg-ok", warn: "bg-warn", risk: "bg-risk" } as const;
export const fmtMin = (m: number) => (m < 1 ? "now" : m < 60 ? `${m}m` : m < 60 * 24 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`);

function useCounts(): Record<CountKey, number> {
  const s = useCrm();
  return {
    inbox: s.conversations.filter((c) => c.unread).length,
    pipeline: s.deals.filter(isOpen).length,
    tasks: s.tasks.filter((t) => ["overdue", "today"].includes(taskGroup(t))).length,
    companies: s.companies.length,
    contacts: s.contacts.length,
    invoices: s.invoices.filter((i) => invoiceStatus(i) === "overdue").length,
  };
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const toggle = useTheme((s) => s.toggle);
  const me = useMe();
  const studioName = useCrm((s) => s.workspace.studioName);
  const channels = useCrm((s) => s.channels);
  const counts = useCounts();
  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex h-[52px] items-center gap-2.5 px-4">
        <img src="/logo-mark.png" alt="" className="size-[28px] shrink-0 object-contain" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13.5px] font-semibold">{studioName}</div>
          <div className="font-mono text-[10.5px] tracking-[0.04em] text-ink-3">CRM</div>
        </div>
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-2.5 pt-1 pb-4">
        {NAV.map((section, si) => (
          <div key={si} className={cn(si > 0 && "mt-5")}>
            {section.label && <div className="t-eyebrow px-2.5 pb-2 text-ink-3">{section.label}</div>}
            <ul className="m-0 flex list-none flex-col gap-px p-0">
              {section.items.map(({ to, label, icon: Icon, count }) => {
                const n = count ? counts[count] : undefined;
                return (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={to === "/"}
                      viewTransition
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "flex h-8 items-center gap-2.5 rounded-control px-2.5 t-dense transition-colors duration-150",
                          isActive ? "bg-surface font-medium text-ink shadow-rest" : "text-ink-2 hover:bg-hover hover:text-ink",
                        )
                      }
                    >
                      <Icon size={16} strokeWidth={1.5} className="shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{label}</span>
                      {n !== undefined && n > 0 && (
                        <span className="relative h-4 overflow-hidden">
                          <AnimatePresence initial={false} mode="popLayout">
                            <motion.span
                              key={n}
                              initial={{ y: 10, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              exit={{ y: -10, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className={cn(
                                "block font-mono text-[11px] leading-4 tnum",
                                SIGNAL_COUNT.has(to) ? "font-medium text-signal" : "text-ink-3",
                              )}
                            >
                              {n}
                            </motion.span>
                          </AnimatePresence>
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="mt-5">
          <NavLink to="/settings/integrations" onClick={onNavigate} className="t-eyebrow block px-2.5 pb-2 text-ink-3 hover:text-ink-2">
            Channels
          </NavLink>
          <ul className="m-0 flex list-none flex-col p-0">
            {!channels.length && (
              <li className="px-2.5 py-1 text-[12px] text-ink-3">
                <NavLink to="/settings/integrations" onClick={onNavigate} className="hover:text-ink-2">None connected yet</NavLink>
              </li>
            )}
            {channels.map((c) => (
              <li key={c.channel} className="flex h-7 items-center gap-2.5 px-2.5 text-[12.5px] text-ink-2">
                <Tooltip content={c.note ?? `${HEALTH_LABEL[c.status]} · last event ${fmtMin(c.lastEventMin)} ago`} side="right">
                  <span tabIndex={0} aria-label={`${c.label}: ${HEALTH_LABEL[c.status]}`} className={cn("size-1.5 shrink-0 rounded-full", dot[c.status])} />
                </Tooltip>
                <span className="flex-1 truncate">{c.label}</span>
                <span className="font-mono text-[10.5px] text-ink-3 tnum">{fmtMin(c.lastEventMin)}</span>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="flex items-center gap-2.5 border-t border-line px-3 py-2.5">
        <Avatar name={me.name} me size="lg" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[12.5px] font-medium">{me.name}</div>
          <div className="truncate text-[11px] text-ink-3">
            {me.title} · {me.role === "admin" ? "Admin" : me.role === "manager" ? "Manager" : "Member"}
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={toggle}>
          <Sun strokeWidth={1.5} className="theme-dark-only" />
          <Moon strokeWidth={1.5} className="theme-light-only" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out" onClick={() => void signOut(auth)}>
          <LogOut strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}
