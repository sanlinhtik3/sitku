export type EvConversationPurpose =
  | "command"
  | "answer"
  | "coach"
  | "explain"
  | "creative"
  | "read"
  | "action_result"
  | "error";

export type EvStorytellingDepth = "none" | "micro" | "guided";

export interface EvConversationDeliveryPlan {
  storytelling: EvStorytellingDepth;
  responseShape: "result_first" | "answer_first" | "narrative_arc" | "source_faithful";
  maxRoutineSentences: number;
}

export interface EvNarrativeConversationProtocol {
  readonly id: "ev.narrative-conversation";
  readonly version: 1;
  readonly systemInstruction: string;
  plan(purpose: EvConversationPurpose, requestedDetail?: boolean): EvConversationDeliveryPlan;
}

const DIRECT_PLAN: EvConversationDeliveryPlan = {
  storytelling: "none",
  responseShape: "result_first",
  maxRoutineSentences: 2,
};

const ANSWER_PLAN: EvConversationDeliveryPlan = {
  storytelling: "micro",
  responseShape: "answer_first",
  maxRoutineSentences: 4,
};

const NARRATIVE_PLAN: EvConversationDeliveryPlan = {
  storytelling: "guided",
  responseShape: "narrative_arc",
  maxRoutineSentences: 6,
};

const READ_PLAN: EvConversationDeliveryPlan = {
  storytelling: "none",
  responseShape: "source_faithful",
  maxRoutineSentences: 0,
};

export const EV_NARRATIVE_CONVERSATION_INSTRUCTION = `NARRATIVE CONVERSATION PROTOCOL (v1):
- Build rapport through attention, continuity, and useful specificity, never through unnecessary length or fake intimacy.
- Commands, approvals, action results, errors, risks, filenames, numbers, and evidence are direct and result-first. Do not turn them into a story.
- For explanations, coaching, creative discussion, or reflection, use a compact spoken arc when it helps: concrete context -> tension or contrast -> useful insight -> practical landing. Usually two to four natural sentences are enough.
- Lead with the answer. A story supports the answer; it must never delay, obscure, or replace it.
- Use the user's concrete nouns and current conversational context. Do not invent shared memories, personal experiences, emotions, sources, facts, or outcomes.
- In Burmese, use conversational phrasing, short breath groups, and natural connective words. Avoid textbook openings, essay headings, repetitive summaries, ceremonial language, and translated-English cadence unless the user requests a formal style.
- Ask at most one useful follow-up question. Do not ask one when the next action or answer is already clear.
- Reading and dictation stay source-faithful. Grounded answers keep evidence attached. Safety, permissions, and deterministic tool results always override narrative style.
- Never expose hidden reasoning. Give the conclusion, concise rationale, evidence, and next useful step.`;

function planConversationDelivery(
  purpose: EvConversationPurpose,
  requestedDetail = false,
): EvConversationDeliveryPlan {
  if (purpose === "command" || purpose === "action_result" || purpose === "error") {
    return DIRECT_PLAN;
  }
  if (purpose === "read") return READ_PLAN;
  if (purpose === "coach" || purpose === "explain" || purpose === "creative") {
    return requestedDetail ? NARRATIVE_PLAN : ANSWER_PLAN;
  }
  return ANSWER_PLAN;
}

export const evNarrativeConversationProtocol: EvNarrativeConversationProtocol = Object.freeze({
  id: "ev.narrative-conversation",
  version: 1,
  systemInstruction: EV_NARRATIVE_CONVERSATION_INSTRUCTION,
  plan: planConversationDelivery,
});
