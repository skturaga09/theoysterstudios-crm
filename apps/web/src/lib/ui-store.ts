import { create } from "zustand";

type Composer = "deal" | "task" | "call" | "invoice" | "company" | "contact";

/** Small UI state: open sheets, the screen's create action, the Won pulse. */
interface UiState {
  dealId?: string;
  openDeal: (id: string) => void;
  closeDeal: () => void;
  composer?: { kind: Composer; dealId?: string; stage?: string };
  openComposer: (kind: Composer, opts?: { dealId?: string; stage?: string }) => void;
  closeComposer: () => void;
  create?: () => void;
  setCreate: (fn?: () => void) => void;
  wonPulse?: string;
}
export const useUi = create<UiState>((set) => ({
  openDeal: (dealId) => set({ dealId }),
  closeDeal: () => set({ dealId: undefined }),
  openComposer: (kind, opts) => set({ composer: { kind, ...opts } }),
  closeComposer: () => set({ composer: undefined }),
  setCreate: (create) => set({ create }),
}));
