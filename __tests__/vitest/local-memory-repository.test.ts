import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalRuntime } from "../../electron/local-runtime.mjs";

const call = (runtime: ReturnType<typeof createLocalRuntime>, method: string, ...args: unknown[]) =>
  runtime.invoke({ domain: "memories", method, args });

describe("Electron local memory repository", () => {
  it("persists, filters, updates access metadata, and deletes memories", async () => {
    const root = mkdtempSync(join(tmpdir(), "sitku-memories-"));
    const dbPath = join(root, "runtime.sqlite");
    const settingsPath = join(root, "settings.json");
    let runtime = createLocalRuntime({ dbPath, settingsPath });

    const saved = await call(runtime, "upsertMemory", {
      content: "Zoe prefers local-first workflows.",
      category: "preference",
      confidence: 0.9,
      importance: 0.7,
      tags: ["workflow", "local", "workflow"],
      pinned: true,
    }) as { id: string; tags: string[]; lastAccessedAt: string | null };
    expect(saved.tags).toEqual(["workflow", "local"]);
    expect(saved.lastAccessedAt).toBeNull();
    runtime.close();

    runtime = createLocalRuntime({ dbPath, settingsPath });
    expect(await call(runtime, "listMemories", { query: "local", tags: ["workflow"] })).toEqual([
      expect.objectContaining({ id: saved.id, category: "preference", pinned: true }),
    ]);

    await call(runtime, "recordMemoryAccess", saved.id);
    expect(await call(runtime, "listMemories")).toEqual([
      expect.objectContaining({ id: saved.id, lastAccessedAt: expect.any(String) }),
    ]);

    await call(runtime, "deleteMemory", saved.id);
    expect(await call(runtime, "listMemories")).toEqual([]);
    runtime.close();
  });
});
