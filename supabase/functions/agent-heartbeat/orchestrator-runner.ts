type OrchestratorTaskStatus = "completed" | "failed" | "running";

interface RunOrchestratorParams {
  supabase: any;
  supabaseUrl: string;
  serviceRoleKey: string;
  prompt: string;
  sessionId: string;
  userId: string;
  taskId?: string;
}

interface AutonomousTaskSnapshot {
  status: string;
  result: string | null;
  error: string | null;
  progress_pct: number | null;
  current_step: number | null;
  total_steps: number | null;
}

export interface OrchestratorRunResult {
  taskId: string | null;
  taskStatus: OrchestratorTaskStatus;
  finalContent: string | null;
  error: string | null;
  progressPct: number | null;
  currentStep: number | null;
  totalSteps: number | null;
}

// Adaptive poll: fast for simple tasks, relaxed for deep research
const getAdaptivePollMs = (elapsed: number): number => {
  if (elapsed < 10_000) return 1000;   // First 10s: poll every 1s
  if (elapsed < 30_000) return 2000;   // 10-30s: every 2s
  if (elapsed < 60_000) return 3000;   // 30-60s: every 3s
  return 5000;                          // 60s+: every 5s (deep research)
};
const POLL_TIMEOUT_MS = 140000; // 140s — generous for deep research tasks
const ORCHESTRATOR_FETCH_TIMEOUT_MS = 30000; // 30s for the initial POST
const MAX_ORCHESTRATOR_RETRIES = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function summarizeMarkdown(markdown: string, maxLength = 260): string {
  if (!markdown) return "";

  const plainText = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[#>*_\-]+/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (plainText.length <= maxLength) return plainText;
  return `${plainText.slice(0, maxLength - 1)}…`;
}

async function fetchTaskSnapshot(supabase: any, taskId: string): Promise<AutonomousTaskSnapshot | null> {
  const { data, error } = await supabase
    .from("autonomous_tasks")
    .select("status, result, error, progress_pct, current_step, total_steps")
    .eq("id", taskId)
    .maybeSingle();

  if (error) throw error;
  return (data as AutonomousTaskSnapshot | null) ?? null;
}

async function waitForTaskCompletion(supabase: any, taskId: string): Promise<OrchestratorRunResult> {
  const startedAt = Date.now();
  let lastSnapshot: AutonomousTaskSnapshot | null = null;

  while (Date.now() - startedAt <= POLL_TIMEOUT_MS) {
    const snapshot = await fetchTaskSnapshot(supabase, taskId);

    if (snapshot) {
      lastSnapshot = snapshot;
      const status = snapshot.status;

      if (status === "completed") {
        return {
          taskId,
          taskStatus: "completed",
          finalContent: snapshot.result,
          error: null,
          progressPct: snapshot.progress_pct,
          currentStep: snapshot.current_step,
          totalSteps: snapshot.total_steps,
        };
      }

      if (status === "failed") {
        return {
          taskId,
          taskStatus: "failed",
          finalContent: null,
          error: snapshot.error || "Autonomous execution failed",
          progressPct: snapshot.progress_pct,
          currentStep: snapshot.current_step,
          totalSteps: snapshot.total_steps,
        };
      }
    }

    await sleep(getAdaptivePollMs(Date.now() - startedAt));
  }

  return {
    taskId,
    taskStatus: "running",
    finalContent: null,
    error: null,
    progressPct: lastSnapshot?.progress_pct ?? null,
    currentStep: lastSnapshot?.current_step ?? null,
    totalSteps: lastSnapshot?.total_steps ?? null,
  };
}

async function callOrchestrator(
  supabaseUrl: string,
  serviceRoleKey: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ORCHESTRATOR_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ORCHESTRATOR_FETCH_TIMEOUT_MS);

      const response = await fetch(`${supabaseUrl}/functions/v1/beebot-orchestrator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const raw = await response.text();
      const payload = raw ? (() => { try { return JSON.parse(raw); } catch { return { raw }; } })() : {};

      if (!response.ok) {
        const detail = payload?.error || payload?.raw || raw || "Unknown orchestrator error";
        throw new Error(`Orchestrator failed (${response.status}): ${detail}`);
      }

      return payload;
    } catch (err: any) {
      lastError = err;
      const isRetryable = err?.name === "AbortError" || err?.message?.includes("abort") || err?.message?.includes("signal");
      if (!isRetryable || attempt >= MAX_ORCHESTRATOR_RETRIES) break;
      console.warn(`[orchestrator-runner] Attempt ${attempt} aborted, retrying...`);
      await sleep(2000 * attempt);
    }
  }

  throw lastError || new Error("Orchestrator call failed after retries");
}

export async function runPromptWithOrchestrator({
  supabase,
  supabaseUrl,
  serviceRoleKey,
  prompt,
  sessionId,
  userId,
  taskId,
}: RunOrchestratorParams): Promise<OrchestratorRunResult> {
  let payload: Record<string, unknown> = {};

  // ═══ Model Sovereignty: Fetch user's preferred model for orchestrator ═══
  // Priority: ai_subsystem_overrides[automate] > ai_user_settings.gemini_model
  let preferredModel: string | null = null;
  let hasOpenRouter = false;
  try {
    const [overrideRes, aiSettingsRes, userKeysRes] = await Promise.all([
      supabase
        .from("ai_subsystem_overrides")
        .select("model, enabled")
        .eq("user_id", userId)
        .eq("subsystem", "automate")
        .maybeSingle(),
      supabase
        .from("ai_user_settings")
        .select("gemini_model")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_api_keys")
        .select("provider")
        .eq("user_id", userId)
        .eq("is_active", true),
    ]);

    const override = overrideRes.data;
    if (override?.enabled && override.model) {
      preferredModel = override.model;
    } else {
      preferredModel = aiSettingsRes.data?.gemini_model || null;
    }
    hasOpenRouter = (userKeysRes.data || []).some((k: any) => k.provider === "openrouter");
  } catch (e) {
    console.warn("[orchestrator-runner] Model sovereignty fetch failed (non-fatal):", e);
  }

  const orchestratorBody: Record<string, unknown> = { prompt, sessionId, userId, taskId };
  if (preferredModel) orchestratorBody.preferred_model = preferredModel;
  if (hasOpenRouter) orchestratorBody.has_openrouter = true;

  try {
    payload = await callOrchestrator(supabaseUrl, serviceRoleKey, orchestratorBody);
  } catch (error: any) {
    // Recovery path: orchestrator can return 502/503/504 while background task is still running.
    if (taskId) {
      console.warn("[orchestrator-runner] Orchestrator request failed, recovering via task polling:", error?.message || error);
      return await waitForTaskCompletion(supabase, taskId);
    }
    throw error;
  }

  const resolvedTaskId = typeof payload?.taskId === "string" ? (payload.taskId as string) : taskId ?? null;
  if (!resolvedTaskId) {
    return {
      taskId: null,
      taskStatus: "failed",
      finalContent: null,
      error: "Missing autonomous task ID from orchestrator",
      progressPct: null,
      currentStep: null,
      totalSteps: null,
    };
  }

  return await waitForTaskCompletion(supabase, resolvedTaskId);
}
