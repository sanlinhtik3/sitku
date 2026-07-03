// ═══ P4: Memory Worker — Async Queue Processor ═══
// Processes memory tasks from the memory_queue table.
// Invoked fire-and-forget from post-loop-handler or via cron.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dequeueMemoryTasks, markTaskDone, markTaskFailed, cleanupOldTasks } from "../_shared/memory-queue.ts";
import {
  analyzeAndLearnUserProfile,
  archiveToEpisodicMemory,
  generateRollingContextSummary,
  memoryHealthCheck,
  postInteractionReflection,
} from "../_shared/executor-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Dequeue up to 10 tasks
    const tasks = await dequeueMemoryTasks(serviceClient, 10);

    if (tasks.length === 0) {
      // Opportunistic cleanup
      await cleanupOldTasks(serviceClient);
      return new Response(JSON.stringify({ processed: 0, duration_ms: Date.now() - startTime }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[MemoryWorker] Processing ${tasks.length} tasks`);

    let processed = 0;
    let failed = 0;

    for (const task of tasks) {
      try {
        const { user_id, session_id, task_type, payload } = task;
        const userClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        switch (task_type) {
          case 'profile_learn':
            await analyzeAndLearnUserProfile(userClient, user_id, payload.sanitizedMessage || '');
            break;

          case 'episodic_archive':
            await archiveToEpisodicMemory(
              userClient, user_id, session_id,
              payload.sanitizedMessage || '',
              payload.sanitizedFinalContent || '',
              payload.toolNames || [],
              payload.geminiKey || undefined,
              payload.complexityTier || 'moderate',
              payload.scopeInfo || undefined,
            );
            break;

          case 'rolling_summary':
            await generateRollingContextSummary(userClient, session_id, payload.geminiKey || undefined);
            break;

          case 'health_check':
            await memoryHealthCheck(userClient, user_id, payload.geminiKey || undefined);
            break;

          case 'reflection':
            await postInteractionReflection(
              userClient, user_id, session_id,
              payload.sanitizedMessage || '',
              payload.sanitizedFinalContent || '',
              payload.toolNames || [],
              payload.geminiKey || undefined,
            );
            break;

          default:
            console.warn(`[MemoryWorker] Unknown task type: ${task_type}`);
        }

        await markTaskDone(serviceClient, task.id);
        processed++;
      } catch (e) {
        console.error(`[MemoryWorker] Task ${task.id} (${task.task_type}) failed:`, e instanceof Error ? e.message : e);
        await markTaskFailed(serviceClient, task.id, task.retry_count);
        failed++;
      }
    }

    // Cleanup old tasks opportunistically
    cleanupOldTasks(serviceClient).catch(() => {});

    console.log(`[MemoryWorker] Done: ${processed} processed, ${failed} failed, ${Date.now() - startTime}ms`);

    return new Response(JSON.stringify({
      processed,
      failed,
      duration_ms: Date.now() - startTime,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[MemoryWorker] Fatal error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
