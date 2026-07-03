-- Fix valid_status check constraint to include 'running' status
-- Root cause: agent-heartbeat worker writes last_status = 'running' as atomic lock
ALTER TABLE agent_heartbeats DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE agent_heartbeats ADD CONSTRAINT valid_status 
  CHECK (last_status = ANY (ARRAY['pending', 'success', 'failed', 'skipped', 'running']));
