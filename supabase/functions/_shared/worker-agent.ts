// ═══ Worker Agent — Isolated Execution Unit with Notification Protocol ═══
// Each worker has its own identity, context, and bidirectional communication with Coordinator.

import type { AgentRole, SpecialistConfig } from "./specialist-agents.ts";
import { routeToSpecialist, buildSpecialistPromptWithPeers, buildSpecialistMemoryContext, getPendingPeerQueries, extractPeerQueries, postPeerQuery } from "./specialist-agents.ts";
import type { PeerChannel } from "./specialist-agents.ts";
import type { DAGStep } from "./dag-executor.ts";
import { NotificationQueue, createNotification, type WorkerNotification } from "./coordinator-protocol.ts";

export interface WorkerContext {
  workerId: string;
  role: AgentRole;
  specialist: SpecialistConfig;
  taskId: string;
  overallPrompt: string;
  isBurmese: boolean;
  totalSteps: number;
  notificationQueue: NotificationQueue;
  peerChannel: PeerChannel;
}

export interface WorkerExecutionResult {
  result?: string;
  error?: string;
  confidence: number;
  peerQueriesEmitted: number;
}

// ═══ Create isolated worker context ═══
export function createWorkerContext(
  workerId: string,
  step: DAGStep,
  overallPrompt: string,
  isBurmese: boolean,
  totalSteps: number,
  notificationQueue: NotificationQueue,
  peerChannel: PeerChannel,
): WorkerContext {
  const specialist = routeToSpecialist(step.tool, step.agent_role);
  return {
    workerId,
    role: specialist.role,
    specialist,
    taskId: step.id,
    overallPrompt,
    isBurmese,
    totalSteps,
    notificationQueue,
    peerChannel,
  };
}

// ═══ Worker Notification Emitters ═══
function emitNotification(ctx: WorkerContext, type: WorkerNotification['type'], payload: WorkerNotification['payload'] = {}): void {
  ctx.notificationQueue.push(createNotification(type, ctx.workerId, ctx.taskId, payload));
}

export function workerStarted(ctx: WorkerContext): void {
  emitNotification(ctx, 'TASK_STARTED');
}

export function workerProgress(ctx: WorkerContext, progress: number, findings?: string): void {
  emitNotification(ctx, 'PROGRESS', { progress, findings });
}

export function workerCompleted(ctx: WorkerContext, result: string, confidence: number): void {
  emitNotification(ctx, 'TASK_COMPLETED', { result, confidence });
}

export function workerFailed(ctx: WorkerContext, error: string): void {
  emitNotification(ctx, 'TASK_FAILED', { error });
}

export function workerNeedInput(ctx: WorkerContext, question: string): void {
  emitNotification(ctx, 'NEED_INPUT', { question });
}

export function workerRequestDelegation(ctx: WorkerContext, title: string, description: string, suggestedRole: AgentRole, tool?: string): void {
  emitNotification(ctx, 'DELEGATION_REQUEST', {
    delegationTask: { title, description, suggestedRole, tool },
  });
}

// ═══ Execute Worker — wraps specialist logic with notification protocol ═══
export async function executeWorker(
  ctx: WorkerContext,
  step: DAGStep,
  depContext: string,
  toolData: string,
  completedSteps: Array<{ title: string; agent_role: string; result?: string }>,
  callAI: (system: string, user: string, temp: number, maxTokens: number) => Promise<string>,
): Promise<WorkerExecutionResult> {
  // Phase 1: Notify start
  workerStarted(ctx);

  try {
    // Phase 2: Build context with peer awareness
    const memoryContext = buildSpecialistMemoryContext(completedSteps, step.title);
    const peerQueries = getPendingPeerQueries(ctx.peerChannel, ctx.specialist.role);

    // Phase 3: Report progress — context built
    workerProgress(ctx, 30, `Context assembled: ${completedSteps.length} prior steps, ${peerQueries.length} peer queries`);

    const { system, user } = buildSpecialistPromptWithPeers(
      ctx.specialist,
      ctx.overallPrompt,
      step.title,
      step.description,
      step.step_index + 1,
      ctx.totalSteps,
      depContext + toolData,
      ctx.isBurmese,
      peerQueries,
      memoryContext,
    );

    // Phase 4: Execute LLM call
    workerProgress(ctx, 50, 'LLM synthesis in progress...');
    const result = await callAI(system, user, ctx.specialist.temperature, ctx.specialist.maxOutputTokens);

    // Phase 5: Extract peer queries from output
    const outgoingQueries = extractPeerQueries(result, ctx.specialist.role, step.id);
    for (const q of outgoingQueries) {
      postPeerQuery(ctx.peerChannel, ctx.specialist.role, step.id, q.toRole, q.query);
    }

    // Phase 6: Assess confidence based on result quality
    const confidence = assessConfidence(result, toolData, completedSteps.length);

    // Phase 7: Check if worker wants to delegate sub-tasks
    const delegationRequests = extractDelegationRequests(result);
    for (const dr of delegationRequests) {
      workerRequestDelegation(ctx, dr.title, dr.description, dr.suggestedRole, dr.tool);
    }

    // Phase 8: Report completion
    workerProgress(ctx, 90, `Synthesis complete: ${result.length} chars`);
    workerCompleted(ctx, result, confidence);

    return { result, confidence, peerQueriesEmitted: outgoingQueries.length };
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    workerFailed(ctx, errorMsg);
    return { error: errorMsg, confidence: 0, peerQueriesEmitted: 0 };
  }
}

// ═══ Confidence Assessment ═══
function assessConfidence(result: string, toolData: string, priorStepCount: number): number {
  let score = 0.5; // baseline

  // Has real tool data → higher confidence
  if (toolData.includes('REAL TOOL DATA')) score += 0.2;

  // Result has citations/sources
  if (/(?:source|according to|data from|\[🟢)/i.test(result)) score += 0.1;

  // Result is substantial
  if (result.length > 1000) score += 0.1;

  // Has prior context
  if (priorStepCount > 0) score += 0.05;

  // Has uncertainty markers → lower confidence
  if (/(?:uncertain|no data found|training knowledge only|⚠️|🔴 Low)/i.test(result)) score -= 0.15;

  return Math.max(0.1, Math.min(1.0, score));
}

// ═══ Delegation Request Extraction ═══
// Workers can request sub-tasks via: @delegate(role): "task description"
function extractDelegationRequests(output: string): Array<{ title: string; description: string; suggestedRole: AgentRole; tool?: string }> {
  const requests: Array<{ title: string; description: string; suggestedRole: AgentRole; tool?: string }> = [];
  const pattern = /@delegate\((\w+)\):\s*"([^"]+)"/gi;
  let match;
  while ((match = pattern.exec(output)) !== null) {
    const role = match[1].toLowerCase() as AgentRole;
    if (['researcher', 'analyst', 'writer', 'coder', 'general'].includes(role)) {
      requests.push({
        title: match[2].slice(0, 80),
        description: match[2],
        suggestedRole: role,
      });
    }
  }
  return requests;
}
