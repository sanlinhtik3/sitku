import * as React from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useIsMobile } from "@/hooks/use-mobile";

interface PullToRefreshProps {
  /** Async handler that performs the refresh (e.g. `queryClient.invalidateQueries`). */
  onRefresh: () => Promise<void> | void;
  /** Disable the gesture (e.g. when nested inside another scroll container). */
  disabled?: boolean;
  /** Class for the outer scroll container. */
  className?: string;
  /** Class for the inner content. */
  contentClassName?: string;
  children: React.ReactNode;
}

/**
 * Native-feel pull-to-refresh wrapper.
 *
 * Wrap any scrollable region. On mobile, dragging down from `scrollTop=0` shows
 * an iOS-style indicator that ramps from arrow → spinner past the threshold.
 * On desktop the wrapper is a transparent passthrough.
 *
 * Usage:
 *   <PullToRefresh onRefresh={() => queryClient.invalidateQueries(...)}>
 *     <YourScrollContent />
 *   </PullToRefresh>
 */
export function PullToRefresh({
  onRefresh,
  disabled,
  className,
  contentClassName,
  children,
}: PullToRefreshProps) {
  const isMobile = useIsMobile();
  const { containerRef, pullDistance, isRefreshing, threshold } = usePullToRefresh({
    onRefresh,
    disabled: disabled || !isMobile,
  });

  const progress = Math.min(pullDistance / threshold, 1);
  const showIndicator = pullDistance > 0 || isRefreshing;
  const isReady = pullDistance >= threshold || isRefreshing;

  // Translate the inner content down by the current pull amount, plus reserve
  // space for the indicator while refreshing.
  const translateY = isRefreshing ? threshold : pullDistance;

  if (!isMobile) {
    return (
      <div ref={containerRef} className={cn("overflow-y-auto", className)}>
        <div className={contentClassName}>{children}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-y-auto overscroll-contain",
        className,
      )}
    >
      {/* Indicator — pinned to viewport top, fades in as user pulls. */}
      <div
        aria-hidden={!showIndicator}
        className={cn(
          "pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-center",
          "transition-opacity",
        )}
        style={{
          height: `${threshold}px`,
          opacity: showIndicator ? 1 : 0,
          transform: `translateY(${pullDistance - threshold}px)`,
          transition: isRefreshing ? "transform 180ms cubic-bezier(0.32,0.72,0,1)" : undefined,
        }}
      >
        <div className="flex items-center justify-center h-full">
          <div
            className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center",
              "bg-card/70 backdrop-blur-md border border-border/40 shadow-md",
              "transition-colors",
              isReady && "border-primary/60 text-primary",
            )}
            style={{
              transform: `rotate(${progress * 180}deg) scale(${0.6 + progress * 0.4})`,
              transition: isRefreshing ? "transform 200ms ease-out" : undefined,
            }}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <ArrowDown
                className={cn(
                  "h-4 w-4 transition-colors",
                  isReady ? "text-primary" : "text-muted-foreground",
                )}
              />
            )}
          </div>
        </div>
      </div>

      {/* Content — translated down to make room for the indicator. */}
      <div
        className={contentClassName}
        style={{
          transform: `translateY(${translateY}px)`,
          transition: isRefreshing
            ? "transform 220ms cubic-bezier(0.32,0.72,0,1)"
            : pullDistance === 0
              ? "transform 220ms cubic-bezier(0.32,0.72,0,1)"
              : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
