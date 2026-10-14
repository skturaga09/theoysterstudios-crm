import * as M from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = "start", className }: { children: ReactNode; align?: "start" | "end"; className?: string }) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-[180px] rounded-panel bg-surface p-1 shadow-pop", className)}
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  checked,
  hint,
  tone,
}: {
  children: ReactNode;
  onSelect?: () => void;
  checked?: boolean;
  hint?: string;
  tone?: "risk";
}) {
  return (
    <M.Item
      onSelect={onSelect}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 rounded-control px-2 t-dense outline-none select-none",
        "data-[highlighted]:bg-hover",
        tone === "risk" ? "text-risk" : "text-ink",
        "[&_svg]:size-4 [&_svg]:text-ink-3",
      )}
    >
      {checked !== undefined && (
        <span className="grid size-4 place-items-center">{checked && <Check strokeWidth={1.5} className="!text-ink" />}</span>
      )}
      <span className="flex flex-1 items-center gap-2 truncate">{children}</span>
      {hint && <span className="font-mono text-[11px] text-ink-3">{hint}</span>}
    </M.Item>
  );
}

export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <M.Label className="t-eyebrow px-2 pt-2 pb-1.5 text-ink-3">{children}</M.Label>
);
export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-line" />;
