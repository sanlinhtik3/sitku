-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2.1 — Named-subagent memory + PGE artifact handoffs
-- See docs/AGENTIC_AUDIT.md Phase 2 + plan §"Phase 2 — Specialization".
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Named-subagent persistent memory ─────────────────────────────────────
-- Scoped to (user, subagent_name). Subagents do NOT share memory with each
-- other or the main agent — matches Anthropic v2.1.33 / Feb 2026 spec.
CREATE TABLE IF NOT EXISTS public.agent_subagent_memories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subagent_name   text NOT NULL,                 -- e.g. 'consultant-planner'
  memory_key      text NOT NULL,
  value_json      jsonb NOT NULL,
  size_bytes      int GENERATED ALWAYS AS (octet_length(value_json::text)) STORED,
  expires_at      timestamptz,                   -- NULL = persistent
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, subagent_name, memory_key)
);

-- 25 KB cap per entry (mirrors DREAM SYSTEM v2 bounds).
ALTER TABLE public.agent_subagent_memories
  ADD CONSTRAINT subagent_mem_size_cap CHECK (octet_length(value_json::text) <= 25000);

CREATE INDEX IF NOT EXISTS idx_subagent_mem_user_name
  ON public.agent_subagent_memories (user_id, subagent_name);
CREATE INDEX IF NOT EXISTS idx_subagent_mem_expires
  ON public.agent_subagent_memories (expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE public.agent_subagent_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subagent_mem_owner_all"
  ON public.agent_subagent_memories FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "subagent_mem_service_all"
  ON public.agent_subagent_memories FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ─── PGE run artifacts (Planner → Generator → Evaluator handoffs) ─────────
-- Each "run" stores the structured plan, generator output, and evaluator
-- assessment. Auditable; replayable for debugging.
CREATE TABLE IF NOT EXISTS public.agent_run_artifacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        uuid REFERENCES public.agent_chat_sessions(id) ON DELETE SET NULL,
  message_id        uuid REFERENCES public.agent_chat_messages(id) ON DELETE SET NULL,
  run_id            text NOT NULL,        -- correlates planner/generator/evaluator artifacts of same turn
  stage             text NOT NULL CHECK (stage IN ('planner','generator','evaluator','revise')),
  subagent_name     text,                 -- which subagent emitted this artifact
  artifact          jsonb NOT NULL,       -- structured payload (plan steps, eval score+issues, etc.)
  score             numeric,              -- evaluator score 0-1 (NULL for non-evaluator stages)
  revise_round      int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_artifacts_user_time
  ON public.agent_run_artifacts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_artifacts_run
  ON public.agent_run_artifacts (run_id, stage);
CREATE INDEX IF NOT EXISTS idx_run_artifacts_session
  ON public.agent_run_artifacts (session_id, created_at DESC);

ALTER TABLE public.agent_run_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "run_artifacts_owner_select"
  ON public.agent_run_artifacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "run_artifacts_admin_select"
  ON public.agent_run_artifacts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "run_artifacts_service_all"
  ON public.agent_run_artifacts FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.agent_subagent_memories IS
  'Per-(user, subagent_name) persistent memory. Used by Planner / Evaluator / Security-Checker subagents. 25 KB hard cap.';
COMMENT ON TABLE public.agent_run_artifacts IS
  'Planner→Generator→Evaluator handoff artifacts. One row per stage per run_id. See pge-pipeline.ts.';
