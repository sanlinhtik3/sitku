import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Slim top-of-screen banner that appears when the device loses network.
 *
 * - Slides in from above the safe-area inset, doesn't shift page layout (fixed).
 * - Fires a Sonner toast on reconnect so the user knows recovery happened even
 *   if they didn't notice the banner disappear.
 * - Mobile-first sizing (h-7) so it doesn't crowd the screen.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  // Track the last-seen state to detect transitions (offline → online).
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      toast.success("ပြန်လည်ချိတ်ဆက်ပြီး", {
        description: "Connection restored",
        duration: 2500,
      });
    }
  }, [isOnline]);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          className="fixed inset-x-0 top-0 z-[60] pointer-events-none"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="mx-auto flex max-w-md items-center justify-center gap-2 mt-1 mx-3 rounded-full bg-destructive/95 px-3 py-1.5 shadow-lg backdrop-blur-md pointer-events-auto">
            <WifiOff className="h-3.5 w-3.5 text-destructive-foreground" />
            <span className="text-xs font-medium text-destructive-foreground">
              ချိတ်ဆက်မှုပြတ်နေသည်
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
