
-- Table for BYOK API keys (Tavily, etc.)
CREATE TABLE public.user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can ONLY access their own keys
CREATE POLICY "Users can manage own API keys"
  ON public.user_api_keys FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RPC: Check key existence without exposing value
CREATE OR REPLACE FUNCTION public.check_user_api_key_exists(
  p_user_id UUID,
  p_provider TEXT
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_api_keys
    WHERE user_id = p_user_id AND provider = p_provider AND is_active = true
  );
$$;
