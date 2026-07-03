DELETE FROM public.agent_heartbeat_logs l
WHERE l.status = 'running'
AND EXISTS (
  SELECT 1 FROM public.agent_heartbeat_logs l2 
  WHERE l2.heartbeat_id = l.heartbeat_id 
  AND l2.status IN ('success', 'error') 
  AND l2.created_at > l.created_at
);