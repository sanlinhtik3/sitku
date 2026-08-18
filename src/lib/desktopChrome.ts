// macOS native desktop chrome helpers.
//
// In the Electron mac shell the window uses the system `hiddenInset` titlebar.
// The OS owns the traffic-light geometry; any surface that becomes the window's
// top-left element only needs to reserve a stable content gutter around that cluster.
//
// The lights exist ONLY in the mac desktop shell — on web/PWA we render decorative dots
// instead, and on Windows/Linux there are no left lights — so the reserve must be gated
// to mac desktop or it leaves an empty band.

export const TRAFFIC_LIGHT_SAFE_ZONE = 80; // px — standard cluster plus a native content margin

export const isMacDesktop = () =>
  typeof window !== "undefined" &&
  Boolean(window.beebotDesktop) &&
  /Mac/i.test(navigator.platform || navigator.userAgent);

// Reduce-effects ("eco") mode. Stacked full-screen `backdrop-filter: blur()` (the glass
// panels + the CFO/Consultant overlays) pegs the GPU and overheats the machine. The CSS
// mitigation ([data-eco-mode] → no blur/pulse/glow) already exists — this wires it.
// Default ON in the desktop app (that's where the thermal problem is); off on web.
// User-overridable via Settings.
const ECO_KEY = "beebot-reduce-effects";
export const reduceEffects = {
  get: (): boolean => {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(ECO_KEY) : null;
    return v === null ? (typeof window !== "undefined" && Boolean(window.beebotDesktop)) : v === "1";
  },
  set: (on: boolean) => { localStorage.setItem(ECO_KEY, on ? "1" : "0"); applyReduceEffects(); },
};
export const applyReduceEffects = () => {
  if (typeof document === "undefined") return;
  if (reduceEffects.get()) document.documentElement.dataset.ecoMode = "true";
  else delete document.documentElement.dataset.ecoMode;
};

function channelHex(value: number) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

/** Normalize a computed CSS canvas color for Electron's setBackgroundColor API. */
export function nativeCanvasColor(value: string): string | null {
  const color = value.trim();
  const shortHex = color.match(/^#([0-9a-f]{3})$/i)?.[1];
  if (shortHex) return `#${[...shortHex].map((part) => `${part}${part}`).join("")}`.toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();

  const rgb = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!rgb) return null;
  return `#${channelHex(Number(rgb[1]))}${channelHex(Number(rgb[2]))}${channelHex(Number(rgb[3]))}`;
}

/**
 * Publish native-only shell state and keep the NSWindow backing color synced to
 * the active theme. The attribute observer also covers live theme previews.
 */
export function initializeNativeDesktopChrome(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined" || !window.beebotDesktop) {
    return () => {};
  }

  const root = document.documentElement;
  root.dataset.desktopShell = "true";
  root.dataset.desktopPlatform = window.beebotDesktop.platform || "unknown";
  void window.beebotDesktop.nativeChromeStatus?.().then((status) => {
    root.dataset.nativeChrome = status.attached ? "swiftui" : "electron";
  }).catch(() => {
    root.dataset.nativeChrome = "electron";
  });

  const syncWindowState = (state?: { active: boolean; fullscreen: boolean; maximized: boolean }) => {
    root.dataset.windowActive = (state?.active ?? document.hasFocus()) ? "true" : "false";
    root.dataset.windowFullscreen = state?.fullscreen ? "true" : "false";
    root.dataset.windowMaximized = state?.maximized ? "true" : "false";
  };
  let frame = 0;
  const syncCanvas = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const styles = getComputedStyle(root);
      const color = nativeCanvasColor(styles.getPropertyValue("--bb-bg-0"))
        || nativeCanvasColor(getComputedStyle(document.body).backgroundColor);
      if (color) window.beebotDesktop?.setWindowBackground?.(color);
      window.beebotDesktop?.setNativeAppearance?.(root.classList.contains("dark") ? "dark" : "light");
    });
  };

  const observer = new MutationObserver(syncCanvas);
  observer.observe(root, {
    attributes: true,
    attributeFilter: ["class", "style", "data-bb-theme", "data-custom-theme", "data-bb-surface"],
  });
  const unsubscribeWindowState = window.beebotDesktop.onWindowState?.(syncWindowState);
  const syncFocusFallback = () => syncWindowState();
  window.addEventListener("focus", syncFocusFallback);
  window.addEventListener("blur", syncFocusFallback);
  syncWindowState();
  syncCanvas();

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    unsubscribeWindowState?.();
    window.removeEventListener("focus", syncFocusFallback);
    window.removeEventListener("blur", syncFocusFallback);
    delete root.dataset.desktopShell;
    delete root.dataset.desktopPlatform;
    delete root.dataset.nativeChrome;
    delete root.dataset.windowActive;
    delete root.dataset.windowFullscreen;
    delete root.dataset.windowMaximized;
  };
}

/** Native file-manager name for the "Reveal in X" menu label — Finder on mac,
 *  Explorer on Windows, Files elsewhere. Defaults to 'Finder' on web (where the
 *  action falls back to path-copy anyway). */
export const platformFileManager = (): string => {
  if (typeof navigator === "undefined") return "Finder";
  const ua = navigator.userAgent || navigator.platform || "";
  if (/Win/i.test(ua)) return "Explorer";
  if (/Mac/i.test(ua)) return "Finder";
  return "Files";
};
