import { bootTextSize, bootTheme, Toaster, TooltipProvider } from "@pinnacle/ui";
import { MotionConfig } from "motion/react";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { AuthGate } from "./shell/auth-gate";
import { reloadForNewVersion } from "./lib/stale";

bootTheme();

// A tab opened before the latest publish may ask for page files that are gone: reload once for the new version.
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  reloadForNewVersion();
});

// The public privacy page (/privacy), client portal links (/portal/…) and signing links (/sign/…) need no sign-in; everything else is behind the gate.
const isPrivacy = window.location.pathname === "/privacy";
const isPortal = window.location.pathname.startsWith("/portal/");
const isSign = window.location.pathname.startsWith("/sign/");
const isEnquire = window.location.pathname === "/enquire";
if (!isPortal && !isSign && !isEnquire) bootTextSize();
const Privacy = lazy(() => import("./routes/privacy").then((m) => ({ default: m.PrivacyPage })));
const Portal = lazy(() => import("./routes/portal/index").then((m) => ({ default: m.PortalApp })));
const Sign = lazy(() => import("./routes/sign/index").then((m) => ({ default: m.SignApp })));
const Enquire = lazy(() => import("./routes/enquire").then((m) => ({ default: m.EnquirePage })));
// The app shell downloads while sign-in resolves (started now, not when the gate opens).
const appModule = isPrivacy || isPortal || isSign || isEnquire ? new Promise<never>(() => {}) : import("./app");
const App = lazy(() => appModule);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        {/* The single-file demo build (`--mode preview`) has no server, so it skips sign-in. */}
        <Suspense>{isPrivacy ? <Privacy /> : isPortal ? <Portal /> : isSign ? <Sign /> : isEnquire ? <Enquire /> : import.meta.env.MODE === "preview" ? <App /> : <AuthGate><App /></AuthGate>}</Suspense>
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  </StrictMode>,
);
