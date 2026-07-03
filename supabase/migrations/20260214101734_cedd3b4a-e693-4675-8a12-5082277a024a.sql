
-- ═══ CHANNEL IDENTITIES TABLE ═══
CREATE TABLE public.channel_identities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  channel TEXT NOT NULL,
  external_id TEXT NOT NULL,
  external_username TEXT,
  chat_id TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one external_id per channel
CREATE UNIQUE INDEX idx_channel_identities_channel_external ON public.channel_identities (channel, external_id);
-- Index for user lookups
CREATE INDEX idx_channel_identities_user ON public.channel_identities (user_id);

ALTER TABLE public.channel_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own channel identities"
  ON public.channel_identities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own channel identities"
  ON public.channel_identities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own channel identities"
  ON public.channel_identities FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own channel identities"
  ON public.channel_identities FOR DELETE
  USING (auth.uid() = user_id);

-- ═══ CHANNEL LINK CODES TABLE ═══
CREATE TABLE public.channel_link_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'telegram',
  external_id TEXT NOT NULL,
  external_username TEXT,
  chat_id TEXT,
  is_used BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_channel_link_codes_code ON public.channel_link_codes (code) WHERE NOT is_used;
CREATE INDEX idx_channel_link_codes_user ON public.channel_link_codes (user_id);

ALTER TABLE public.channel_link_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own link codes"
  ON public.channel_link_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert link codes"
  ON public.channel_link_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own link codes"
  ON public.channel_link_codes FOR UPDATE
  USING (auth.uid() = user_id);

-- ═══ ADD source_channel TO agent_chat_messages ═══
ALTER TABLE public.agent_chat_messages
  ADD COLUMN IF NOT EXISTS source_channel TEXT;

-- ═══ ADD processing_lock TO agent_chat_sessions ═══
ALTER TABLE public.agent_chat_sessions
  ADD COLUMN IF NOT EXISTS processing_lock TIMESTAMPTZ;

-- ═══ ENABLE REALTIME for cross-channel sync ═══
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_identities;
