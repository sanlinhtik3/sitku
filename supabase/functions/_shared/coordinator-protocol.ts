// ═══ Coordinator Mode Protocol — Claude Code-Inspired Multi-Agent Orchestration ═══
// Typed message schema for Coordinator ↔ Worker bidirectional communication.

import type { AgentRole } from "./specialist-agents.ts";

// ═══ Worker State Machine ═══
export type WorkerState = 'idle' | 'assigned' | 'running' | 'completed' | 'failed';

// ═══ Coordinator → Worker Messages ═══
export interface CoordinatorMessage {
  type: 'ASSIGN_TASK' | 'CANCEL_TASK' | 'REQUEST_STATUS' | 'PROVIDE_INPUT';
  taskId: string;
  workerId: string;
  payload: {
    task?: { stepId: string; title: string; description: string; tool?: string; depContext?: string };
    input?: string;
    reason?: string;
  };
  timestamp: string;
}

// ═══ Worker → Coordinator Notifications ═══
export interface WorkerNotification {
  type: 'TASK_STARTED' | 'PROGRESS' | 'TASK_COMPLETED' | 'TASK_FAILED' | 'NEED_INPUT' | 'DELEGATION_REQUEST';
  workerId: string;
  taskId: string;
  payload: {
    result?: string;
    error?: string;
    progress?: number;       // 0-100
    confidence?: number;     // 0-1
    question?: string;       // NEED_INPUT
    delegationTask?: {       // DELEGATION_REQUEST
      title: string;
      description: string;
      suggestedRole: AgentRole;
      tool?: string;
    };
    findings?: string;       // intermediate findings for scratchpad
  };
  timestamp: string;
}

// ═══ Worker Registration ═══
export interface WorkerInfo {
  id: string;
  role: AgentRole;
  state: WorkerState;
  assignedTaskId: string | null;
  assignedStepId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  progressPct: number;
  lastNotificationAt: string | null;
}

// ═══ Worker Registry — tracks all active workers ═══
export class WorkerRegistry {
  private workers = new Map<string, WorkerInfo>();

  register(id: string, role: AgentRole): WorkerInfo {
    const worker: WorkerInfo = {
      id, role, state: 'idle',
      assignedTaskId: null, assignedStepId: null,
      startedAt: null, completedAt: null,
      progressPct: 0, lastNotificationAt: null,
    };
    this.workers.set(id, worker);
    return worker;
  }

  get(id: string): WorkerInfo | undefined { return this.workers.get(id); }
  getAll(): WorkerInfo[] { return [...this.workers.values()]; }
  getByState(state: WorkerState): WorkerInfo[] { return this.getAll().filter(w => w.state === state); }
  getByRole(role: AgentRole): WorkerInfo[] { return this.getAll().filter(w => w.role === role); }

  assign(workerId: string, taskId: string, stepId: string): void {
    const w = this.workers.get(workerId);
    if (w) {
      w.state = 'assigned';
      w.assignedTaskId = taskId;
      w.assignedStepId = stepId;
      w.startedAt = new Date().toISOString();
      w.progressPct = 0;
    }
  }

  updateState(workerId: string, state: WorkerState, progressPct?: number): void {
    const w = this.workers.get(workerId);
    if (w) {
      w.state = state;
      w.lastNotificationAt = new Date().toISOString();
      if (progressPct !== undefined) w.progressPct = progressPct;
      if (state === 'completed' || state === 'failed') w.completedAt = new Date().toISOString();
    }
  }

  hasActiveWorkers(): boolean {
    return this.getAll().some(w => w.state === 'assigned' || w.state === 'running');
  }

  getStuckWorkers(timeoutMs: number): WorkerInfo[] {
    const now = Date.now();
    return this.getAll().filter(w => {
      if (w.state !== 'running' && w.state !== 'assigned') return false;
      const ref = w.lastNotificationAt || w.startedAt;
      if (!ref) return false;
      return (now - new Date(ref).getTime()) > timeoutMs;
    });
  }
}

// ═══ Notification Queue — in-memory FIFO ═══
export class NotificationQueue {
  private queue: WorkerNotification[] = [];

  push(notification: WorkerNotification): void {
    this.queue.push(notification);
  }

  consume(): WorkerNotification[] {
    const batch = [...this.queue];
    this.queue = [];
    return batch;
  }

  peek(): WorkerNotification[] { return [...this.queue]; }
  get length(): number { return this.queue.length; }
  hasType(type: WorkerNotification['type']): boolean { return this.queue.some(n => n.type === type); }
}

// ═══ Factory Helpers ═══
export function createNotification(
  type: WorkerNotification['type'],
  workerId: string,
  taskId: string,
  payload: WorkerNotification['payload'] = {},
): WorkerNotification {
  return { type, workerId, taskId, payload, timestamp: new Date().toISOString() };
}

export function createCoordinatorMessage(
  type: CoordinatorMessage['type'],
  workerId: string,
  taskId: string,
  payload: CoordinatorMessage['payload'] = {},
): CoordinatorMessage {
  return { type, workerId, taskId, payload, timestamp: new Date().toISOString() };
}

// ═══ Coordinator Decision Types ═══
export type CoordinatorDecision =
  | { action: 'wait' }
  | { action: 'synthesize'; reason: string }
  | { action: 'reassign'; workerId: string; reason: string }
  | { action: 'spawn_worker'; task: { title: string; description: string; role: AgentRole; tool?: string; dependsOn?: string[] } }
  | { action: 'terminate'; workerId: string; reason: string }
  | { action: 'provide_input'; workerId: string; input: string };
