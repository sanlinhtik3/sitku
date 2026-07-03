// ═══════════════════════════════════════════════════════════════
// 🧭 BEE BRAIN — COMPLEXITY MODULE
// Dynamic routing, step budgets, wall-clock budgets, temperature scaling
// Extracted from bee-brain.ts (P2 refactor)
// ═══════════════════════════════════════════════════════════════

export type ComplexityTier = "greeting" | "simple" | "turbo" | "moderate" | "complex" | "deep" | "ultra-deep";

export interface AdaptiveStepConfig {
  maxSteps: number;
  tier: ComplexityTier;
}

const STEP_BUDGET: Record<ComplexityTier, number> = {
  "greeting":   1,
  "simple":     2,
  "turbo":      2,
  "moderate":   4,
  "complex":    6,
  "deep":       8,
  "ultra-deep": 8,
};

// ═══ P1: WALL-CLOCK BUDGETS per complexity tier ═══
// P0: Increased deep/ultra-deep budgets to 45s to reduce premature relay triggers (10-min total window)
export const COMPLEXITY_WALL_CLOCK_MS: Record<ComplexityTier, number> = {
  "greeting":   6_000,
  "simple":     6_000,
  "turbo":      15_000,
  "moderate":   30_000,
  "complex":    40_000,
  "deep":       45_000,
  "ultra-deep": 45_000,
};

export const CONTINUATION_TRIGGER_RATIO = 0.85;

// ═══ P1: SLA TARGETS — Per-tier P50/P95 latency goals (ms) ═══
// Used for self-tuning: if rolling P95 exceeds target, system can auto-adjust budgets
export interface SLATarget {
  p50Ms: number;
  p95Ms: number;
  stepTimeoutMs: number;
  toolTimeoutMs: number;
}

export const TIER_SLA_TARGETS: Record<ComplexityTier, SLATarget> = {
  "greeting":   { p50Ms: 1_500, p95Ms: 3_000,  stepTimeoutMs: 8_000,  toolTimeoutMs: 5_000  },
  "simple":     { p50Ms: 2_000, p95Ms: 5_000,  stepTimeoutMs: 10_000, toolTimeoutMs: 6_000  },
  "turbo":      { p50Ms: 3_000, p95Ms: 8_000,  stepTimeoutMs: 15_000, toolTimeoutMs: 8_000  },
  "moderate":   { p50Ms: 5_000, p95Ms: 15_000, stepTimeoutMs: 25_000, toolTimeoutMs: 12_000 },
  "complex":    { p50Ms: 8_000, p95Ms: 25_000, stepTimeoutMs: 30_000, toolTimeoutMs: 15_000 },
  "deep":       { p50Ms: 15_000, p95Ms: 35_000, stepTimeoutMs: 35_000, toolTimeoutMs: 15_000 },
  "ultra-deep": { p50Ms: 20_000, p95Ms: 40_000, stepTimeoutMs: 40_000, toolTimeoutMs: 15_000 },
};

/**
 * Get SLA-driven timeouts for a complexity tier.
 * Falls back to moderate defaults if tier unknown.
 */
export function getSLATimeouts(tier: ComplexityTier | undefined): SLATarget {
  return TIER_SLA_TARGETS[tier || "moderate"];
}

/**
 * Dynamic Routing: Maps observer complexity + flags into optimal step budget.
 */
export function getAdaptiveStepBudget(opts: {
  observerComplexity?: "simple" | "moderate" | "complex" | null;
  isSimpleMessage: boolean;
  isTurboMessage?: boolean;
  isDeepQuery: boolean;
  isUltraDeep: boolean;
  isContinuation: boolean;
  messageText?: string;
}): AdaptiveStepConfig {
  if (opts.isContinuation) return { maxSteps: STEP_BUDGET["deep"], tier: "deep" };
  if (opts.isUltraDeep) return { maxSteps: STEP_BUDGET["ultra-deep"], tier: "ultra-deep" };

  if (opts.messageText) {
    const multiStepPattern = /\b(audit|architecture|strategy|research|refactor|redesign)\b|analyze\s+\w*\s*system|optimize\s+\w*\s*pipeline/i;
    if (multiStepPattern.test(opts.messageText) && (opts.isDeepQuery || opts.observerComplexity === 'complex')) {
      console.log(`[AdaptiveStepBudget] Multi-step keywords detected → ultra-deep (10 steps)`);
      return { maxSteps: STEP_BUDGET["ultra-deep"], tier: "ultra-deep" };
    }
  }

  if (opts.isDeepQuery) return { maxSteps: STEP_BUDGET["deep"], tier: "deep" };
  if (opts.isSimpleMessage) return { maxSteps: STEP_BUDGET["greeting"], tier: "greeting" };

  if (opts.isTurboMessage) {
    console.log(`[AdaptiveStepBudget] Turbo tier detected → 2 steps, 15s budget`);
    return { maxSteps: STEP_BUDGET["turbo"], tier: "turbo" };
  }

  if (opts.observerComplexity === "complex") return { maxSteps: STEP_BUDGET["complex"], tier: "complex" };

  // ═══ COMPLEXITY ESCALATION: Detect hidden complexity in "simple" classifications ═══
  // If observer says "simple" but message contains complex entities, escalate to moderate.
  if (opts.observerComplexity === "simple" && opts.messageText) {
    const msg = opts.messageText;
    const hasComplexSignals =
      msg.length > 100 ||                                              // Long messages are rarely simple
      /\$[\d,]+|\d{4,}|\d+%/.test(msg) ||                             // Financial amounts, large numbers, percentages
      /portfolio|rebalance|invest|ROI|compound|amortiz/i.test(msg) ||  // Financial analysis
      /deadline|schedule|timeline|roadmap/i.test(msg) ||               // Temporal planning
      /compare|contrast|analyze|evaluate|pros.*cons/i.test(msg) ||     // Analytical queries
      /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(msg);             // Date references
    if (hasComplexSignals) {
      console.log(`[AdaptiveStepBudget] Complexity escalation: observer=simple but complex signals detected → moderate`);
      return { maxSteps: STEP_BUDGET["moderate"], tier: "moderate" };
    }
    return { maxSteps: STEP_BUDGET["simple"], tier: "simple" };
  }

  if (opts.observerComplexity === "simple") return { maxSteps: STEP_BUDGET["simple"], tier: "simple" };

  return { maxSteps: STEP_BUDGET["moderate"], tier: "moderate" };
}

// ═══ ADAPTIVE TEMPERATURE SCALING ═══
export function getAdaptiveTemperature(baseTemp: number, retryCount: number): number {
  const reduction = retryCount * 0.15;
  return Math.max(0.3, baseTemp - reduction);
}

// ═══ REASONING BOOST ═══
export interface ReasoningBoost {
  temperature: number;
  top_p: number;
  active: boolean;
}

export type ModelTier = "pro" | "flash" | "lite";

export function getModelTier(modelId: string): ModelTier {
  if (modelId.startsWith('google/')) {
    return getModelTier(modelId.replace(/^google\//, ''));
  }
  // OpenRouter models (contain '/') — smart classification by model name
  if (modelId.includes('/')) {
    const name = (modelId.split('/').pop() || '').toLowerCase();
    if (name.includes("lite") || name.includes("nano") || name.includes("mini")) return "lite";
    if (name.includes("pro") || name.includes("sonnet") || name.includes("r1") || name.includes("plus") || name.includes("opus")) return "pro";
    return "flash";
  }
  if (modelId.includes("lite")) return "lite";
  if (modelId.includes("pro") || modelId.includes("sonnet")) return "pro";
  return "flash";
}

export function getReasoningBoost(modelId: string, isDeepQuery: boolean): ReasoningBoost {
  const tier = getModelTier(modelId);
  if (tier === "pro" && isDeepQuery) return { temperature: 0.5, top_p: 0.98, active: true };
  return { temperature: 0, top_p: 0, active: false };
}

// ═══ PROMPT TIER SYSTEM ═══
export type PromptTier = "minimal" | "abbreviated" | "moderate" | "full";

export function getPromptTier(complexityTier: ComplexityTier | undefined): PromptTier {
  if (!complexityTier) return "moderate";
  switch (complexityTier) {
    case "greeting":
    case "simple":
    case "turbo":
      return "minimal";
    case "moderate":
      return "moderate";
    case "complex":
    case "deep":
    case "ultra-deep":
      return "full";
  }
}

// ═══ FAST MODEL MAP ═══
const FAST_MODEL_MAP: Record<string, string> = {
  "gemini-3.1-pro-preview":     "gemini-3.5-flash",
  "gemini-2.5-pro":             "gemini-2.5-flash",
  "gemini-3-pro-image-preview": "gemini-3.5-flash",
};

export function getFastModel(model: string): string {
  return FAST_MODEL_MAP[model] || model;
}

// ═══ MODEL SELECTION BY STEP TYPE ═══
export function getStepModel(
  baseModel: string,
  _step: number,
  _complexityTier: ComplexityTier | undefined,
  _isGuardRetry: boolean,
): string {
  // Model Sovereignty: always use user's selected model — no silent swaps
  return baseModel;
}
