
-- ═══════════════════════════════════════════════════════════════
-- MASTER ORCHESTRATOR ARCHITECTURE: 4-Pillar Migration
-- ═══════════════════════════════════════════════════════════════

-- ═══ PILLAR 2: Pending Messages Queue ═══
CREATE TABLE public.pending_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.agent_chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT NULL,
  source_channel TEXT DEFAULT 'web',
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ DEFAULT NULL
);

-- Indexes for queue processing
CREATE INDEX idx_pending_messages_session_status ON public.pending_messages(session_id, status, priority DESC, created_at ASC);
CREATE INDEX idx_pending_messages_user_id ON public.pending_messages(user_id);

-- RLS
ALTER TABLE public.pending_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own pending messages"
  ON public.pending_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own pending messages"
  ON public.pending_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own pending messages"
  ON public.pending_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_messages;

-- ═══ PILLAR 3: Cross-Surface Session State ═══
ALTER TABLE public.agent_chat_sessions
  ADD COLUMN IF NOT EXISTS global_session_state JSONB DEFAULT '{}'::jsonb;

-- ═══ PILLAR 4: Lease-Based Locking ═══
ALTER TABLE public.agent_chat_sessions
  ADD COLUMN IF NOT EXISTS lease_holder_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lease_acquired_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Index for lease expiry checks
CREATE INDEX idx_sessions_lease_expires ON public.agent_chat_sessions(lease_expires_at) WHERE lease_expires_at IS NOT NULL;
