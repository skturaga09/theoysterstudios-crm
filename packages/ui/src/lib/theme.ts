import { create } from "zustand";

export type ThemePref = "system" | "light" | "dark";
const KEY = "pinnacle.theme";

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

export const resolvedTheme = (): "light" | "dark" => {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

interface ThemeState {
  pref: ThemePref;
  set: (p: ThemePref) => void;
  toggle: () => void;
}

/** Saved locally now; persisted to users.prefs.theme once the API exists (M3). */
export const useTheme = create<ThemeState>((set) => ({
  pref: typeof window === "undefined" ? "system" : read(),
  set: (pref) => {
    apply(pref);
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* ignore */
    }
    set({ pref });
  },
  toggle: () => {
    const next = resolvedTheme() === "dark" ? "light" : "dark";
    useTheme.getState().set(next);
  },
}));

/** Call before React renders to avoid a flash. */
export function bootTheme() {
  apply(read());
}
