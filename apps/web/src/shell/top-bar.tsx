import { BUSINESS_SHORT, type BusinessView } from "@pinnacle/shared";
import { Button, Kbd, Segmented, Select, useCommandMenu } from "@pinnacle/ui";
import { useAccess, useCrm } from "../data/store";
import { useUi } from "../lib/ui-store";
import { NotificationsBell } from "./notifications";
import { Menu, Plus, Search } from "lucide-react";

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const openCmd = () => useCommandMenu.getState().setOpen(true);
  const sales = useAccess("sales");
  const canLead = sales === "edit" || sales === "own";
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-line px-4 md:px-8">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation" onClick={onMenu}>
        <Menu strokeWidth={1.5} />
      </Button>
      <button
        onClick={openCmd}
        className="flex h-[34px] w-full max-w-[380px] items-center gap-2 rounded-control bg-sunken px-3 text-left t-dense text-ink-3 transition-colors duration-150 hover:text-ink-2"
      >
        <Search size={15} strokeWidth={1.5} aria-hidden />
        <span className="flex-1 truncate">Search deals, people, conversations…</span>
        <Kbd className="hidden sm:inline-flex">{isMac ? "⌘K" : "Ctrl K"}</Kbd>
      </button>
      <div className="ml-auto flex items-center gap-2">
        <BusinessSwitch />
        <NotificationsBell />
        <Button
          variant="ink"
          size="sm"
          onClick={() => {
            const create = useUi.getState().create;
            if (create) create();
            // Only roles that work on leads start one here; everyone else adds a task.
            else useUi.getState().openComposer(canLead ? "deal" : "task");
          }}
        >
          <Plus strokeWidth={1.5} />
          New
          <Kbd className="hidden border-on-ink/25 text-on-ink/60 sm:inline-flex">C</Kbd>
        </Button>
      </div>
    </div>
  );
}

const VIEWS: { value: BusinessView; label: string }[] = [
  { value: "all", label: "Both" },
  { value: "photography", label: BUSINESS_SHORT.photography },
  { value: "marketing", label: BUSINESS_SHORT.marketing },
];

/** Which business every screen shows. A dropdown on phones, a segmented control otherwise. */
function BusinessSwitch() {
  const view = useCrm((s) => s.businessView);
  const set = useCrm.getState().setBusinessView;
  return (
    <>
      <Segmented label="Business" value={view} onChange={set} options={VIEWS} className="hidden md:inline-flex" />
      <Select aria-label="Business" value={view} onChange={(e) => set(e.target.value as BusinessView)} className="md:hidden">
        {VIEWS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
      </Select>
    </>
  );
}
