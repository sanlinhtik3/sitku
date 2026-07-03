// ═══ Shared Personality, Language Detection & Confidence Decay ═══
// Single source of truth — used by narration-llm.ts, prompt-builder.ts, network.ts, bee-brain.ts

// ═══ LANGUAGE DETECTION ═══
export function detectLanguage(text: string): "burmese" | "english" | "mixed" {
  const burmeseChars = (text.match(/[\u1000-\u109F\uAA60-\uAA7F]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length || 1;
  const ratio = burmeseChars / totalChars;
  if (ratio > 0.3) return "burmese";
  if (ratio > 0.05) return "mixed";
  return "english";
}

// ═══ CONFIDENCE DECAY (exponential, unified) ═══
export function decayConfidence(confidence: number, createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 3) return confidence;
  const decayPeriods = Math.floor(ageDays / 3);
  return Math.max(0.1, confidence * Math.pow(0.8, decayPeriods));
}

// ═══ UNIFIED PERSONALITY CONFIG ═══
export interface PersonalityProfile {
  style: string;
  emojiDensity: string;
  tokenBudget: string;
  toolPreference: string;
  addressStyle: string;
}

export const PERSONALITY_CONFIG: Record<string, PersonalityProfile> = {
  friendly: {
    style: "warm, encouraging, natural",
    emojiDensity: "2-4 relevant emojis",
    tokenBudget: "200-400",
    toolPreference: "Use show_widget for visual data. Balance tools and direct answers.",
    addressStyle: "Use user's name frequently. Celebrate user wins.",
  },
  professional: {
    style: "concise, factual, direct",
    emojiDensity: "0 emojis",
    tokenBudget: "100-250",
    toolPreference: "Prefer search_knowledge_base for verified answers. Use show_widget for ≥3 metrics or trends; never for single facts.",
    addressStyle: "Formal. Structured output. No filler words.",
  },
  casual: {
    style: "relaxed, fun, street-smart",
    emojiDensity: "1-3 fun emojis",
    tokenBudget: "150-350",
    toolPreference: "Use show_widget more often for visual flair. Quick tool runs preferred.",
    addressStyle: "Nickname-friendly. Drop formality entirely.",
  },
  mentor: {
    style: "wise, patient, guiding",
    emojiDensity: "0-1 emoji",
    tokenBudget: "300-500",
    toolPreference: "ALWAYS prefer search_knowledge_base before direct answers. Teach through tools.",
    addressStyle: "Supportive. Socratic. Explain the 'why'.",
  },
};

// Helper to get narration tone subset
export function getNarrationTone(mode: string): { style: string; emojiDensity: string } {
  const p = PERSONALITY_CONFIG[mode] || PERSONALITY_CONFIG.friendly;
  return { style: p.style, emojiDensity: p.emojiDensity };
}

// Helper to build prompt behavior block
export function buildPersonalityBehaviorBlock(mode: string): string {
  const p = PERSONALITY_CONFIG[mode] || PERSONALITY_CONFIG.friendly;
  const label = mode.toUpperCase();
  return `
## PERSONALITY BEHAVIOR: ${label}
- Response budget: ${p.tokenBudget} tokens.
- Emoji density: ${p.emojiDensity} per response.
- Tool preference: ${p.toolPreference}
- Tone: ${p.style}.
- Address style: ${p.addressStyle}`;
}
