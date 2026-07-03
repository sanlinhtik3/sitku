
-- Cleanup function for automated log retention
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS void AS $$
BEGIN
  -- Heartbeat logs older than 90 days
  DELETE FROM public.agent_heartbeat_logs
  WHERE created_at < NOW() - INTERVAL '90 days';

  -- AI usage logs older than 90 days
  DELETE FROM public.agent_ai_usage
  WHERE created_at < NOW() - INTERVAL '90 days';

  -- Chat messages older than 180 days
  DELETE FROM public.agent_chat_messages
  WHERE created_at < NOW() - INTERVAL '180 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
