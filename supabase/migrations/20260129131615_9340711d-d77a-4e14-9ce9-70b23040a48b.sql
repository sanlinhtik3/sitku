-- ================================================
-- AGENTIC AI CHAT SYSTEM - Database Schema
-- ================================================

-- Chat sessions (Conversation sections)
CREATE TABLE public.agent_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Chat messages
CREATE TABLE public.agent_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.agent_chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  tool_results JSONB,
  is_error BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Learning context (for Agentic improvement)
CREATE TABLE public.agent_learning_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL,
  context_key TEXT NOT NULL,
  context_value JSONB NOT NULL,
  usage_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, context_type, context_key)
);

-- Enable RLS
ALTER TABLE public.agent_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_learning_context ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only access their own data
CREATE POLICY "Users can manage own sessions" ON public.agent_chat_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own messages" ON public.agent_chat_messages
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own learning context" ON public.agent_learning_context
  FOR ALL USING (auth.uid() = user_id);

-- Performance indexes
CREATE INDEX idx_agent_sessions_user ON public.agent_chat_sessions(user_id);
CREATE INDEX idx_agent_sessions_active ON public.agent_chat_sessions(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_agent_messages_session ON public.agent_chat_messages(session_id);
CREATE INDEX idx_agent_messages_created ON public.agent_chat_messages(created_at DESC);
CREATE INDEX idx_agent_learning_user_type ON public.agent_learning_context(user_id, context_type);

-- Trigger for updating session timestamp
CREATE OR REPLACE FUNCTION public.update_agent_session_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agent_chat_sessions
  SET 
    last_message_at = NEW.created_at,
    message_count = message_count + 1,
    updated_at = now()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_agent_message_insert
  AFTER INSERT ON public.agent_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_agent_session_on_message();

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_chat_messages;