// ═══════════════════════════════════════════════════════════════════════════
// Session Events — Phase 3.3 of docs/AGENTIC_AUDIT.md
//
// Emits lifecycle events to `agent_session_webhooks`:
//   session.started    — when a new agentic loop begins
//   session.tool_called — when a tool is invoked (sampled — high volume)
//   session.completed  — when the loop returns successfully
//   session.error      — when the loop returns with finalIsError
//
// Fire-and-forget; never blocks the request. Relay (HTTP POST to user-set
// URLs) is handled separately by the `agent-webhook-relay` edge function.
// ═══════════════════════════════════════════════════════════════════════════

export type SessionEventType =
  | "session.started"
  | "session.tool_called"
  | "session.completed"
  | "session.error";

export interface SessionEventInput {
  serviceClient: any;
  userId: string;
  sessionId: string | null | undefined;
  eventType: SessionEventType;
  payload?: Record<string, any>;
}

// Sample tool-called events at 1/Nth rate to keep the table small.
// Set N=1 to capture every call (development).
const TOOL_CALL_SAMPLE_RATE = 1;
let toolCallCounter = 0;

export async function emitSessionEvent(input: SessionEventInput): Promise<void> {
  try {
    if (!input.serviceClient || !input.userId) return;
    if (input.eventType === "session.tool_called") {
      toolCallCounter++;
      if (toolCallCounter % TOOL_CALL_SAMPLE_RATE !== 0) return;
    }
    const { error } = await input.serviceClient
      .from("agent_session_webhooks")
      .insert({
        user_id: input.userId,
        session_id: input.sessionId ?? null,
        event_type: input.eventType,
        payload: input.payload ?? {},
      });
    if (error) {
      console.warn(`[session-events] insert ${input.eventType} failed: ${error.message}`);
    }
  } catch (e) {
    console.warn(`[session-events] swallowed:`, (e as Error)?.message);
  }
}

/** Convenience helpers — each is fire-and-forget. */

export function emitSessionStarted(serviceClient: any, userId: string, sessionId: string | null, meta?: any) {
  return emitSessionEvent({
    serviceClient, userId, sessionId, eventType: "session.started",
    payload: { started_at: new Date().toISOString(), ...(meta ?? {}) },
  });
}

export function emitSessionCompleted(
  serviceClient: any, userId: string, sessionId: string | null,
  summary: { duration_ms: number; tool_calls: number; tokens_in?: number; tokens_out?: number; model?: string },
) {
  return emitSessionEvent({
    serviceClient, userId, sessionId, eventType: "session.completed",
    payload: { completed_at: new Date().toISOString(), ...summary },
  });
}

export function emitSessionError(
  serviceClient: any, userId: string, sessionId: string | null,
  err: { message: string; code?: string; stage?: string },
) {
  return emitSessionEvent({
    serviceClient, userId, sessionId, eventType: "session.error",
    payload: { errored_at: new Date().toISOString(), ...err },
  });
}

export function emitToolCalled(
  serviceClient: any, userId: string, sessionId: string | null,
  tool: { name: string; status: string; latency_ms: number },
) {
  return emitSessionEvent({
    serviceClient, userId, sessionId, eventType: "session.tool_called",
    payload: { at: new Date().toISOString(), ...tool },
  });
}
