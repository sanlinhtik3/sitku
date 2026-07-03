// ═══════════════════════════════════════════════════════════════════════════
// Subagent Invoker — Phase 2.3-2.5 of docs/AGENTIC_AUDIT.md
//
// Single entry point for calling any registered subagent. Steps:
//   1. Look up subagent definition (subagent-registry.ts)
//   2. Build minimal message array (system + user prompt)
//   3. Call the LLM (Anthropic SDK if available + flag on, else raw fetch)
//   4. Parse the response as strict JSON; on parse failure return null
//   5. Persist artifact to agent_run_artifacts table
// ═══════════════════════════════════════════════════════════════════════════

import { getSubagent, modelForSubagent, type SubagentDefinition } from "./subagent-registry.ts";
import { callAnthropicViaSDK, shouldUseAnthropicSDK } from "./anthropic-client.ts";
import { OPENROUTER_HEADERS } from "./api-endpoints.ts";

export interface InvokeSubagentOpts {
  serviceClient: any;
  userId: string;
  sessionId?: string | null;
  messageId?: string | null;
  runId: string;
  reviseRound?: number;
  subagentName: string;
  userPrompt: string;
  providerType: "anthropic" | "google" | "openrouter" | "xai";
  apiKey: string;
  apiEndpoint: string;
  agentSettings?: any;
}

export interface InvokeSubagentResult {
  ok: boolean;
  artifact: any | null;
  rawText: string;
  error?: string;
  durationMs: number;
}

const SUBAGENT_TIMEOUT_MS = 45_000;

/** Strip code-fences and try to extract a JSON object. */
function extractJSON(text: string): any | null {
  if (!text) return null;
  // Remove ```json … ``` wrapper
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  // Find first { and last } (lenient)
  const i = body.indexOf("{");
  const j = body.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try {
    return JSON.parse(body.slice(i, j + 1));
  } catch {
    return null;
  }
}

export async function invokeSubagent(opts: InvokeSubagentOpts): Promise<InvokeSubagentResult> {
  const startedAt = Date.now();
  const sa = getSubagent(opts.subagentName);
  if (!sa) {
    return { ok: false, artifact: null, rawText: "", error: `unknown subagent: ${opts.subagentName}`, durationMs: 0 };
  }

  const model = modelForSubagent(sa, opts.providerType);
  const body: any = opts.providerType === "anthropic"
    ? {
        model,
        system: sa.system_prompt,
        messages: [{ role: "user", content: opts.userPrompt }],
        max_tokens: sa.max_tokens,
        temperature: sa.temperature,
        stream: false,
      }
    : {
        model,
        messages: [
          { role: "system", content: sa.system_prompt },
          { role: "user", content: opts.userPrompt },
        ],
        max_tokens: sa.max_tokens,
        temperature: sa.temperature,
        stream: false,
      };

  let response: Response;
  try {
    if (opts.providerType === "anthropic" && shouldUseAnthropicSDK("anthropic", opts.agentSettings)) {
      response = await callAnthropicViaSDK({
        apiKey: opts.apiKey,
        body,
        signal: AbortSignal.timeout(SUBAGENT_TIMEOUT_MS),
      });
    } else {
      // Fallback: raw fetch (Anthropic-shaped). Gemini path adapts at endpoint level.
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (opts.providerType === "anthropic") {
        headers["x-api-key"] = opts.apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers["authorization"] = `Bearer ${opts.apiKey}`;
        if (opts.providerType === "openrouter") Object.assign(headers, OPENROUTER_HEADERS);
      }
      response = await fetch(opts.apiEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SUBAGENT_TIMEOUT_MS),
      });
    }
  } catch (e: any) {
    return { ok: false, artifact: null, rawText: "", error: e?.message ?? "subagent fetch failed", durationMs: Date.now() - startedAt };
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    return { ok: false, artifact: null, rawText: errText, error: `HTTP ${response.status}`, durationMs: Date.now() - startedAt };
  }

  let payload: any;
  try { payload = await response.json(); } catch (e: any) {
    return { ok: false, artifact: null, rawText: "", error: `bad JSON: ${e?.message}`, durationMs: Date.now() - startedAt };
  }

  // Extract assistant text — handle Anthropic + OpenAI shapes.
  let rawText = "";
  if (Array.isArray(payload?.content)) {
    rawText = payload.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  } else if (payload?.choices?.[0]?.message?.content) {
    rawText = String(payload.choices[0].message.content);
  } else {
    rawText = JSON.stringify(payload).slice(0, 4000);
  }

  const artifact = extractJSON(rawText);
  const ok = !!artifact;

  // Persist artifact (fire-and-forget; never blocks)
  const stageName = ({
    "consultant-planner": "planner",
    "quality-evaluator": "evaluator",
    "security-checker": "evaluator",     // security checker logged as eval stage variant
  } as Record<string, string>)[sa.name] ?? "planner";

  opts.serviceClient.from("agent_run_artifacts").insert({
    user_id: opts.userId,
    session_id: opts.sessionId ?? null,
    message_id: opts.messageId ?? null,
    run_id: opts.runId,
    stage: stageName,
    subagent_name: sa.name,
    artifact: artifact ?? { _parse_error: true, raw_preview: rawText.slice(0, 2000) },
    score: typeof artifact?.score === "number" ? artifact.score : null,
    revise_round: opts.reviseRound ?? 0,
  }).then(() => {}).catch((e: any) => console.warn(`[subagent-invoker] artifact persist failed: ${e?.message}`));

  return { ok, artifact, rawText, durationMs: Date.now() - startedAt };
}

/** Convenience wrappers for the 3 named specialists. */

export function invokePlanner(opts: Omit<InvokeSubagentOpts, "subagentName">) {
  return invokeSubagent({ ...opts, subagentName: "consultant-planner" });
}

export function invokeEvaluator(opts: Omit<InvokeSubagentOpts, "subagentName">) {
  return invokeSubagent({ ...opts, subagentName: "quality-evaluator" });
}

export function invokeSecurityChecker(opts: Omit<InvokeSubagentOpts, "subagentName">) {
  return invokeSubagent({ ...opts, subagentName: "security-checker" });
}
