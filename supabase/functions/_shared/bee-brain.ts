// ═══════════════════════════════════════════════════════════════
// 🧬 BEE BRAIN: Re-Export Hub + Utilities
// P2 Refactor: Split into 4 focused sub-modules for maintainability.
// All existing imports from "./bee-brain.ts" continue to work.
// ═══════════════════════════════════════════════════════════════

// ═══ RE-EXPORTS: Persona Module ═══
export {
  resolveUserName,
  CONTENT_FILTER_DIRECTIVE,
  PERSONA_RULES,
  AUTOMATION_CAPABILITY,
  THINKING_PROTOCOL,
  THINKING_PROTOCOL_ABBREVIATED,
  THINKING_PROTOCOL_MODERATE,
  sanitizeContextForName,
  applyContentFirewall,
  getNameEnforcementBlock,
} from "./bee-brain-persona.ts";

// ═══ RE-EXPORTS: Complexity Module ═══
export {
  type ComplexityTier,
  type AdaptiveStepConfig,
  type ReasoningBoost,
  type ModelTier,
  type PromptTier,
  type SLATarget,
  COMPLEXITY_WALL_CLOCK_MS,
  CONTINUATION_TRIGGER_RATIO,
  TIER_SLA_TARGETS,
  getAdaptiveStepBudget,
  getAdaptiveTemperature,
  getModelTier,
  getReasoningBoost,
  getPromptTier,
  getFastModel,
  getStepModel,
  getSLATimeouts,
} from "./bee-brain-complexity.ts";

// ═══ RE-EXPORTS: Request Builder Module ═══
export {
  SAYA_GYI_TUNING,
  DEFAULT_TUNING,
  DEFAULT_HB_TUNING,
  buildAdaptiveRequestBody,
} from "./bee-brain-request-builder.ts";

// ═══ RE-EXPORTS: Integrity Module ═══
export {
  type IntegrityReport,
  verifyToolResultIntegrity,
} from "./bee-brain-integrity.ts";

// ═══ RE-EXPORTS: Shared Personality/Decay ═══
import { decayConfidence } from "./personality-config.ts";
export {
  detectLanguage,
  decayConfidence,
  PERSONALITY_CONFIG,
  getNarrationTone,
  buildPersonalityBehaviorBlock,
} from "./personality-config.ts";


// ═══════════════════════════════════════════════════════════════
// 🧠 REMAINING UTILITIES: Thinking Cache, Scoring, Parallel Intent
// These are small enough to stay in the hub file.
// ═══════════════════════════════════════════════════════════════

/**
 * Generates a simple hash fingerprint from a query for pattern matching.
 */
export function generateQueryFingerprint(query: string): string {
  return query
    .toLowerCase()
    .replace(/[0-9]+/g, '#')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\u1000-\u109F#]/g, '')
    .trim()
    .slice(0, 200);
}

/**
 * V2: Generate a category-based cache key from observer result.
 */
export function generateCategoryCacheKey(
  primaryAction: string | undefined,
  complexity: string | undefined,
  query: string,
): string {
  const action = primaryAction || "other";
  const tier = complexity || "moderate";
  const stopwords = new Set(["the","a","an","is","are","was","were","be","been","what","how","who","where","when","why","can","could","would","should","do","does","did","have","has","had","my","your","this","that","me","i","to","for","of","in","on","at","and","or","but","not","it","its"]);
  const keywords = query.toLowerCase()
    .replace(/[^\w\s\u1000-\u109F]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w))
    .slice(0, 3)
    .sort()
    .join('+');
  return `${action}:${tier}:${keywords}`;
}

/**
 * Extracts a compressed reasoning strategy summary from thinking content.
 */
export function extractReasoningFingerprint(thinkingContent: string): string | null {
  if (!thinkingContent || thinkingContent.length < 50) return null;
  const planMatch = thinkingContent.match(/(?:plan|strategy|approach|tool check)[:\s]*(.{50,300})/i);
  if (planMatch) return planMatch[1].trim().slice(0, 300);
  const mid = Math.floor(thinkingContent.length / 4);
  return thinkingContent.slice(mid, mid + 300).trim();
}

/**
 * Builds the Brain State Recall injection for the system message.
 */
export function buildBrainStateRecall(cachedStrategies: Array<{ insight: string; confidence: number; created_at?: string }>): string {
  if (!cachedStrategies || cachedStrategies.length === 0) return "";
  const topStrategy = cachedStrategies
    .map(s => ({
      ...s,
      effectiveConfidence: s.created_at ? decayConfidence(s.confidence || 0, s.created_at) : (s.confidence || 0),
    }))
    .sort((a, b) => b.effectiveConfidence - a.effectiveConfidence)[0];
  if (topStrategy.effectiveConfidence < 0.3) return "";
  return `\n[BRAIN_STATE_RECALL] Similar query pattern detected. Previous successful strategy: ${topStrategy.insight.slice(0, 400)}\nConfidence: ${(topStrategy.effectiveConfidence * 100).toFixed(0)}%. Use this as a starting hint but adapt to the current context.\n`;
}

/**
 * Scores a message's importance for context compaction decisions.
 */
export function scoreMessageImportance(
  msg: { role: string; content?: string; name?: string; tool_calls?: any; error?: boolean },
  index: number,
  totalMessages: number,
  laterContent: string,
): number {
  let score = 0;
  const content = typeof msg.content === 'string' ? msg.content : '';
  if (msg.role === "system") return 100;
  if (msg.role === "user") score += 8;
  else if (msg.role === "tool") score += (msg.error ? 3 : 6);
  else if (msg.role === "assistant") score += 2;
  if (index >= totalMessages - 4) score += 3;
  const numberCount = (content.match(/\d+/g) || []).length;
  if (numberCount > 5) score += 2;
  if (msg.role === "tool" && msg.name && laterContent.includes(msg.name)) score += 3;
  if (content.length < 100) score += 1;
  return score;
}

// ═══ PARALLEL INTENT DIRECTIVE (compressed) ═══
export const PARALLEL_INTENT_DIRECTIVE = `
## PARALLEL INTENT PLANNING
SCAN request for ALL data points. EMIT ALL independent tool calls in ONE response.
Example: "Bitcoin price and weather" → search_web("Bitcoin price") + search_web("weather") — BOTH in one response.
Sequential ONLY when output depends on prior result (e.g., search then scrape top result).
When in doubt, parallelize silently.
`;
