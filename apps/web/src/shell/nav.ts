import { accessOf, roleOf, type Area } from "@pinnacle/shared";
import { useMe } from "../data/store";
import {
  BarChart3,
  Building2,
  CheckSquare,
  FileText,
  Gauge,
  FolderKanban,
  Home,
  Inbox,
  KanbanSquare,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type CountKey = "inbox" | "pipeline" | "tasks" | "companies" | "contacts" | "invoices";
export type NavItem = { to: string; label: string; icon: LucideIcon; count?: CountKey; shortcut?: string; /** Hidden from roles with no access to it. */ area?: Area; /** Owners / admins only. */ admin?: boolean };
export type NavSection = { label?: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    items: [
      { to: "/", label: "Home", icon: Home, shortcut: "G H" },
      { to: "/inbox", label: "Inbox", icon: Inbox, count: "inbox", shortcut: "G I", area: "sales" },
      { to: "/pipeline", label: "Pipeline", icon: KanbanSquare, count: "pipeline", shortcut: "G P", area: "sales" },
      { to: "/projects", label: "Projects", icon: FolderKanban },
      { to: "/tasks", label: "Tasks", icon: CheckSquare, count: "tasks" },
    ],
  },
  {
    label: "Records",
    items: [
      { to: "/clients", label: "Clients", icon: Building2, count: "companies", area: "sales" },
      { to: "/contacts", label: "Contacts", icon: Users, count: "contacts", area: "sales" },
      { to: "/invoices", label: "Invoices", icon: FileText, count: "invoices", area: "finance" },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/dashboard", label: "Owner dashboard", icon: Gauge, admin: true },
      { to: "/reports", label: "Reports", icon: BarChart3, area: "sales" },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Inbox unread count is the one nav count rendered in signal. */
export const SIGNAL_COUNT = new Set(["/inbox"]);

/** The menu for my role: sections without anything I can open are left out. */
export function useNav(): NavSection[] {
  const role = useMe().role;
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => (!i.area || accessOf(role, i.area) !== "none") && (!i.admin || roleOf(role) === "admin")) })).filter((s) => s.items.length);
}
