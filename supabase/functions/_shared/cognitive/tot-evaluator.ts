// Cognitive Architecture v2 — Phase D
// Tree-of-Thoughts pre-evaluator: generates 3 candidate plans for
// complex queries, scores them, picks the best — feeds the existing
// plan-generator with a higher-quality seed.

const TOT_MODEL = "google/gemini-3.5-flash";

export interface ToTPlan {
  plan_id: string;
  approach: string;
  steps: string[];
  risks: string[];
  expected_quality: number; // 0-1
  feasibility: number; // 0-1
}

export interface ToTResult {
  candidates: ToTPlan[];
  selected_plan_id: string;
  selection_reasoning: string;
  latency_ms: number;
}

export function shouldRunToT(opts: {
  tier?: string;
  observerModules?: string[] | null;
}): boolean {
  const t = (opts.tier || "moderate").toLowerCase();
  if (t === "complex" || t === "deep" || t === "ultra-deep") return true;
  if ((opts.observerModules ?? []).some((m) => /MULTI_STEP|RESEARCH|PLAN/i.test(m))) return true;
  return false;
}

export async function runToTEvaluator(
  userMessage: string,
  context?: { availableTools?: string[]; userPreferences?: string | null }
): Promise<ToTResult | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;
  const t0 = Date.now();

  const toolsLine = (context?.availableTools ?? []).slice(0, 30).join(", ") || "(any standard tool)";

  const prompt = `Generate 3 distinct candidate plans to handle this user request, then internally evaluate and pick the best.

USER REQUEST:
${userMessage.slice(0, 1500)}

AVAILABLE TOOLS: ${toolsLine}
USER PREFERENCE: ${context?.userPreferences ?? "(none)"}

Rules:
- Plans must be DIFFERENT in approach (not minor variations).
- Each plan: 2-6 concrete steps. List risks.
- Score each plan 0-1 on expected_quality and feasibility.
- Pick the plan with highest (expected_quality * 0.6 + feasibility * 0.4).
- selection_reasoning: ONE sentence explaining the pick.
Output via tool only.`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TOT_MODEL,
        messages: [
          { role: "system", content: "You are a planning evaluator. Output only via tool." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_tot_plans",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                candidates: {
                  type: "array",
                  minItems: 2,
                  maxItems: 4,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      plan_id: { type: "string" },
                      approach: { type: "string" },
                      steps: { type: "array", items: { type: "string" } },
                      risks: { type: "array", items: { type: "string" } },
                      expected_quality: { type: "number" },
                      feasibility: { type: "number" },
                    },
                    required: ["plan_id", "approach", "steps", "risks", "expected_quality", "feasibility"],
                  },
                },
                selected_plan_id: { type: "string" },
                selection_reasoning: { type: "string" },
              },
              required: ["candidates", "selected_plan_id", "selection_reasoning"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_tot_plans" } },
        temperature: 0.4,
        max_tokens: 1500,
      }),
    });

    if (!resp.ok) {
      console.warn("[ToT] gateway", resp.status);
      return null;
    }
    const json = await resp.json();
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : null;
    if (!parsed?.candidates?.length) return null;

    const result: ToTResult = {
      candidates: parsed.candidates,
      selected_plan_id: parsed.selected_plan_id,
      selection_reasoning: parsed.selection_reasoning,
      latency_ms: Date.now() - t0,
    };
    console.log(`[ToT] evaluated ${result.candidates.length} plans, picked ${result.selected_plan_id} in ${result.latency_ms}ms`);
    return result;
  } catch (e) {
    console.warn("[ToT] error:", e);
    return null;
  }
}

export function getSelectedPlan(result: ToTResult): ToTPlan | null {
  return result.candidates.find((c) => c.plan_id === result.selected_plan_id) ?? result.candidates[0] ?? null;
}

/** Format selected plan as a seed instruction block injected into the system prompt. */
export function formatToTSeedBlock(result: ToTResult): string {
  const sel = getSelectedPlan(result);
  if (!sel) return "";
  const steps = sel.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n");
  return `\n[PRE-EVALUATED PLAN — use this as your execution backbone]\nApproach: ${sel.approach}\nSteps:\n${steps}\nKnown risks: ${sel.risks.join("; ") || "none"}\nWhy this plan: ${result.selection_reasoning}\n`;
}

export async function logThoughtTree(
  supabase: any,
  userId: string,
  sessionId: string | null,
  messageId: string | null,
  userMessage: string,
  result: ToTResult
): Promise<void> {
  try {
    await supabase.from("agent_thought_trees").insert({
      user_id: userId,
      session_id: sessionId,
      message_id: messageId,
      user_message: userMessage.slice(0, 2000),
      candidate_plans: result.candidates,
      selected_plan_id: result.selected_plan_id,
      selection_reasoning: result.selection_reasoning,
      evaluator_model: TOT_MODEL,
      latency_ms: result.latency_ms,
    });
  } catch (e) {
    console.warn("[ToT] log error:", e);
  }
}
