ALTER TABLE public.agent_heartbeats 
  ADD COLUMN IF NOT EXISTS task_subtype TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_heartbeats_scheduled 
  ON public.agent_heartbeats(user_id, task_type, is_active) 
  WHERE task_type = 'scheduled_task';