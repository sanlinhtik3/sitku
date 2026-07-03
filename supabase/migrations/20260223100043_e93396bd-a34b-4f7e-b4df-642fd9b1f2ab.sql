
-- Phase 4C: Add priority column to agent_heartbeats
ALTER TABLE agent_heartbeats
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';

-- Add CHECK constraint for priority
ALTER TABLE agent_heartbeats
  ADD CONSTRAINT agent_heartbeats_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'critical'));

COMMENT ON COLUMN agent_heartbeats.priority IS 'Task priority level. critical/high bypass DND.';

-- Phase 4B: Update task_type CHECK constraint to include knowledge_digest
ALTER TABLE agent_heartbeats DROP CONSTRAINT IF EXISTS agent_heartbeats_task_type_check;
ALTER TABLE agent_heartbeats ADD CONSTRAINT agent_heartbeats_task_type_check
  CHECK (task_type IN ('briefing','memory_review','check_in','custom','scheduled_task','goal_step','knowledge_digest'));
