// ═══════════════════════════════════════════════════════════════════════════
// Tool Call Tracer — Phase 1.4 / 1.5 of docs/AGENTIC_AUDIT.md
//
// Single fire-and-forget logger for every tool invocation. Writes one row to
// `agent_tool_call_logs` per executeTool() call. Never throws — observability
// must never break the hot path.
//
// Design rules:
//   1. Service-role insert only (RLS enforces this).
//   2. args truncated to 4 KB to keep table small.
//   3. Errors logged to console.warn, never propagated.
//   4. SHA-256 of canonical args for dedup analysis (cheap, deterministic).
// ═══════════════════════════════════════════════════════════════════════════

export interface ToolTraceInput {
  serviceClient: any;                   // Supabase service-role client
  userId: string;
  sessionId?: string | null;
  messageId?: string | null;
  missionId?: string | null;
  step?: number | null;
  toolName: string;
  toolAction?: string | null;
  riskLevel?: string | null;            // LOW / MEDIUM / HIGH
  tier?: number | null;                 // 1 / 2 / 3
  args: any;
  status: "success" | "error" | "timeout" | "skipped";
  errorMessage?: string | null;
  latencyMs: number;
  resultSize?: number | null;
  startedAt?: Date;
}

const ARGS_PREVIEW_MAX_BYTES = 4_096;

/** Stable JSON canonicalization for hashing (keys sorted, undefined skipped). */
function canonicalize(value: any): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

async function sha256Hex(text: string): Promise<string> {
  try {
    const buf = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

/** Truncate args jsonb preview while staying valid JSON. */
function truncatePreview(args: any): any {
  try {
    const str = JSON.stringify(args ?? null);
    if (str.length <= ARGS_PREVIEW_MAX_BYTES) return args ?? null;
    return { _truncated: true, _original_size: str.length, preview: str.slice(0, ARGS_PREVIEW_MAX_BYTES) };
  } catch {
    return { _unserializable: true };
  }
}

/** Estimate result size in bytes (best-effort). */
export function estimateResultSize(result: any): number {
  try {
    return new TextEncoder().encode(JSON.stringify(result ?? null)).length;
  } catch {
    return 0;
  }
}

/**
 * Fire-and-forget. Returns a promise but you can ignore it.
 * Never throws.
 */
export async function logToolCall(input: ToolTraceInput): Promise<void> {
  try {
    if (!input.serviceClient || !input.userId || !input.toolName) return;

    const canonical = canonicalize(input.args);
    const argsHash = canonical.length > 0 ? await sha256Hex(canonical) : "";

    const row = {
      user_id: input.userId,
      session_id: input.sessionId ?? null,
      message_id: input.messageId ?? null,
      mission_id: input.missionId ?? null,
      step: input.step ?? null,
      tool_name: input.toolName,
      tool_action: input.toolAction ?? null,
      risk_level: input.riskLevel ?? null,
      tier: input.tier ?? null,
      args_hash: argsHash || null,
      args_preview: truncatePreview(input.args),
      status: input.status,
      error_message: input.errorMessage ?? null,
      latency_ms: Math.max(0, Math.round(input.latencyMs)),
      result_size: input.resultSize ?? null,
      started_at: (input.startedAt ?? new Date()).toISOString(),
    };

    const { error } = await input.serviceClient
      .from("agent_tool_call_logs")
      .insert(row);

    if (error) {
      console.warn(`[ToolTracer] insert failed for ${input.toolName}:`, error.message);
    }
  } catch (e) {
    console.warn(`[ToolTracer] swallowed error:`, (e as Error)?.message);
  }
}
