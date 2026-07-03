import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { initSentry, captureException } from "./lib/sentry";
import { initGlobalErrorCapture } from "./lib/systemErrorLogger";
import "./index.css";

// Init error reporting before any render so boot crashes are captured.
initSentry();
// Mirror unhandled errors into Lovable Cloud DB so ai-doctor has data.
initGlobalErrorCapture();

// Render first — never let cleanup block the UI
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// One-time PWA cache bust after Vite 8 migration (non-blocking)
try {
  const CACHE_VERSION = "vite8-v2";
  if (typeof localStorage !== "undefined" && !localStorage.getItem(CACHE_VERSION)) {
    localStorage.setItem(CACHE_VERSION, "1");
    if ("caches" in window) {
      caches.keys()
        .then((names) => names.forEach((n) => caches.delete(n)))
        .catch((e) => captureException(e, { phase: "cache-bust" }));
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch((e) => captureException(e, { phase: "sw-cleanup" }));
    }
  }
} catch (e) {
  // Storage access denied (private mode, embedded iframes) — log but do not block boot.
  captureException(e, { phase: "cache-bust-outer" });
}
