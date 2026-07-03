
-- Fix: Include all existing task_type values + new goal_step
ALTER TABLE public.agent_heartbeats DROP CONSTRAINT IF EXISTS valid_task_type;
ALTER TABLE public.agent_heartbeats ADD CONSTRAINT valid_task_type 
  CHECK (task_type IN ('daily_briefing', 'market_update', 'custom', 'memory_review', 'scheduled_task', 'goal_step', 'check_in', 'briefing'));
