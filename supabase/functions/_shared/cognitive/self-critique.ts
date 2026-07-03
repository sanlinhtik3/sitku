// Cognitive Architecture v2 — Phase D
// Self-Critique pre-output layer: silently audits the draft against
// the user's constraints, tool results, and reflexive lessons.
// Only runs on heavy tiers or when tools were used.

const CRITIQUE_MODEL = "google/gemini-2.5-flash-lite";

export interface CritiqueInput {
  userMessage: string;
  draft: string;
  toolResults?: Array<{ tool: string; ok: boolean; summary?: string }>;
  userContextPreference?: string | null;
  lessons?: Array<{ lesson_learned: string }>;
  language?: "burmese" | "english" | "mixed" | "unknown";
}

export interface CritiqueResult {
  verdict: "ok" | "refine" | "reject";
  issues: string[];
  refined_answer?: string | null;
  latency_ms: number;
}

export function shouldCritique(opts: {
  tier?: string;
  usedTools: boolean;
  draftLen: number;
}): boolean {
  if (opts.draftLen < 40) return false; // too short to bother
  if (opts.draftLen > 6000) return false; // too long, would burn tokens
  const t = (opts.tier || "moderate").toLowerCase();
  if (t === "turbo" || t === "greeting" || t === "simple") return false;
  return opts.usedTools || t === "complex" || t === "deep" || t === "ultra-deep";
}

export async function runSelfCritique(
  input: CritiqueInput
): Promise<CritiqueResult | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;
  const t0 = Date.now();

  const toolSummary = (input.toolResults ?? [])
    .slice(0, 6)
    .map((r) => `- ${r.tool}: ${r.ok ? "ok" : "FAIL"}${r.summary ? ` — ${r.summary.slice(0, 200)}` : ""}`)
    .join("\n");

  const lessonsBlock = (input.lessons ?? [])
    .slice(0, 3)
    .map((l, i) => `  ${i + 1}. ${l.lesson_learned}`)
    .join("\n");

  const prompt = `You are an internal QA auditor. Silently critique BeeBot's DRAFT before it ships. Be ruthless but minimal.

USER MESSAGE:
${input.userMessage.slice(0, 1200)}

USER PREFERENCE (must respect): ${input.userContextPreference ?? "(none)"}

TOOL RESULTS (must be grounded in these):
${toolSummary || "(no tools used)"}

ACTIVE LESSONS (must NOT violate):
${lessonsBlock || "(none)"}

DRAFT:
${input.draft.slice(0, 4000)}

Rubric (flag issues only if real):
1. Grounded in tool results? (no hallucinated numbers/facts)
2. Language matches user's? (Burmese↔English consistent)
3. Tone matches user preference?
4. Violates any active lesson?
5. Overuses filler ("Sure!", "Of course!", "As an AI")?
6. Promises an action without doing it?

Verdicts:
- "ok": draft is fine, ship as-is.
- "refine": provide a refined_answer (concise, fix issues, keep tone).
- "reject": draft is broken (e.g. wrong language entirely); provide refined_answer.

Output via tool only.`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CRITIQUE_MODEL,
        messages: [
          { role: "system", content: "You are a strict, silent QA auditor. Never address the user. Output only via tool." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_critique",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                verdict: { type: "string", enum: ["ok", "refine", "reject"] },
                issues: { type: "array", items: { type: "string" } },
                refined_answer: { type: ["string", "null"] },
              },
              required: ["verdict", "issues", "refined_answer"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_critique" } },
        temperature: 0.1,
        max_tokens: 1200,
      }),
    });

    if (!resp.ok) {
      console.warn("[SelfCritique] gateway", resp.status);
      return null;
    }
    const json = await resp.json();
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : null;
    if (!parsed) return null;

    const result: CritiqueResult = {
      verdict: parsed.verdict,
      issues: parsed.issues ?? [],
      refined_answer: parsed.refined_answer ?? null,
      latency_ms: Date.now() - t0,
    };
    console.log(`[SelfCritique] verdict=${result.verdict} issues=${result.issues.length} latency=${result.latency_ms}ms`);
    return result;
  } catch (e) {
    console.warn("[SelfCritique] error:", e);
    return null;
  }
}

/** Persist critique audit (best-effort, non-blocking). */
export async function logCritique(
  supabase: any,
  userId: string,
  sessionId: string | null,
  messageId: string | null,
  originalDraft: string,
  result: CritiqueResult
): Promise<void> {
  try {
    await supabase.from("agent_critique_log").insert({
      user_id: userId,
      session_id: sessionId,
      message_id: messageId,
      original_draft: originalDraft.slice(0, 8000),
      refined_answer: result.refined_answer?.slice(0, 8000) ?? null,
      verdict: result.verdict,
      issues: result.issues,
      critique_model: CRITIQUE_MODEL,
      latency_ms: result.latency_ms,
    });
  } catch (e) {
    console.warn("[SelfCritique] log error:", e);
  }
}
