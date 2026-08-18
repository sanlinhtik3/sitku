export type NativePlatform = "electron-macos" | "electron" | "ios-web" | "web";
export type NativeHaptic = "selection" | "light" | "success" | "warning";
export type NativeTransitionDirection = "forward" | "back" | "none";

type ViewTransition = { finished: Promise<void> };
type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransition;
};

export function nativePlatform(): NativePlatform {
  if (typeof window === "undefined") return "web";
  const desktop = (window as Window & { beebotDesktop?: { platform?: string } }).beebotDesktop;
  if (desktop?.platform === "darwin") return "electron-macos";
  if (desktop) return "electron";
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios-web" : "web";
}

export function nativeHaptic(kind: NativeHaptic = "selection") {
  const desktop = typeof window === "undefined" ? undefined : window.beebotDesktop;
  if (desktop?.performNativeHaptic) {
    desktop.performNativeHaptic(kind === "warning" ? "warning" : "selection");
    return;
  }
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const pattern: Record<NativeHaptic, number | number[]> = {
    selection: 8,
    light: 12,
    success: [10, 35, 16],
    warning: [18, 35, 18],
  };
  navigator.vibrate(pattern[kind]);
}

export function nativeViewTransition(
  direction: NativeTransitionDirection,
  update: () => void,
) {
  if (typeof document === "undefined") {
    update();
    return;
  }

  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as ViewTransitionDocument;
  root.dataset.nativeTransitionDirection = direction;

  if (reduced || !doc.startViewTransition) {
    update();
    delete root.dataset.nativeTransitionDirection;
    return;
  }

  const transition = doc.startViewTransition(update);
  void transition.finished.finally(() => {
    delete root.dataset.nativeTransitionDirection;
  });
}
