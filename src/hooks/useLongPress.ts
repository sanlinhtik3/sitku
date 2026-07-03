import { useCallback, useEffect, useRef } from "react";

interface UseLongPressOptions {
  /** Hold duration in ms before the long-press fires. Default 500ms (iOS standard). */
  delay?: number;
  /** Movement tolerance in px. Going past this cancels the press. Default 8. */
  movementThreshold?: number;
  /** Disable the gesture (e.g. on desktop or while a streaming reply is in flight). */
  disabled?: boolean;
}

interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/**
 * iOS-style long-press detector for touch surfaces.
 *
 * Returns a set of pointer-event handlers to spread on the target element. Calls
 * `onLongPress(e)` after `delay` ms of continuous touch with movement < threshold.
 * Fires a short haptic pulse (10ms) on trigger if the platform supports it.
 *
 * Mouse pointers are ignored — long-press is a touch-only interaction. Right-click
 * (`onContextMenu`) is suppressed on touch to prevent the native action sheet from
 * fighting our custom one.
 */
export function useLongPress(
  onLongPress: (e: React.PointerEvent) => void,
  { delay = 500, movementThreshold = 8, disabled = false }: UseLongPressOptions = {},
): LongPressHandlers {
  const timeoutRef = useRef<number | null>(null);
  const startCoord = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    startCoord.current = null;
    firedRef.current = false;
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      if (e.pointerType !== "touch") return;
      startCoord.current = { x: e.clientX, y: e.clientY };
      firedRef.current = false;
      timeoutRef.current = window.setTimeout(() => {
        firedRef.current = true;
        if (typeof navigator !== "undefined") navigator.vibrate?.(10);
        onLongPress(e);
      }, delay);
    },
    [disabled, delay, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startCoord.current) return;
      const dx = e.clientX - startCoord.current.x;
      const dy = e.clientY - startCoord.current.y;
      if (Math.hypot(dx, dy) > movementThreshold) clear();
    },
    [clear, movementThreshold],
  );

  const onPointerUp = useCallback(() => {
    clear();
  }, [clear]);

  const onPointerLeave = useCallback(() => {
    clear();
  }, [clear]);

  const onPointerCancel = useCallback(() => {
    clear();
  }, [clear]);

  // Suppress the browser's native context menu when our long-press fires —
  // otherwise iOS Safari shows a "copy/share/look up" sheet on top of ours.
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (firedRef.current) e.preventDefault();
    },
    [],
  );

  return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onPointerCancel, onContextMenu };
}
