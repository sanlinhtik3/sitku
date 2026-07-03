
-- ═══ P2: Model Performance Registry ═══
-- Tracks per-model, per-task-type success rates and latencies for intelligent routing.

CREATE TABLE IF NOT EXISTS public.agent_model_performance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'general',
  complexity_tier TEXT NOT NULL DEFAULT 'moderate',
  total_requests INTEGER NOT NULL DEFAULT 0,
  successful_requests INTEGER NOT NULL DEFAULT 0,
  failed_requests INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms INTEGER NOT NULL DEFAULT 0,
  p95_latency_ms INTEGER NOT NULL DEFAULT 0,
  avg_output_length INTEGER NOT NULL DEFAULT 0,
  avg_guard_retries REAL NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 100,
  quality_score REAL NOT NULL DEFAULT 50,
  last_used_at TIMESTAMPTZ,
  period_start TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_perf_lookup 
  ON public.agent_model_performance (model, task_type, complexity_tier, period_start);

CREATE INDEX IF NOT EXISTS idx_model_perf_quality 
  ON public.agent_model_performance (quality_score DESC);

-- RLS: service-role only (telemetry writes are fire-and-forget from edge functions)
ALTER TABLE public.agent_model_performance ENABLE ROW LEVEL SECURITY;

-- ═══ P2: Predictive Health Anomalies ═══
-- Records detected anomalies for alerting and auto-tuning.

CREATE TABLE IF NOT EXISTS public.agent_health_anomalies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  anomaly_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  source TEXT NOT NULL,
  description TEXT NOT NULL,
  metric_value REAL,
  threshold_value REAL,
  metadata JSONB DEFAULT '{}',
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomalies_unresolved 
  ON public.agent_health_anomalies (resolved, created_at DESC) WHERE NOT resolved;

ALTER TABLE public.agent_health_anomalies ENABLE ROW LEVEL SECURITY;
