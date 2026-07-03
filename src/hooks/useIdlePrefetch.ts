import { useEffect } from "react";

/**
 * Prefetch lazy-loaded modules during browser idle time.
 * Accepts an array of dynamic import functions and triggers them
 * via requestIdleCallback (with setTimeout fallback).
 */
export function useIdlePrefetch(importFns: Array<() => Promise<unknown>>) {
  useEffect(() => {
    const schedule = typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback
      : (cb: () => void) => window.setTimeout(cb, 200);

    const id = schedule(() => {
      importFns.forEach((fn) => fn().catch(() => {}));
    });

    return () => {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(id as number);
      } else {
        clearTimeout(id as number);
      }
    };
  }, []); // Run once on mount
}
