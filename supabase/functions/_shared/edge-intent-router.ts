// ═══ P3: EDGE INTENT ROUTER — Sub-50ms Pre-Classification ═══
// Lightweight regex-based router that runs BEFORE the Observer LLM call.
// Assigns SLA tier + routing hints without consuming any LLM tokens.
// Goal: eliminate Observer LLM call for 70%+ of messages.

import type { ComplexityTier } from "./bee-brain-complexity.ts";

export interface EdgeRouteResult {
  /** Pre-assigned complexity tier (may be refined by Observer) */
  tier: ComplexityTier;
  /** Whether Observer LLM call can be skipped entirely */
  skipObserver: boolean;
  /** Pre-classified primary action hint */
  actionHint: string;
  /** Whether tools are likely needed */
  needsTools: boolean;
  /** Classification confidence (0-1) */
  confidence: number;
  /** Route source for telemetry */
  source: 'edge_greeting' | 'edge_confirmation' | 'edge_farewell' | 'edge_emotional' |
          'edge_short_simple' | 'edge_tool_keyword' | 'edge_deep_keyword' | 'edge_question' |
          'edge_unknown';
  /** Prefetch hints — what data to pre-load before LLM call */
  prefetchHints?: { finance: boolean; tasks: boolean; kb: boolean };
}

// ═══ COMPILED REGEX PATTERNS (initialized once, reused across requests) ═══

const GREETING_RX = /^(hi|hello|hey|yo|sup|မင်္ဂလာ|ဟယ်လို|ဟိုင်း|good\s*(morning|afternoon|evening|night))\s*[!.?]*\s*$/i;
const FAREWELL_RX = /^(thanks?|thank\s*you|ကျေးဇူး|bye|goodbye|see\s*you|ဘိုင်|good\s*night)\s*[!.?]*\s*$/i;
const CONFIRMATION_RX = /^(yes|no|yeah|nah|yep|nope|ok|okay|sure|right|correct|exactly|ဟုတ်|မဟုတ်|ဟုတ်ကဲ့|အင်း|ကောင်းပြီ|ရပါတယ်|ရတယ်|အိုကေ|got\s*it|alright|fine|good|great|cool|nice)\s*[!.?]*\s*$/i;
const EMOTIONAL_RX = /^(i('m| am)\s+(happy|sad|tired|bored|excited|stressed|angry)|ပျော်|ဝမ်းနည်း|ပင်ပန်း|စိတ်ညစ်|love\s+you|ချစ်တယ်|haha|lol|😂|😊|🥲|😭)\s*[!.?]*\s*$/i;

// Tool-requiring keywords (compiled once)
const TOOL_KEYWORDS_RX = /search|ရှာ|price|ဈေး|write|ရေး|draw|ဆွဲ|image|ပုံ|task|အလုပ်|expense|ငွေ|balance|config|setting|schedule|remind|broadcast|goal|credit|health|api|key|token|channel|remember|မှတ်|cancel|stop|delete|ဖျက်|facebook|fb/i;

// Deep/complex keywords
const DEEP_KEYWORDS_RX = /deep|analyze|research|audit|architecture|strategy|refactor|redesign|optimize|comprehensive|thorough|အသေးစိတ်|ခွဲခြမ်း|in.?depth|systematic|သုတေသန|စိစစ်|လေ့လာ|ပိုင်းခြား|စူးစမ်း|ဆန်းစစ်|အသေးစိတ်လုပ်|benchmark|quantiz|compress|pipeline|latency|infrastructure|အခြေခံ|အဆင့်မြင့်|နက်ရှိုင်း|ခွဲခြမ်းစိတ်ဖြာ|အကဲဖြတ်|compare|evaluate|diagnose/i;

// Question patterns
const QUESTION_RX = /\?\s*$|^(what|who|when|where|why|how|which|ဘာ|ဘယ်|ဘာကြောင့်|ဘယ်လို)\s/i;
const QUESTION_END_RX = /(သလဲ|လဲ|လား)\s*[?]?\s*$/;

// ═══ PREFETCH HINT PATTERNS (compiled once) ═══
const FINANCE_PREFETCH_RX = /ငွေ|balance|expense|income|ဈေး|money|cost|budget|လက်ကျန်|ဘယ်လောက်|subscription|profit|loss/i;
const TASK_PREFETCH_RX = /task|အလုပ်|todo|workspace|assign|leaderboard|point|ပွိုင့်/i;
const KB_PREFETCH_RX = /knowledge|သိ|learn|ဘာလဲ|explain|ရှင်းပြ|how\s+to|tutorial|guide/i;

/**
 * Edge Intent Router — sub-1ms classification.
 * Runs before Observer to skip LLM calls for high-confidence patterns.
 */
export function edgeClassify(message: string): EdgeRouteResult {
  const trimmed = message.trim();
  const len = trimmed.length;

  // ═══ INSTANT ROUTES: Zero-ambiguity patterns ═══

  if (GREETING_RX.test(trimmed)) {
    return { tier: 'greeting', skipObserver: true, actionHint: 'answer_question', needsTools: false, confidence: 0.99, source: 'edge_greeting' };
  }

  if (FAREWELL_RX.test(trimmed)) {
    return { tier: 'greeting', skipObserver: true, actionHint: 'answer_question', needsTools: false, confidence: 0.99, source: 'edge_farewell' };
  }

  if (CONFIRMATION_RX.test(trimmed)) {
    return { tier: 'simple', skipObserver: true, actionHint: 'answer_question', needsTools: false, confidence: 0.95, source: 'edge_confirmation' };
  }

  if (EMOTIONAL_RX.test(trimmed)) {
    return { tier: 'simple', skipObserver: true, actionHint: 'answer_question', needsTools: false, confidence: 0.92, source: 'edge_emotional' };
  }

  // ═══ SHORT SIMPLE MESSAGES: <40 chars, no tool keywords ═══
  if (len < 40 && !TOOL_KEYWORDS_RX.test(trimmed)) {
    const isQuestion = QUESTION_RX.test(trimmed) || QUESTION_END_RX.test(trimmed);
    return {
      tier: 'simple',
      skipObserver: true,
      actionHint: isQuestion ? 'answer_question' : 'answer_question',
      needsTools: false,
      confidence: 0.85,
      source: 'edge_short_simple',
    };
  }

  // ═══ PREFETCH HINTS: Compute once for tool/deep routes ═══
  const prefetchHints = {
    finance: FINANCE_PREFETCH_RX.test(trimmed),
    tasks: TASK_PREFETCH_RX.test(trimmed),
    kb: KB_PREFETCH_RX.test(trimmed),
  };
  const hasPrefetch = prefetchHints.finance || prefetchHints.tasks || prefetchHints.kb;

  // ═══ DEEP KEYWORDS: Route to complex/deep tier ═══
  if (DEEP_KEYWORDS_RX.test(trimmed) && len > 30) {
    return {
      tier: len > 100 ? 'deep' : 'complex',
      skipObserver: false,
      actionHint: 'search_web',
      needsTools: true,
      confidence: 0.7,
      source: 'edge_deep_keyword',
      prefetchHints: hasPrefetch ? prefetchHints : undefined,
    };
  }

  // ═══ TOOL KEYWORDS DETECTED: Needs Observer but we pre-assign tier ═══
  if (TOOL_KEYWORDS_RX.test(trimmed)) {
    return {
      tier: 'moderate',
      skipObserver: false,
      actionHint: 'other',
      needsTools: true,
      confidence: 0.6,
      source: 'edge_tool_keyword',
      prefetchHints: hasPrefetch ? prefetchHints : undefined,
    };
  }

  // ═══ QUESTION WITHOUT TOOL KEYWORDS: Likely simple knowledge ═══
  if (QUESTION_RX.test(trimmed) || QUESTION_END_RX.test(trimmed)) {
    return {
      tier: len > 80 ? 'moderate' : 'simple',
      skipObserver: len > 80 ? false : true,
      actionHint: 'answer_question',
      needsTools: false,
      confidence: len > 80 ? 0.6 : 0.8,
      source: 'edge_question',
      prefetchHints: hasPrefetch ? prefetchHints : undefined,
    };
  }

  // ═══ UNKNOWN: Must use Observer ═══
  return {
    tier: 'moderate',
    skipObserver: false,
    actionHint: 'other',
    needsTools: false,
    confidence: 0.3,
    source: 'edge_unknown',
  };
}

/**
 * Merge edge route with Observer result.
 * Observer always wins when it runs, but edge provides fallback tier.
 */
export function mergeEdgeWithObserver(
  edge: EdgeRouteResult,
  observer: { complexity?: string; primary_action?: string; needs_tools?: boolean } | null,
): { finalTier: ComplexityTier; finalAction: string; observerUsed: boolean } {
  if (!observer) {
    // Observer didn't run or failed — use edge classification
    return { finalTier: edge.tier, finalAction: edge.actionHint, observerUsed: false };
  }

  // Observer result available — it wins for action, but edge tier can provide bounds
  const observerTier = observer.complexity === 'complex' ? 'complex' as ComplexityTier
    : observer.complexity === 'simple' ? 'simple' as ComplexityTier
    : 'moderate' as ComplexityTier;

  return {
    finalTier: observerTier,
    finalAction: observer.primary_action || edge.actionHint,
    observerUsed: true,
  };
}
