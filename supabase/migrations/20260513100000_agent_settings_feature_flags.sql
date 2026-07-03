-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1.3 — Agentic Era feature flags on user_agent_settings
-- All three flags default OFF; admin/user opt-in for staged rollout.
-- See docs/AGENTIC_AUDIT.md §A2 and plan §A2.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_agent_settings
  ADD COLUMN IF NOT EXISTS agentic_sdk_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pge_pipeline_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mcp_postgres_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pge_min_complexity   text    NOT NULL DEFAULT 'complex'
    CHECK (pge_min_complexity IN ('moderate','complex','deep','ultra-deep'));

COMMENT ON COLUMN public.user_agent_settings.agentic_sdk_enabled IS
  'Phase 1 — when true and provider=anthropic, agentic-loop dispatches via @anthropic-ai/sdk instead of raw fetch.';
COMMENT ON COLUMN public.user_agent_settings.pge_pipeline_enabled IS
  'Phase 2 — when true, complex turns route through Planner → Generator → Evaluator subagent triad.';
COMMENT ON COLUMN public.user_agent_settings.mcp_postgres_enabled IS
  'Phase 1.6 — when true, knowledge tool executor routes KB queries through Postgres MCP client.';
COMMENT ON COLUMN public.user_agent_settings.pge_min_complexity IS
  'Minimum complexity tier that triggers PGE pipeline (default: complex).';
