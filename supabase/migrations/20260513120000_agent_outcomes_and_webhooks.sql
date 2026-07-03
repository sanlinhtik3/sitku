-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3.2 — Agent Outcomes (formal goal tracking) + Session-event webhooks
-- See docs/AGENTIC_AUDIT.md §"DoD OUTCOME-1, WEBHOOK-1".
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Outcomes ────────────────────────────────────────────────────────────
-- A persistent goal that may span multiple sessions / messages. Mirrors the
-- Anthropic May-2026 "Outcomes" feature for Managed Agents.
CREATE TABLE IF NOT EXISTS public.agent_outcomes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','completed','abandoned','blocked')),
  success_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  progress_pct    int NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  linked_sessions uuid[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outcomes_user_status
  ON public.agent_outcomes (user_id, status, updated_at DESC);

ALTER TABLE public.agent_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outcomes_owner_all"
  ON public.agent_outcomes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "outcomes_service_all"
  ON public.agent_outcomes FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_outcome_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now();
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN NEW.completed_at = now(); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_outcomes_touch ON public.agent_outcomes;
CREATE TRIGGER trg_outcomes_touch BEFORE UPDATE ON public.agent_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.touch_outcome_updated_at();

-- ─── Session lifecycle webhook log + per-user webhook destinations ───────
-- Two tables: one stores raw events, one stores user-configured external
-- webhook URLs to relay them to (multi-tenant SaaS pattern).

CREATE TABLE IF NOT EXISTS public.agent_session_webhooks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      uuid REFERENCES public.agent_chat_sessions(id) ON DELETE CASCADE,
  event_type      text NOT NULL
                    CHECK (event_type IN ('session.started','session.tool_called','session.completed','session.error')),
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivered       boolean NOT NULL DEFAULT false,
  delivery_attempts int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_webhooks_user_time
  ON public.agent_session_webhooks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_webhooks_undelivered
  ON public.agent_session_webhooks (delivered, created_at) WHERE delivered = false;

ALTER TABLE public.agent_session_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhooks_owner_select"
  ON public.agent_session_webhooks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "webhooks_service_all"
  ON public.agent_session_webhooks FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.agent_webhook_destinations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label           text,
  target_url      text NOT NULL,
  secret          text,         -- optional HMAC signing secret
  events          text[] NOT NULL DEFAULT ARRAY['session.completed']::text[],
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_dest_user_active
  ON public.agent_webhook_destinations (user_id, is_active);

ALTER TABLE public.agent_webhook_destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_dest_owner_all"
  ON public.agent_webhook_destinations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "webhook_dest_service_all"
  ON public.agent_webhook_destinations FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.agent_outcomes IS
  'Long-running goal tracking across sessions. Mirrors Anthropic Managed Agents Outcomes (May 2026).';
COMMENT ON TABLE public.agent_session_webhooks IS
  'Session lifecycle event log. Populated by session-events.ts. Consumed by agent-webhook-relay edge fn.';
COMMENT ON TABLE public.agent_webhook_destinations IS
  'User-configured external webhook URLs for session events (Slack, Zapier, custom).';
