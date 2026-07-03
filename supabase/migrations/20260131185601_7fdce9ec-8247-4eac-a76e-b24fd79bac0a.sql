-- Create agent_ai_usage table for tracking AI usage metrics
CREATE TABLE public.agent_ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID REFERENCES public.agent_chat_sessions(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.agent_chat_messages(id) ON DELETE CASCADE,
  
  -- API Info
  api_source TEXT NOT NULL CHECK (api_source IN ('personal_key', 'lovable_gateway')),
  model_used TEXT NOT NULL,
  
  -- Usage Metrics
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_total INTEGER GENERATED ALWAYS AS (tokens_input + tokens_output) STORED,
  
  -- Cost Tracking (for personal key users)
  estimated_cost DECIMAL(10, 6) DEFAULT 0,
  
  -- Request Info
  request_duration_ms INTEGER,
  is_successful BOOLEAN DEFAULT true,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX idx_agent_ai_usage_user ON public.agent_ai_usage(user_id);
CREATE INDEX idx_agent_ai_usage_created ON public.agent_ai_usage(created_at DESC);
CREATE INDEX idx_agent_ai_usage_api_source ON public.agent_ai_usage(api_source);
CREATE INDEX idx_agent_ai_usage_session ON public.agent_ai_usage(session_id);

-- RLS
ALTER TABLE public.agent_ai_usage ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage data
CREATE POLICY "Users view own usage"
  ON public.agent_ai_usage FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own usage data (via edge function)
CREATE POLICY "Users insert own usage"
  ON public.agent_ai_usage FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());