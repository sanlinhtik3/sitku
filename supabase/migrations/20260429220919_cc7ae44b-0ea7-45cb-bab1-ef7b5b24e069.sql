-- ═══ Thread feature hardening migration ═══

-- 1) Unique index: at most one ACTIVE thread session per source message.
--    Race-safe: concurrent inserts will get a unique-violation we can recover from.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_thread_per_source
  ON public.agent_chat_sessions ((metadata->>'source_message_id'))
  WHERE metadata->>'kind' = 'thread' AND is_active = true;

-- 2) Trigger: when a source message is deleted, soft-delete its threads.
CREATE OR REPLACE FUNCTION public.cleanup_orphan_threads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agent_chat_sessions
     SET is_active = false
   WHERE metadata->>'kind' = 'thread'
     AND metadata->>'source_message_id' = OLD.id::text
     AND is_active = true;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_orphan_threads ON public.agent_chat_messages;
CREATE TRIGGER trg_cleanup_orphan_threads
  BEFORE DELETE ON public.agent_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_orphan_threads();

-- 3) Audit columns for "Apply thread reply to source" with undo support.
ALTER TABLE public.agent_chat_messages
  ADD COLUMN IF NOT EXISTS thread_applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pre_thread_content TEXT;