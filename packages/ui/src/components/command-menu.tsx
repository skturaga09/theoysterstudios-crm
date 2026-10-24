import * as D from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { create } from "zustand";
import { cn } from "../lib/cn";
import { dur, spring } from "../motion";
import { Kbd } from "./kbd";

export const useCommandMenu = create<{ open: boolean; setOpen: (o: boolean) => void; toggle: () => void }>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
}));

export type CommandItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
  keywords?: string[];
  onSelect: () => void;
};
export type CommandGroup = { heading: string; items: CommandItem[] };

/** ⌘K. Scale .98 → 1 + fade with spring.snappy. Grouped, mono hints on the right. */
export function CommandMenu({ groups, placeholder = "Search or jump to…" }: { groups: CommandGroup[]; placeholder?: string }) {
  const { open, setOpen } = useCommandMenu();
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[var(--scrim)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: dur.fast }}
              />
            </D.Overlay>
            <D.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed top-[14vh] left-1/2 z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-menu bg-surface shadow-pop"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: dur.micro } }}
                transition={spring.snappy}
              >
                <D.Title className="sr-only">Command menu</D.Title>
                <Command loop className="flex flex-col" label="Command menu">
                  <div className="flex items-center gap-3 border-b border-line px-4">
                    <Command.Input
                      autoFocus
                      placeholder={placeholder}
                      className="h-12 flex-1 bg-transparent t-body text-ink outline-none placeholder:text-ink-3"
                    />
                    <Kbd>esc</Kbd>
                  </div>
                  <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
                    <Command.Empty className="px-3 py-8 text-center t-meta text-ink-3">No matches.</Command.Empty>
                    {groups.map((g) => (
                      <Command.Group
                        key={g.heading}
                        heading={g.heading}
                        className={cn(
                          "[&_[cmdk-group-heading]]:t-eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:text-ink-3",
                        )}
                      >
                        {g.items.map((it) => (
                          <Command.Item
                            key={it.id}
                            value={`${g.heading} ${it.label}`}
                            keywords={it.keywords}
                            onSelect={() => {
                              setOpen(false);
                              it.onSelect();
                            }}
                            className="flex h-9 cursor-pointer items-center gap-3 rounded-control px-2 t-dense text-ink-2 data-[selected=true]:bg-hover data-[selected=true]:text-ink [&_svg]:size-4 [&_svg]:text-ink-3"
                          >
                            {it.icon}
                            <span className="flex-1 truncate">{it.label}</span>
                            {it.hint && <span className="font-mono fs-11 text-ink-3">{it.hint}</span>}
                          </Command.Item>
                        ))}
                      </Command.Group>
                    ))}
                  </Command.List>
                </Command>
              </motion.div>
            </D.Content>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  );
}
