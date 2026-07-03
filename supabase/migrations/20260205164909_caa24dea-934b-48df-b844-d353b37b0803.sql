-- ═══════════════════════════════════════════════════════════════════════════
-- BeeBot Inter-Agent Communication System
-- Enables autonomous agent-to-agent communication with Super Agent oversight
-- ═══════════════════════════════════════════════════════════════════════════

-- Table 1: agent_shared_insights
-- Public knowledge pool that all agents can contribute to and read from
CREATE TABLE public.agent_shared_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('market_data', 'general_fact', 'news', 'tool_pattern', 'verified_info')),
  topic TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  source_agent_id UUID REFERENCES auth.users(id),
  is_anonymous BOOLEAN DEFAULT false,
  confidence_score DECIMAL(3,2) DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  verification_count INTEGER DEFAULT 0,
  verified_by UUID[] DEFAULT '{}',
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_shared_insights ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read shared insights
CREATE POLICY "All agents can read shared insights"
  ON public.agent_shared_insights FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Authenticated users can insert their own insights
CREATE POLICY "Agents can share insights"
  ON public.agent_shared_insights FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (source_agent_id IS NULL OR source_agent_id = auth.uid()));

-- Users can update their own insights (for verification)
CREATE POLICY "Agents can update own insights"
  ON public.agent_shared_insights FOR UPDATE
  USING (source_agent_id = auth.uid() OR source_agent_id IS NULL);

-- Admins can delete any insight
CREATE POLICY "Admins can delete insights"
  ON public.agent_shared_insights FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Indexes for efficient querying
CREATE INDEX idx_agent_shared_insights_topic ON public.agent_shared_insights(topic);
CREATE INDEX idx_agent_shared_insights_type ON public.agent_shared_insights(insight_type);
CREATE INDEX idx_agent_shared_insights_created ON public.agent_shared_insights(created_at DESC);
CREATE INDEX idx_agent_shared_insights_expires ON public.agent_shared_insights(expires_at) WHERE expires_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════

-- Table 2: agent_communication_log
-- Full audit trail for Super Agent visibility
CREATE TABLE public.agent_communication_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_agent_id UUID NOT NULL REFERENCES auth.users(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('broadcast', 'specific_agent', 'knowledge_pool', 'auto_respond')),
  target_agent_id UUID REFERENCES auth.users(id),
  query_type TEXT NOT NULL CHECK (query_type IN ('market_data', 'fact_check', 'collaboration', 'sync_request', 'response')),
  query_content TEXT NOT NULL,
  response_summary TEXT,
  was_successful BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_communication_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read all logs (Super Agent visibility)
CREATE POLICY "Only admins can view all communication logs"
  ON public.agent_communication_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Users can see their own logs
CREATE POLICY "Users can see own communication logs"
  ON public.agent_communication_log FOR SELECT
  USING (requester_agent_id = auth.uid() OR target_agent_id = auth.uid());

-- All authenticated users can insert logs
CREATE POLICY "Agents can log communications"
  ON public.agent_communication_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND requester_agent_id = auth.uid());

-- Indexes
CREATE INDEX idx_agent_comm_log_requester ON public.agent_communication_log(requester_agent_id);
CREATE INDEX idx_agent_comm_log_target ON public.agent_communication_log(target_agent_id) WHERE target_agent_id IS NOT NULL;
CREATE INDEX idx_agent_comm_log_created ON public.agent_communication_log(created_at DESC);
CREATE INDEX idx_agent_comm_log_type ON public.agent_communication_log(query_type);

-- ═══════════════════════════════════════════════════════════════════════════

-- Table 3: agent_conversations
-- Autonomous agent-to-agent direct messaging
CREATE TABLE public.agent_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  sender_agent_id UUID NOT NULL REFERENCES auth.users(id),
  receiver_agent_id UUID REFERENCES auth.users(id), -- NULL for broadcast
  message_type TEXT NOT NULL CHECK (message_type IN ('query', 'response', 'broadcast', 'sync_request', 'acknowledgment')),
  message_content TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  response_to UUID REFERENCES public.agent_conversations(id), -- Threading
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '7 days'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;

-- Agents can see their own conversations or broadcasts
CREATE POLICY "Agents can see their conversations"
  ON public.agent_conversations FOR SELECT
  USING (
    sender_agent_id = auth.uid() OR 
    receiver_agent_id = auth.uid() OR 
    receiver_agent_id IS NULL -- Broadcast
  );

-- Admins can see ALL conversations (Super Agent)
CREATE POLICY "Super Agent sees all conversations"
  ON public.agent_conversations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Authenticated users can send messages
CREATE POLICY "Agents can send messages"
  ON public.agent_conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND sender_agent_id = auth.uid());

-- Agents can update messages they received (mark as read)
CREATE POLICY "Agents can mark received messages as read"
  ON public.agent_conversations FOR UPDATE
  USING (receiver_agent_id = auth.uid() OR receiver_agent_id IS NULL)
  WITH CHECK (receiver_agent_id = auth.uid() OR receiver_agent_id IS NULL);

-- Indexes
CREATE INDEX idx_agent_conv_sender ON public.agent_conversations(sender_agent_id);
CREATE INDEX idx_agent_conv_receiver ON public.agent_conversations(receiver_agent_id) WHERE receiver_agent_id IS NOT NULL;
CREATE INDEX idx_agent_conv_thread ON public.agent_conversations(conversation_id);
CREATE INDEX idx_agent_conv_unread ON public.agent_conversations(receiver_agent_id, is_read) WHERE is_read = false;
CREATE INDEX idx_agent_conv_type ON public.agent_conversations(message_type);
CREATE INDEX idx_agent_conv_created ON public.agent_conversations(created_at DESC);
CREATE INDEX idx_agent_conv_expires ON public.agent_conversations(expires_at) WHERE expires_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════

-- Table 4: agent_auto_sync_rules
-- Define automatic data sync pipelines (managed by Super Agent)
CREATE TABLE public.agent_auto_sync_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_name TEXT NOT NULL,
  description TEXT,
  topic_pattern TEXT NOT NULL, -- Regex pattern for topic matching
  insight_types TEXT[] NOT NULL DEFAULT '{"market_data", "news"}',
  sync_frequency TEXT NOT NULL CHECK (sync_frequency IN ('realtime', 'hourly', 'daily')),
  min_confidence DECIMAL(3,2) DEFAULT 0.7 CHECK (min_confidence >= 0 AND min_confidence <= 1),
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_auto_sync_rules ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read sync rules (need to know what syncs exist)
CREATE POLICY "All agents can read sync rules"
  ON public.agent_auto_sync_rules FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins can create/update/delete rules
CREATE POLICY "Only admins can manage sync rules"
  ON public.agent_auto_sync_rules FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admins can update sync rules"
  ON public.agent_auto_sync_rules FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admins can delete sync rules"
  ON public.agent_auto_sync_rules FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Indexes
CREATE INDEX idx_agent_sync_rules_active ON public.agent_auto_sync_rules(is_active) WHERE is_active = true;
CREATE INDEX idx_agent_sync_rules_frequency ON public.agent_auto_sync_rules(sync_frequency);

-- ═══════════════════════════════════════════════════════════════════════════

-- Trigger for auto-updating updated_at
CREATE OR REPLACE FUNCTION public.update_agent_network_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_agent_shared_insights_timestamp
  BEFORE UPDATE ON public.agent_shared_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.update_agent_network_timestamp();

CREATE TRIGGER update_agent_auto_sync_rules_timestamp
  BEFORE UPDATE ON public.agent_auto_sync_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_agent_network_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════

-- Function to clean up expired data (can be called by a cron job)
CREATE OR REPLACE FUNCTION public.cleanup_expired_agent_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete expired insights
  DELETE FROM public.agent_shared_insights 
  WHERE expires_at IS NOT NULL AND expires_at < now();
  
  -- Delete expired conversations
  DELETE FROM public.agent_conversations 
  WHERE expires_at IS NOT NULL AND expires_at < now();
  
  -- Delete old communication logs (older than 30 days)
  DELETE FROM public.agent_communication_log 
  WHERE created_at < now() - INTERVAL '30 days';
END;
$$;

-- Enable realtime for agent conversations (so agents can see incoming messages)
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_conversations;