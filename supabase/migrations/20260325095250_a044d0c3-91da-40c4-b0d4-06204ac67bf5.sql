
-- ═══ P0: Resilience Telemetry Infrastructure ═══

-- 1. Telemetry Spans — structured tracing for every LLM call, tool execution, guard check
CREATE TABLE public.agent_telemetry_spans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id TEXT NOT NULL,
  session_id UUID REFERENCES public.agent_chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  span_type TEXT NOT NULL CHECK (span_type IN ('llm_call', 'tool_execution', 'guard_check', 'plan_generation', 'provider_failover', 'relay', 'full_request')),
  span_name TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'timeout', 'skipped')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telemetry_spans_trace ON public.agent_telemetry_spans(trace_id);
CREATE INDEX idx_telemetry_spans_type_created ON public.agent_telemetry_spans(span_type, created_at DESC);
CREATE INDEX idx_telemetry_spans_session ON public.agent_telemetry_spans(session_id);

-- 2. Provider Health Registry — persistent cross-request health scoring
CREATE TABLE public.agent_provider_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_key_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  health_score NUMERIC(5,2) NOT NULL DEFAULT 100.0,
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  total_timeouts INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms INTEGER DEFAULT 0,
  p95_latency_ms INTEGER DEFAULT 0,
  last_error_type TEXT,
  last_error_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_key_hash, model)
);

CREATE INDEX idx_provider_health_lookup ON public.agent_provider_health(provider_key_hash, model);

-- 3. Guard Effectiveness — track which guards actually improve output
CREATE TABLE public.agent_guard_effectiveness (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guard_name TEXT NOT NULL,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  improvement_count INTEGER NOT NULL DEFAULT 0,
  false_positive_count INTEGER NOT NULL DEFAULT 0,
  avg_retry_latency_ms INTEGER DEFAULT 0,
  effectiveness_score NUMERIC(5,2) DEFAULT 50.0,
  last_triggered_at TIMESTAMPTZ,
  period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('day', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(guard_name, period_start)
);

CREATE INDEX idx_guard_effectiveness_name ON public.agent_guard_effectiveness(guard_name, period_start DESC);

-- RLS policies — service role only (edge functions write via serviceClient)
ALTER TABLE public.agent_telemetry_spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_guard_effectiveness ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own telemetry (for admin dashboard)
CREATE POLICY "Users can read own telemetry spans" ON public.agent_telemetry_spans FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service can insert telemetry spans" ON public.agent_telemetry_spans FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Provider health is system-wide, read by any authenticated user
CREATE POLICY "Authenticated users can read provider health" ON public.agent_provider_health FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage provider health" ON public.agent_provider_health FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Guard effectiveness is system-wide
CREATE POLICY "Authenticated users can read guard effectiveness" ON public.agent_guard_effectiveness FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage guard effectiveness" ON public.agent_guard_effectiveness FOR ALL TO authenticated USING (true) WITH CHECK (true);
