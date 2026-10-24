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

/* ---------- Text size: per person, on this device ---------- */
export const TEXT_SIZES = { standard: 1, large: 1.15, larger: 1.3 } as const;
export type TextSize = keyof typeof TEXT_SIZES;
export const TEXT_SIZE_LABEL: Record<TextSize, string> = { standard: "Standard", large: "Large", larger: "Extra large" };
const SIZE_KEY = "pinnacle.textSize";

function readSize(): TextSize {
  try {
    const v = localStorage.getItem(SIZE_KEY);
    if (v && v in TEXT_SIZES) return v as TextSize;
  } catch {
    /* storage unavailable */
  }
  return "large"; // the studio asked for bigger text than the original design
}
const applySize = (s: TextSize) => document.documentElement.style.setProperty("--fs", String(TEXT_SIZES[s]));

export const useTextSize = create<{ size: TextSize; set: (s: TextSize) => void }>((set) => ({
  size: typeof window === "undefined" ? "large" : readSize(),
  set: (size) => {
    applySize(size);
    try {
      localStorage.setItem(SIZE_KEY, size);
    } catch {
      /* ignore */
    }
    set({ size });
  },
}));

/** Staff app only; public pages (portal, signing, enquiry) keep the designed size. */
export function bootTextSize() {
  applySize(readSize());
}
