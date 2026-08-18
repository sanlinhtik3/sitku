export const JARVIS_RUNTIME_POLICY = {
  endOfSpeechMs: 400,
  cloudFirstAudioGraceMs: 3000,
  // Audio transcription is the first blocking network hop. It needs a short recovery ceiling so
  // a dead request cannot hold the orb on "Understanding" for tens of seconds. Conversation and
  // TTS keep their more generous limits below because they may legitimately do more work.
  transcriptionInactivityMs: 10000,
  providerInactivityMs: 45000,
  ttsInactivityMs: 30000,
  speakSafetyCeilingMs: 60000,
} as const;

// Audio transcription and JSON routing need a model with predictable no-thinking behavior.
// Conversation model selection remains independent in Settings.
export function audioRoutingModel(_selectedModel: string): "gemini-2.5-flash" {
  return "gemini-2.5-flash";
}

export type JarvisReasoningMode = "fast" | "light" | "balanced" | "deep";
export type JarvisReasoningRoute = "local" | "live" | "operator";
export type JarvisReasoningLevel = "minimal" | "low" | "medium" | "high" | "dynamic";

export interface JarvisReasoningDecision {
  mode: JarvisReasoningMode;
  level: JarvisReasoningLevel;
  route: JarvisReasoningRoute;
  score: number;
  risk: "low" | "medium" | "high";
  ambiguous: boolean;
  reasons: string[];
}

export interface JarvisReasoningContext {
  action?: string;
  requiresConfirmation?: boolean;
  liveForeground?: boolean;
}

const GREETING = /^(hi|hello|hey|thanks|thank you|မင်္ဂလာပါ|ကျေးဇူး)/i;
const COMPLEX = /\b(research|analy[sz]e|compare|strategy|architecture|debug|audit|plan|diagnose|root cause|trade-?offs?|evaluate)\b|လေ့လာ|နှိုင်းယှဉ်|ဗျူဟာ|အစီအစဉ်|စစ်ဆေး|အကြောင်းရင်း|အားသာချက်|အားနည်းချက်/i;
const MULTI_STEP = /\b(and then|after that|and (?:recommend|propose|implement|fix)|step by step|layer by layer|end to end)\b|နောက်ပြီး|ပြီးရင်|ထို့နောက်|အစအဆုံး|အဆင့်ဆင့်/i;
const HIGH_RISK = /\b(delete|remove|overwrite|replace|terminal|shell|execute|payment|revenue|payroll)\b|ဖျက်|ပယ်ဖျက်|အစားထိုး|ဝင်ငွေ|လစာ/i;
const AMBIGUOUS = /^(this|that|it|those|ဒီဟာ|ဒါ|အဲဒါ|အဲ့တာ)(\s|$)/i;

/**
 * App-level reasoning policy. Gemini Live keeps one stable session; this decision
 * selects the cheapest safe route for each turn without reconnecting the voice stream.
 */
export function reasoningPolicyForTurn(
  text: string,
  context: JarvisReasoningContext = {},
): JarvisReasoningDecision {
  const value = text.trim();
  const action = context.action?.trim() || "none";
  const deterministicAction = action !== "none";
  const reasons: string[] = [];
  let score = 0;

  if (value.length > 180) { score += 2; reasons.push("long_request"); }
  else if (value.length > 90) { score += 1; reasons.push("detailed_request"); }
  if (COMPLEX.test(value)) { score += 2; reasons.push("analysis_required"); }
  if (MULTI_STEP.test(value)) { score += 2; reasons.push("multi_step"); }
  const ambiguous = AMBIGUOUS.test(value);
  if (ambiguous) { score += 1; reasons.push("context_reference"); }

  const riskyLanguage = HIGH_RISK.test(value);
  const risk = context.requiresConfirmation || riskyLanguage ? "high" : deterministicAction ? "medium" : "low";
  if (risk === "high") { score += 2; reasons.push("consequential_action"); }
  else if (deterministicAction) reasons.push("deterministic_action");

  if (!deterministicAction && GREETING.test(value) && value.length < 80) {
    return { mode: "fast", level: "minimal", route: "local", score: 0, risk: "low", ambiguous: false, reasons: ["social_fast_path"] };
  }

  // Operator handoff is explicit. Never copy a complex request that may contain
  // private workspace context into a separate agent merely because it scored high.
  if (action === "delegate_operator_task") {
    return { mode: "deep", level: "high", route: "operator", score: Math.max(score, 4), risk: "low", ambiguous, reasons: [...reasons, "explicit_operator_handoff"] };
  }

  if (context.liveForeground) {
    return { mode: "fast", level: "minimal", route: "live", score, risk, ambiguous, reasons: reasons.length ? reasons : ["ordinary_turn"] };
  }

  // Writes remain in the deterministic action engine even when risky. The Operator
  // can reason, but it must never bypass confirmation or perform the write itself.
  if (deterministicAction) {
    const deepAction = risk === "high" || score >= 5;
    return {
      mode: deepAction ? "deep" : "light",
      level: deepAction ? "high" : "low",
      route: "live",
      score,
      risk,
      ambiguous,
      reasons,
    };
  }

  if (score >= 4) return { mode: "deep", level: "high", route: "live", score, risk, ambiguous, reasons };
  if (score >= 2) return { mode: "balanced", level: "medium", route: "live", score, risk, ambiguous, reasons };
  return { mode: "light", level: "low", route: "live", score, risk, ambiguous, reasons: reasons.length ? reasons : ["ordinary_turn"] };
}

export function reasoningModeForText(text: string): JarvisReasoningMode {
  return reasoningPolicyForTurn(text).mode;
}

export function escalateReasoningMode(mode: JarvisReasoningMode): JarvisReasoningMode {
  if (mode === "fast") return "light";
  if (mode === "light") return "balanced";
  return "deep";
}

export function thinkingConfig(
  model: string,
  mode: JarvisReasoningMode,
): { thinkingBudget: number } | { thinkingLevel: "minimal" | "low" | "medium" | "high" } {
  if (/^gemini-2\.5-/i.test(model)) {
    if (mode === "fast") return { thinkingBudget: 0 };
    if (mode === "light") return { thinkingBudget: 1024 };
    return { thinkingBudget: -1 };
  }
  if (mode === "fast") return { thinkingLevel: "minimal" };
  if (mode === "light") return { thinkingLevel: "low" };
  if (mode === "balanced") return { thinkingLevel: "medium" };
  return { thinkingLevel: "high" };
}

/** Deep, non-live work can spend more reasoning without delaying live turn-taking. */
export function operatorThinkingConfig(
  model: string,
): { thinkingBudget: -1 } | { thinkingLevel: "high" } {
  return /^gemini-2\.5-/i.test(model)
    ? { thinkingBudget: -1 }
    : { thinkingLevel: "high" };
}

export function supportsStreamingTts(model: string): boolean {
  const match = model.match(/gemini-(\d+)\.(\d+)-/i);
  return !!match && (Number(match[1]) > 3 || (Number(match[1]) === 3 && Number(match[2]) >= 1));
}
