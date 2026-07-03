import { useEffect, useState } from "react";

/**
 * Tracks the browser's online/offline state.
 *
 * Returns `true` when navigator reports we have a network connection. Subscribes
 * to the standard `online` / `offline` window events. The `online` flag here
 * doesn't guarantee reachability of any specific server, only that the OS sees
 * a network — but that's enough to drive a connectivity banner.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return isOnline;
}
