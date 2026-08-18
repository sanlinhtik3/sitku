import { lazy, type ComponentType } from "react";

// Stale-chunk recovery for code-split imports. After a rebuild/redeploy the hashed chunk filenames
// change; a page still running the OLD entry bundle requests a chunk name that no longer exists and
// the dynamic import rejects with "Failed to fetch dynamically imported module". We reload ONCE to
// pull the fresh index.html + manifest, then stop (a genuinely missing chunk must surface, not loop
// forever). This matters most in the Electron desktop build, which is rebuilt under a still-running
// window during development — reload re-reads dist/index.html from disk and gets the new hashes.
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    importFn().catch((error) => {
      const KEY = "chunk_reload";
      const last = sessionStorage.getItem(KEY);
      const now = Date.now();
      if (last && now - parseInt(last, 10) < 10000) throw error; // just reloaded — this is a real failure
      sessionStorage.setItem(KEY, now.toString());
      window.location.reload();
      return new Promise<{ default: T }>(() => {}); // never resolves; the page is reloading
    }),
  );
}
