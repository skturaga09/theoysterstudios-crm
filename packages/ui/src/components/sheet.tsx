import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { dur, ease } from "../motion";
import { Button } from "./button";

/** Right-side quick view, 480px. Slides in 450ms; scrim fades with 2px blur; focus lands on Close. */
export function Sheet({
  open,
  onOpenChange,
  title,
  eyebrow,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-[var(--scrim)] backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: dur.fast }}
              />
            </D.Overlay>
            <D.Content
              asChild
              forceMount
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                closeRef.current?.focus();
              }}
            >
              <motion.div
                className={cn(
                  "fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col bg-surface shadow-pop",
                  className,
                )}
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ duration: dur.slow, ease: ease.out }}
              >
                <header className="flex items-start gap-3 border-b border-line px-6 pt-5 pb-4">
                  <div className="min-w-0 flex-1">
                    {eyebrow && <div className="t-eyebrow mb-2 text-ink-3">{eyebrow}</div>}
                    <D.Title className="t-sheet m-0 text-ink">{title}</D.Title>
                  </div>
                  <D.Close asChild>
                    <Button ref={closeRef} variant="ghost" size="icon-sm" aria-label="Close">
                      <X strokeWidth={1.5} />
                    </Button>
                  </D.Close>
                </header>
                <D.Description className="sr-only">Quick view</D.Description>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
                {footer && <footer className="border-t border-line px-6 py-3">{footer}</footer>}
              </motion.div>
            </D.Content>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  );
}
