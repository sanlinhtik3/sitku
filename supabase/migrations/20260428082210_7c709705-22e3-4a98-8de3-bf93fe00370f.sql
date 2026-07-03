
-- ═══ Per-message Thread feature ═══

CREATE TABLE public.agent_message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_id uuid NOT NULL REFERENCES public.agent_chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.agent_chat_sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_agent_message_threads_source_user
  ON public.agent_message_threads(source_message_id, user_id);
CREATE INDEX idx_agent_message_threads_user
  ON public.agent_message_threads(user_id, last_activity_at DESC);

ALTER TABLE public.agent_message_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own threads"
  ON public.agent_message_threads FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users create own threads"
  ON public.agent_message_threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own threads"
  ON public.agent_message_threads FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own threads"
  ON public.agent_message_threads FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_agent_message_threads_updated
  BEFORE UPDATE ON public.agent_message_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Thread messages ──
CREATE TABLE public.agent_message_thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.agent_message_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text, 'tool'::text])),
  content text NOT NULL,
  tool_calls jsonb,
  tool_results jsonb,
  thoughts jsonb,
  attachments jsonb,
  is_error boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_thread_messages_thread_created
  ON public.agent_message_thread_messages(thread_id, created_at);
CREATE INDEX idx_agent_thread_messages_user
  ON public.agent_message_thread_messages(user_id);

ALTER TABLE public.agent_message_thread_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own thread messages"
  ON public.agent_message_thread_messages FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users create own thread messages"
  ON public.agent_message_thread_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own thread messages"
  ON public.agent_message_thread_messages FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own thread messages"
  ON public.agent_message_thread_messages FOR DELETE
  USING (auth.uid() = user_id);

-- ── Helper: bump last_activity_at on new thread message ──
CREATE OR REPLACE FUNCTION public.bump_thread_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agent_message_threads
     SET last_activity_at = now(),
         updated_at = now()
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_thread_activity
  AFTER INSERT ON public.agent_message_thread_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_thread_activity();
