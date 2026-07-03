import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const results: Record<string, number> = {};

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // 1. Delete messages in inactive sessions
    const { data: inactiveSessionIds } = await supabase
      .from('agent_chat_sessions')
      .select('id')
      .eq('is_active', false);

    const sessionIds = (inactiveSessionIds || []).map((s: { id: string }) => s.id);
    results.inactive_sessions_found = sessionIds.length;

    if (sessionIds.length > 0) {
      // Clean FK references first
      for (const table of [
        'agent_knowledge_gaps',
        'agent_proactive_suggestions',
        'agent_autonomous_actions',
      ]) {
        await supabase.from(table).delete().in('session_id', sessionIds);
      }

      await supabase.from('agent_sub_tasks').delete().in('parent_session_id', sessionIds);

      // Get autonomous task IDs for step cleanup
      const { data: taskIds } = await supabase
        .from('autonomous_tasks')
        .select('id')
        .in('session_id', sessionIds);
      
      if (taskIds && taskIds.length > 0) {
        await supabase.from('autonomous_task_steps').delete().in('task_id', taskIds.map(t => t.id));
        await supabase.from('autonomous_tasks').delete().in('session_id', sessionIds);
      }

      await supabase.from('agent_ai_usage').delete().in('session_id', sessionIds);
      await supabase.from('agent_chat_messages').delete().in('session_id', sessionIds);
      await supabase.from('agent_chat_sessions').delete().in('id', sessionIds);
      results.inactive_sessions_deleted = sessionIds.length;
    }

    // 2. Delete old AI usage logs (30d+)
    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: aiUsageDeleted } = await supabase
      .from('agent_ai_usage')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff30d);
    results.ai_usage_deleted = aiUsageDeleted || 0;

    // 3. Delete old heartbeat logs (14d+)
    const cutoff14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { count: heartbeatDeleted } = await supabase
      .from('agent_heartbeat_logs')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff14d);
    results.heartbeat_logs_deleted = heartbeatDeleted || 0;

    // 4. Delete inactive learning contexts
    const { count: learningDeleted } = await supabase
      .from('agent_learning_context')
      .delete({ count: 'exact' })
      .eq('is_active', false);
    results.learning_context_deleted = learningDeleted || 0;

    // 5. Delete low-importance embeddings (< 0.5)
    const { count: embeddingsDeleted } = await supabase
      .from('chat_memory_embeddings')
      .delete({ count: 'exact' })
      .lt('importance_score', 0.5);
    results.low_importance_embeddings_deleted = embeddingsDeleted || 0;

    // 6. Delete inactive user_memories
    const { count: memoriesDeleted } = await supabase
      .from('user_memories')
      .delete({ count: 'exact' })
      .eq('is_active', false);
    results.inactive_memories_deleted = memoriesDeleted || 0;

    const elapsed = Date.now() - startTime;
    console.log(`[database-cleanup] Completed in ${elapsed}ms:`, JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, results, elapsed_ms: elapsed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[database-cleanup] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error', results }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
