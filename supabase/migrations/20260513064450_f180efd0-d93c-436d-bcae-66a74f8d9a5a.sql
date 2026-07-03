CREATE TABLE public.ai_subsystem_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subsystem text NOT NULL CHECK (subsystem IN ('automate','consultant','flowstate')),
  provider text NOT NULL CHECK (provider IN ('google','anthropic')),
  model text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, subsystem)
);

CREATE INDEX idx_ai_subsystem_overrides_user ON public.ai_subsystem_overrides(user_id);

ALTER TABLE public.ai_subsystem_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subsystem overrides"
ON public.ai_subsystem_overrides FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own subsystem overrides"
ON public.ai_subsystem_overrides FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own subsystem overrides"
ON public.ai_subsystem_overrides FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own subsystem overrides"
ON public.ai_subsystem_overrides FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER trg_ai_subsystem_overrides_updated_at
BEFORE UPDATE ON public.ai_subsystem_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();