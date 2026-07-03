-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1.4 support — Read-only SQL executor for the local MCP Postgres adapter
-- See mcp-postgres-client.ts (LocalMcpPostgresAdapter).
--
-- Safety:
--   • SECURITY DEFINER with explicit search_path
--   • Wraps query in a transaction with SET TRANSACTION READ ONLY
--   • Caller (edge function) is service-role; user input is sanitized
--     client-side in the adapter (SELECT-only, length cap, block list).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.exec_readonly_sql(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Hard guards even though the client adapter pre-filters.
  IF lower(btrim(p_sql)) NOT LIKE 'select%' THEN
    RAISE EXCEPTION 'exec_readonly_sql: only SELECT statements allowed';
  END IF;
  IF length(p_sql) > 5000 THEN
    RAISE EXCEPTION 'exec_readonly_sql: query too long';
  END IF;
  IF p_sql ~* '\b(pg_sleep|copy|lo_)' THEN
    RAISE EXCEPTION 'exec_readonly_sql: blocked construct';
  END IF;

  -- Force the session to read-only so even sneaky CTE writes fail.
  PERFORM set_config('transaction_read_only', 'on', true);

  EXECUTE format('SELECT jsonb_agg(t) FROM (%s) t', p_sql) INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Restrict callers — only service_role; users should never invoke directly.
REVOKE ALL ON FUNCTION public.exec_readonly_sql(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_readonly_sql(text) TO service_role;

COMMENT ON FUNCTION public.exec_readonly_sql IS
  'Bounded read-only SQL exec for the local MCP Postgres adapter. Service-role only. See mcp-postgres-client.ts.';
