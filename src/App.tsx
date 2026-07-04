import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { BeeBotLayout } from "@/layouts/BeeBotLayout";
import { RepositoryProvider } from "@/repositories/runtime/RepositoryProvider";
import { isLocalRepositoryRuntime } from "@/repositories/runtime/runtimeMode";
import { ensurePersistentStorage } from "@/lib/storageDurability";
import { isMacDesktop, TRAFFIC_LIGHT_SAFE_ZONE, applyReduceEffects } from "@/lib/desktopChrome";

import { lazy, Suspense, memo, useEffect } from "react";

// Stale-chunk recovery: reload page once to get fresh Vite manifest
function lazyWithRetry(importFn: () => Promise<any>) {
  return lazy(() =>
    importFn().catch((error) => {
      const key = 'chunk_reload';
      const lastReload = sessionStorage.getItem(key);
      const now = Date.now();
      if (lastReload && now - parseInt(lastReload) < 10000) {
        throw error;
      }
      sessionStorage.setItem(key, now.toString());
      window.location.reload();
      return new Promise(() => {});
    })
  );
}

// ─── Pages ─────────────────────────────────────────────────────
const BeeBotPage = lazyWithRetry(() => import("./pages/BeeBotPage"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));

const PWAInstallPrompt = lazyWithRetry(() => import("./components/PWAInstallPrompt").then(m => ({ default: m.PWAInstallPrompt })));
const PWAUpdatePrompt = lazyWithRetry(() => import("./components/PWAUpdatePrompt").then(m => ({ default: m.PWAUpdatePrompt })));
const DesktopUpdatePrompt = lazyWithRetry(() => import("./components/DesktopUpdatePrompt").then(m => ({ default: m.DesktopUpdatePrompt })));
const WhatsNewDialog = lazyWithRetry(() => import("./components/WhatsNewDialog").then(m => ({ default: m.WhatsNewDialog })));
const OfflineBanner = lazyWithRetry(() => import("./components/OfflineBanner").then(m => ({ default: m.OfflineBanner })));

// ─── QueryClient ─────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      // Lower GC so heavy local aggregation result sets (income-intel, source-flow,
      // dashboard) are freed sooner after a dashboard closes — matters on 4GB RAM.
      gcTime: 1000 * 60 * 3,
      retry: 2,
      retryDelay: (attemptIndex: number) =>
        Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Respect staleTime instead of refetching on every mount — local-first data
      // rarely changes out from under us, so re-running aggregation on each dialog
      // open was pure waste. "false" → use cache while fresh; still refetches when stale.
      refetchOnMount: false,
    },
    mutations: { retry: 1 },
  },
});

const ThemeInitializer = memo(({ children }: { children: React.ReactNode }) => {
  useThemeSettings();
  // Request durable storage early (best grant odds while the page is engaged), so
  // local data is exempt from browser eviction before any store lazy-loads.
  useEffect(() => { void ensurePersistentStorage(); }, []);

  // Publish the macOS traffic-light safe-zone width once. On the mac desktop shell the
  // OS window controls are painted at a fixed top-left position; surfaces that become
  // the window's top-left element reserve `--titlebar-safe` so the lights don't overlap
  // their content. `0px` everywhere else (web/PWA/Windows/Linux) → no visual change.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--titlebar-safe",
      isMacDesktop() ? `${TRAFFIC_LIGHT_SAFE_ZONE}px` : "0px",
    );
  }, []);

  // Reduce-effects mode: kill stacked backdrop-blur (the GPU overheat cause). Default ON
  // on desktop, off on web; user-overridable in Settings. See desktopChrome.reduceEffects.
  useEffect(() => { applyReduceEffects(); }, []);

  // Pause ALL CSS animations (mesh-drift gradient, "live" pings, spinners) whenever
  // the window is hidden or blurred. Zero visual change while you're using the app —
  // it only stops burning CPU/GPU/battery when you're not looking at it.
  useEffect(() => {
    const root = document.documentElement;
    const setHidden = (hidden: boolean) => {
      if (hidden) root.dataset.appHidden = "true";
      else delete root.dataset.appHidden;
    };
    const onVis = () => setHidden(document.visibilityState === "hidden");
    const onBlur = () => setHidden(true);
    const onFocus = () => setHidden(document.visibilityState === "hidden");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return <>{children}</>;
});

const isLocalRuntime = isLocalRepositoryRuntime();
const isDesktopRenderer = typeof window !== "undefined"
  && (window.location.protocol === "file:" || Boolean(window.beebotDesktop));
// Desktop (Electron `file://`) can't use BrowserRouter's path history. It used to
// use HashRouter — but the app's modal system is hash-driven (`#cfo`, `#consultant`,
// `#search`, …), and HashRouter treats the hash AS the route, so opening any modal
// navigated to a non-existent route → 404 + the dialog host unmounted. MemoryRouter
// keeps routing in memory and never touches window.location, freeing the hash for
// the modal system (exactly like BrowserRouter does on web).
const AppRouter = isLocalRuntime && isDesktopRenderer ? MemoryRouter : BrowserRouter;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeInitializer>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <RepositoryProvider>
            <AuthProvider>
              <Suspense fallback={null}>
                <Routes>
                  {/* Local-first: everything goes straight to the workspace */}
                  <Route path="/" element={<Navigate to="/sitku" replace />} />
                  <Route path="/auth" element={<Navigate to="/sitku" replace />} />
                  <Route path="/auth/*" element={<Navigate to="/sitku" replace />} />
                  <Route path="/beebot" element={<Navigate to="/sitku" replace />} />
                  <Route path="/pututu" element={<Navigate to="/sitku" replace />} />

                  <Route element={<BeeBotLayout />}>
                    <Route path="/sitku" element={<BeeBotPage />} />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              <Suspense fallback={null}>
                <PWAInstallPrompt />
                <PWAUpdatePrompt />
                <DesktopUpdatePrompt />
                <WhatsNewDialog />
                <OfflineBanner />
              </Suspense>
            </AuthProvider>
          </RepositoryProvider>
        </AppRouter>
      </TooltipProvider>
    </ThemeInitializer>
  </QueryClientProvider>
);

export default App;
