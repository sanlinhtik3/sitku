
DROP TABLE IF EXISTS public.agent_message_thread_messages CASCADE;
DROP TABLE IF EXISTS public.agent_message_threads CASCADE;
DROP FUNCTION IF EXISTS public.bump_thread_activity() CASCADE;

-- Fast lookup: does this user already have a thread session for a given source message?
CREATE INDEX IF NOT EXISTS idx_agent_sessions_thread_source
  ON public.agent_chat_sessions ((metadata->>'source_message_id'))
  WHERE metadata->>'is_thread' = 'true';

-- Hide threads from main session listings by default
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_non_thread_active
  ON public.agent_chat_sessions (user_id, last_message_at DESC)
  WHERE is_active = true AND (metadata->>'is_thread') IS DISTINCT FROM 'true';
