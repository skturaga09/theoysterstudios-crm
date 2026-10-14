import { useEffect, useRef, useState } from "react";
import { useUi } from "./ui-store";

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const overlayOpen = () => !!document.querySelector('[role="dialog"]');

/** j / k move through a list, Enter opens. Returns the active index and a setter. */
export function useListNav(length: number, onOpen: (i: number) => void, enabled = true) {
  const [active, setActive] = useState(-1);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || overlayOpen()) return;
      if (e.key === "j") setActive((a) => Math.min(length - 1, a + 1));
      else if (e.key === "k") setActive((a) => Math.max(0, a - 1));
      else if (e.key === "Enter" && active >= 0) openRef.current(active);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [length, active, enabled]);
  useEffect(() => {
    if (active < 0) return;
    document.querySelector(`[data-nav-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return [active, setActive] as const;
}

/** Registers what `c` creates on this screen. */
export function useCreateAction(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    useUi.getState().setCreate(() => ref.current());
    return () => useUi.getState().setCreate(undefined);
  }, []);
}

/** Persisted per-viewer preference (view toggles). Storage may be unavailable. */
export function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(`pinnacle.${key}`) as T) || initial;
    } catch {
      return initial;
    }
  });
  return [
    v,
    (n: T) => {
      setV(n);
      try {
        localStorage.setItem(`pinnacle.${key}`, n);
      } catch {
        /* ignore */
      }
    },
  ];
}

/** True once per browser session for a given key (KPI count-up on first Home view). */
export function useOncePerSession(key: string) {
  const [first] = useState(() => {
    try {
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, "1");
      return true;
    } catch {
      return true;
    }
  });
  return first;
}
