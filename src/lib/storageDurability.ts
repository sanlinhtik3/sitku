// ── Storage durability ──────────────────────────────────────────────────────
// The single source of truth for "is our local data safe from browser eviction?".
//
// IndexedDB is "best-effort" by default — Safari evicts it after ~7 idle days,
// and any browser may evict under storage pressure. `navigator.storage.persist()`
// upgrades the origin to "persistent" (exempt from automatic eviction), but it is
// only GRANTED under certain conditions (installed PWA, high engagement, bookmark,
// notifications permission, …). The previous code fired persist() from three
// different store inits and never checked the result — so durability was silently
// false (measured). This centralizes the request, caches the verified status, and
// lets the UI warn the user when their data is NOT protected.

export interface DurabilityStatus {
  supported: boolean;   // the Storage API exists
  persisted: boolean;   // origin is persistent → exempt from automatic eviction
  requested: boolean;   // we attempted persist() this session
  usage?: number;       // bytes used (best-effort)
  quota?: number;       // bytes available (best-effort)
}

let cached: DurabilityStatus | null = null;
let inflight: Promise<DurabilityStatus> | null = null;
const listeners = new Set<(s: DurabilityStatus) => void>();

function notify(s: DurabilityStatus) {
  cached = s;
  for (const l of listeners) { try { l(s); } catch { /* ignore */ } }
}

/** Subscribe to durability-status changes. Returns an unsubscribe fn. */
export function onDurabilityChange(fn: (s: DurabilityStatus) => void): () => void {
  listeners.add(fn);
  if (cached) fn(cached);
  return () => listeners.delete(fn);
}

export function getDurabilityStatus(): DurabilityStatus | null {
  return cached;
}

async function readEstimate(): Promise<{ usage?: number; quota?: number }> {
  try {
    const est = await navigator.storage?.estimate?.();
    return { usage: est?.usage, quota: est?.quota };
  } catch { return {}; }
}

/**
 * Request + verify persistent storage. Idempotent and de-duplicated: safe to call
 * from app startup AND from each store's init — only the first does real work.
 * Never throws.
 */
export async function ensurePersistentStorage(): Promise<DurabilityStatus> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const supported = typeof navigator !== "undefined" && !!navigator.storage?.persist;
    if (!supported) {
      const s: DurabilityStatus = { supported: false, persisted: false, requested: false };
      notify(s);
      return s;
    }
    let persisted = false;
    try { persisted = (await navigator.storage.persisted?.()) ?? false; } catch { /* ignore */ }
    let requested = false;
    if (!persisted) {
      requested = true;
      try { persisted = (await navigator.storage.persist()) ?? false; } catch { /* ignore */ }
    }
    const est = await readEstimate();
    const s: DurabilityStatus = { supported: true, persisted, requested, ...est };
    notify(s);
    return s;
  })();

  try { return await inflight; } finally { inflight = null; }
}

/** Re-check the current grant + usage without forcing another persist() prompt. */
export async function refreshDurabilityStatus(): Promise<DurabilityStatus> {
  const supported = typeof navigator !== "undefined" && !!navigator.storage?.persist;
  if (!supported) { const s = { supported: false, persisted: false, requested: false }; notify(s); return s; }
  let persisted = false;
  try { persisted = (await navigator.storage.persisted?.()) ?? false; } catch { /* ignore */ }
  const est = await readEstimate();
  const s: DurabilityStatus = { supported: true, persisted, requested: cached?.requested ?? false, ...est };
  notify(s);
  return s;
}
