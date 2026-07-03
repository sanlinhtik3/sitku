
-- M3: Full-text search on chat messages
ALTER TABLE public.agent_chat_messages
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_agent_chat_messages_content_tsv
  ON public.agent_chat_messages USING GIN (content_tsv);

CREATE INDEX IF NOT EXISTS idx_agent_chat_messages_user_created
  ON public.agent_chat_messages (user_id, created_at DESC);

-- M2: Skill proposal status (for Reflexive Skill Forge inbox)
DO $$ BEGIN
  CREATE TYPE public.skill_status AS ENUM ('proposed', 'active', 'rejected', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.agent_custom_skills
  ADD COLUMN IF NOT EXISTS status public.skill_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS proposal_reason text,
  ADD COLUMN IF NOT EXISTS proposal_evidence jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_agent_custom_skills_status
  ON public.agent_custom_skills (user_id, status);

-- M4: User profile traits (dialectic auditor output)
CREATE TABLE IF NOT EXISTS public.agent_user_traits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trait_key text NOT NULL,
  trait_value text NOT NULL,
  confidence numeric(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'unconfirmed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, trait_key)
);

ALTER TABLE public.agent_user_traits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own traits" ON public.agent_user_traits;
CREATE POLICY "Users manage own traits" ON public.agent_user_traits
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_agent_user_traits_user
  ON public.agent_user_traits (user_id, confidence DESC);
