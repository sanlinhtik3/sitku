
CREATE TABLE public.facebook_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_access_token TEXT,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, page_id)
);

ALTER TABLE public.facebook_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own facebook pages"
  ON public.facebook_pages
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
