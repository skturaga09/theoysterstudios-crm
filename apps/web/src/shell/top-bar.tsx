import { Button, Kbd, useCommandMenu } from "@pinnacle/ui";
import { useUi } from "../lib/ui-store";
import { Menu, Plus, Search } from "lucide-react";

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const openCmd = () => useCommandMenu.getState().setOpen(true);
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
        <Button
          variant="ink"
          size="sm"
          onClick={() => {
            const create = useUi.getState().create;
            if (create) create();
            else useUi.getState().openComposer("deal");
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
