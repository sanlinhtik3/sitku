export const EV_STORYTELLING_STANDARD = `
You are E.V's Storytelling Master. Write and review truthful, conversational scripts for a Myanmar audience.

Use this narrative order when it serves the idea:
1. Audience and objective
2. Hook
3. Essential context
4. Curiosity or open question
5. Conflict or tension
6. Viewer stakes: why this matters to them
7. Evidence and meaning
8. Supported perspective shift
9. Resolution
10. One clear call to action

Rules:
- Never manufacture facts, conflict, urgency, quotes, results, or sources.
- A twist is optional. Use one only when the evidence supports it.
- For Burmese social scripts, use natural conversational Burmese, not translated textbook prose.
- Keep one idea per paragraph and normally one or two sentences per paragraph.
- Preserve the author's facts, voice, names, numbers, links, and intended meaning unless the user explicitly asks to change them.
- Separate missing evidence from weak writing. Missing evidence is not a writing failure.
- Review with a direct verdict and no more than three highest-leverage fixes.
- When revising, change only the requested scope. Return the complete revised Markdown so Sitku can show one exact approval preview before writing.
`.trim();

export type StorytellingScope =
  | "full_script"
  | "hook"
  | "context"
  | "conflict"
  | "stakes"
  | "resolution"
  | "cta"
  | "paragraph";

export interface StorytellingReview {
  summary: string;
  verdict: string;
  audienceFit: string;
  structure: Array<{
    beat: "hook" | "context" | "curiosity" | "conflict" | "stakes" | "evidence" | "resolution" | "cta";
    status: "strong" | "weak" | "missing" | "not_needed";
    paragraph: number | null;
    reason: string;
  }>;
  strengths: string[];
  gaps: string[];
  fixes: Array<{ title: string; instruction: string; paragraph: number | null }>;
}

export interface StorytellingRevision {
  scope: StorytellingScope;
  rationale: string;
  changes: Array<{ paragraph: number | null; before: string; after: string; reason: string }>;
  revisedMarkdown: string;
}

export function storytellingCreatePrompt(input: {
  brief: string;
  audience?: string;
  objective?: string;
  platform?: string;
  format?: string;
  language?: string;
  sourceMaterial?: string;
}) {
  return [
    EV_STORYTELLING_STANDARD,
    "Create a publishable storytelling script from the supplied brief.",
    "Return Markdown only. Do not add analysis, a score, or invented source notes.",
    `Audience: ${input.audience || "Myanmar general audience"}`,
    `Objective: ${input.objective || "inform and engage"}`,
    `Platform: ${input.platform || "Facebook"}`,
    `Format: ${input.format || "social script"}`,
    `Language: ${input.language || "Burmese"}`,
    `Brief:\n${bounded(input.brief, 20_000)}`,
    input.sourceMaterial ? `User-supplied source material:\n${bounded(input.sourceMaterial, 30_000)}` : "",
  ].filter(Boolean).join("\n\n");
}

export function storytellingReviewPrompt(content: string, profile: Record<string, unknown>) {
  return [
    EV_STORYTELLING_STANDARD,
    "Review only the supplied Markdown. Do not rewrite it and do not use outside facts.",
    "Return JSON only with this exact shape:",
    '{"summary":string,"verdict":string,"audienceFit":string,"structure":[{"beat":"hook|context|curiosity|conflict|stakes|evidence|resolution|cta","status":"strong|weak|missing|not_needed","paragraph":number|null,"reason":string}],"strengths":[string],"gaps":[string],"fixes":[{"title":string,"instruction":string,"paragraph":number|null}]}',
    `Profile: ${JSON.stringify(profile)}`,
    `Markdown:\n${bounded(content, 60_000)}`,
  ].join("\n\n");
}

export function storytellingRevisionPrompt(input: {
  content: string;
  instruction: string;
  scope: StorytellingScope;
  paragraph?: number;
  profile: Record<string, unknown>;
}) {
  return [
    EV_STORYTELLING_STANDARD,
    "Revise the supplied Markdown using the user's exact instruction.",
    `Scope: ${input.scope}${input.paragraph ? `, paragraph ${input.paragraph}` : ""}`,
    "Return JSON only with this exact shape:",
    '{"scope":"full_script|hook|context|conflict|stakes|resolution|cta|paragraph","rationale":string,"changes":[{"paragraph":number|null,"before":string,"after":string,"reason":string}],"revisedMarkdown":string}',
    "The revisedMarkdown field must contain the complete document, including untouched paragraphs in their original order.",
    `Profile: ${JSON.stringify(input.profile)}`,
    `Instruction: ${bounded(input.instruction, 4_000)}`,
    `Markdown:\n${bounded(input.content, 60_000)}`,
  ].join("\n\n");
}

export function parseStorytellingReview(raw: string): StorytellingReview {
  const value = parseObject(raw);
  const allowedBeats = new Set(["hook", "context", "curiosity", "conflict", "stakes", "evidence", "resolution", "cta"]);
  const allowedStatuses = new Set(["strong", "weak", "missing", "not_needed"]);
  const structure = Array.isArray(value.structure) ? value.structure.map((entry) => {
    const item = object(entry);
    const beat = text(item.beat);
    const status = text(item.status);
    if (!allowedBeats.has(beat) || !allowedStatuses.has(status)) throw new Error("Invalid storytelling structure result.");
    return {
      beat: beat as StorytellingReview["structure"][number]["beat"],
      status: status as StorytellingReview["structure"][number]["status"],
      paragraph: paragraph(item.paragraph),
      reason: requiredText(item.reason, "Storytelling structure reason"),
    };
  }) : [];
  if (!structure.length) throw new Error("Storytelling review returned no narrative structure.");
  return {
    summary: requiredText(value.summary, "Storytelling summary"),
    verdict: requiredText(value.verdict, "Storytelling verdict"),
    audienceFit: requiredText(value.audienceFit, "Audience fit"),
    structure,
    strengths: stringList(value.strengths, 4),
    gaps: stringList(value.gaps, 4),
    fixes: Array.isArray(value.fixes) ? value.fixes.slice(0, 3).map((entry) => {
      const item = object(entry);
      return {
        title: requiredText(item.title, "Fix title"),
        instruction: requiredText(item.instruction, "Fix instruction"),
        paragraph: paragraph(item.paragraph),
      };
    }) : [],
  };
}

export function parseStorytellingRevision(raw: string): StorytellingRevision {
  const value = parseObject(raw);
  const allowedScopes = new Set(["full_script", "hook", "context", "conflict", "stakes", "resolution", "cta", "paragraph"]);
  const scope = text(value.scope);
  if (!allowedScopes.has(scope)) throw new Error("Storytelling revision returned an invalid scope.");
  const revisedMarkdown = requiredText(value.revisedMarkdown, "Revised Markdown");
  return {
    scope: scope as StorytellingScope,
    rationale: requiredText(value.rationale, "Revision rationale"),
    changes: Array.isArray(value.changes) ? value.changes.slice(0, 12).map((entry) => {
      const item = object(entry);
      return {
        paragraph: paragraph(item.paragraph),
        before: text(item.before),
        after: requiredText(item.after, "Revised paragraph"),
        reason: requiredText(item.reason, "Revision reason"),
      };
    }) : [],
    revisedMarkdown,
  };
}

function parseObject(raw: string): Record<string, unknown> {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Storytelling provider returned invalid JSON.");
  return object(JSON.parse(clean.slice(start, end + 1)));
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Storytelling provider returned an invalid object.");
  return value as Record<string, unknown>;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value: unknown, label: string) {
  const result = text(value);
  if (!result) throw new Error(`${label} is missing.`);
  return result;
}

function stringList(value: unknown, limit: number) {
  return Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, limit) : [];
}

function paragraph(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function bounded(value: string, max: number) {
  return value.trim().slice(0, max);
}
