// ═══ Coordinator Supervisor Loop — Claude Code-Inspired Multi-Agent Orchestration ═══
// Active supervisor that delegates, monitors, decides, and synthesizes.
// Wraps existing DAG engine with a think-delegate-monitor loop.

import type { DAGStep, DAGExecutionConfig } from "./dag-executor.ts";
import { executeDAG } from "./dag-executor.ts";
import {
  WorkerRegistry, NotificationQueue, createNotification,
  type WorkerNotification, type CoordinatorDecision,
} from "./coordinator-protocol.ts";
import {
  createWorkerContext, executeWorker, type WorkerExecutionResult,
} from "./worker-agent.ts";
import { writeScratchpadTyped } from "./scratchpad.ts";
import type { PeerChannel } from "./specialist-agents.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CoordinatorConfig {
  dagConfig: DAGExecutionConfig;
  overallPrompt: string;
  isBurmese: boolean;
  supabase: SupabaseClient;
  swarmId: string;
  userId: string;
  sessionId: string;
  peerChannel: PeerChannel;
  callAI: (system: string, user: string, temp: number, maxTokens: number) => Promise<string>;
  // Tool execution phase — returns tool data string to inject into specialist context
  toolExecuteFn?: (step: DAGStep) => Promise<string>;
  onStepUpdate: (step: DAGStep) => Promise<void>;
  onLayerComplete?: (layerIdx: number, totalLayers: number) => Promise<void>;
  workerTimeoutMs?: number;  // default 50_000
  maxDelegatedSteps?: number; // max dynamically added steps, default 3
}

export interface CoordinatorResult {
  completed: Map<string, DAGStep>;
  successCount: number;
  totalCount: number;
  delegatedStepCount: number;
  workerNotifications: WorkerNotification[];
  coordinatorDecisions: CoordinatorDecision[];
}

// ═══ Main Coordinator Loop ═══
export async function runCoordinatorLoop(
  steps: DAGStep[],
  config: CoordinatorConfig,
): Promise<CoordinatorResult> {
  const registry = new WorkerRegistry();
  const notificationQueue = new NotificationQueue();
  const allNotifications: WorkerNotification[] = [];
  const allDecisions: CoordinatorDecision[] = [];
  let delegatedStepCount = 0;
  const maxDelegated = config.maxDelegatedSteps ?? 3;
  const workerTimeout = config.workerTimeoutMs ?? 50_000;

  // Register workers for each step
  for (const step of steps) {
    registry.register(`worker_${step.id}`, step.agent_role as any || 'general');
  }

  console.log(`[Coordinator] Initialized with ${steps.length} steps, ${registry.getAll().length} workers`);

  // ═══ Wrap executeFn with Worker Protocol ═══
  const coordinatorExecuteFn = async (step: DAGStep, depContext: string): Promise<{ result: string } | { error: string }> => {
    const workerId = `worker_${step.id}`;
    registry.assign(workerId, config.swarmId, step.id);
    registry.updateState(workerId, 'running');

    const workerCtx = createWorkerContext(
      workerId, step, config.overallPrompt,
      config.isBurmese, steps.length,
      notificationQueue, config.peerChannel,
    );

    // Execute tool phase (Phase 1) if toolExecuteFn provided
    const toolData = config.toolExecuteFn ? await config.toolExecuteFn(step) : '';

    const completedSteps = steps
      .filter(s => s.status === 'done' && s.result)
      .map(s => ({ title: s.title, agent_role: s.agent_role, result: s.result }));

    const workerResult = await executeWorker(
      workerCtx, step, depContext, toolData,
      completedSteps, config.callAI,
    );

    // Process worker notifications
    const notifications = notificationQueue.consume();
    allNotifications.push(...notifications);

    // Persist critical findings to scratchpad
    for (const n of notifications) {
      if (n.type === 'TASK_COMPLETED' && n.payload.result) {
        writeScratchpadTyped(config.supabase, config.swarmId, workerCtx.role, step.id, n.payload.result, 'finding',
          n.payload.confidence && n.payload.confidence > 0.8 ? 'critical' : 'normal',
          { confidence: n.payload.confidence, workerId },
        ).catch(() => {});
      }
    }

    // Handle delegation requests
    for (const n of notifications) {
      if (n.type === 'DELEGATION_REQUEST' && n.payload.delegationTask && delegatedStepCount < maxDelegated) {
        const dt = n.payload.delegationTask;
        const decision: CoordinatorDecision = {
          action: 'spawn_worker',
          task: {
            title: dt.title,
            description: dt.description,
            role: dt.suggestedRole,
            tool: dt.tool,
            dependsOn: [step.id],
          },
        };
        allDecisions.push(decision);
        delegatedStepCount++;
        console.log(`[Coordinator] Worker ${workerId} requested delegation: "${dt.title}" → ${dt.suggestedRole}`);
      }
    }

    // Update registry state
    if (workerResult.error) {
      registry.updateState(workerId, 'failed');
      return { error: workerResult.error };
    }

    registry.updateState(workerId, 'completed', 100);
    return { result: workerResult.result! };
  };

  // ═══ Enhanced Replan — triggers on BOTH errors AND delegation requests ═══
  const coordinatorReplanFn = async (
    completedSteps: Map<string, DAGStep>,
    remainingStepIds: string[],
  ): Promise<DAGStep[] | null> => {
    // Check for delegation-spawned tasks
    const pendingDelegations = allDecisions.filter(d => d.action === 'spawn_worker');
    const hasErrors = [...completedSteps.values()].some(s => s.status === 'error');

    if (pendingDelegations.length === 0 && !hasErrors) return null;

    const newSteps: DAGStep[] = [];

    // Convert delegation decisions to DAG steps
    for (const decision of pendingDelegations) {
      if (decision.action !== 'spawn_worker') continue;
      const { task } = decision;
      const stepId = `delegated_${Date.now()}_${newSteps.length}`;
      const newStep: DAGStep = {
        id: stepId,
        step_index: completedSteps.size + newSteps.length,
        title: task.title,
        description: task.description,
        tool: task.tool,
        agent_role: task.role,
        depends_on: task.dependsOn || [],
        status: 'pending',
        retries: 0,
        metadata: { delegated: true, requestedBy: 'worker' },
      };
      newSteps.push(newStep);
      registry.register(`worker_${stepId}`, task.role);
      console.log(`[Coordinator:Replan] Injecting delegated step: ${stepId} — "${task.title}"`);
    }

    // Clear processed delegation decisions
    const remaining = allDecisions.filter(d => d.action !== 'spawn_worker');
    allDecisions.length = 0;
    allDecisions.push(...remaining);

    // If errors exist but no delegations, attempt LLM-based replan
    if (newSteps.length === 0 && hasErrors) {
      try {
        const completedSummary = [...completedSteps.values()]
          .map(s => `- ${s.title}: ${s.status}${s.error ? ` (error: ${s.error})` : ''}`)
          .join('\n');

        const replanPrompt = `Based on completed steps with failures, suggest revised steps.
COMPLETED: ${completedSummary}
REMAINING: ${remainingStepIds.join(', ')}
Return JSON array of revised steps.`;

        const response = await config.callAI(
          'You are a task coordinator. Output ONLY valid JSON array of steps.',
          replanPrompt, 0.3, 1024,
        );

        const parsed = JSON.parse(response.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        return parsed.map((s: any, idx: number) => ({
          id: s.id || `replan_${idx}`,
          step_index: completedSteps.size + idx,
          title: s.title || `Revised Step ${idx + 1}`,
          description: s.description || '',
          tool: s.tool,
          agent_role: s.agent_role || 'general',
          depends_on: Array.isArray(s.depends_on) ? s.depends_on : [],
          status: 'pending' as const,
          retries: 0,
          metadata: { replanned: true },
        }));
      } catch (e: any) {
        console.warn(`[Coordinator:Replan] LLM replan failed:`, e.message);
        return null;
      }
    }

    return newSteps.length > 0 ? newSteps : null;
  };

  // ═══ Monitor callback — check for stuck workers after each layer ═══
  const onLayerCompleteWithMonitor = async (layerIdx: number, totalLayers: number): Promise<void> => {
    // Check stuck workers
    const stuck = registry.getStuckWorkers(workerTimeout);
    for (const w of stuck) {
      console.warn(`[Coordinator:Monitor] Worker ${w.id} stuck (last activity: ${w.lastNotificationAt})`);
      const decision: CoordinatorDecision = { action: 'terminate', workerId: w.id, reason: 'Timeout exceeded' };
      allDecisions.push(decision);
      registry.updateState(w.id, 'failed');
    }

    // Log layer summary
    const completed = registry.getByState('completed').length;
    const failed = registry.getByState('failed').length;
    const active = registry.getByState('running').length + registry.getByState('assigned').length;
    console.log(`[Coordinator:Monitor] Layer ${layerIdx + 1}/${totalLayers} — completed: ${completed}, failed: ${failed}, active: ${active}`);

    if (config.onLayerComplete) {
      await config.onLayerComplete(layerIdx, totalLayers);
    }
  };

  // ═══ Execute DAG with Coordinator wrapping ═══
  const dagResult = await executeDAG(
    steps,
    config.dagConfig,
    coordinatorExecuteFn,
    config.onStepUpdate,
    onLayerCompleteWithMonitor,
    coordinatorReplanFn,
  );

  // Final coordinator summary
  const workerSummary = registry.getAll().map(w => `${w.id}[${w.role}]: ${w.state}`).join(', ');
  console.log(`[Coordinator] ✅ Complete — ${dagResult.successCount}/${dagResult.totalCount} steps, ${delegatedStepCount} delegated | Workers: ${workerSummary}`);

  return {
    completed: dagResult.completed,
    successCount: dagResult.successCount,
    totalCount: dagResult.totalCount,
    delegatedStepCount,
    workerNotifications: allNotifications,
    coordinatorDecisions: allDecisions,
  };
}
