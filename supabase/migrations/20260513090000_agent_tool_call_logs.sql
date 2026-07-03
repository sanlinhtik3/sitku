-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1.4 (AGENTIC_AUDIT.md) — Per-tool-call observability
-- Adds `agent_tool_call_logs` so every tool invocation is traceable:
--   • per-tool latency (p50/p95 dashboards)
--   • tool failure rates → circuit-breaker tuning data
--   • decision trail for evaluator agents (Phase 2)
-- Multi-tenant: RLS enforces `auth.uid() = user_id`; admins can read all.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agent_tool_call_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      uuid REFERENCES public.agent_chat_sessions(id) ON DELETE SET NULL,
  message_id      uuid REFERENCES public.agent_chat_messages(id) ON DELETE SET NULL,
  mission_id      text,                 -- agentic loop mission id
  step            int,                  -- loop step at invocation
  tool_name       text NOT NULL,
  tool_action     text,                 -- sub-action (e.g. manage_consultant.action)
  risk_level      text,                 -- LOW / MEDIUM / HIGH (from getToolRiskLevel)
  tier            int,                  -- 1 (auto) / 2 (consent) / 3 (high-risk)
  args_hash       text,                 -- sha256(canonical args) — for dedup analysis
  args_preview    jsonb,                -- truncated args payload (cap 4KB)
  status          text NOT NULL CHECK (status IN ('success','error','timeout','skipped')),
  error_message   text,
  latency_ms      int NOT NULL,
  result_size     int,                  -- bytes (post-truncation)
  started_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes tuned for the three primary queries:
--   1) per-user dashboard
--   2) per-session timeline
--   3) tool-level p95 / failure-rate rollups
CREATE INDEX IF NOT EXISTS idx_tcl_user_started
  ON public.agent_tool_call_logs (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_tcl_session_step
  ON public.agent_tool_call_logs (session_id, step);

CREATE INDEX IF NOT EXISTS idx_tcl_tool_status_started
  ON public.agent_tool_call_logs (tool_name, status, started_at DESC);

-- RLS
ALTER TABLE public.agent_tool_call_logs ENABLE ROW LEVEL SECURITY;

-- Owner read-only (logs are write-once from edge functions via service role)
CREATE POLICY "tcl_owner_select"
  ON public.agent_tool_call_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read everything (uses existing has_role helper)
CREATE POLICY "tcl_admin_select"
  ON public.agent_tool_call_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Service role inserts (edge functions). No user-side insert/update/delete.
CREATE POLICY "tcl_service_insert"
  ON public.agent_tool_call_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.agent_tool_call_logs IS
  'Per-tool-call trace. Populated by tool-execution-engine.ts → tool-call-tracer.ts. See docs/AGENTIC_AUDIT.md Phase 1.4.';
