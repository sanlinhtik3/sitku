import type { AgentTask, TaskRepository } from "@/repositories/contracts";

const OPERATOR_KIND = "ev_operator_job";
const SCHEMA_VERSION = 1;

export type OperatorJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface OperatorEvidence {
  type: "runtime" | "warning";
  label: string;
  detail: string;
}

export interface OperatorJob {
  id: string;
  request: string;
  status: OperatorJobStatus;
  idempotencyKey: string;
  turnId?: string;
  result?: string;
  error?: { code: string; message: string; retryable: boolean };
  evidence: OperatorEvidence[];
  provider?: string;
  model?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorRunInput {
  request: string;
  /** Safe journal label when request contains permissioned private evidence. */
  persistedRequest?: string;
  idempotencyKey: string;
  turnId?: string;
}

export interface OperatorModelInput {
  request: string;
  signal: AbortSignal;
}

export interface OperatorModelResult {
  text: string;
  provider: string;
  model?: string | null;
  evidence?: OperatorEvidence[];
}

export type OperatorModel = (input: OperatorModelInput) => Promise<OperatorModelResult>;

export interface OperatorAgentDependencies {
  tasks: TaskRepository;
  model: OperatorModel;
  now?: () => string;
  createId?: () => string;
}

export class OperatorAgentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "OperatorAgentError";
  }
}

/**
 * A single-user, local-journaled Operator runner for complex E.V requests.
 * It receives the user's request plus only the bounded evidence that a permissioned
 * tool explicitly supplies. Private evidence can use persistedRequest so raw note
 * content never lands in the Operator task journal.
 */
export class EvOperatorAgent {
  private readonly active = new Map<string, { controller: AbortController; promise: Promise<OperatorJob> }>();
  private readonly starting = new Map<string, Promise<OperatorJob>>();
  private readonly settledListeners = new Set<(job: OperatorJob) => void>();
  private readonly settledNotified = new Set<string>();
  private recovery: Promise<void> | null = null;

  constructor(private readonly deps: OperatorAgentDependencies) {}

  async run(input: OperatorRunInput): Promise<OperatorJob> {
    const started = await this.start(input);
    const inFlight = this.active.get(started.id);
    if (inFlight) return inFlight.promise;
    return await this.get(started.id) || started;
  }

  async start(input: OperatorRunInput): Promise<OperatorJob> {
    const request = input.request.trim();
    if (!request) throw new OperatorAgentError("OPERATOR_REQUEST_REQUIRED", "Operator request is required.");
    if (!input.idempotencyKey.trim()) throw new OperatorAgentError("IDEMPOTENCY_KEY_REQUIRED", "Operator idempotency key is required.");

    const pendingStart = this.starting.get(input.idempotencyKey);
    if (pendingStart) return pendingStart;
    const starting = this.startInternal({ ...input, request }).finally(() => this.starting.delete(input.idempotencyKey));
    this.starting.set(input.idempotencyKey, starting);
    return starting;
  }

  subscribeSettled(listener: (job: OperatorJob) => void): () => void {
    this.settledListeners.add(listener);
    return () => this.settledListeners.delete(listener);
  }

  private async startInternal(input: OperatorRunInput): Promise<OperatorJob> {
    const request = input.request;

    await this.recoverInterruptedJobs();
    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;

    const id = this.deps.createId?.() || makeId();
    const createdAt = this.now();
    const job: OperatorJob = {
      id,
      request: input.persistedRequest?.trim() || request,
      status: "pending",
      idempotencyKey: input.idempotencyKey,
      turnId: input.turnId,
      evidence: [],
      createdAt,
      updatedAt: createdAt,
    };
    await this.persist(job);

    const controller = new AbortController();
    const running = this.update(job, { status: "running" });
    await this.persist(running);
    const promise = this.execute(running, request, controller.signal)
      .then((settled) => {
        this.notifySettled(settled);
        return settled;
      })
      .finally(() => this.active.delete(id));
    this.active.set(id, { controller, promise });
    return running;
  }

  async cancel(jobId?: string): Promise<OperatorJob> {
    await this.recoverInterruptedJobs();
    const target = jobId ? await this.get(jobId) : await this.latestActive();
    if (!target) throw new OperatorAgentError("OPERATOR_JOB_NOT_FOUND", "No active Operator job was found.");
    if (["completed", "failed", "cancelled"].includes(target.status)) return target;
    this.active.get(target.id)?.controller.abort(new DOMException("Operator job cancelled", "AbortError"));
    const cancelled = this.update(target, {
      status: "cancelled",
      error: { code: "OPERATOR_CANCELLED", message: "Operator job was cancelled by the user.", retryable: true },
    });
    await this.persist(cancelled);
    this.notifySettled(cancelled);
    return cancelled;
  }

  async get(jobId: string): Promise<OperatorJob | null> {
    const task = (await this.deps.tasks.listTasks()).find((item) => item.id === jobId && isOperatorTask(item));
    return task ? taskToJob(task) : null;
  }

  async latest(): Promise<OperatorJob | null> {
    const jobs = (await this.deps.tasks.listTasks()).filter(isOperatorTask).map(taskToJob);
    return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
  }

  async cancelAll(): Promise<void> {
    const active = [...this.active.values()];
    active.forEach(({ controller }) => controller.abort(new DOMException("Operator interrupted", "AbortError")));
    await Promise.allSettled(active.map(({ promise }) => promise));
  }

  private async execute(seed: OperatorJob, modelRequest: string, signal: AbortSignal): Promise<OperatorJob> {
    let job = seed;
    try {
      const output = await this.deps.model({ request: modelRequest, signal });
      if (signal.aborted) return await this.currentCancelled(job);
      if (!output.text.trim()) throw new OperatorAgentError("OPERATOR_EMPTY_RESULT", "Operator returned an empty result.", true);
      job = this.update(job, {
        status: "completed",
        result: output.text.trim(),
        provider: output.provider,
        model: output.model,
        evidence: [...job.evidence, ...(output.evidence || [])],
        error: undefined,
      });
    } catch (error) {
      const cancelled = isAbort(error) || signal.aborted;
      const normalized = cancelled
        ? { code: "OPERATOR_CANCELLED", message: "Operator job was interrupted.", retryable: true }
        : normalizeError(error, "OPERATOR_FAILED", true);
      job = this.update(job, { status: cancelled ? "cancelled" : "failed", error: normalized });
    }
    if (signal.aborted) return await this.currentCancelled(job);
    await this.persist(job);
    return job;
  }

  private async currentCancelled(job: OperatorJob): Promise<OperatorJob> {
    const current = await this.get(job.id);
    if (current?.status === "cancelled") return current;
    const cancelled = this.update(job, {
      status: "cancelled",
      error: { code: "OPERATOR_CANCELLED", message: "Operator job was interrupted.", retryable: true },
    });
    await this.persist(cancelled);
    return cancelled;
  }

  private notifySettled(job: OperatorJob) {
    if (!['completed', 'failed', 'cancelled'].includes(job.status) || this.settledNotified.has(job.id)) return;
    this.settledNotified.add(job.id);
    for (const listener of this.settledListeners) listener(job);
  }

  private async recoverInterruptedJobs(): Promise<void> {
    if (this.recovery) return this.recovery;
    this.recovery = (async () => {
      const tasks = await this.deps.tasks.listTasks();
      const interrupted = tasks.filter((task) => isOperatorTask(task) && ["pending", "running", "paused"].includes(task.status));
      await Promise.all(interrupted.map((task) => {
        const job = taskToJob(task);
        return this.persist(this.update(job, {
          status: "failed",
          error: {
            code: "OPERATOR_INTERRUPTED_RESTART",
            message: "The previous Operator run was interrupted when the app stopped. Start it again to retry safely.",
            retryable: true,
          },
        }));
      }));
    })();
    return this.recovery;
  }

  private async findByIdempotencyKey(key: string): Promise<OperatorJob | null> {
    const task = (await this.deps.tasks.listTasks()).find((item) => isOperatorTask(item) && operatorMetadata(item).idempotencyKey === key);
    return task ? taskToJob(task) : null;
  }

  private async latestActive(): Promise<OperatorJob | null> {
    const jobs = (await this.deps.tasks.listTasks())
      .filter((task) => isOperatorTask(task) && ["pending", "running", "paused"].includes(task.status))
      .map(taskToJob)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return jobs[0] || null;
  }

  private async persist(job: OperatorJob): Promise<void> {
    await this.deps.tasks.upsertTask({
      id: job.id,
      title: `E.V Operator · ${job.request.slice(0, 72)}`,
      status: job.status,
      createdAt: job.createdAt,
      metadata: {
        kind: OPERATOR_KIND,
        source: "ev-voice",
        schemaVersion: SCHEMA_VERSION,
        operator: job,
      },
    });
  }

  private update(job: OperatorJob, patch: Partial<OperatorJob>): OperatorJob {
    return { ...job, ...patch, updatedAt: this.now() };
  }

  private now(): string {
    return this.deps.now?.() || new Date().toISOString();
  }
}

export function isOperatorTask(task: AgentTask): boolean {
  return task.metadata?.kind === OPERATOR_KIND;
}

function operatorMetadata(task: AgentTask): Partial<OperatorJob> {
  const value = task.metadata?.operator;
  return value && typeof value === "object" ? value as Partial<OperatorJob> : {};
}

function taskToJob(task: AgentTask): OperatorJob {
  const metadata = operatorMetadata(task);
  return {
    id: task.id,
    request: String(metadata.request || task.title.replace(/^E\.V Operator · /, "")),
    status: task.status as OperatorJobStatus,
    idempotencyKey: String(metadata.idempotencyKey || task.id),
    turnId: metadata.turnId,
    result: metadata.result,
    error: metadata.error,
    evidence: Array.isArray(metadata.evidence) ? metadata.evidence : [],
    provider: metadata.provider,
    model: metadata.model,
    createdAt: metadata.createdAt || task.createdAt,
    updatedAt: metadata.updatedAt || task.updatedAt,
  };
}

function normalizeError(error: unknown, fallbackCode: string, retryable: boolean) {
  if (error instanceof OperatorAgentError) return { code: error.code, message: error.message, retryable: error.retryable };
  return { code: fallbackCode, message: error instanceof Error ? error.message : String(error), retryable };
}

function isAbort(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "AbortError");
}

function makeId(): string {
  const value = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `ev-operator-${value}`;
}
