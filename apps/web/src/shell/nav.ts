import {
  BarChart3,
  Building2,
  CheckSquare,
  FileText,
  Home,
  Inbox,
  KanbanSquare,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type CountKey = "inbox" | "pipeline" | "tasks" | "companies" | "contacts" | "invoices";
export type NavItem = { to: string; label: string; icon: LucideIcon; count?: CountKey; shortcut?: string };
export type NavSection = { label?: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    items: [
      { to: "/", label: "Home", icon: Home, shortcut: "G H" },
      { to: "/inbox", label: "Inbox", icon: Inbox, count: "inbox", shortcut: "G I" },
      { to: "/pipeline", label: "Pipeline", icon: KanbanSquare, count: "pipeline", shortcut: "G P" },
      { to: "/tasks", label: "Tasks", icon: CheckSquare, count: "tasks" },
    ],
  },
  {
    label: "Records",
    items: [
      { to: "/clients", label: "Clients", icon: Building2, count: "companies" },
      { to: "/contacts", label: "Contacts", icon: Users, count: "contacts" },
      { to: "/invoices", label: "Invoices", icon: FileText, count: "invoices" },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/reports", label: "Reports", icon: BarChart3 },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Inbox unread count is the one nav count rendered in signal. */
export const SIGNAL_COUNT = new Set(["/inbox"]);
