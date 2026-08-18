import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NotesRepository } from "../../src/repositories/contracts/notes";
import { BrowserNotesRepository, hashContent } from "../../src/repositories/local/browserLocal";
import { FsaNotesRepository } from "../../src/repositories/local/fileSystemAccess";
import { noteStore } from "../../src/repositories/local/noteStore";
import { createLocalRuntime } from "../../electron/local-runtime.mjs";

function installLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  });
  return values;
}

class MemoryFileHandle {
  kind = "file" as const;
  lastModified = Date.now();
  constructor(public name: string, public content = "") {}
  async getFile() {
    return {
      lastModified: this.lastModified,
      text: async () => this.content,
    } as File;
  }
  async createWritable() {
    let pending = this.content;
    return {
      write: async (data: string) => { pending = String(data); },
      close: async () => {
        this.content = pending;
        this.lastModified = Date.now();
      },
    };
  }
}

class MemoryDirHandle {
  kind = "directory" as const;
  files = new Map<string, MemoryFileHandle>();
  dirs = new Map<string, MemoryDirHandle>();
  constructor(public name: string) {}
  async *entries() {
    for (const entry of this.dirs) yield entry;
    for (const entry of this.files) yield entry;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    const existing = this.files.get(name);
    if (existing) return existing;
    if (!options?.create) throw new Error("File not found");
    const created = new MemoryFileHandle(name);
    this.files.set(name, created);
    return created;
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const existing = this.dirs.get(name);
    if (existing) return existing;
    if (!options?.create) throw new Error("Directory not found");
    const created = new MemoryDirHandle(name);
    this.dirs.set(name, created);
    return created;
  }
  async removeEntry(name: string) {
    if (!this.files.delete(name)) this.dirs.delete(name);
  }
}

async function expectConflictProtection(notes: NotesRepository, notePath: string) {
  const initial = await notes.writeNote({ path: notePath, content: "# Original", syncName: false });
  await notes.writeNote({ path: notePath, content: "# External", expectedHash: initial.contentHash, syncName: false });
  await expect(notes.writeNote({
    path: notePath,
    content: "# Stale overwrite",
    expectedHash: initial.contentHash,
    syncName: false,
  })).rejects.toThrow(/changed/i);
  expect((await notes.readNote(notePath))?.content).toBe("# External");
}

async function waitFor(check: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for local runtime watcher");
}

describe("note reliability contract", () => {
  let previousLocalStorage: Storage;
  let tempRoots: string[];

  beforeEach(async () => {
    previousLocalStorage = globalThis.localStorage;
    installLocalStorage();
    tempRoots = [];
    await noteStore.ready();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previousLocalStorage });
    for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
  });

  it("protects browser-local notes from stale writes and keeps version content", async () => {
    const notes = new BrowserNotesRepository();
    const notePath = `contract-browser-${Date.now()}.md`;
    await expectConflictProtection(notes, notePath);
    const versions = await notes.listVersions(notePath);
    expect(versions.length).toBeGreaterThan(0);
    expect(await notes.getVersionContent(versions[0].id)).toMatch(/^# /);
  });

  it("protects device-folder notes from stale writes and scopes their history", async () => {
    const root = new MemoryDirHandle(`Contract Vault ${Date.now()}`);
    const notes = new FsaNotesRepository(() => root as never);
    const notePath = "Device Contract.md";
    await expectConflictProtection(notes, notePath);
    const versions = await notes.listVersions(notePath);
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.every((version) => version.path === notePath)).toBe(true);
    expect(await notes.getVersionContent(versions[0].id)).toMatch(/^# /);
  });

  it("restores a device-folder recovery journal only when the base hash still matches", async () => {
    const root = new MemoryDirHandle(`Recovery Vault ${Date.now()}`);
    const writer = new FsaNotesRepository(() => root as never);
    const saved = await writer.writeNote({ path: "Recovery.md", content: "# Saved" });
    writer.emergencySaveSync("Recovery.md", "# Recovered draft", saved.contentHash);

    const restarted = new FsaNotesRepository(() => root as never);
    await restarted.listEntries();
    expect((await restarted.readNote("Recovery.md"))?.content).toBe("# Recovered draft");
    expect(localStorage.getItem("beebot.emergency_recovery")).toBeNull();
  });

  it("provides atomic conflict protection, history, and crash recovery in Electron", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sitku-note-contract-"));
    tempRoots.push(root);
    const dbPath = path.join(root, "sitku.sqlite");
    const settingsPath = path.join(root, "app.json");
    let runtime = createLocalRuntime({ dbPath, settingsPath });
    const invoke = (method: string, args: unknown[] = []) => runtime.invoke({ domain: "notes", method, args });

    const initial = invoke("writeNote", [{ path: "Electron Contract.md", content: "# Original", syncName: false }]);
    invoke("writeNote", [{ path: "Electron Contract.md", content: "# External", expectedHash: initial.contentHash, syncName: false }]);
    expect(() => invoke("writeNote", [{
      path: "Electron Contract.md",
      content: "# Stale overwrite",
      expectedHash: initial.contentHash,
      syncName: false,
    }])).toThrow(/changed/i);

    const current = invoke("readNote", ["Electron Contract.md"]);
    const versions = invoke("listVersions", ["Electron Contract.md"]);
    expect(versions.length).toBeGreaterThan(0);
    expect(invoke("getVersionContent", [versions[0].id])).toMatch(/^# /);
    invoke("emergencySaveSync", ["Electron Contract.md", "# Recovered draft", current.contentHash]);
    runtime.close();

    runtime = createLocalRuntime({ dbPath, settingsPath });
    expect(invoke("readNote", ["Electron Contract.md"]).content).toBe("# Recovered draft");
    expect(fs.readdirSync(path.join(root, "Sitku Vault")).some((name) => name.endsWith(".tmp"))).toBe(false);
    runtime.close();
  });

  it.runIf(process.platform === "darwin")("retries a watched note after a temporary SQLite lock", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sitku-note-watch-lock-"));
    tempRoots.push(root);
    const dbPath = path.join(root, "sitku.sqlite");
    const settingsPath = path.join(root, "app.json");
    const runtime = createLocalRuntime({ dbPath, settingsPath });
    const events: string[][] = [];
    runtime.subscribe(
      { domain: "notes", method: "watchNotes", args: [], subscriptionId: "watch-lock-test" },
      (paths: string[]) => events.push(paths),
    );

    const locker = new DatabaseSync(dbPath);
    let lockOpen = false;
    try {
      locker.exec("PRAGMA journal_mode = WAL; BEGIN IMMEDIATE;");
      lockOpen = true;
      const notePath = "Locked watcher.md";
      fs.writeFileSync(path.join(root, "Sitku Vault", notePath), "# Arrived during lock", "utf8");

      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(events.flat()).not.toContain(notePath);
      locker.exec("ROLLBACK;");
      lockOpen = false;

      await waitFor(() => events.flat().includes(notePath));
      const indexed = runtime.invoke({
        domain: "notes",
        method: "listNotes",
        args: [{ query: "Locked watcher" }],
      });
      expect(indexed.map((note: { path: string }) => note.path)).toContain(notePath);
    } finally {
      if (lockOpen) locker.exec("ROLLBACK;");
      locker.close();
      runtime.close();
    }
  });

  it("does not apply a recovery journal over a newer device-folder edit", async () => {
    const root = new MemoryDirHandle(`Conflict Recovery Vault ${Date.now()}`);
    const writer = new FsaNotesRepository(() => root as never);
    const saved = await writer.writeNote({ path: "Conflict.md", content: "# Saved" });
    writer.emergencySaveSync("Conflict.md", "# Draft", saved.contentHash);
    const file = await root.getFileHandle("Conflict.md");
    file.content = "# Newer external edit";
    file.lastModified = Date.now();

    const restarted = new FsaNotesRepository(() => root as never);
    await restarted.listEntries();
    expect((await restarted.readNote("Conflict.md"))?.content).toBe("# Newer external edit");
    expect(localStorage.getItem("beebot.emergency_recovery")).not.toBeNull();
    expect(await hashContent("# Newer external edit")).not.toBe(saved.contentHash);
  });
});
