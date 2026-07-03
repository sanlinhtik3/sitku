import { useEffect, useState } from "react";

/**
 * Tracks the on-screen keyboard's vertical occlusion using `window.visualViewport`.
 *
 * Returns the number of pixels the keyboard covers at the bottom of the layout viewport,
 * so the chat composer can translate up by exactly that amount. Returns 0 when no keyboard
 * is shown, or when `visualViewport` is unavailable (older browsers, desktop).
 *
 * Why visualViewport over `window.innerHeight`: when a soft keyboard opens, iOS Safari
 * shrinks the *visual* viewport but leaves the *layout* viewport untouched. Listening to
 * `viewport.resize` + `viewport.scroll` + `geometrychange` (iOS 17+) gives an accurate,
 * real-time keyboard height we can apply with `transform`.
 */
export function useKeyboardInset(): { keyboardHeight: number; isKeyboardOpen: boolean } {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    let raf = 0;

    const compute = () => {
      // Layout viewport height − (visual viewport height + visual viewport offset)
      // = pixels covered by the keyboard at the bottom.
      const occluded = window.innerHeight - viewport.height - viewport.offsetTop;
      // Clamp tiny rounding noise to 0; ignore browser UI bars (≤80px) so we only
      // react to actual keyboards.
      const next = occluded > 80 ? Math.round(occluded) : 0;
      setKeyboardHeight((prev) => (prev === next ? prev : next));
    };

    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    compute();
    viewport.addEventListener("resize", onChange);
    viewport.addEventListener("scroll", onChange);
    // iOS 17+ fires geometrychange on the visualViewport; older Safari ignores it.
    viewport.addEventListener("geometrychange", onChange as EventListener);

    return () => {
      cancelAnimationFrame(raf);
      viewport.removeEventListener("resize", onChange);
      viewport.removeEventListener("scroll", onChange);
      viewport.removeEventListener("geometrychange", onChange as EventListener);
    };
  }, []);

  return { keyboardHeight, isKeyboardOpen: keyboardHeight > 0 };
}
