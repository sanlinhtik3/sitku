ALTER TABLE agent_heartbeats DROP CONSTRAINT valid_task_type;
ALTER TABLE agent_heartbeats ADD CONSTRAINT valid_task_type 
  CHECK (task_type = ANY (ARRAY['briefing','memory_review','check_in','custom','scheduled_task']));