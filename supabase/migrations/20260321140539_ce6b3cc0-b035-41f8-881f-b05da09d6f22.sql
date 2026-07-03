
-- Video Projects table
CREATE TABLE public.video_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  project_data JSONB NOT NULL DEFAULT '{}',
  thumbnail_url TEXT,
  duration_seconds NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.video_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own video projects"
  ON public.video_projects FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own video projects"
  ON public.video_projects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own video projects"
  ON public.video_projects FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own video projects"
  ON public.video_projects FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Video Assets table
CREATE TABLE public.video_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.video_projects(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  duration_seconds NUMERIC,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.video_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own video assets"
  ON public.video_assets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own video assets"
  ON public.video_assets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own video assets"
  ON public.video_assets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own video assets"
  ON public.video_assets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
