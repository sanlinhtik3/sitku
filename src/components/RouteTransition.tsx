import { type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useIsMobile } from "@/hooks/use-mobile";

interface RouteTransitionProps {
  children: ReactNode;
}

/**
 * Mobile-only fade+rise transition between routes.
 *
 * Wraps `<Outlet />` (or any switching content) in an `AnimatePresence` so each
 * route mounts with a brief fade + 6px lift — the same micro-motion native iOS
 * stacks use for a "settled" feel without being slow. On desktop and when the
 * user prefers reduced motion, this is a transparent passthrough.
 *
 * Anchored to `location.pathname` so re-rendering the same route (search-param
 * change, etc.) doesn't replay the animation.
 */
export function RouteTransition({ children }: RouteTransitionProps) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const prefersReduced = useReducedMotion();

  if (!isMobile || prefersReduced) {
    return <>{children}</>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -2 }}
        transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
        style={{ willChange: "transform, opacity" }}
        className="h-full w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
