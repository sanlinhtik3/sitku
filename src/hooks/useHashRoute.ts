import { useState, useEffect, useCallback } from "react";

/**
 * Lightweight hash-based router for in-page navigation.
 * Listens to `hashchange` and syncs with React state.
 * Supports browser back/forward buttons natively.
 */
export function useHashRoute() {
  const [hash, setHashState] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHashState(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setHash = useCallback((newHash: string) => {
    const normalized = newHash.startsWith("#") ? newHash : `#${newHash}`;
    if (window.location.hash !== normalized) {
      window.location.hash = normalized;
    }
  }, []);

  const clearHash = useCallback(() => {
    if (window.location.hash) {
      history.pushState(null, "", window.location.pathname + window.location.search);
      // Manually dispatch since pushState doesn't trigger hashchange
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }, []);

  /** Check if current hash matches a given path */
  const isHash = useCallback((target: string) => {
    const normalized = target.startsWith("#") ? target : `#${target}`;
    return hash === normalized;
  }, [hash]);

  return { hash, setHash, clearHash, isHash };
}
