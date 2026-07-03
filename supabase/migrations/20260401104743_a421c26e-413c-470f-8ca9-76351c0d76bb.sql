CREATE TABLE public.widget_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID NOT NULL,
  message_id TEXT NOT NULL,
  title TEXT NOT NULL,
  html TEXT NOT NULL,
  height INT DEFAULT 400,
  preset TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.widget_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own widget snapshots"
  ON public.widget_snapshots FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own widget snapshots"
  ON public.widget_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own widget snapshots"
  ON public.widget_snapshots FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_widget_snapshots_user ON public.widget_snapshots(user_id);
CREATE INDEX idx_widget_snapshots_session ON public.widget_snapshots(session_id);