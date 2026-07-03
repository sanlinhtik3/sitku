-- Task-level AI usage ledger for per-run cost and model auditing.

ALTER TABLE public.agent_ai_usage
  DROP CONSTRAINT IF EXISTS agent_ai_usage_api_source_check;

ALTER TABLE public.agent_ai_usage
  ADD CONSTRAINT agent_ai_usage_api_source_check
  CHECK (api_source IN ('personal_key', 'lovable_gateway', 'system_key', 'gateway', 'system_grant', 'free_tier'));

ALTER TABLE public.agent_ai_usage
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES public.autonomous_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_request_id TEXT,
  ADD COLUMN IF NOT EXISTS trace_id TEXT,
  ADD COLUMN IF NOT EXISTS call_kind TEXT DEFAULT 'main_response',
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS request_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS estimated_iu NUMERIC(12, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_agent_ai_usage_task_created
  ON public.agent_ai_usage(task_id, created_at DESC)
  WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ai_usage_client_request
  ON public.agent_ai_usage(client_request_id, created_at DESC)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ai_usage_trace
  ON public.agent_ai_usage(trace_id, created_at DESC)
  WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ai_usage_provider
  ON public.agent_ai_usage(provider);

CREATE OR REPLACE FUNCTION public.get_agent_usage_audit(
  p_user_id UUID,
  p_task_id UUID DEFAULT NULL,
  p_client_request_id TEXT DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF auth.uid() IS NOT NULL
    AND auth.uid() <> p_user_id
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
  THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  WITH filtered AS (
    SELECT *
    FROM public.agent_ai_usage
    WHERE user_id = p_user_id
      AND (p_task_id IS NULL OR task_id = p_task_id)
      AND (p_client_request_id IS NULL OR client_request_id = p_client_request_id)
      AND (p_since IS NULL OR created_at >= p_since)
  ),
  totals AS (
    SELECT
      COUNT(*)::INT AS rows_logged,
      COALESCE(SUM(request_count), 0)::INT AS total_requests,
      COALESCE(SUM(tokens_input), 0)::INT AS tokens_input,
      COALESCE(SUM(tokens_output), 0)::INT AS tokens_output,
      COALESCE(SUM(tokens_total), 0)::INT AS tokens_total,
      COALESCE(SUM(estimated_cost), 0)::NUMERIC AS estimated_cost_usd,
      COALESCE(SUM(estimated_iu), 0)::NUMERIC AS estimated_iu,
      COALESCE(AVG(request_duration_ms), 0)::NUMERIC AS avg_duration_ms,
      COALESCE(SUM(CASE WHEN is_successful THEN 1 ELSE 0 END), 0)::INT AS successful_rows,
      COALESCE(SUM(CASE WHEN NOT is_successful THEN 1 ELSE 0 END), 0)::INT AS failed_rows
    FROM filtered
  ),
  by_model AS (
    SELECT model_used, COALESCE(provider, 'unknown') AS provider,
      COALESCE(SUM(request_count), 0)::INT AS requests,
      COALESCE(SUM(tokens_total), 0)::INT AS tokens_total,
      COALESCE(SUM(estimated_cost), 0)::NUMERIC AS estimated_cost_usd,
      COALESCE(SUM(estimated_iu), 0)::NUMERIC AS estimated_iu
    FROM filtered
    GROUP BY model_used, COALESCE(provider, 'unknown')
  ),
  by_call_kind AS (
    SELECT COALESCE(call_kind, 'unknown') AS call_kind,
      COALESCE(SUM(request_count), 0)::INT AS requests,
      COALESCE(SUM(tokens_total), 0)::INT AS tokens_total,
      COALESCE(SUM(estimated_cost), 0)::NUMERIC AS estimated_cost_usd
    FROM filtered
    GROUP BY COALESCE(call_kind, 'unknown')
  )
  SELECT jsonb_build_object(
    'filters', jsonb_build_object(
      'user_id', p_user_id,
      'task_id', p_task_id,
      'client_request_id', p_client_request_id,
      'since', p_since
    ),
    'summary', jsonb_build_object(
      'rows_logged', totals.rows_logged,
      'total_requests', totals.total_requests,
      'tokens_input', totals.tokens_input,
      'tokens_output', totals.tokens_output,
      'tokens_total', totals.tokens_total,
      'estimated_cost_usd', ROUND(totals.estimated_cost_usd, 6),
      'estimated_iu', ROUND(totals.estimated_iu, 4),
      'avg_duration_ms', ROUND(totals.avg_duration_ms, 0),
      'successful_rows', totals.successful_rows,
      'failed_rows', totals.failed_rows
    ),
    'by_model', COALESCE((SELECT jsonb_agg(to_jsonb(by_model) ORDER BY requests DESC) FROM by_model), '[]'::jsonb),
    'by_call_kind', COALESCE((SELECT jsonb_agg(to_jsonb(by_call_kind) ORDER BY requests DESC) FROM by_call_kind), '[]'::jsonb),
    'calls', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'created_at', created_at,
        'task_id', task_id,
        'client_request_id', client_request_id,
        'trace_id', trace_id,
        'call_kind', call_kind,
        'api_source', api_source,
        'provider', provider,
        'model_used', model_used,
        'request_count', request_count,
        'tokens_input', tokens_input,
        'tokens_output', tokens_output,
        'tokens_total', tokens_total,
        'estimated_cost_usd', estimated_cost,
        'estimated_iu', estimated_iu,
        'duration_ms', request_duration_ms,
        'success', is_successful,
        'error', error_message
      ) ORDER BY created_at ASC)
      FROM filtered
    ), '[]'::jsonb)
  )
  INTO result
  FROM totals;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_agent_usage_audit(UUID, UUID, TEXT, TIMESTAMPTZ) TO authenticated;
