import type { EvReasoningLevel } from "@/features/ev-voice/protocols";

export type { EvReasoningLevel } from "@/features/ev-voice/protocols";

export type EvLiveModelProfile = {
  id: string;
  label: string;
  description: string;
  affectiveDialog: boolean;
  proactiveAudio: boolean;
  reasoningLevel: EvReasoningLevel;
  thinkingConfig?:
    | { thinkingLevel: Exclude<EvReasoningLevel, "dynamic"> }
    | { thinkingBudget: -1 | 0 };
};

export const AFFECTIVE_EV_LIVE_MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025";
export const ANALYTICAL_EV_LIVE_MODEL = "models/gemini-3.1-flash-live-preview";
export const DEFAULT_EV_LIVE_MODEL = AFFECTIVE_EV_LIVE_MODEL;

export const EV_LIVE_MODEL_PROFILES: readonly EvLiveModelProfile[] = [
  {
    id: AFFECTIVE_EV_LIVE_MODEL,
    label: "Adaptive Voice · Gemini 2.5 Live",
    description: "Recommended: expressive native audio with reliable conversational turn-taking.",
    affectiveDialog: true,
    // E.V is opened explicitly by the user, so every completed utterance should
    // receive a response. Proactive audio can intentionally suppress replies
    // when the model decides speech was not directed at the assistant.
    proactiveAudio: false,
    reasoningLevel: "minimal",
    thinkingConfig: { thinkingBudget: 0 },
  },
  {
    id: ANALYTICAL_EV_LIVE_MODEL,
    label: "Analytical Voice · Gemini 3.1 Live",
    description: "Low-latency native audio; complex work is delegated to the grounded operator.",
    affectiveDialog: false,
    proactiveAudio: false,
    // Keep the real-time voice transport fast. The engine's adaptive policy
    // delegates complex, evidence-heavy work to the bounded operator instead
    // of making every conversational reply pay a reasoning delay.
    reasoningLevel: "minimal",
    thinkingConfig: { thinkingLevel: "minimal" },
  },
] as const;

const profilesById = new Map(EV_LIVE_MODEL_PROFILES.map((profile) => [profile.id, profile]));

export function normalizeEvLiveModel(model: string): string {
  return model.startsWith("models/") ? model : `models/${model}`;
}

export function evLiveModelProfile(model: string): EvLiveModelProfile {
  return profilesById.get(normalizeEvLiveModel(model)) ?? EV_LIVE_MODEL_PROFILES[0];
}

export function isSupportedEvLiveModel(model: string): boolean {
  return profilesById.has(normalizeEvLiveModel(model));
}

export function evLiveReasoningLevel(model: string): EvReasoningLevel {
  return evLiveModelProfile(model).reasoningLevel;
}
