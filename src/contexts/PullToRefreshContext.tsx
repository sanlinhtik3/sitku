import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type RefreshHandler = () => Promise<void> | void;

interface PullToRefreshContextValue {
  /** The current registered refresh handler, or null if no page wants PTR. */
  handler: RefreshHandler | null;
  /** Set or clear the active handler. Pages do this via `usePullToRefreshRegister`. */
  setHandler: (fn: RefreshHandler | null) => void;
}

const PullToRefreshContext = createContext<PullToRefreshContextValue | null>(null);

/**
 * Provides a single slot where the current page can register its refresh handler.
 * MainLayout consumes this and attaches the pull-to-refresh gesture to its scroll
 * container. Only one page is ever registered at a time (the most recent).
 */
export function PullToRefreshProvider({ children }: { children: ReactNode }) {
  const [handler, setHandlerState] = useState<RefreshHandler | null>(null);
  const setHandler = useCallback((fn: RefreshHandler | null) => {
    setHandlerState(() => fn);
  }, []);
  return (
    <PullToRefreshContext.Provider value={{ handler, setHandler }}>
      {children}
    </PullToRefreshContext.Provider>
  );
}

/**
 * Internal hook used by MainLayout to read the active handler.
 */
export function usePullToRefreshSlot() {
  const ctx = useContext(PullToRefreshContext);
  return ctx;
}

/**
 * Page-side hook: register a refresh handler while the page is mounted.
 *
 * Usage:
 *   const queryClient = useQueryClient();
 *   usePullToRefreshRegister(async () => {
 *     await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
 *   });
 */
export function usePullToRefreshRegister(handler: RefreshHandler | null | undefined) {
  const ctx = useContext(PullToRefreshContext);
  useEffect(() => {
    if (!ctx) return;
    if (!handler) {
      ctx.setHandler(null);
      return;
    }
    ctx.setHandler(handler);
    return () => ctx.setHandler(null);
  }, [ctx, handler]);
}
