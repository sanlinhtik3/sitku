import { useCallback, useEffect, useRef, useState } from "react";

interface UsePullToRefreshOptions {
  /** Async refresh handler. The indicator stays visible until the promise resolves. */
  onRefresh: () => Promise<void> | void;
  /** Pixels the user must pull past the top before release fires `onRefresh`. Default 80. */
  threshold?: number;
  /** Maximum stretch distance even if the user keeps pulling. Default 140. */
  maxPull?: number;
  /** Disable the gesture (e.g. while keyboard is open or refresh is already running). */
  disabled?: boolean;
}

/**
 * Pointer-events based pull-to-refresh tracker.
 *
 * Activates only when the bound scroll container is at `scrollTop === 0` and the
 * user pulls down with their finger. While pulling, returns the live distance
 * (clamped at `maxPull`) so the caller can render an indicator. Once released
 * past `threshold`, calls `onRefresh()` and keeps `isRefreshing` true until the
 * promise resolves.
 *
 * Designed to feel like iOS / Twitter / Instagram: friction increases past the
 * threshold (1.6× resistance), light haptic on threshold-hit, smooth spring-back.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPull = 140,
  disabled = false,
}: UsePullToRefreshOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startY = useRef(0);
  const tracking = useRef(false);
  const thresholdHit = useRef(false);
  // Mirror state in refs so pointer handlers can read current values without
  // re-binding listeners on every state change.
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const activePointerId = useRef<number | null>(null);

  const setPull = useCallback((v: number) => {
    pullDistanceRef.current = v;
    setPullDistance(v);
  }, []);

  const reset = useCallback(() => {
    tracking.current = false;
    thresholdHit.current = false;
    activePointerId.current = null;
    setPull(0);
  }, [setPull]);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  // Stable ref to the latest onRefresh so we don't re-bind listeners when the
  // caller passes an inline arrow function.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || disabled) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (isRefreshingRef.current) return;
      if (el.scrollTop > 0) return;
      startY.current = e.clientY;
      tracking.current = true;
      thresholdHit.current = false;
      activePointerId.current = e.pointerId;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!tracking.current || e.pointerId !== activePointerId.current) return;
      const dy = e.clientY - startY.current;

      if (el.scrollTop > 0 || dy < 0) {
        reset();
        return;
      }

      if (dy > 0) {
        const resisted = dy <= threshold ? dy : threshold + (dy - threshold) / 1.6;
        const clamped = Math.min(resisted, maxPull);
        setPull(clamped);

        if (!thresholdHit.current && resisted >= threshold) {
          thresholdHit.current = true;
          if (typeof navigator !== "undefined") navigator.vibrate?.(10);
        } else if (thresholdHit.current && resisted < threshold) {
          thresholdHit.current = false;
        }
      }
    };

    const onPointerUp = async (e: PointerEvent) => {
      if (!tracking.current || e.pointerId !== activePointerId.current) return;
      const shouldRefresh = pullDistanceRef.current >= threshold;
      tracking.current = false;
      activePointerId.current = null;

      if (shouldRefresh) {
        setIsRefreshing(true);
        isRefreshingRef.current = true;
        setPull(threshold);
        try {
          await onRefreshRef.current();
        } finally {
          setIsRefreshing(false);
          isRefreshingRef.current = false;
          setPull(0);
          thresholdHit.current = false;
        }
      } else {
        reset();
      }
    };

    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    el.addEventListener("pointermove", onPointerMove, { passive: true });
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", reset);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", reset);
    };
  }, [disabled, maxPull, reset, setPull, threshold]);

  return { containerRef, pullDistance, isRefreshing, threshold };
}
