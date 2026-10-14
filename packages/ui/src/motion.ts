/** Motion tokens — the only easing/duration values the app may use. */
export const ease = { out: [0.2, 0.8, 0.2, 1], inOut: [0.65, 0, 0.35, 1] } as const;
export const spring = {
  snappy: { type: "spring", stiffness: 520, damping: 38 },
  soft: { type: "spring", stiffness: 260, damping: 30 },
} as const;
export const dur = { micro: 0.12, fast: 0.18, base: 0.28, slow: 0.45, count: 0.9 } as const;

/** Page-load section rise: 8px, 60ms stagger, max 6 items. */
export const rise = {
  hidden: { opacity: 0, y: 8 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: dur.base, ease: ease.out, delay: Math.min(i, 5) * 0.06 },
  }),
};

/** Quartic ease-out for count-ups. */
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
