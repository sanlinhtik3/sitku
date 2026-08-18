import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalRuntime } from "../../electron/local-runtime.mjs";
import { parseVoiceCommandText } from "@/features/jarvis/core/intentParser";
import { execAction, resolveNote } from "@/features/jarvis/services/actions";
import { EvOperatorAgent } from "@/features/ev-voice/operator";
import type { AgentTask, NoteFile, NotesRepository, TaskRepository } from "@/repositories/contracts";
import {
  createSnapshotId,
  registerWorkspaceActionPort,
  registerWorkspaceContextPort,
  stableContentHash,
} from "@/features/ev-voice/workspace/workspaceContext";

const call = (runtime: ReturnType<typeof createLocalRuntime>, domain: string, method: string, ...args: unknown[]) =>
  runtime.invoke({ domain, method, args });

describe("E.V action reliability", () => {
  it("refuses a referential create-note request when no conversation content reached the executor", async () => {
    const notes = memoryNotes([]);
    await expect(execAction(
      { notes, tasks: {} as never, memories: {} as never },
      "create_note",
      "Launch Script",
      {
        action: "create_note",
        reply: "confirm",
        transcript: "ဒါကို note အသစ်ဖန်တီးပြီး ထည့်လိုက်ပါ",
        payload: {},
      },
    )).rejects.toThrow("INVALID_INPUT: referenced conversation content is unavailable");
    expect(await notes.listNotes()).toEqual([]);
  });

  it("persists desktop tasks through the Electron SQLite repository", async () => {
    const root = mkdtempSync(join(tmpdir(), "sitku-ev-tasks-"));
    const dbPath = join(root, "runtime.sqlite");
    const settingsPath = join(root, "settings.json");
    let runtime = createLocalRuntime({ dbPath, settingsPath });
    const created = await call(runtime, "tasks", "upsertTask", {
      title: "Prepare weekly report",
      metadata: { source: "voice" },
    }) as { id: string; title: string; status: string };
    expect(created).toEqual(expect.objectContaining({ title: "Prepare weekly report", status: "pending" }));
    runtime.close();

    runtime = createLocalRuntime({ dbPath, settingsPath });
    expect(await call(runtime, "tasks", "listTasks")).toEqual([
      expect.objectContaining({ id: created.id, title: "Prepare weekly report", metadata: { source: "voice" } }),
    ]);
    await call(runtime, "tasks", "upsertTask", { ...created, status: "completed" });
    expect(await call(runtime, "tasks", "listTasks")).toEqual([
      expect.objectContaining({ id: created.id, status: "completed" }),
    ]);
    runtime.close();
  });

  it("counts every note and folder from the active repository", async () => {
    const result = await execAction({
      notes: {
        listEntries: async () => [
          { path: "Inbox", name: "Inbox", kind: "folder", depth: 0 },
          { path: "Inbox/One.md", name: "One.md", kind: "note", depth: 1 },
          { path: "Two.md", name: "Two.md", kind: "note", depth: 0 },
        ],
      } as never,
      tasks: {} as never,
      memories: {} as never,
    }, "get_vault_stats");
    expect(result.result).toBe("Active vault contains 2 Markdown files and 1 folders.");
    expect(result.reply).toContain("file 2 ခု");
  });

  it("routes file-count and failure-diagnostic requests deterministically", () => {
    expect(parseVoiceCommandText("ဒီ vault ထဲမှာ ဖိုင် ဘယ်နှစ်ခုရှိလဲ").action).toBe("get_vault_stats");
    expect(parseVoiceCommandText("ဘာကြောင့် action မအောင်မြင်တာလဲ").action).toBe("explain_last_failure");
  });

  it("routes note CRUD phrases and never treats opening a new note as open-existing", () => {
    expect(parseVoiceCommandText("open a new note Project Alpha").action).toBe("create_note");
    expect(parseVoiceCommandText("Project Alpha note ဖျက်").action).toBe("delete_note");
    expect(parseVoiceCommandText("rename note Project Alpha to Project Beta").action).toBe("rename_note");
    const append = parseVoiceCommandText("append Next step to note Project Alpha");
    expect(append).toEqual(expect.objectContaining({
      action: "append_note",
      title: "Project Alpha",
      payload: { target: "Project Alpha", content: "Next step" },
    }));
    const update = parseVoiceCommandText("Project Alpha note ကို Revised draft နဲ့ ပြင်");
    expect(update).toEqual(expect.objectContaining({
      action: "update_note",
      title: "Project Alpha",
      payload: { target: "Project Alpha", content: "Revised draft" },
    }));
    expect(parseVoiceCommandText("append to note Project Alpha").action).toBe("none");
  });

  it("rejects ambiguous note names instead of guessing the first result", async () => {
    const notes = memoryNotes([
      { path: "Work/Plan.md", title: "Plan", content: "work" },
      { path: "Personal/Plan.md", title: "Plan", content: "personal" },
    ]);
    await expect(resolveNote(notes, "Plan", false)).rejects.toThrow("AMBIGUOUS_TARGET");
  });

  it("creates, opens, updates and deletes notes through the registered workspace action port", async () => {
    const notes = memoryNotes([]);
    let activePath: string | null = null;
    const unregisterContext = registerWorkspaceContextPort({
      async capture() {
        const active = activePath ? await notes.readNote(activePath) : null;
        const capturedAt = new Date().toISOString();
        const hash = active ? stableContentHash(active.content) : "none";
        return {
          snapshotId: createSnapshotId(capturedAt, hash),
          capturedAt,
          room: "notes",
          openFiles: active ? [{ path: active.path, title: active.title, active: true, split: false, dirty: false }] : [],
          activeFile: active ? {
            ...active,
            contentHash: hash,
            source: "repository",
            active: true,
            split: false,
            dirty: false,
          } : null,
        };
      },
    });
    const unregisterActions = registerWorkspaceActionPort({
      async createNote(input) {
        const note = await notes.writeNote({ path: input.path, content: input.content || "" });
        activePath = note.path;
        return receipt(note, true);
      },
      async openNote(input) {
        const note = await notes.readNote(input.path);
        if (!note) throw new Error("FILE_NOT_FOUND");
        activePath = note.path;
        return receipt(note, true);
      },
      async updateNote(input) {
        const note = await notes.writeNote({ path: input.path, content: input.content || "" });
        return receipt(note, activePath === note.path);
      },
      async deleteNote(input) {
        const note = await notes.readNote(input.path);
        if (!note) throw new Error("FILE_NOT_FOUND");
        await notes.deleteNote(input.path);
        if (activePath === input.path) activePath = null;
        return receipt(note, false);
      },
      async renameNote(input) {
        throw new Error(`unused ${input.path}`);
      },
    });
    const repos = { notes, tasks: {} as never, memories: {} as never };

    try {
      await execAction(repos, "create_note", "Project Alpha", {
        action: "create_note", reply: "confirm", payload: { content: "# Project Alpha\n\nDraft" },
      });
      expect(activePath).toBe("Project Alpha.md");

      await execAction(repos, "append_note", "Project Alpha", {
        action: "append_note", reply: "confirm", payload: { target: "Project Alpha", content: "Next step" },
      });
      expect((await notes.readNote("Project Alpha.md"))?.content).toContain("Next step");

      await execAction(repos, "delete_note", "Project Alpha", {
        action: "delete_note", reply: "confirm", payload: { target: "Project Alpha" },
      });
      expect(await notes.readNote("Project Alpha.md")).toBeNull();
      expect(activePath).toBeNull();
    } finally {
      unregisterActions();
      unregisterContext();
    }
  });

  it("routes a complex request through the Operator and keeps its journal out of user tasks", async () => {
    const root = mkdtempSync(join(tmpdir(), "sitku-ev-operator-"));
    const runtime = createLocalRuntime({ dbPath: join(root, "runtime.sqlite"), settingsPath: join(root, "settings.json") });
    const tasks: TaskRepository = {
      listTasks: () => call(runtime, "tasks", "listTasks") as Promise<AgentTask[]>,
      upsertTask: (input) => call(runtime, "tasks", "upsertTask", input) as Promise<AgentTask>,
      deleteTask: (id) => call(runtime, "tasks", "deleteTask", id) as Promise<void>,
    };
    await tasks.upsertTask({ title: "Real user task" });
    const operator = new EvOperatorAgent({
      tasks,
      model: async () => ({ text: "Architecture review completed with two verified risks.", provider: "Gemini Operator", model: "gemini-2.5-flash" }),
      createId: () => "operator-integration",
    });
    const repos = { notes: {} as never, tasks, memories: {} as never, operator };

    const delegated = await execAction(repos, "delegate_operator_task", undefined, {
      action: "delegate_operator_task",
      reply: "delegate",
      transcript: "Review the architecture",
      payload: { content: "Review the architecture", turnId: "turn-int", idempotencyKey: "turn-int:delegate" },
    });
    const listed = await execAction(repos, "list_today_tasks");

    expect(delegated).toEqual(expect.objectContaining({ reply: expect.stringContaining("background") }));
    expect(listed.reply).toContain("Real user task");
    expect(listed.reply).not.toContain("E.V Operator");
    await vi.waitFor(async () => expect(await tasks.listTasks()).toContainEqual(expect.objectContaining({ id: "operator-integration", status: "completed" })));
    runtime.close();
  });
});

function memoryNotes(seed: NoteFile[]): NotesRepository {
  const store = new Map(seed.map((note) => [note.path, { ...note, contentHash: stableContentHash(note.content) }]));
  return {
    listEntries: async () => [...store.values()].map((note) => ({ path: note.path, name: note.path, title: note.title, kind: "note" as const, depth: 0 })),
    listNotes: async () => [...store.values()].map((note) => ({ ...note })),
    readNote: async (path) => store.has(path) ? { ...store.get(path)! } : null,
    writeNote: async ({ path, content }) => {
      const note = { path, title: path.split("/").pop()!.replace(/\.md$/i, ""), content, contentHash: stableContentHash(content) };
      store.set(path, note);
      return { ...note };
    },
    deleteNote: async (path) => { store.delete(path); },
    createFolder: async () => { throw new Error("unused"); },
    deleteFolder: async () => { throw new Error("unused"); },
    renamePath: async () => { throw new Error("unused"); },
    revealPath: async () => undefined,
    watchNotes: () => ({ unsubscribe() {} }),
  };
}

function receipt(note: NoteFile, active: boolean) {
  return { path: note.path, title: note.title, contentHash: note.contentHash || stableContentHash(note.content), active };
}
