// ═══ P1 UPGRADE: Error Recovery with Checkpoint/Resume ═══
// Step-level checkpointing for agentic loop resilience.
// After each successful tool execution, saves a lightweight checkpoint.
// On recovery (relay/retry), skips already-completed steps.

export interface Checkpoint {
  stepIndex: number;
  toolName: string;
  toolArguments: Record<string, any>;
  toolResult: any;
  isSuccess: boolean;
  createdAt: string;
}

/**
 * Save a checkpoint after successful tool execution.
 * Non-blocking — failures here should never affect the main loop.
 */
export async function saveCheckpoint(
  serviceClient: any,
  sessionId: string,
  missionId: string,
  userId: string,
  stepIndex: number,
  toolName: string,
  toolArguments: Record<string, any>,
  toolResult: any,
  isSuccess: boolean,
): Promise<void> {
  try {
    // Truncate large results to keep checkpoints lightweight
    const truncatedResult = truncateForCheckpoint(toolResult);
    const truncatedArgs = truncateForCheckpoint(toolArguments);

    await serviceClient.from("agent_loop_checkpoints").upsert({
      session_id: sessionId,
      mission_id: missionId,
      user_id: userId,
      step_index: stepIndex,
      tool_name: toolName,
      tool_arguments: truncatedArgs,
      tool_result: truncatedResult,
      is_success: isSuccess,
    }, { onConflict: 'session_id,mission_id,step_index,tool_name' });

    console.log(`[Checkpoint] Saved step ${stepIndex}:${toolName} (success: ${isSuccess})`);
  } catch (e) {
    // Non-critical — checkpoint save failure should never break the loop
    console.warn(`[Checkpoint] Save failed (non-critical):`, e instanceof Error ? e.message : e);
  }
}

/**
 * Load checkpoints for a session/mission to enable resume.
 */
export async function loadCheckpoints(
  serviceClient: any,
  sessionId: string,
  missionId: string,
): Promise<Checkpoint[]> {
  try {
    const { data, error } = await serviceClient
      .from("agent_loop_checkpoints")
      .select("step_index, tool_name, tool_arguments, tool_result, is_success, created_at")
      .eq("session_id", sessionId)
      .eq("mission_id", missionId)
      .order("step_index", { ascending: true });

    if (error || !data) {
      console.warn(`[Checkpoint] Load failed:`, error?.message);
      return [];
    }

    console.log(`[Checkpoint] Loaded ${data.length} checkpoints for mission ${missionId.slice(0, 8)}`);
    return data.map((row: any) => ({
      stepIndex: row.step_index,
      toolName: row.tool_name,
      toolArguments: row.tool_arguments || {},
      toolResult: row.tool_result || {},
      isSuccess: row.is_success,
      createdAt: row.created_at,
    }));
  } catch (e) {
    console.warn(`[Checkpoint] Load error:`, e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Check if a specific tool call has already been completed (checkpoint hit).
 */
export function isCheckpointed(
  checkpoints: Checkpoint[],
  stepIndex: number,
  toolName: string,
  toolArguments: Record<string, any>,
): Checkpoint | null {
  return checkpoints.find(cp =>
    cp.stepIndex === stepIndex &&
    cp.toolName === toolName &&
    cp.isSuccess &&
    argsMatch(cp.toolArguments, toolArguments)
  ) || null;
}

/**
 * Shallow comparison of tool arguments for checkpoint matching.
 */
function argsMatch(a: Record<string, any>, b: Record<string, any>): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false;
    if (String(a[keysA[i]]) !== String(b[keysB[i]])) return false;
  }
  return true;
}

/**
 * Clean up old checkpoints for a session (keep only last 2 missions).
 */
export async function cleanupOldCheckpoints(
  serviceClient: any,
  sessionId: string,
  currentMissionId: string,
): Promise<void> {
  try {
    // Delete checkpoints older than 30 minutes (except current mission)
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await serviceClient
      .from("agent_loop_checkpoints")
      .delete()
      .eq("session_id", sessionId)
      .neq("mission_id", currentMissionId)
      .lt("created_at", cutoff);
  } catch (e) {
    console.warn(`[Checkpoint] Cleanup failed (non-critical):`, e instanceof Error ? e.message : e);
  }
}

// ═══ P4: CRASH-RECOVERY DETECTION ═══

/**
 * Detect if the previous request for this session crashed (lease expired without clean release).
 * Returns the crashed mission ID if detected, null otherwise.
 */
export async function detectCrashedSession(
  serviceClient: any,
  sessionId: string,
): Promise<{ crashedMissionId: string | null; crashedAt: string | null }> {
  try {
    const { data, error } = await serviceClient
      .from("agent_chat_sessions")
      .select("global_session_state, lease_expires_at, lease_holder_id")
      .eq("id", sessionId)
      .single();

    if (error || !data) return { crashedMissionId: null, crashedAt: null };

    const state = data.global_session_state;
    const leaseExpiry = data.lease_expires_at;

    // Crash detected if: processing_status is NOT idle AND lease has expired
    if (
      state?.processing_status &&
      state.processing_status !== "idle" &&
      leaseExpiry &&
      new Date(leaseExpiry) < new Date()
    ) {
      const missionId = state.active_mission_id || null;
      console.log(`[CrashDetect] ⚠️ Crashed session detected! Mission: ${missionId?.slice(0, 8)}, status: ${state.processing_status}`);
      return { crashedMissionId: missionId, crashedAt: leaseExpiry };
    }

    return { crashedMissionId: null, crashedAt: null };
  } catch (e) {
    console.warn(`[CrashDetect] Detection failed:`, e instanceof Error ? e.message : e);
    return { crashedMissionId: null, crashedAt: null };
  }
}

/**
 * Mark a crash recovery event for observability.
 */
export async function markCrashRecovery(
  serviceClient: any,
  sessionId: string,
  crashedMissionId: string,
  newMissionId: string,
  checkpointCount: number,
): Promise<void> {
  try {
    await serviceClient.from("agent_communication_log").insert({
      requester_agent_id: 'system',
      query_type: "crash_recovery",
      query_content: `[CRASH RECOVERY] Session ${sessionId}: resuming from ${checkpointCount} checkpoints. Crashed mission: ${crashedMissionId}, new mission: ${newMissionId}`,
      target_type: "system",
      was_successful: true,
      metadata: {
        session_id: sessionId,
        crashed_mission_id: crashedMissionId,
        new_mission_id: newMissionId,
        checkpoint_count: checkpointCount,
      },
    });
    console.log(`[CrashRecovery] Recovery logged: ${checkpointCount} checkpoints from mission ${crashedMissionId.slice(0, 8)}`);
  } catch (e) {
    console.warn(`[CrashRecovery] Logging failed:`, e instanceof Error ? e.message : e);
  }
}

/**
 * Build context injection from crash checkpoints for resumption.
 */
export function buildCrashRecoveryContext(checkpoints: Checkpoint[]): string {
  if (checkpoints.length === 0) return "";

  const summaries = checkpoints
    .filter(cp => cp.isSuccess)
    .map(cp => {
      const resultPreview = typeof cp.toolResult === 'string'
        ? cp.toolResult.slice(0, 200)
        : JSON.stringify(cp.toolResult).slice(0, 200);
      return `- Step ${cp.stepIndex}: ${cp.toolName} → ${resultPreview}`;
    })
    .join('\n');

  return `[CRASH RECOVERY] The previous request crashed mid-execution. Here are the completed steps:\n${summaries}\n\nContinue from where the crash occurred. Do NOT repeat completed steps.`;
}

/**
 * Truncate large objects to keep checkpoints lightweight (max 2KB per field).
 */
function truncateForCheckpoint(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  
  const str = JSON.stringify(obj);
  if (str.length <= 2048) return obj;

  // Deep truncate
  if (typeof obj === 'string') return obj.slice(0, 2000) + '...[truncated]';
  if (Array.isArray(obj)) return obj.slice(0, 5).map(truncateForCheckpoint);
  if (typeof obj === 'object') {
    const truncated: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string' && val.length > 500) {
        truncated[key] = val.slice(0, 500) + '...[truncated]';
      } else if (typeof val === 'object') {
        truncated[key] = JSON.stringify(val).length > 500
          ? '[object truncated]'
          : val;
      } else {
        truncated[key] = val;
      }
    }
    return truncated;
  }
  return obj;
}
