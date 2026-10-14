import { bootTheme, Toaster, TooltipProvider } from "@pinnacle/ui";
import { MotionConfig } from "motion/react";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { AuthGate } from "./shell/auth-gate";

bootTheme();

// The app shell downloads while sign-in resolves (started now, not when the gate opens).
const appModule = import("./app");
const App = lazy(() => appModule);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        {/* The single-file demo build (`--mode preview`) has no server, so it skips sign-in. */}
        <Suspense>{import.meta.env.MODE === "preview" ? <App /> : <AuthGate><App /></AuthGate>}</Suspense>
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  </StrictMode>,
);
