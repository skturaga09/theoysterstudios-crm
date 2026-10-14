import { useCommandMenu } from "@pinnacle/ui";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useUi } from "../lib/ui-store";

const GO: Record<string, string> = { h: "/", i: "/inbox", p: "/pipeline" };

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** ⌘K / Ctrl+K command menu · g h / g i / g p go-to · c creates in context (j/k live in each list). */
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useCommandMenu.getState().toggle();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || useCommandMenu.getState().open) return;
      const k = e.key.toLowerCase();
      if (k === "c" && !gAt && !document.querySelector('[role="dialog"]')) {
        const create = useUi.getState().create;
        if (create) {
          e.preventDefault();
          create();
        }
        return;
      }
      if (k === "g") {
        gAt = Date.now();
        return;
      }
      if (gAt && Date.now() - gAt < 1000 && GO[k]) {
        e.preventDefault();
        gAt = 0;
        navigate(GO[k]!, { viewTransition: true });
      }
      gAt = 0;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}
