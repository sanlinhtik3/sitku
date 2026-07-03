-- Add agentic feature flag columns to user_agent_settings (P0 fix: AgenticFeatureFlags admin panel)
ALTER TABLE public.user_agent_settings
  ADD COLUMN IF NOT EXISTS agentic_sdk_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pge_pipeline_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mcp_postgres_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tool_search_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pge_min_complexity TEXT NOT NULL DEFAULT 'complex';