import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalRuntime } from "../../electron/local-runtime.mjs";

const call = (runtime: ReturnType<typeof createLocalRuntime>, method: string, ...args: unknown[]) =>
  runtime.invoke({ domain: "jarvis", method, args });

describe("Jarvis SQLite journal", () => {
  it("deduplicates action claims and recovers unfinished turns after restart", async () => {
    const root = mkdtempSync(join(tmpdir(), "sitku-jarvis-"));
    const dbPath = join(root, "runtime.sqlite");
    const settingsPath = join(root, "settings.json");
    const runtime = createLocalRuntime({ dbPath, settingsPath });

    await call(runtime, "begin", { turnId: "jarvis-1", status: "recording", startedAt: "2026-07-16T00:00:00.000Z" });
    expect(await call(runtime, "claimAction", {
      turnId: "jarvis-1", idempotencyKey: "jarvis-1:create_note", intent: "create_note", skill: "notes_skill",
    })).toEqual({ claimed: true });
    await call(runtime, "update", { turnId: "jarvis-1", status: "completed", result: "Created note", reply: "Done" });
    expect(await call(runtime, "claimAction", {
      turnId: "jarvis-1", idempotencyKey: "jarvis-1:create_note", intent: "create_note", skill: "notes_skill",
    })).toEqual({ claimed: false, result: "Created note", reply: "Done" });

    await call(runtime, "begin", { turnId: "jarvis-2", status: "thinking", startedAt: "2026-07-16T00:01:00.000Z" });
    runtime.close();

    const reopened = createLocalRuntime({ dbPath, settingsPath });
    const turns = await call(reopened, "listRecent", 10) as Array<{ turnId: string; status: string; error?: string }>;
    expect(turns.find((turn) => turn.turnId === "jarvis-1")?.status).toBe("completed");
    expect(turns.find((turn) => turn.turnId === "jarvis-2")).toEqual(expect.objectContaining({
      status: "interrupted",
      error: "app restarted before completion",
    }));
    reopened.close();
  });
});
