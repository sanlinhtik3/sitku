-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3.6 — Unified Agent Jobs Queue
-- Replaces mixed patterns (SRT translations, KB embedding sync, dream system
-- cron) with a single observable queue. Existing tables stay intact — this
-- is additive; the worker reads/writes the new table while existing flows
-- can opt in over time.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agent_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type        text NOT NULL,           -- 'kb_embed','dream_tick','srt','generic'
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  priority        int NOT NULL DEFAULT 5,  -- 1=high, 10=low
  attempts        int NOT NULL DEFAULT 0,
  max_attempts    int NOT NULL DEFAULT 3,
  scheduled_for   timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  result          jsonb,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_jobs_pickup
  ON public.agent_jobs (status, scheduled_for, priority)
  WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_agent_jobs_user
  ON public.agent_jobs (user_id, created_at DESC);

ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_jobs_owner_select"
  ON public.agent_jobs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "agent_jobs_service_all"
  ON public.agent_jobs FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Pickup function — atomic claim using FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.agent_jobs_claim(p_limit int DEFAULT 5)
RETURNS SETOF public.agent_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
    UPDATE public.agent_jobs j
       SET status = 'processing',
           started_at = now(),
           attempts = j.attempts + 1,
           updated_at = now()
     WHERE j.id IN (
       SELECT id FROM public.agent_jobs
        WHERE status = 'pending'
          AND scheduled_for <= now()
          AND attempts < max_attempts
        ORDER BY priority ASC, scheduled_for ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
     )
    RETURNING j.*;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_jobs_claim(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_jobs_claim(int) TO service_role;

-- Touch updated_at
CREATE OR REPLACE FUNCTION public.touch_agent_jobs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_agent_jobs_touch ON public.agent_jobs;
CREATE TRIGGER trg_agent_jobs_touch BEFORE UPDATE ON public.agent_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_jobs_updated_at();

COMMENT ON TABLE public.agent_jobs IS
  'Unified async job queue. Worker = agent-jobs-worker edge fn. See docs/AGENTIC_AUDIT.md Phase 3.6.';
