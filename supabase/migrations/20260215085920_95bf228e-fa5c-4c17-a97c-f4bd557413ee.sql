CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_heartbeat_per_user_type
ON public.agent_heartbeats (user_id, task_type)
WHERE is_active = true AND name IN ('morning_briefing', 'weekly_memory_review', 'caring_check_in');