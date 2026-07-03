ALTER TABLE public.ai_subsystem_overrides
  DROP CONSTRAINT IF EXISTS ai_subsystem_overrides_provider_check;

ALTER TABLE public.ai_subsystem_overrides
  ADD CONSTRAINT ai_subsystem_overrides_provider_check
  CHECK (provider IN ('google', 'openrouter'));
