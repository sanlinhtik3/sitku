export const EV_LIVE_RELIABILITY = Object.freeze({
  maxReconnectAttempts: 4,
  reconnectBaseDelayMs: 250,
  reconnectMaxDelayMs: 4_000,
  pendingControlLimit: 64,
  pendingControlMaxAgeMs: 30_000,
  reconnectAudioBufferMs: 3_000,
});

export function evLiveReconnectDelayMs(attempt: number): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(
    EV_LIVE_RELIABILITY.reconnectMaxDelayMs,
    EV_LIVE_RELIABILITY.reconnectBaseDelayMs * 2 ** safeAttempt,
  );
}
