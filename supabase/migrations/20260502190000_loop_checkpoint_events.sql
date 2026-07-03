-- ═══ RESUMABLE SSE — EVENT RINGBUFFER ═══
-- Persists key SSE events (content_block_delta text, tool_call, tool_result,
-- step_complete, agent_step) per mission so a client that drops mid-stream
-- can reconnect with `Last-Event-ID` header and resume from breakpoint.
--
-- Design notes:
--   • Ringbuffer per mission_id: max 200 events (server-side trim).
--   • TTL: 10 min (server-side cleanup).
--   • event_id is per-mission monotonic, generated server-side.
--   • payload is the full SSE frame (already-stringified `data: ...\n\n`)
--     so replay can blast it to the client without re-encoding.

CREATE TABLE IF NOT EXISTS public.loop_checkpoint_events (
  mission_id   UUID NOT NULL,
  event_id     BIGINT NOT NULL,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  ttl_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mission_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_loop_checkpoint_events_ttl
  ON public.loop_checkpoint_events (ttl_at);

CREATE INDEX IF NOT EXISTS idx_loop_checkpoint_events_mission
  ON public.loop_checkpoint_events (mission_id, event_id);

-- RLS: only the service role writes/reads. End users never query this.
ALTER TABLE public.loop_checkpoint_events ENABLE ROW LEVEL SECURITY;

-- (No policies = no access except service role bypass.)

COMMENT ON TABLE  public.loop_checkpoint_events IS 'Per-mission SSE event ringbuffer for resumable streams (Last-Event-ID replay).';
COMMENT ON COLUMN public.loop_checkpoint_events.event_id  IS 'Monotonic per-mission counter assigned by streaming-engine.';
COMMENT ON COLUMN public.loop_checkpoint_events.payload   IS 'Full SSE frame data object (replayed verbatim on resume).';
COMMENT ON COLUMN public.loop_checkpoint_events.ttl_at    IS 'Hard expiry — old missions are cleaned up by ringbuffer trim job or query-time filter.';
