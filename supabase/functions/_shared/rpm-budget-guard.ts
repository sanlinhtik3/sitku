// ═══ UNIFIED RPM BUDGET GUARD ═══
// Tracks ALL LLM API calls per user per minute across all callers:
// main loop, narration, internal scoring, context compaction, embeddings.
// Prevents satellite calls from exhausting the user's RPM budget before the main loop fires.

interface RPMEntry {
  calls: number;
  windowStart: number;
}

// Per-user RPM tracking (in-memory, resets per Deno isolate)
const _rpmTracker = new Map<string, RPMEntry>();
const RPM_WINDOW_MS = 60_000; // 1 minute

// RPM limits by model tier (conservative — leaves headroom for main loop)
// RPM limits by model tier — matched to Google free-tier actuals
const RPM_LIMITS: Record<string, number> = {
  pro: 2,         // gemini-*-pro — Google free tier RPM=2
  flash: 5,       // gemini-*-flash — Google free tier RPM=5
  flash_lite: 10, // gemini-*-flash-lite — Google free tier RPM=10
  default: 5,     // conservative default
};

// How much of the RPM budget satellite calls are allowed to consume
// Main loop always gets priority — satellites can use at most this fraction
const SATELLITE_RPM_FRACTION = 0.4;

export type CallPriority = 'main' | 'satellite';

function getModelTier(model: string): string {
  if (!model) return 'default';
  const lower = model.toLowerCase();
  if (lower.includes('pro') && !lower.includes('flash')) return 'pro';
  if (lower.includes('flash-lite') || lower.includes('flash_lite')) return 'flash_lite';
  if (lower.includes('flash')) return 'flash';
  return 'default';
}

function getRPMLimit(model: string): number {
  const tier = getModelTier(model);
  return RPM_LIMITS[tier] || RPM_LIMITS.default;
}

/**
 * Check if an LLM call is allowed within the user's RPM budget.
 *
 * @param userId - User identifier for tracking
 * @param model - The model being called (determines RPM limit)
 * @param priority - 'main' for agentic loop calls, 'satellite' for narration/internal/etc.
 * @returns true if the call is allowed, false if it should be skipped
 */
export function canMakeLLMCall(userId: string, model: string, priority: CallPriority): boolean {
  const now = Date.now();
  const key = `${userId}:${model}`;
  const entry = _rpmTracker.get(key);

  // Reset window if expired
  if (!entry || (now - entry.windowStart) >= RPM_WINDOW_MS) {
    // New window — allow the call
    return true;
  }

  const limit = getRPMLimit(model);

  // Main loop calls: allowed up to the full RPM limit
  if (priority === 'main') {
    return entry.calls < limit;
  }

  // Satellite calls: allowed up to SATELLITE_RPM_FRACTION of the limit
  const satelliteLimit = Math.max(1, Math.floor(limit * SATELLITE_RPM_FRACTION));
  // Count how many calls have been made — if we're near the limit, deny satellite calls
  // Reserve remaining RPM for the main loop
  const remainingBudget = limit - entry.calls;
  const mainReserve = Math.ceil(limit * (1 - SATELLITE_RPM_FRACTION));

  if (remainingBudget <= mainReserve) {
    console.log(`[RPMGuard] Satellite call DENIED for ${model} — ${remainingBudget}/${limit} RPM remaining (reserving ${mainReserve} for main loop)`);
    return false;
  }

  return entry.calls < satelliteLimit;
}

/**
 * Record an LLM call in the RPM tracker.
 * Call this AFTER a successful API call (or at call initiation).
 */
export function recordLLMCall(userId: string, model: string): void {
  const now = Date.now();
  const key = `${userId}:${model}`;
  const entry = _rpmTracker.get(key);

  if (!entry || (now - entry.windowStart) >= RPM_WINDOW_MS) {
    _rpmTracker.set(key, { calls: 1, windowStart: now });
  } else {
    entry.calls++;
  }

  // Prevent unbounded memory growth — evict stale entries
  if (_rpmTracker.size > 1000) {
    for (const [k, v] of _rpmTracker) {
      if ((now - v.windowStart) >= RPM_WINDOW_MS) {
        _rpmTracker.delete(k);
      }
    }
  }
}

/**
 * Convenience: Check + record in one call. Returns true if allowed.
 */
export function tryLLMCall(userId: string, model: string, priority: CallPriority): boolean {
  if (!canMakeLLMCall(userId, model, priority)) return false;
  recordLLMCall(userId, model);
  return true;
}

/**
 * Get current RPM usage for debugging/logging.
 */
export function getRPMUsage(userId: string, model: string): { calls: number; limit: number; remaining: number } {
  const key = `${userId}:${model}`;
  const entry = _rpmTracker.get(key);
  const limit = getRPMLimit(model);
  const calls = entry && (Date.now() - entry.windowStart) < RPM_WINDOW_MS ? entry.calls : 0;
  return { calls, limit, remaining: limit - calls };
}
