import { CommandMenu, dur, ease } from "@pinnacle/ui";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Outlet } from "react-router";
import { Composers } from "../components/composers";
import { DealSheet } from "../components/deal/deal-sheet";
import { useLiveArrivals } from "../data/live";
import { useCommandGroups } from "./command-groups";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { useGlobalShortcuts } from "./use-shortcuts";

export function AppShell() {
  useGlobalShortcuts();
  useLiveArrivals();
  const groups = useCommandGroups();
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="grid h-dvh grid-cols-1 overflow-hidden bg-bg lg:grid-cols-[calc(232px*var(--fs,1))_minmax(0,1fr)] print:block print:h-auto print:overflow-visible">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <aside className="hidden border-r border-line lg:block print:hidden">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-[var(--scrim)] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: dur.fast }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[264px] border-r border-line shadow-pop lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: dur.base, ease: ease.out }}
              onKeyDown={(e) => e.key === "Escape" && setDrawer(false)}
            >
              <Sidebar onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-col overflow-hidden print:overflow-visible">
        <div className="contents print:hidden"><TopBar onMenu={() => setDrawer(true)} /></div>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto print:overflow-visible" style={{ viewTransitionName: "main" }}>
          <div className="mx-auto w-full max-w-[1320px] px-4 pt-7 pb-16 md:px-8">
            <Outlet />
          </div>
        </main>
      </div>

      <CommandMenu groups={groups} />
      <DealSheet />
      <Composers />
    </div>
  );
}
