import { CHANNEL_MONOGRAM, STAGE_LABEL } from "@pinnacle/shared";
import { useTheme, type CommandGroup } from "@pinnacle/ui";
import { Building2, CheckSquare, Contrast, FileText, KanbanSquare, MessageSquare, Palette, Phone, Plus, User } from "lucide-react";
import { useNavigate } from "react-router";
import { useCrm } from "../data/store";
import { useUi } from "../lib/ui-store";
import { NAV } from "./nav";

/** Local search over the store. Server-side search (debounced 150ms) replaces this in M3. */
export function useCommandGroups(): CommandGroup[] {
  const navigate = useNavigate();
  const s = useCrm();
  const go = (to: string) => navigate(to, { viewTransition: true });
  const coName = (id?: string) => s.companies.find((c) => c.id === id)?.name ?? "";
  return [
    {
      heading: "Jump to",
      items: [
        ...NAV.flatMap((x) => x.items).map((n) => ({
          id: `nav-${n.to}`,
          label: n.label,
          icon: <n.icon strokeWidth={1.5} />,
          hint: n.shortcut,
          onSelect: () => go(n.to),
        })),
        { id: "nav-team", label: "Team & access", icon: <User strokeWidth={1.5} />, onSelect: () => go("/settings/team") },
        { id: "nav-styleguide", label: "Styleguide", icon: <Palette strokeWidth={1.5} />, onSelect: () => go("/styleguide") },
      ],
    },
    {
      heading: "Actions",
      items: [
        { id: "a-deal", label: "New deal", icon: <Plus strokeWidth={1.5} />, hint: "C", onSelect: () => useUi.getState().openComposer("deal") },
        { id: "a-call", label: "Log call", icon: <Phone strokeWidth={1.5} />, onSelect: () => useUi.getState().openComposer("call") },
        { id: "a-invoice", label: "New invoice", icon: <FileText strokeWidth={1.5} />, onSelect: () => useUi.getState().openComposer("invoice") },
        { id: "a-task", label: "Add task", icon: <CheckSquare strokeWidth={1.5} />, onSelect: () => useUi.getState().openComposer("task") },
        { id: "a-theme", label: "Toggle theme", icon: <Contrast strokeWidth={1.5} />, onSelect: () => useTheme.getState().toggle() },
      ],
    },
    {
      heading: "Deals",
      items: s.deals.map((d) => ({
        id: d.id,
        label: `${coName(d.companyId)} — ${d.title}`,
        icon: <KanbanSquare strokeWidth={1.5} />,
        hint: STAGE_LABEL[d.stage],
        onSelect: () => useUi.getState().openDeal(d.id),
      })),
    },
    {
      heading: "Conversations",
      items: s.conversations.map((c) => ({
        id: c.id,
        label: `${c.name}${c.company ? ` · ${c.company}` : ""}`,
        icon: <MessageSquare strokeWidth={1.5} />,
        hint: CHANNEL_MONOGRAM[c.channel],
        onSelect: () => go(`/inbox/${c.id}`),
      })),
    },
    {
      heading: "Companies",
      items: s.companies.map((c) => ({
        id: c.id,
        label: c.name,
        keywords: [c.domain, c.city],
        icon: <Building2 strokeWidth={1.5} />,
        hint: c.city,
        onSelect: () => go(`/companies?q=${encodeURIComponent(c.name)}`),
      })),
    },
    {
      heading: "People",
      items: s.contacts.map((c) => ({
        id: c.id,
        label: c.name,
        keywords: [coName(c.companyId), c.email ?? ""],
        icon: <User strokeWidth={1.5} />,
        hint: coName(c.companyId),
        onSelect: () => go(`/contacts?q=${encodeURIComponent(c.name)}`),
      })),
    },
  ];
}
