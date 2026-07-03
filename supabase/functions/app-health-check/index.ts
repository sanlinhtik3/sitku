import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const checks: Record<string, { status: string; latency_ms?: number; error?: string }> = {};

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // === Action: log_error (called by frontend systemErrorLogger) ===
    // Backward compatible — health-check pings (no body / no action) skip this branch.
    if (req.method === 'POST') {
      let body: any = null;
      try { body = await req.clone().json(); } catch { /* not JSON, fall through to health check */ }
      if (body?.action === 'log_error') {
        const message = String(body.error_message ?? '').slice(0, 4000);
        const source = String(body.error_source ?? 'unknown').slice(0, 200);
        if (!message) {
          return new Response(JSON.stringify({ error: 'error_message required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        const { error: insertErr } = await supabase.from('system_error_logs').insert({
          error_source: source,
          error_message: message,
          error_stack: body.error_stack ? String(body.error_stack).slice(0, 8000) : null,
          severity: ['info','warning','error','critical'].includes(body.severity) ? body.severity : 'error',
          user_id: body.user_id ?? null,
          context: body.context ?? null,
          resolved: false,
        });
        if (insertErr) {
          console.error('[app-health-check] log_error insert failed:', insertErr.message);
          return new Response(JSON.stringify({ logged: false, error: insertErr.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ logged: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Check 1: Database connectivity
    const dbStart = Date.now();
    try {
      const { error } = await supabase.from('profiles').select('user_id', { count: 'exact', head: true });
      checks.database = error
        ? { status: 'unhealthy', error: error.message, latency_ms: Date.now() - dbStart }
        : { status: 'healthy', latency_ms: Date.now() - dbStart };
    } catch (e) {
      checks.database = { status: 'unhealthy', error: e instanceof Error ? e.message : 'Unknown', latency_ms: Date.now() - dbStart };
    }

    // Check 2: Auth service
    const authStart = Date.now();
    try {
      const { error } = await supabase.auth.getSession();
      checks.auth = error
        ? { status: 'unhealthy', error: error.message, latency_ms: Date.now() - authStart }
        : { status: 'healthy', latency_ms: Date.now() - authStart };
    } catch (e) {
      checks.auth = { status: 'unhealthy', error: e instanceof Error ? e.message : 'Unknown', latency_ms: Date.now() - authStart };
    }

    // Check 3: Recent error count (last hour)
    const errStart = Date.now();
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from('system_error_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo)
        .eq('resolved', false);
      
      const errorCount = count ?? 0;
      checks.error_logs = {
        status: errorCount >= 10 ? 'warning' : 'healthy',
        latency_ms: Date.now() - errStart,
        ...(error && { error: error.message }),
      };
    } catch (e) {
      checks.error_logs = { status: 'unhealthy', error: e instanceof Error ? e.message : 'Unknown', latency_ms: Date.now() - errStart };
    }

    // Check 4: Active sessions
    const sessStart = Date.now();
    try {
      const { count } = await supabase
        .from('user_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      checks.active_sessions = { status: 'healthy', latency_ms: Date.now() - sessStart };
    } catch (e) {
      checks.active_sessions = { status: 'unhealthy', error: e instanceof Error ? e.message : 'Unknown', latency_ms: Date.now() - sessStart };
    }

    const overallHealthy = Object.values(checks).every(c => c.status !== 'unhealthy');
    const statusCode = overallHealthy ? 200 : 503;

    return new Response(
      JSON.stringify({
        status: overallHealthy ? 'healthy' : 'unhealthy',
        checks,
        total_latency_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        checks,
        total_latency_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
