import { mkdtempSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalRuntime } from "../../electron/local-runtime.mjs";
import { createEvMemorySummaryProcessor } from "@/features/ev-voice/memory/langchainMemoryProcessor";
import type { EvConversationMessage, EvMemoryBackupEnvelope } from "@/features/ev-voice/memory/contracts";

const call = (runtime: ReturnType<typeof createLocalRuntime>, method: string, ...args: unknown[]) =>
  runtime.invoke({ domain: "evMemory", method, args });

function runtimeAt(root: string) {
  return createLocalRuntime({ dbPath: join(root, "runtime.sqlite"), settingsPath: join(root, "settings.json") });
}

describe("E.V durable memory contract", () => {
  it("keeps raw messages append-only and restores a checksum-verified merge", async () => {
    const source = runtimeAt(mkdtempSync(join(tmpdir(), "sitku-ev-memory-source-")));
    await call(source, "openSession", { sessionId: "session-1", startedAt: "2026-08-09T00:00:00.000Z" });
    const user = await call(source, "appendMessage", {
      id: "turn-1:user", sessionId: "session-1", turnId: "turn-1", role: "user",
      content: "မှတ်ထား၊ local-first data မပျက်ရဘူး။", status: "final", createdAt: "2026-08-09T00:00:01.000Z",
    }) as EvConversationMessage;
    await call(source, "appendMessage", {
      id: "turn-1:assistant", sessionId: "session-1", turnId: "turn-1", role: "assistant",
      content: "မှတ်ထားပါပြီ။", status: "final", createdAt: "2026-08-09T00:00:02.000Z",
    });
    expect((await call(source, "appendMessage", {
      id: user.id, sessionId: "session-1", turnId: "turn-1", role: "user",
      content: user.content, status: "final", createdAt: "2026-08-09T00:00:03.000Z",
    }) as EvConversationMessage).id).toBe(user.id);
    await expect(Promise.resolve().then(() => call(source, "appendMessage", {
      id: user.id, sessionId: "session-1", turnId: "turn-1", role: "user",
      content: "changed content", status: "final", createdAt: "2026-08-09T00:00:04.000Z",
    }))).rejects.toThrow("append-only message conflict");

    await call(source, "saveSummary", {
      sessionId: "session-1", fromSequence: 1, toSequence: 2,
      summary: "User requires local-first data safety.", facts: ["Data must not be lost."], decisions: [], unresolved: [],
      processor: "test", processorVersion: 1,
    });
    await call(source, "upsertMemory", {
      kind: "instruction", content: "Keep data local-first.", status: "confirmed", confidence: 1, importance: 0.9,
      sourceTurnId: "turn-1", sourceMessageId: user.id,
    });
    const backup = await call(source, "exportData") as EvMemoryBackupEnvelope;
    source.close();

    const target = runtimeAt(mkdtempSync(join(tmpdir(), "sitku-ev-memory-target-")));
    expect(await call(target, "importData", backup)).toEqual({ imported: 5, skipped: 0 });
    expect(await call(target, "importData", backup)).toEqual({ imported: 0, skipped: 5 });
    expect(await call(target, "listMessages", "session-1", 10)).toHaveLength(2);
    expect(await call(target, "listLongTermMemories", { status: "confirmed" })).toEqual([
      expect.objectContaining({ content: "Keep data local-first.", sourceTurnId: "turn-1" }),
    ]);
    await expect(Promise.resolve().then(() => call(target, "importData", { ...backup, checksum: "corrupt" })))
      .rejects.toThrow("checksum mismatch");
    target.close();
  });

  it("marks an unfinished session interrupted after restart", async () => {
    const root = mkdtempSync(join(tmpdir(), "sitku-ev-memory-recovery-"));
    const first = runtimeAt(root);
    await call(first, "openSession", { sessionId: "open-session", startedAt: "2026-08-09T00:00:00.000Z" });
    first.close();
    const reopened = runtimeAt(root);
    const backup = await call(reopened, "exportData") as EvMemoryBackupEnvelope;
    expect(backup.data.sessions.find((session) => session.id === "open-session")?.status).toBe("interrupted");
    reopened.close();
  });

  it("migrates existing Jarvis turns once without deleting the legacy journal", async () => {
    const root = mkdtempSync(join(tmpdir(), "sitku-ev-memory-legacy-"));
    const dbPath = join(root, "runtime.sqlite");
    const first = runtimeAt(root);
    await first.invoke({ domain: "jarvis", method: "begin", args: [{
      turnId: "old-turn", status: "recording", startedAt: "2026-08-08T00:00:00.000Z",
    }] });
    await first.invoke({ domain: "jarvis", method: "update", args: [{
      turnId: "old-turn", status: "completed", transcript: "အဟောင်းမေးခွန်း",
      reply: "အဟောင်းအဖြေ", intent: "conversation", skill: "coach_skill",
    }] });
    first.close();

    const db = new DatabaseSync(dbPath);
    db.prepare("DELETE FROM ev_memory_migrations WHERE id = ?").run("legacy_jarvis_turns_v1");
    db.close();

    const migrated = runtimeAt(root);
    const messages = await call(migrated, "listMessages", "ev-legacy-jarvis-v1", 10) as EvConversationMessage[];
    expect(messages.map((message) => [message.role, message.content])).toEqual([
      ["user", "အဟောင်းမေးခွန်း"],
      ["assistant", "အဟောင်းအဖြေ"],
    ]);
    const legacyTurns = await migrated.invoke({ domain: "jarvis", method: "listRecent", args: [10] }) as Array<{ turnId: string }>;
    expect(legacyTurns.some((turn) => turn.turnId === "old-turn")).toBe(true);
    migrated.close();

    const reopened = runtimeAt(root);
    expect(await call(reopened, "listMessages", "ev-legacy-jarvis-v1", 10)).toHaveLength(2);
    reopened.close();
  });
});

describe("LangChain local E.V summary processor", () => {
  it("creates an extractive summary with exact facts, decisions, and unresolved questions", async () => {
    const process = createEvMemorySummaryProcessor();
    const base = { sessionId: "s", status: "final" as const, contentHash: "hash", metadata: {}, createdAt: "2026-08-09T00:00:00.000Z" };
    const messages: EvConversationMessage[] = [
      { ...base, id: "1", turnId: "t1", sequence: 1, role: "user", content: "ငါက local-first ကို ကြိုက်တယ်။ ဒီ data ကို ဘယ်လို backup လုပ်မလဲ?" },
      { ...base, id: "2", turnId: "t1", sequence: 2, role: "assistant", content: "SQLite နဲ့ versioned backup သုံးမယ်။" },
      { ...base, id: "3", turnId: "t2", sequence: 3, role: "user", content: "သဘောတူတယ်၊ ဒီအတိုင်း ဆက်လုပ်မယ်။" },
    ];
    const result = await process({ messages });
    expect(result.summary).toContain("User: ငါက local-first");
    expect(result.facts).toContain("ငါက local-first ကို ကြိုက်တယ်။");
    expect(result.decisions).toContain("သဘောတူတယ်၊ ဒီအတိုင်း ဆက်လုပ်မယ်။");
    expect(result.unresolved).toContain("ဒီ data ကို ဘယ်လို backup လုပ်မလဲ?");
    expect(result).toEqual(expect.objectContaining({ fromSequence: 1, toSequence: 3 }));
  });
});
