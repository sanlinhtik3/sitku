import type { EnginePhase } from "@/features/jarvis/core/engine";

type EvLogStatus = "started" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled" | "interrupted" | "retrying";

export interface EvObservabilityEvent {
  level?: "info" | "warn" | "error";
  event: string;
  status: EvLogStatus;
  traceId?: string | null;
  turnId?: string | null;
  actionId?: string | null;
  durationMs?: number;
  errorCode?: string;
  recovery?: string;
  metadata?: Record<string, unknown>;
}

const phaseStatus: Record<EnginePhase, EvLogStatus> = {
  idle: "completed",
  connecting: "started",
  recording: "running",
  listening: "running",
  thinking: "running",
  confirm: "awaiting_approval",
  running_skill: "running",
  speaking: "running",
  resuming: "retrying",
};

/**
 * A one-way, bounded renderer-to-main diagnostic bridge. It is intentionally
 * fire-and-forget so a terminal log can never delay the live audio pipeline.
 */
export function recordEvEvent(event: EvObservabilityEvent) {
  if (typeof window === "undefined") return;
  window.beebotDesktop?.recordObservability?.({ domain: "ev", ...event });
}

export function recordEvPhase(phase: EnginePhase, turnId: string | null) {
  recordEvEvent({
    event: `live.${phase}`,
    status: phaseStatus[phase],
    traceId: turnId,
    turnId,
  });
}
