import { cn } from "@pinnacle/ui";
import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { PageHeader } from "../../components/page-header";
import { useWorkspace } from "../../data/store";

export const SECTIONS = [
  { to: "workspace", label: "Workspace" },
  { to: "team", label: "Team & access", admin: true },
  { to: "pipeline", label: "Pipelines & stages" },
  { to: "templates", label: "Project templates" },
  { to: "packages", label: "Packages & payments" },
  { to: "integrations", label: "Integrations", admin: true },
  { to: "routing", label: "Lead routing" },
  { to: "notifications", label: "Notifications" },
  { to: "data", label: "Import & export", admin: true },
] as const;

export function SettingsLayout() {
  const studioName = useWorkspace().studioName;
  return (
    <>
      <PageHeader eyebrow={studioName} title="Settings" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Settings" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="m-0 flex list-none gap-1 p-0 lg:sticky lg:top-0 lg:flex-col">
            {SECTIONS.map((s) => (
              <li key={s.to} className="shrink-0">
                <NavLink
                  to={s.to}
                  className={({ isActive }) =>
                    cn(
                      "flex h-8 items-center gap-2 rounded-control px-2.5 t-dense whitespace-nowrap transition-colors duration-150",
                      isActive ? "bg-surface font-medium text-ink shadow-rest" : "text-ink-2 hover:bg-hover hover:text-ink",
                    )
                  }
                >
                  {s.label}
                  {"admin" in s && <span className="font-mono text-[10px] text-ink-3">ADMIN</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 max-w-[880px]">
          <Outlet />
        </div>
      </div>
    </>
  );
}

export function SettingsHeader({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end gap-4 border-b border-line pb-5">
      <div className="min-w-0 flex-1">
        <h2 className="t-sheet m-0">{title}</h2>
        {body && <p className="t-dense m-0 mt-2 max-w-[64ch] text-ink-2">{body}</p>}
      </div>
      {action}
    </header>
  );
}
