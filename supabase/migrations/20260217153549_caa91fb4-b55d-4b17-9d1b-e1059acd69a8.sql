
CREATE TABLE public.broadcast_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL DEFAULT 'telegram',
  channel_name TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.broadcast_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own broadcast channels"
  ON public.broadcast_channels FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
