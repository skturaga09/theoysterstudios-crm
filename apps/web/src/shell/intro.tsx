import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";

const SEEN = "pinnacle.introSeen";
const seen = () => {
  try {
    return sessionStorage.getItem(SEEN) === "1";
  } catch {
    return true; // no storage: don't replay it on every load
  }
};

/**
 * The studio's logo animation, once per browser session before sign-in (or before Home when already signed in).
 * Skippable; the app loads underneath while it plays. Reduced-motion users go straight in.
 */
export function Intro({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(() => !seen());
  const done = () => {
    try {
      sessionStorage.setItem(SEEN, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };
  return (
    <>
      {children}
      <AnimatePresence>
        {show && !reduce && (
          <motion.div
            key="intro"
            className="fixed inset-0 z-[100] grid place-items-center bg-white"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }}
          >
            <video
              src="/intro.mp4"
              poster="/intro-poster.jpg"
              autoPlay
              muted
              playsInline
              onEnded={() => window.setTimeout(done, 700)}
              onError={done}
              className="h-full w-full object-cover"
            />
            <button onClick={done} className="absolute right-6 bottom-6 rounded-full bg-black/5 px-4 py-1.5 fs-12.5 text-black/60 backdrop-blur hover:bg-black/10 hover:text-black">
              Skip
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
