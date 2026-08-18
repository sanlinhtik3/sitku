import { describe, expect, it, vi } from "vitest";
import type { AgentTask, TaskRepository } from "@/repositories/contracts";
import { EvOperatorAgent } from "@/features/ev-voice/operator";

class MemoryTasks implements TaskRepository {
  records: AgentTask[] = [];

  async listTasks() {
    return this.records.map((task) => structuredClone(task));
  }

  async upsertTask(input: Partial<AgentTask> & { title: string }) {
    const now = new Date().toISOString();
    const existing = this.records.find((task) => task.id === input.id);
    const task: AgentTask = {
      id: input.id || `task-${this.records.length + 1}`,
      title: input.title,
      status: input.status || existing?.status || "pending",
      schedule: input.schedule ?? existing?.schedule,
      metadata: input.metadata ?? existing?.metadata,
      createdAt: input.createdAt || existing?.createdAt || now,
      updatedAt: now,
    };
    this.records = [task, ...this.records.filter((item) => item.id !== task.id)];
    return structuredClone(task);
  }

  async deleteTask(id: string) {
    this.records = this.records.filter((task) => task.id !== id);
  }
}

describe("E.V Operator agent", () => {
  it("returns a running receipt without waiting for the model", async () => {
    const tasks = new MemoryTasks();
    let resolveModel!: (value: { text: string; provider: string }) => void;
    const model = vi.fn(() => new Promise<{ text: string; provider: string }>((resolve) => { resolveModel = resolve; }));
    const operator = new EvOperatorAgent({ tasks, model, createId: () => "background-job" });

    const started = await operator.start({ request: "deep review", idempotencyKey: "background-key" });
    expect(started).toEqual(expect.objectContaining({ id: "background-job", status: "running" }));
    expect(model).toHaveBeenCalledOnce();

    resolveModel({ text: "done", provider: "test" });
    await vi.waitFor(async () => expect(await operator.get("background-job")).toEqual(expect.objectContaining({ status: "completed", result: "done" })));
  });

  it("journals a real model result and deduplicates the same voice turn", async () => {
    const tasks = new MemoryTasks();
    const model = vi.fn(async () => ({
      text: "အကြောင်းရင်းနှစ်ခု တွေ့ပါတယ်။",
      provider: "Gemini Operator",
      model: "gemini-2.5-flash",
      evidence: [{ type: "runtime" as const, label: "Operator model", detail: "gemini-2.5-flash" }],
    }));
    const operator = new EvOperatorAgent({ tasks, model, createId: () => "ev-operator-1" });

    const first = await operator.run({ request: "ဒီ architecture ကို review လုပ်ပါ", idempotencyKey: "turn-1:delegate", turnId: "turn-1" });
    const duplicate = await operator.run({ request: "ဒီ architecture ကို review လုပ်ပါ", idempotencyKey: "turn-1:delegate", turnId: "turn-1" });

    expect(first).toEqual(expect.objectContaining({ id: "ev-operator-1", status: "completed", provider: "Gemini Operator" }));
    expect(duplicate.id).toBe(first.id);
    expect(model).toHaveBeenCalledTimes(1);
    expect(tasks.records[0]).toEqual(expect.objectContaining({ status: "completed", metadata: expect.objectContaining({ kind: "ev_operator_job" }) }));
  });

  it("marks an abandoned running job as interrupted after restart", async () => {
    const tasks = new MemoryTasks();
    await tasks.upsertTask({
      id: "old-job",
      title: "E.V Operator · old request",
      status: "running",
      metadata: {
        kind: "ev_operator_job",
        operator: {
          id: "old-job", request: "old request", status: "running", idempotencyKey: "old-key",
          evidence: [], createdAt: "2026-08-08T00:00:00.000Z", updatedAt: "2026-08-08T00:00:01.000Z",
        },
      },
    });
    const operator = new EvOperatorAgent({
      tasks,
      model: vi.fn(async () => ({ text: "new result", provider: "test" })),
      createId: () => "new-job",
    });

    await operator.run({ request: "new request", idempotencyKey: "new-key" });
    const recovered = await operator.get("old-job");
    expect(recovered).toEqual(expect.objectContaining({
      status: "failed",
      error: expect.objectContaining({ code: "OPERATOR_INTERRUPTED_RESTART", retryable: true }),
    }));
  });

  it("aborts the active model turn and persists cancellation", async () => {
    const tasks = new MemoryTasks();
    const model = vi.fn(({ signal }: { signal: AbortSignal }) => new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const operator = new EvOperatorAgent({ tasks, model, createId: () => "cancel-job" });

    const running = operator.run({ request: "long analysis", idempotencyKey: "cancel-key" });
    await vi.waitFor(() => expect(tasks.records[0]?.status).toBe("running"));
    await operator.cancel("cancel-job");
    const finished = await running;

    expect(finished).toEqual(expect.objectContaining({ status: "cancelled", error: expect.objectContaining({ code: "OPERATOR_CANCELLED" }) }));
    expect((await operator.get("cancel-job"))?.status).toBe("cancelled");
  });

  it("stores structured provider failures without claiming success", async () => {
    const tasks = new MemoryTasks();
    const operator = new EvOperatorAgent({
      tasks,
      model: vi.fn(async () => { throw new Error("gemini 429: quota exhausted"); }),
      createId: () => "failed-job",
    });

    const job = await operator.run({ request: "analyze", idempotencyKey: "failed-key" });
    expect(job).toEqual(expect.objectContaining({
      status: "failed",
      error: expect.objectContaining({ code: "OPERATOR_FAILED", message: expect.stringContaining("429") }),
    }));
    expect(job.result).toBeUndefined();
  });

  it("does not let an abort-ignoring late result overwrite cancellation", async () => {
    const tasks = new MemoryTasks();
    let resolveModel!: (value: { text: string; provider: string }) => void;
    const operator = new EvOperatorAgent({
      tasks,
      model: vi.fn(() => new Promise<{ text: string; provider: string }>((resolve) => { resolveModel = resolve; })),
      createId: () => "late-result-job",
    });

    const running = operator.run({ request: "long analysis", idempotencyKey: "late-key" });
    await vi.waitFor(() => expect(tasks.records[0]?.status).toBe("running"));
    await operator.cancel("late-result-job");
    resolveModel({ text: "late success", provider: "test" });

    expect(await running).toEqual(expect.objectContaining({ status: "cancelled" }));
    expect(await operator.get("late-result-job")).toEqual(expect.objectContaining({ status: "cancelled", result: undefined }));
  });
});
