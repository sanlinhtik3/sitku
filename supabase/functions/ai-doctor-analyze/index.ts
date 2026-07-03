import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAIWithFallback } from "../_shared/model-fallback-caller.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Parse trigger type from body (manual vs scheduled)
    let triggerType = 'scheduled';
    try {
      const body = await req.json();
      triggerType = body.trigger_type || 'scheduled';
    } catch { /* default to scheduled */ }

    // === Multi-source error aggregation (B1) ===
    // Source 1: system_error_logs (frontend captured via systemErrorLogger)
    // Source 2: agent_communication_log failures (semantic tool/agent errors)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const [errorsResult, agentFailuresResult] = await Promise.all([
      supabase
        .from('system_error_logs')
        .select('*')
        .eq('resolved', false)
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('agent_communication_log')
        .select('id, created_at, message_type, content, metadata')
        .or('message_type.ilike.%error%,message_type.ilike.%fail%')
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (errorsResult.error) {
      throw new Error(`Failed to fetch error logs: ${errorsResult.error.message}`);
    }

    const errors = errorsResult.data ?? [];
    const agentFailures = agentFailuresResult.data ?? [];

    const errorCount = errors.length;
    const agentFailureCount = agentFailures.length;
    const totalSignals = errorCount + agentFailureCount;
    const hasCritical = errors.some(e => e.severity === 'critical');

    // Skip analysis if below threshold (unless manual trigger)
    if (triggerType !== 'manual' && totalSignals < 5 && !hasCritical) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `Only ${totalSignals} signals found (threshold: 5). No analysis needed.`,
          error_count: errorCount,
          agent_failure_count: agentFailureCount,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group errors by source
    const errorsBySource: Record<string, any[]> = {};
    for (const err of errors) {
      if (!errorsBySource[err.error_source]) {
        errorsBySource[err.error_source] = [];
      }
      errorsBySource[err.error_source].push({
        message: err.error_message,
        severity: err.severity,
        stack: err.error_stack?.substring(0, 500),
        context: err.context,
        created_at: err.created_at,
      });
    }

    // Build analysis prompt (multi-source)
    const errorSummary = Object.entries(errorsBySource).map(([source, errs]) => {
      return `## ${source} (${errs.length} errors)\n${errs.map(e =>
        `- [${e.severity}] ${e.message} (${e.created_at})`
      ).join('\n')}`;
    }).join('\n\n');

    const agentFailureSummary = agentFailures.length
      ? `\n\n## Agent Communication Failures (${agentFailures.length})\n${agentFailures.slice(0, 15).map((f: any) =>
          `- [${f.message_type}] ${String(f.content ?? '').slice(0, 200)} (${f.created_at})`
        ).join('\n')}`
      : '';

    const prompt = `You are an AI Doctor analyzing error logs from a web application.
Analyze these errors and provide a diagnostic report.

## Error Logs (Last Hour)
Frontend errors: ${errorCount} | Agent failures: ${agentFailureCount} | Critical: ${hasCritical ? 'YES' : 'No'}

${errorSummary}${agentFailureSummary}

Respond with a JSON object containing:
{
  "root_causes": [{"component": "...", "cause": "...", "severity": "critical|high|medium|low"}],
  "patterns": ["pattern description"],
  "recommendations": [{"action": "...", "priority": "immediate|soon|later", "details": "..."}],
  "health_score": 0-100,
  "summary": "One paragraph summary in both English and Myanmar"
}`;

    // Resolve personal API key (admin's key)
    const { data: adminRolesForKey } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1);
    let personalKey: string | null = null;
    if (adminRolesForKey?.length) {
      const { data: adminSettings } = await supabase
        .from('ai_user_settings')
        .select('gemini_api_key')
        .eq('user_id', adminRolesForKey[0].user_id)
        .maybeSingle();
      personalKey = adminSettings?.gemini_api_key || null;
    }
    if (!personalKey) {
      const { data: sysSettings } = await supabase
        .from('ai_model_settings')
        .select('google_system_api_key')
        .maybeSingle();
      personalKey = sysSettings?.google_system_api_key || null;
    }
    if (!personalKey) {
      throw new Error('No API key available for AI Doctor analysis');
    }

    const aiResult = await callAIWithFallback({
      apiKey: personalKey,
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are a system health diagnostic AI. Return valid JSON only, no markdown wrapping.' },
        { role: 'user', content: prompt },
      ],
    });
    if (aiResult.fallbackUsed) {
      console.log(`[AI Doctor] Used fallback model: ${aiResult.modelUsed}`);
    }

    const aiResponse = aiResult.data;

    const rawContent = aiResponse.choices?.[0]?.message?.content || '{}';
    
    // Parse AI response (strip markdown code blocks if present)
    let diagnosis;
    try {
      const cleanJson = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      diagnosis = JSON.parse(cleanJson);
    } catch {
      diagnosis = { raw_response: rawContent, parse_error: true };
    }

    // Save report to database
    const { data: report, error: saveError } = await supabase
      .from('doctor_reports')
      .insert({
        trigger_type: triggerType,
        error_count: errorCount,
        diagnosis,
        status: 'pending_review',
      })
      .select()
      .single();

    if (saveError) {
      console.error('Failed to save doctor report:', saveError);
    }

    // Send Telegram alert if critical issues found
    if (hasCritical || (diagnosis.health_score !== undefined && diagnosis.health_score < 50)) {
      await sendTelegramAlert(supabase, diagnosis, errorCount);
    }

    // Mark analyzed errors as resolved by ai-doctor
    if (errors && errors.length > 0) {
      const errorIds = errors.map(e => e.id);
      await supabase
        .from('system_error_logs')
        .update({ resolved: true, resolved_by: 'ai-doctor' })
        .in('id', errorIds);
    }

    return new Response(
      JSON.stringify({
        success: true,
        report_id: report?.id,
        error_count: errorCount,
        health_score: diagnosis.health_score,
        summary: diagnosis.summary,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('AI Doctor error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function sendTelegramAlert(supabase: any, diagnosis: any, errorCount: number) {
  try {
    // Get admin's bot settings for Telegram notification
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1);

    if (!adminRoles?.length) return;

    const adminUserId = adminRoles[0].user_id;
    const { data: botSettings } = await supabase
      .from('bot_settings')
      .select('telegram_bot_token')
      .eq('user_id', adminUserId)
      .eq('is_active', true)
      .maybeSingle();

    if (!botSettings?.telegram_bot_token) return;

    // Get admin's Telegram chat ID from recent bot chat logs
    const { data: recentChat } = await supabase
      .from('bot_chat_logs')
      .select('chat_id')
      .eq('user_id', adminUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!recentChat?.chat_id) return;

    const healthScore = diagnosis.health_score ?? '??';
    const summary = diagnosis.summary ?? 'No summary available';
    const recommendations = (diagnosis.recommendations || [])
      .slice(0, 3)
      .map((r: any) => `• [${r.priority}] ${r.action}`)
      .join('\n');

    const message = `🏥 *AI Doctor Alert*\n\n` +
      `⚠️ Health Score: *${healthScore}/100*\n` +
      `📊 Errors Analyzed: ${errorCount}\n\n` +
      `${summary}\n\n` +
      `${recommendations ? `*Recommendations:*\n${recommendations}` : ''}`;

    await fetch(
      `https://api.telegram.org/bot${botSettings.telegram_bot_token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: recentChat.chat_id,
          text: message,
          parse_mode: 'Markdown',
        }),
      }
    );
  } catch (e) {
    console.error('Failed to send Telegram alert:', e);
  }
}
