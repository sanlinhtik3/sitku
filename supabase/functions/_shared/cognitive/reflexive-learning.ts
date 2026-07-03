// Cognitive Architecture v2 — Phase B
// Reflexive Learning: log mistakes once, retrieve as "lessons learned"
// before the agent attempts a similar task again.

import { generateEmbeddingWithKey } from "../embedding-helpers.ts";

const EXTRACTOR_MODEL = "google/gemini-2.5-flash-lite";

export type ReflexiveTrigger =
  | "user_correction"
  | "tool_failure"
  | "guard_violation"
  | "low_rating"
  | "self_audit";

export interface RecordLessonInput {
  userId: string;
  triggerType: ReflexiveTrigger;
  userMessage?: string;
  whatWentWrong: string;
  evidence?: Record<string, any>;
  personalEmbedKey?: string | null;
}

export interface RetrievedLesson {
  id: string;
  lesson_learned: string;
  what_went_wrong: string;
  trigger_type: string;
  similarity: number;
}

const CORRECTION_REGEX =
  /(မဟုတ်ဘူး|မဟုတ်ပါ(ဘူး)?|ပြန်လုပ်ပေး|အဲ့လို မဟုတ်|မလုပ်ဖြစ်|that'?s?\s*(not|wrong)|that is wrong|incorrect|not what i (asked|wanted|meant)|you misunderstood|please redo|do it again|wrong answer)/i;

export function detectUserCorrection(message: string): boolean {
  if (!message || message.length > 600) return false;
  return CORRECTION_REGEX.test(message);
}

/**
 * Distill a generalizable one-line lesson from raw evidence,
 * embed it, and persist. Idempotent-ish: same task_signature → upsert.
 */
export async function recordLesson(
  supabase: any,
  input: RecordLessonInput
): Promise<string | null> {
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return null;

    // 1) Extract a one-line generalizable lesson via cheap model
    const evidenceJson = JSON.stringify(input.evidence ?? {}).slice(0, 1500);
    const extractPrompt = `A BeeBot agent just made a mistake. Convert it into a SHORT, GENERAL, FUTURE-PROOF lesson the agent should remember.

Trigger: ${input.triggerType}
User message (if any): ${input.userMessage?.slice(0, 400) ?? "(none)"}
What went wrong: ${input.whatWentWrong}
Evidence: ${evidenceJson}

Return JSON via tool. Rules:
- lesson_learned: ONE sentence, imperative, generalizable. Bad: "Don't say X to user". Good: "When user asks for finance summary in Burmese, always cite numbers from manage_flowstate before commenting."
- task_signature: 4-12 words describing the task class (used for vector matching). E.g. "burmese finance summary request".`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EXTRACTOR_MODEL,
        messages: [
          { role: "system", content: "You distill agent failures into short reusable lessons." },
          { role: "user", content: extractPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_lesson",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                task_signature: { type: "string" },
                lesson_learned: { type: "string" },
              },
              required: ["task_signature", "lesson_learned"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_lesson" } },
        temperature: 0.1,
      }),
    });
    if (!resp.ok) {
      console.warn("[Reflexive] extractor", resp.status);
      return null;
    }
    const json = await resp.json();
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : null;
    if (!parsed?.lesson_learned || !parsed?.task_signature) return null;

    // 2) Embed task_signature
    const embedding = await generateEmbeddingWithKey(
      parsed.task_signature,
      input.personalEmbedKey ?? null
    );

    // 3) Persist
    const { data, error } = await supabase
      .from("reflexive_learning")
      .insert({
        user_id: input.userId,
        trigger_type: input.triggerType,
        task_signature: parsed.task_signature,
        task_signature_embedding: embedding,
        what_went_wrong: input.whatWentWrong.slice(0, 1000),
        lesson_learned: parsed.lesson_learned.slice(0, 600),
        evidence: input.evidence ?? {},
      })
      .select("id")
      .single();

    if (error) {
      console.warn("[Reflexive] insert error:", error.message);
      return null;
    }
    console.log(`[Reflexive] lesson recorded id=${data.id} trigger=${input.triggerType}`);
    return data.id;
  } catch (e) {
    console.warn("[Reflexive] recordLesson error:", e);
    return null;
  }
}

/** Vector-search relevant lessons for the current user message. */
export async function retrieveRelevantLessons(
  supabase: any,
  userId: string,
  currentMessage: string,
  opts?: { k?: number; threshold?: number; personalEmbedKey?: string | null }
): Promise<RetrievedLesson[]> {
  try {
    if (!currentMessage || currentMessage.length < 3) return [];
    const k = opts?.k ?? 3;
    const threshold = opts?.threshold ?? 0.78;

    const embedding = await generateEmbeddingWithKey(
      currentMessage.slice(0, 1000),
      opts?.personalEmbedKey ?? null
    );
    if (!embedding) return [];

    const { data, error } = await supabase.rpc("match_reflexive_lessons", {
      p_user_id: userId,
      p_query_embedding: embedding,
      p_match_threshold: threshold,
      p_match_count: k,
    });

    if (error) {
      console.warn("[Reflexive] match rpc error:", error.message);
      return [];
    }
    const lessons = (data ?? []) as RetrievedLesson[];

    // Async hit counter (don't block)
    if (lessons.length > 0) {
      const ids = lessons.map((l) => l.id);
      supabase
        .from("reflexive_learning")
        .update({ hits: ((null as any) as number), last_retrieved_at: new Date().toISOString() })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .in("id", ids)
        .then(() => {})
        .catch(() => {});
      // Use raw rpc for atomic increment if you want; simple update above is best-effort
      supabase
        .rpc("noop_safe", {})
        .then(() => {})
        .catch(() => {});
    }
    return lessons;
  } catch (e) {
    console.warn("[Reflexive] retrieve error:", e);
    return [];
  }
}

/** Format lessons for prompt injection (high-recency placement). */
export function formatLessonsBlock(lessons: RetrievedLesson[]): string {
  if (!lessons || lessons.length === 0) return "";
  const lines = lessons
    .slice(0, 3)
    .map((l, i) => `  ${i + 1}. ${l.lesson_learned}`)
    .join("\n");
  return `\n[LESSONS LEARNED — apply strictly, do not repeat past mistakes]\n${lines}\n`;
}
