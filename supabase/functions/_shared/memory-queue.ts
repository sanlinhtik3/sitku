// ═══ P4: Async Memory Queue — Decouple Memory Pipeline ═══
// Replaces fire-and-forget memory calls with DB-backed queue for at-least-once delivery.

export type MemoryTaskType = 
  | 'episodic_archive'
  | 'profile_learn'
  | 'rolling_summary'
  | 'health_check'
  | 'reflection';

export interface MemoryQueueItem {
  user_id: string;
  session_id: string;
  task_type: MemoryTaskType;
  payload: Record<string, any>;
}

/**
 * Enqueue one or more memory tasks. Fire-and-forget — failures are non-critical.
 */
export async function enqueueMemoryTasks(
  serviceClient: any,
  tasks: MemoryQueueItem[],
): Promise<void> {
  if (tasks.length === 0) return;

  try {
    const rows = tasks.map(t => ({
      user_id: t.user_id,
      session_id: t.session_id,
      task_type: t.task_type,
      payload: t.payload,
      status: 'pending',
      retry_count: 0,
    }));

    const { error } = await serviceClient
      .from('memory_queue')
      .insert(rows);

    if (error) {
      console.warn(`[MemoryQueue] Enqueue failed:`, error.message);
    } else {
      console.log(`[MemoryQueue] Enqueued ${tasks.length} tasks: ${tasks.map(t => t.task_type).join(', ')}`);
    }
  } catch (e) {
    console.warn(`[MemoryQueue] Enqueue error:`, e instanceof Error ? e.message : e);
  }
}

/**
 * Dequeue pending tasks (with pessimistic locking via locked_until).
 * Returns up to `limit` tasks and marks them as processing.
 */
export async function dequeueMemoryTasks(
  serviceClient: any,
  limit: number = 10,
): Promise<Array<{ id: string; user_id: string; session_id: string; task_type: MemoryTaskType; payload: Record<string, any>; retry_count: number }>> {
  try {
    const lockUntil = new Date(Date.now() + 60_000).toISOString(); // 60s lock
    const now = new Date().toISOString();

    // Fetch pending tasks that are not locked
    const { data, error } = await serviceClient
      .from('memory_queue')
      .select('id, user_id, session_id, task_type, payload, retry_count')
      .eq('status', 'pending')
      .or(`locked_until.is.null,locked_until.lt.${now}`)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error || !data || data.length === 0) return [];

    // Lock them
    const ids = data.map((d: any) => d.id);
    await serviceClient
      .from('memory_queue')
      .update({ status: 'processing', locked_until: lockUntil })
      .in('id', ids);

    return data;
  } catch (e) {
    console.warn(`[MemoryQueue] Dequeue error:`, e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Mark a task as done.
 */
export async function markTaskDone(
  serviceClient: any,
  taskId: string,
): Promise<void> {
  try {
    await serviceClient
      .from('memory_queue')
      .update({ status: 'done', processed_at: new Date().toISOString() })
      .eq('id', taskId);
  } catch (e) {
    console.warn(`[MemoryQueue] markDone error:`, e instanceof Error ? e.message : e);
  }
}

/**
 * Mark a task as failed (increments retry_count, resets to pending if under max retries).
 */
export async function markTaskFailed(
  serviceClient: any,
  taskId: string,
  retryCount: number,
  maxRetries: number = 3,
): Promise<void> {
  try {
    const newStatus = retryCount + 1 >= maxRetries ? 'failed' : 'pending';
    await serviceClient
      .from('memory_queue')
      .update({
        status: newStatus,
        retry_count: retryCount + 1,
        locked_until: null,
        ...(newStatus === 'failed' ? { processed_at: new Date().toISOString() } : {}),
      })
      .eq('id', taskId);
  } catch (e) {
    console.warn(`[MemoryQueue] markFailed error:`, e instanceof Error ? e.message : e);
  }
}

/**
 * Cleanup old completed/failed tasks (older than 24h).
 */
export async function cleanupOldTasks(
  serviceClient: any,
): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await serviceClient
      .from('memory_queue')
      .delete()
      .in('status', ['done', 'failed'])
      .lt('created_at', cutoff);
  } catch (e) {
    console.warn(`[MemoryQueue] Cleanup error:`, e instanceof Error ? e.message : e);
  }
}

/**
 * Trigger the memory-worker edge function (fire-and-forget).
 */
export function triggerMemoryWorker(): void {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !svcKey) return;

    fetch(`${supabaseUrl}/functions/v1/memory-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${svcKey}`,
      },
      body: JSON.stringify({ trigger: "post-loop" }),
    }).catch(() => {});
  } catch {
    // Non-critical
  }
}
