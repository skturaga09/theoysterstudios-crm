import { AnimatePresence, motion } from "motion/react";
import { create } from "zustand";
import { spring } from "../motion";

type Toast = { id: number; message: string; action?: { label: string; onClick: () => void }; duration: number };

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id" | "duration"> & { duration?: number }) => number;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    const duration = t.duration ?? (t.action ? 3200 : 2400);
    set({ toasts: [...get().toasts, { ...t, id, duration }] });
    setTimeout(() => get().dismiss(id), duration);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

/** toast("Deal created in New · ₹7.0 L", { action: { label: "Undo", onClick } }) */
export const toast = (message: string, opts?: { action?: Toast["action"]; duration?: number }) =>
  useToasts.getState().push({ message, ...opts });

/** Bottom-centre. Rises 20px with spring.snappy. */
export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            transition={spring.snappy}
            className="pointer-events-auto flex items-center gap-4 rounded-control bg-ink py-2 pr-2 pl-4 fs-13 text-on-ink shadow-pop"
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                className="rounded-[4px] px-2 py-1 font-medium text-on-ink/80 underline-offset-2 hover:text-on-ink hover:underline"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
