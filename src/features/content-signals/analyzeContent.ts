import type {
  ContentAnalysisInput,
  ContentProfile,
  ContentRecommendation,
  ContentSignalEvidence,
  ContentSignalReport,
  ContentSignalScore,
} from "./types";

const BURMESE_SENTENCE_END = /[.!?။]+/u;
const MARKDOWN_LINE = /^(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+|```|\|)/;

function cleanMarkdown(value: string): string {
  return value
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~#>]/g, "")
    .replace(/\r\n/g, "\n");
}

function paragraphs(value: string): string[] {
  const proseOnly = value
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/```[\s\S]*?```/g, "")
    .split(/\r?\n/)
    .filter((line) => !MARKDOWN_LINE.test(line.trim()))
    .join("\n");
  return cleanMarkdown(proseOnly)
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\n+/g, " ").trim())
    .filter(Boolean);
}

function segmentCount(value: string): number {
  const text = cleanMarkdown(value).trim();
  if (!text) return 0;
  try {
    const Segmenter = Intl.Segmenter as unknown as new (locale?: string, options?: { granularity: "sentence" }) => { segment(value: string): Iterable<unknown> };
    return [...new Segmenter(undefined, { granularity: "sentence" }).segment(text)].length;
  } catch {
    return text.split(BURMESE_SENTENCE_END).filter((item) => item.trim()).length;
  }
}

function wordCount(value: string): number {
  const text = cleanMarkdown(value).trim();
  if (!text) return 0;
  try {
    const Segmenter = Intl.Segmenter as unknown as new (locale?: string, options?: { granularity: "word" }) => {
      segment(value: string): Iterable<{ segment: string; isWordLike?: boolean }>;
    };
    return [...new Segmenter("my", { granularity: "word" }).segment(text)]
      .filter((part) => part.isWordLike && part.segment.trim())
      .length;
  } catch {
    return text.split(/\s+/).filter(Boolean).length;
  }
}

function clip(value: string, length = 92) {
  return value.length > length ? `${value.slice(0, length - 1).trimEnd()}…` : value;
}

function score(id: ContentSignalScore["id"], label: string, value: number | null, summary: string, status: ContentSignalScore["status"], confidence: ContentSignalScore["confidence"] = "medium", evidence?: ContentSignalEvidence[]): ContentSignalScore {
  return { id, label, value, summary, status, confidence, evidence };
}

function hasQuestionOrTension(value: string) {
  return /[?？]|ဘာကြောင့်|ဘယ်လို|မသိသေး|အမှန်တကယ်|but\b|why\b|how\b|secret\b|mistake\b/i.test(value);
}

function hasEvidence(value: string) {
  return /(?:\b\d+(?:[.,]\d+)?%|\b\d{1,3}(?:,\d{3})+\b|https?:\/\/|\[[^\]]+\]\([^)]*\)|source|အချက်အလက်|သက်သေ|အရင်းအမြစ်)/iu.test(value);
}

function analyze(input: ContentAnalysisInput): ContentSignalReport {
  const body = cleanMarkdown(input.content);
  const blocks = paragraphs(input.content);
  const first = blocks[0] || "";
  const chars = body.replace(/\s/g, "").length;
  const words = wordCount(input.content);
  const headings = (input.content.match(/^#{1,6}\s+/gm) || []).length;
  const links = (input.content.match(/\[[^\]]+\]\([^)]*\)/g) || []).length;
  const citations = links + (input.content.match(/https?:\/\//g) || []).length;
  const sentences = segmentCount(input.content);
  const recommendations: ContentRecommendation[] = [];
  const hookValue = !first ? null : Math.min(100, 35 + (hasQuestionOrTension(first) ? 35 : 0) + (first.length < 190 ? 20 : 5));
  const hookStatus = hookValue === null ? "needs_data" : hookValue >= 70 ? "good" : "watch";
  if (hookStatus === "watch") recommendations.push({ id: "strengthen-hook", title: "Strengthen the opening", detail: "Open with a sharper question, tension, or concrete promise.", paragraph: 1 });

  const flowValue = blocks.length < 2 ? 45 : Math.min(100, 60 + Math.min(25, (blocks.length - 1) * 7) + (hasQuestionOrTension(body) ? 8 : 0));
  const flowStatus = blocks.length < 2 ? "watch" : flowValue >= 75 ? "good" : "watch";
  if (blocks.length < 2) recommendations.push({ id: "add-breathing-room", title: "Add a second beat", detail: "Split the idea into short paragraphs so the reader can follow the turn.", paragraph: 1 });

  const averageSegmentLength = sentences ? Math.round(chars / sentences) : 0;
  const clarityValue = chars === 0 ? null : averageSegmentLength <= 155 ? 84 : averageSegmentLength <= 235 ? 67 : 48;
  const clarityStatus = clarityValue === null ? "needs_data" : clarityValue >= 72 ? "good" : "watch";
  if (clarityStatus === "watch") recommendations.push({ id: "shorten-sentences", title: "Tighten long sentences", detail: "Break the densest sentence into two clearer beats.", paragraph: blocks.findIndex((block) => block.length > 240) + 1 || undefined });

  const retentionValue = chars < 80 ? 42 : blocks.length >= 3 ? 78 : 59;
  const retentionStatus = retentionValue >= 70 ? "good" : "watch";
  if (chars < 80) recommendations.push({ id: "add-context", title: "Give the reader one useful detail", detail: "The idea is too short to create a strong payoff yet.", paragraph: 1 });

  const evidenceValue = chars === 0 ? null : hasEvidence(input.content) ? Math.min(92, 62 + Math.min(25, citations * 8) + (/(?:\b\d+(?:[.,]\d+)?%|\b\d{1,3}(?:,\d{3})+\b)/.test(body) ? 10 : 0)) : 45;
  const evidenceStatus = evidenceValue === null ? "needs_data" : evidenceValue >= 70 ? "good" : "watch";
  if (evidenceStatus === "watch") recommendations.push({ id: "add-evidence", title: "Anchor one claim", detail: "Add one specific fact, example, or source before making the conclusion." });

  const platformValue = input.profile.platform === "general" ? null : Math.min(88, 55 + (input.profile.format === "post" ? 15 : 5) + (blocks.length <= 7 ? 12 : 0) + (hasQuestionOrTension(first) ? 8 : 0));
  const platformStatus = platformValue === null ? "needs_data" : platformValue >= 72 ? "good" : "watch";
  const readinessInputs = [hookValue, flowValue, clarityValue, retentionValue, evidenceValue, platformValue].filter((value): value is number => value !== null);
  const readinessValue = readinessInputs.length ? Math.round(readinessInputs.reduce((sum, value) => sum + value, 0) / readinessInputs.length) : null;
  const readinessStatus = readinessValue === null ? "needs_data" : readinessValue >= 74 ? "good" : "watch";
  const viralValue = chars < 80 ? null : Math.round(((hookValue || 0) * 0.3) + flowValue * 0.2 + retentionValue * 0.2 + (evidenceValue || 0) * 0.15 + (platformValue || 0) * 0.15);

  return {
    schemaVersion: 1,
    contentHash: input.contentHash,
    analyzedAt: Date.now(),
    profile: input.profile,
    meta: { words, characters: chars, segments: sentences, paragraphs: blocks.length, headings, links, citations },
    scores: [
      score("readiness", "Content readiness", readinessValue, readinessValue === null ? "Start writing to unlock the review." : readinessValue >= 74 ? "Ready for a deeper review." : "A few high-leverage edits remain.", readinessStatus),
      score("hook", "Hook strength", hookValue, hookValue === null ? "No opening yet." : hasQuestionOrTension(first) ? "The opening creates curiosity." : "The opening explains, but does not pull yet.", hookStatus, "medium", first ? [{ paragraph: 1, text: clip(first) }] : undefined),
      score("flow", "Storytelling & flow", flowValue, blocks.length < 2 ? "The idea needs a clearer progression." : "The content has readable beats.", flowStatus),
      score("clarity", "Clarity", clarityValue, clarityValue === null ? "No content yet." : averageSegmentLength > 235 ? "Some sentences are carrying too much." : "Sentence density is comfortable.", clarityStatus),
      score("retention", "Retention", retentionValue, chars < 80 ? "There is not enough context for a payoff." : blocks.length >= 3 ? "The structure gives readers room to continue." : "Add one more beat to hold attention.", retentionStatus),
      score("evidence", "Evidence health", evidenceValue, evidenceValue === null ? "No claim to check yet." : hasEvidence(input.content) ? "At least one claim is grounded." : "Important claims need support.", evidenceStatus),
      score("platform_fit", "Platform fit", platformValue, platformValue === null ? "Choose a platform to assess fit." : `Checked for ${input.profile.platform}.`, platformStatus),
      score("viral_potential", "Viral potential", viralValue, viralValue === null ? "Needs more content before estimating potential." : "A local heuristic, not a guaranteed outcome.", viralValue === null ? "needs_data" : viralValue >= 72 ? "good" : "watch", "low"),
    ],
    recommendations: recommendations.slice(0, 3),
  };
}

export function analyzeContent(input: ContentAnalysisInput): ContentSignalReport {
  return analyze(input);
}
