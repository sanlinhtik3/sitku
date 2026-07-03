
-- Function to auto-finalize stale autonomous tasks stuck for >5 minutes
CREATE OR REPLACE FUNCTION public.finalize_stale_autonomous_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE autonomous_tasks
  SET status = 'failed',
      error = 'Auto-finalized: task timed out without completing',
      updated_at = now(),
      completed_at = COALESCE(completed_at, now())
  WHERE status IN ('planning', 'working', 'compiling')
    AND updated_at < now() - interval '5 minutes';
END;
$$;
