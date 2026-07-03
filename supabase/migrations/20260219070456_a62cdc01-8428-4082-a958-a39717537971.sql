
-- ═══ ABSOLUTE PERFECTION: RPC 1 - Atomic Batch Task Pickup ═══
CREATE OR REPLACE FUNCTION pick_goal_tasks(
  p_goal_id UUID,
  p_max_batch INT DEFAULT 5
)
RETURNS SETOF agent_task_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM agent_task_queue
    WHERE goal_id = p_goal_id
      AND status = 'queued'
      AND scheduled_for <= now()
    ORDER BY priority ASC
    LIMIT p_max_batch
    FOR UPDATE SKIP LOCKED
  )
  UPDATE agent_task_queue
  SET status = 'running',
      started_at = now(),
      attempt_count = attempt_count + 1
  FROM picked
  WHERE agent_task_queue.id = picked.id
  RETURNING agent_task_queue.*;
END;
$$;

-- ═══ ABSOLUTE PERFECTION: RPC 2 - Atomic Monitoring Goal Toggle ═══
CREATE OR REPLACE FUNCTION toggle_monitoring_goal(
  p_session_id UUID,
  p_goal_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_meta JSONB;
BEGIN
  SELECT COALESCE(metadata::jsonb, '{}'::jsonb)
  INTO current_meta
  FROM agent_chat_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF p_goal_id IS NULL THEN
    current_meta := current_meta - 'monitoring_goal_id';
  ELSE
    current_meta := current_meta || jsonb_build_object('monitoring_goal_id', p_goal_id::text);
  END IF;

  UPDATE agent_chat_sessions
  SET metadata = current_meta
  WHERE id = p_session_id;
END;
$$;
