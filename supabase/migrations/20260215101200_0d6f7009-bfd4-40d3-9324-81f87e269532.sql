-- Fix #2: Add missing index for ThoughtStream history queries by user_id
CREATE INDEX IF NOT EXISTS idx_heartbeat_logs_user_created 
ON agent_heartbeat_logs(user_id, created_at DESC);

-- Fix #3: RPC for memory counts (server-side aggregation)
CREATE OR REPLACE FUNCTION get_memory_counts()
RETURNS TABLE(user_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT user_id, COUNT(*) FROM agent_learning_context GROUP BY user_id;
$$;

-- Fix #4: RPC for last neural pulse per user
CREATE OR REPLACE FUNCTION get_last_pulse_per_user()
RETURNS TABLE(user_id uuid, last_pulse timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT DISTINCT ON (user_id) user_id, created_at 
  FROM agent_learning_context ORDER BY user_id, created_at DESC;
$$;