
-- Phase A: Dream System columns for memory consolidation v2
ALTER TABLE public.agent_chat_sessions 
ADD COLUMN IF NOT EXISTS last_dream_at TIMESTAMPTZ DEFAULT NULL;

-- Add sessions_since_dream counter to profiles or a separate tracking table
-- Using a lightweight approach: store dream state per user in agent_soul_config
ALTER TABLE public.agent_soul_config 
ADD COLUMN IF NOT EXISTS last_dream_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS sessions_since_dream INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS dream_lock BOOLEAN DEFAULT FALSE;

-- Phase D: Shared Scratchpad table for swarm cross-specialist knowledge
CREATE TABLE IF NOT EXISTS public.agent_swarm_scratchpad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id TEXT NOT NULL,
  specialist_role TEXT NOT NULL,
  step_id TEXT NOT NULL,
  findings TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for scratchpad (service role only - used by edge functions)
ALTER TABLE public.agent_swarm_scratchpad ENABLE ROW LEVEL SECURITY;

-- Index for fast swarm lookups
CREATE INDEX IF NOT EXISTS idx_swarm_scratchpad_swarm_id ON public.agent_swarm_scratchpad(swarm_id);
