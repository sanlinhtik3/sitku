// macOS native desktop chrome helpers.
//
// In the Electron mac shell the window uses `titleBarStyle: "hiddenInset"` with
// `trafficLightPosition: { x: 22, y: 20 }` (electron/main.mjs). The OS traffic-light
// cluster (minimize/maximize/close) is painted at a FIXED window position and spans
// roughly x:22 → x:74. Any surface that becomes the window's top-left element must
// reserve a left gutter so the lights don't overlap its content.
//
// The lights exist ONLY in the mac desktop shell — on web/PWA we render decorative dots
// instead, and on Windows/Linux there are no left lights — so the reserve must be gated
// to mac desktop or it leaves an empty band.

export const TRAFFIC_LIGHT_SAFE_ZONE = 80; // px — lights end ~x:74 + Finder-style margin

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
