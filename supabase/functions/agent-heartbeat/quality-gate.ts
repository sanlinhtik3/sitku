// ═══ Quality Gate ═══
// Rule-based, no LLM. Runs after orchestrator produces final content,
// before Telegram delivery. Returns score (0-100) + ok flag + reasons.
//
// CRITICAL: Verbatim modes (translate/forward/summarize_given) use
// proportional length floors based on the user's actual source content,
// and run a fabrication check that penalises invented entities/sources.

import type { IntentClass } from "./automation-prompt-builder.ts";

export interface QualityGateInput {
  content: string | null;
  intent: IntentClass;
  freshness: "required" | "tool_data" | "none";
  priorRuns: Array<{ summary: string; full?: string | null }>;
  // Did the autonomous task call a search tool? (Optional — heartbeat may pass this.)
  usedSearchTool?: boolean;
  // Did it call data tools (flowstate / workspace)?
  usedDataTool?: boolean;
  // NEW: verbatim source supplied by the user (extracted by the prompt builder).
  // When present, the gate runs proportional-length + fabrication checks.
  sourceContent?: string | null;
}

export interface QualityGateResult {
  ok: boolean;
  score: number;            // 0-100
  reasons: string[];
  flags: {
    too_short?: boolean;
    too_long?: boolean;
    refusal?: boolean;
    placeholder?: boolean;
    insufficient_data?: boolean;
    duplicate?: boolean;
    freshness_violation?: boolean;
    empty?: boolean;
    fabrication?: boolean;
  };
}

const REFUSAL_RX =
  /(?:^|\b)(?:i (?:cannot|can'?t|am unable|won'?t)|sorry,?\s*(?:i|but)|as an ai|i (?:do not|don'?t) have)/i;
const REFUSAL_MM_RX = /(မလုပ်ပေးနိုင်|မဖြေနိုင်|မသိပါ|မရရှိနိုင်)/;
const PLACEHOLDER_RX =
  /(\{\s*[a-z_][a-z0-9_]*\s*\}|\[\s*insert[^\]]*\]|\bTODO\b|Lorem ipsum|XXXX|<placeholder>)/i;
const INSUFFICIENT_RX = /"automation_status"\s*:\s*"insufficient_data"/;

// ─── Fabrication detectors ───
// Citations like "(Source: NYT)" / "[Reuters]" / "— BBC News".
const CITATION_RX = /(\bSource\s*[:\-]\s*[^()\n]{2,40}|\bSource\b\s*\([^)]+\)|—\s*[A-Z][A-Za-z][A-Za-z\s]{2,30}\s+(?:News|Times|Post|Journal|Daily))/g;
// Burmese broadcast-style intros that the agent must NOT add to a verbatim translation.
const BROADCAST_INTRO_RX =
  /(မိတ်ဆွေတို့\s*ရေ|မိတ်ဆွေတို့\s*ရဲ့|ကြည့်ရအောင်|share\s+လုပ်ပေးကြပါ|hello\s+friends|dear\s+friends)/i;
// 3-section emoji breakdown that the agent loves to invent.
const SECTION_BREAKDOWN_RX = /(🤖|💡|⚡|🔥|🎯)\s+\S/g;

function lengthFloor(intent: IntentClass): number {
  switch (intent) {
    case "news":
      return 400;
    case "report":
      return 350;
    case "market":
      return 200;
    case "weather":
      return 150;
    case "reminder":
      return 30;
    case "translate":
    case "forward":
    case "summarize_given":
      // Proportional floors are computed against sourceContent when present;
      // these are the absolute minimums when no source is available.
      return 30;
    default:
      return 80;
  }
}

// Proportional floor for verbatim modes — relative to actual source length.
function proportionalFloor(intent: IntentClass, sourceLen: number): number {
  switch (intent) {
    case "translate":      return Math.max(30, Math.ceil(sourceLen * 0.6));
    case "forward":        return Math.max(30, Math.ceil(sourceLen * 0.8));
    case "summarize_given":return Math.max(30, Math.ceil(sourceLen * 0.1));
    default:               return lengthFloor(intent);
  }
}

// Proportional ceiling for verbatim modes — flags fabrication when exceeded.
function proportionalCeiling(intent: IntentClass, sourceLen: number): number {
  switch (intent) {
    case "translate":      return Math.max(120, Math.ceil(sourceLen * 2.0));
    case "forward":        return Math.max(120, Math.ceil(sourceLen * 1.6));
    case "summarize_given":return Math.max(80,  Math.ceil(sourceLen * 0.6));
    default:               return Number.POSITIVE_INFINITY;
  }
}

// Word-trigram Jaccard similarity. Cheap (O(n)).
function trigrams(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
  const out = new Set<string>();
  for (let i = 0; i < tokens.length - 2; i++) {
    out.add(tokens[i] + " " + tokens[i + 1] + " " + tokens[i + 2]);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function isVerbatim(intent: IntentClass): boolean {
  return intent === "translate" || intent === "forward" || intent === "summarize_given";
}

export function evaluateQuality(input: QualityGateInput): QualityGateResult {
  const reasons: string[] = [];
  const flags: QualityGateResult["flags"] = {};
  let score = 100;

  const raw = (input.content || "").trim();

  if (!raw) {
    return {
      ok: false,
      score: 0,
      reasons: ["empty output"],
      flags: { empty: true },
    };
  }

  // Hard fail: explicit insufficient_data signal
  if (INSUFFICIENT_RX.test(raw)) {
    flags.insufficient_data = true;
    reasons.push("agent reported insufficient_data");
    score = 20;
  }

  // Hard fail: refusal
  if (REFUSAL_RX.test(raw) || REFUSAL_MM_RX.test(raw)) {
    flags.refusal = true;
    reasons.push("refusal/hedging detected");
    score -= 60;
  }

  // Hard fail: placeholder
  if (PLACEHOLDER_RX.test(raw)) {
    flags.placeholder = true;
    reasons.push("placeholder/TODO detected");
    score -= 50;
  }

  const verbatim = isVerbatim(input.intent);
  const sourceLen = (input.sourceContent || "").trim().length;

  // ─── Length floor ───
  const floor = verbatim && sourceLen > 0
    ? proportionalFloor(input.intent, sourceLen)
    : lengthFloor(input.intent);
  if (raw.length < floor) {
    flags.too_short = true;
    reasons.push(`output below length floor (${raw.length} < ${floor} for intent=${input.intent})`);
    score -= 35;
  }

  // ─── Verbatim-only checks ───
  if (verbatim && sourceLen > 0) {
    const ceiling = proportionalCeiling(input.intent, sourceLen);
    if (raw.length > ceiling) {
      flags.too_long = true;
      flags.fabrication = true;
      reasons.push(
        `output exceeds proportional ceiling (${raw.length} > ${ceiling}; source=${sourceLen}); likely fabrication/expansion`,
      );
      score -= 50;
    }

    // Citations that did NOT appear in the source = invented sources.
    const sourceLower = (input.sourceContent || "").toLowerCase();
    const citations = raw.match(CITATION_RX) || [];
    const inventedCitations = citations.filter((c) => !sourceLower.includes(c.toLowerCase().slice(0, 12)));
    if (inventedCitations.length > 0) {
      flags.fabrication = true;
      reasons.push(`fabricated citation(s) detected: ${inventedCitations.slice(0, 2).join(" | ")}`);
      score -= 40;
    }

    // Broadcast-intro fluff that wasn't in source.
    if (BROADCAST_INTRO_RX.test(raw) && !BROADCAST_INTRO_RX.test(input.sourceContent || "")) {
      flags.fabrication = true;
      reasons.push("added broadcast intro/sign-off not present in source");
      score -= 25;
    }

    // 3-section emoji breakdown the agent invented.
    const sectionsInOutput = (raw.match(SECTION_BREAKDOWN_RX) || []).length;
    const sectionsInSource = ((input.sourceContent || "").match(SECTION_BREAKDOWN_RX) || []).length;
    if (sectionsInOutput >= 3 && sectionsInOutput > sectionsInSource + 1) {
      flags.fabrication = true;
      reasons.push(`added ${sectionsInOutput - sectionsInSource} unsolicited section headers`);
      score -= 25;
    }
  }

  // ─── Freshness violation (non-verbatim only) ───
  if (!verbatim) {
    if (input.freshness === "required" && input.usedSearchTool === false) {
      flags.freshness_violation = true;
      reasons.push("freshness=required but no search tool was invoked");
      score -= 30;
    }
    if (input.freshness === "tool_data" && input.usedDataTool === false) {
      flags.freshness_violation = true;
      reasons.push("freshness=tool_data but no data tool was invoked");
      score -= 20;
    }
  } else {
    // Verbatim modes should NOT call search. Penalise if they did — that's
    // the agent ignoring the user's literal source content.
    if (input.usedSearchTool === true) {
      reasons.push("verbatim mode but agent called a search tool (ignored user-supplied source)");
      score -= 20;
    }
  }

  // ─── Duplication vs prior runs (non-verbatim only — verbatim repeats are fine) ───
  if (!verbatim && input.priorRuns && input.priorRuns.length > 0) {
    const myGrams = trigrams(raw);
    let maxSim = 0;
    let hitIndex = -1;
    for (let i = 0; i < input.priorRuns.length; i++) {
      const prior = input.priorRuns[i].full || input.priorRuns[i].summary || "";
      if (!prior) continue;
      const sim = jaccard(myGrams, trigrams(prior));
      if (sim > maxSim) {
        maxSim = sim;
        hitIndex = i;
      }
    }
    if (maxSim > 0.55) {
      flags.duplicate = true;
      reasons.push(
        `near-duplicate of run-${hitIndex + 1} (jaccard=${maxSim.toFixed(2)})`,
      );
      score -= 40;
    } else if (maxSim > 0.4) {
      reasons.push(`high similarity to run-${hitIndex + 1} (jaccard=${maxSim.toFixed(2)})`);
      score -= 15;
    }
  }

  score = Math.max(0, Math.min(100, score));
  const ok = score >= 50
    && !flags.refusal
    && !flags.placeholder
    && !flags.empty
    && !flags.insufficient_data
    && !flags.duplicate
    && !flags.fabrication;

  return { ok, score, reasons, flags };
}
