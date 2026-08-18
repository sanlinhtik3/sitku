import type { EvConversationMessage } from "./contracts";

export interface EvSummaryDraft {
  summary: string;
  facts: string[];
  decisions: string[];
  unresolved: string[];
  fromSequence: number;
  toSequence: number;
}

interface SummaryInput {
  messages: EvConversationMessage[];
  previousSummary?: string;
}

interface SummaryPipeline {
  invoke(input: SummaryInput, options?: { tags?: string[] }): Promise<EvSummaryDraft>;
}

const MAX_LINE = 280;
const MAX_ITEMS = 8;

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clip(value: string): string {
  const normalized = clean(value);
  return normalized.length <= MAX_LINE ? normalized : `${normalized.slice(0, MAX_LINE - 1)}…`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(clip).filter(Boolean))].slice(0, MAX_ITEMS);
}

function sentences(value: string): string[] {
  return value
    .split(/(?<=[.!?။])\s+|\n+/u)
    .map(clean)
    .filter(Boolean);
}

function summarizeLocally(input: SummaryInput): EvSummaryDraft {
  const messages = [...input.messages].sort((a, b) => a.sequence - b.sequence);
  if (!messages.length) throw new Error("EV_MEMORY_MESSAGES_REQUIRED: No finalized E.V messages were supplied.");

  const userSentences = messages
    .filter((message) => message.role === "user")
    .flatMap((message) => sentences(message.content));
  const assistantSentences = messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) => sentences(message.content));

  const facts = unique(userSentences.filter((sentence) =>
    /\b(?:i am|i'm|my|i use|i prefer|remember that)\b/i.test(sentence)
      || /(?:ငါက|ကျွန်တော်က|ကျွန်မက|ငါ့|ကျွန်တော့်|ကြိုက်တယ်|မကြိုက်ဘူး|မှတ်ထား)/u.test(sentence),
  ));
  const decisions = unique(userSentences.filter((sentence) =>
    /\b(?:i agree|decided|we will|let's|go with|use this)\b/i.test(sentence)
      || /(?:သဘောတူ|ဆုံးဖြတ်|ဆက်လုပ်|လုပ်မယ်|သုံးမယ်|ရွေးမယ်)/u.test(sentence),
  ));
  const unresolved = unique(userSentences.filter((sentence) =>
    /\?|လား(?:\s|$)|ဘယ်လို|ဘာကြောင့်|ဘာကြောင့်/u.test(sentence),
  ));

  const recent = messages.slice(-12).map((message) =>
    `${message.role === "user" ? "User" : "E.V"}: ${clip(message.content)}`,
  );
  const sections = [
    input.previousSummary ? `Earlier context:\n${clip(input.previousSummary)}` : "",
    recent.join("\n"),
    assistantSentences.length ? `Latest E.V outcome: ${clip(assistantSentences.at(-1) || "")}` : "",
  ].filter(Boolean);

  return {
    summary: sections.join("\n\n"),
    facts,
    decisions,
    unresolved,
    fromSequence: messages[0].sequence,
    toSequence: messages.at(-1)!.sequence,
  };
}

/**
 * LangChain owns only the deterministic processing pipeline. Sitku repositories
 * remain the source of truth, so a library or provider failure cannot lose chat data.
 */
export function createEvMemorySummaryProcessor() {
  let pipelinePromise: Promise<SummaryPipeline> | null = null;
  const getPipeline = () => {
    pipelinePromise ||= import("@langchain/core/runnables").then(({ RunnableLambda, RunnableSequence }) => {
      const normalize = RunnableLambda.from((input: SummaryInput) => ({
        messages: input.messages.filter((message) => message.status !== "failed" && clean(message.content)),
        previousSummary: clean(input.previousSummary || "") || undefined,
      }));
      const summarize = RunnableLambda.from(summarizeLocally);
      return RunnableSequence.from([normalize, summarize]) as unknown as SummaryPipeline;
    });
    return pipelinePromise;
  };

  return async (input: SummaryInput): Promise<EvSummaryDraft> => {
    const pipeline = await getPipeline();
    return pipeline.invoke(input, { tags: ["sitku", "ev-memory", "local-first"] });
  };
}
