// ═══ P3: SELF-TUNING BUDGETS ═══
// Reads rolling P95 from agent_model_performance table
// and auto-adjusts SLA timeouts for optimal latency.
// Runs once per request (cached in-memory for 5 minutes).

import type { ComplexityTier } from "./bee-brain-complexity.ts";
import { TIER_SLA_TARGETS } from "./bee-brain-complexity.ts";
import type { SLATarget } from "./bee-brain-complexity.ts";

interface TunedBudget {
  stepTimeoutMs: number;
  toolTimeoutMs: number;
  p50Ms: number;
  p95Ms: number;
  source: 'tuned' | 'default';
}

// In-memory cache (per-isolate, 5-min TTL)
const budgetCache = new Map<string, { budget: TunedBudget; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Get self-tuned SLA budget for a complexity tier.
 * Reads rolling P95 from DB and adjusts timeouts accordingly.
 * Falls back to static TIER_SLA_TARGETS if no data.
 */
export async function getTunedBudget(
  serviceClient: any,
  tier: ComplexityTier | undefined,
): Promise<TunedBudget> {
  const effectiveTier = tier || 'moderate';
  const cacheKey = `budget:${effectiveTier}`;

  // Check in-memory cache
  const cached = budgetCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.budget;
  }

  const defaults = TIER_SLA_TARGETS[effectiveTier];
  const defaultBudget: TunedBudget = {
    stepTimeoutMs: defaults.stepTimeoutMs,
    toolTimeoutMs: defaults.toolTimeoutMs,
    p50Ms: defaults.p50Ms,
    p95Ms: defaults.p95Ms,
    source: 'default',
  };

  try {
    // Query rolling performance for this tier (last 24h of data)
    const { data } = await serviceClient
      .from('agent_model_performance')
      .select('avg_latency_ms, p95_latency_ms, total_requests')
      .eq('complexity_tier', effectiveTier)
      .gte('total_requests', 10) // Minimum sample size
      .order('updated_at', { ascending: false })
      .limit(5);

    if (!data || data.length === 0) {
      budgetCache.set(cacheKey, { budget: defaultBudget, cachedAt: Date.now() });
      return defaultBudget;
    }

    // Weighted average across recent performance records
    let totalWeight = 0;
    let weightedP95 = 0;
    let weightedAvg = 0;
    for (const row of data) {
      const weight = row.total_requests;
      totalWeight += weight;
      weightedP95 += row.p95_latency_ms * weight;
      weightedAvg += row.avg_latency_ms * weight;
    }

    const rollingP95 = Math.round(weightedP95 / totalWeight);
    const rollingAvg = Math.round(weightedAvg / totalWeight);

    // Self-tuning logic:
    // If rolling P95 is significantly below static target → tighten (faster SLA)
    // If rolling P95 exceeds static target → loosen (prevent premature timeouts)
    const staticP95 = defaults.p95Ms;
    const ratio = rollingP95 / staticP95;

    let tunedStepTimeout = defaults.stepTimeoutMs;
    let tunedToolTimeout = defaults.toolTimeoutMs;
    let tunedP50 = defaults.p50Ms;
    let tunedP95 = defaults.p95Ms;

    if (ratio < 0.6) {
      // Performing much faster than target → tighten by 20%
      tunedStepTimeout = Math.round(defaults.stepTimeoutMs * 0.8);
      tunedToolTimeout = Math.round(defaults.toolTimeoutMs * 0.85);
      tunedP50 = Math.round(rollingAvg * 1.2); // Set P50 target slightly above actual
      tunedP95 = Math.round(rollingP95 * 1.3); // Set P95 target with 30% headroom
      console.log(`[SelfTune] ${effectiveTier}: TIGHTENED — rolling P95 ${rollingP95}ms << static ${staticP95}ms (ratio: ${ratio.toFixed(2)})`);
    } else if (ratio > 1.2) {
      // Exceeding target → loosen by 15% (but cap at 2x static)
      tunedStepTimeout = Math.min(Math.round(defaults.stepTimeoutMs * 1.15), defaults.stepTimeoutMs * 2);
      tunedToolTimeout = Math.min(Math.round(defaults.toolTimeoutMs * 1.1), defaults.toolTimeoutMs * 2);
      tunedP95 = Math.round(rollingP95 * 1.1); // Accept reality + 10% buffer
      tunedP50 = Math.round(rollingAvg * 1.1);
      console.log(`[SelfTune] ${effectiveTier}: LOOSENED — rolling P95 ${rollingP95}ms > static ${staticP95}ms (ratio: ${ratio.toFixed(2)})`);
    } else {
      // Within acceptable range — use actuals with small buffer
      tunedP50 = Math.round(Math.max(rollingAvg, defaults.p50Ms * 0.8));
      tunedP95 = Math.round(Math.max(rollingP95, defaults.p95Ms * 0.8));
      console.log(`[SelfTune] ${effectiveTier}: ON-TARGET — rolling P95 ${rollingP95}ms ≈ static ${staticP95}ms`);
    }

    const tuned: TunedBudget = {
      stepTimeoutMs: tunedStepTimeout,
      toolTimeoutMs: tunedToolTimeout,
      p50Ms: tunedP50,
      p95Ms: tunedP95,
      source: 'tuned',
    };

    budgetCache.set(cacheKey, { budget: tuned, cachedAt: Date.now() });
    return tuned;
  } catch (e) {
    console.warn(`[SelfTune] Failed, using defaults:`, e instanceof Error ? e.message : e);
    budgetCache.set(cacheKey, { budget: defaultBudget, cachedAt: Date.now() });
    return defaultBudget;
  }
}

/**
 * Invalidate the budget cache for a tier (call after significant performance changes).
 */
export function invalidateBudgetCache(tier?: ComplexityTier): void {
  if (tier) {
    budgetCache.delete(`budget:${tier}`);
  } else {
    budgetCache.clear();
  }
}
