import type {
  ListNotesInput,
  ListVaultEntriesInput,
  NoteFile,
  NoteVersion,
  NotesRepository,
  RenamePathInput,
  VaultEntry,
  VaultInfo,
  VaultRepository,
  WriteNoteInput,
} from "@/repositories/contracts";
import { hashContent, normalizeNotePath, titleFromContent, titleFromPath } from "./browserLocal";
import { noteStore, type NoteRecord } from "./noteStore";

/**
 * Browser "open a real device folder" support via the File System Access API.
 *
 * Electron already reads the device filesystem directly; this module gives the
 * web build the same capability in Chromium browsers: the user picks a folder
 * with `showDirectoryPicker()`, we persist the directory handle in IndexedDB, and
 * the workspace browses/edits the real `.md` files inside it.
 */

// ── Minimal FSA typings (lib.dom lacks the permission API + async iterators) ──
type PermissionState = "granted" | "denied" | "prompt";
interface FsaPermissionDescriptor {
  mode?: "read" | "readwrite";
}
interface DirHandle {
  kind: "directory";
  name: string;
  entries(): AsyncIterableIterator<[string, DirHandle | FileHandle]>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  queryPermission?(descriptor?: FsaPermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FsaPermissionDescriptor): Promise<PermissionState>;
}
interface FileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
}
interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
}
type WindowWithFsa = Window & {
  showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<DirHandle>;
};

function fsaWindow(): WindowWithFsa {
  return window as unknown as WindowWithFsa;
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof fsaWindow().showDirectoryPicker === "function";
}

// ── IndexedDB persistence for the directory handle ──
const DB_NAME = "beebot-fsa";
const STORE = "handles";
const HANDLE_KEY = "vault";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

// ── Shared store: the active picked directory handle ──
class FsaStore {
  private handle: DirHandle | null = null;
  // A restored handle awaiting a user gesture to re-grant permission. It is NOT
  // exposed via get() until permission is granted, so notes ops keep using
  // localStorage (never route to a dead, permission-less handle).
  private pending: DirHandle | null = null;
  private listeners = new Set<() => void>();

  isSupported() {
    return isFileSystemAccessSupported();
  }

  get(): DirHandle | null {
    return this.handle;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  async set(handle: DirHandle): Promise<void> {
    this.handle = handle;
    this.pending = null;
    await idbSet(HANDLE_KEY, handle);
    this.emit();
  }

  async clear(): Promise<void> {
    this.handle = null;
    this.pending = null;
    await idbDel(HANDLE_KEY);
    this.emit();
  }

  private async permissionFor(handle: DirHandle): Promise<PermissionState> {
    if (!handle.queryPermission) return "granted";
    try {
      return await handle.queryPermission({ mode: "readwrite" });
    } catch {
      return "denied";
    }
  }

  /**
   * Restore a previously-picked handle from IndexedDB. The handle is only made
   * ACTIVE (routable via get()) when permission is already granted; otherwise it
   * is held as `pending` and the caller should prompt the user to reconnect.
   */
  async restore(): Promise<{ active: boolean; needsPermission: boolean }> {
    if (this.handle) return { active: true, needsPermission: false };
    const saved = await idbGet<DirHandle>(HANDLE_KEY);
    if (!saved) return { active: false, needsPermission: false };
    this.pending = saved;
    if ((await this.permissionFor(saved)) === "granted") {
      this.handle = saved;
      this.pending = null;
      this.emit();
      return { active: true, needsPermission: false };
    }
    return { active: false, needsPermission: true };
  }

  async queryPermission(): Promise<PermissionState> {
    const target = this.handle ?? this.pending;
    if (!target) return "denied";
    return this.permissionFor(target);
  }

  /** Ensure read/write permission, prompting the user if needed (requires a user gesture). */
  async ensurePermission(): Promise<boolean> {
    const target = this.handle ?? this.pending;
    if (!target) return false;
    const activate = () => {
      this.handle = target;
      this.pending = null;
      this.emit();
    };
    if (!target.queryPermission || !target.requestPermission) {
      activate();
      return true;
    }
    try {
      let permission = await target.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") permission = await target.requestPermission({ mode: "readwrite" });
      if (permission === "granted") {
        activate();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export const fsaStore = new FsaStore();

// ── Path helpers over a directory handle ──
function splitPath(path: string): string[] {
  return path.replace(/\\/g, "/").split("/").filter(Boolean);
}

function requireHandle(): DirHandle {
  const handle = fsaStore.get();
  if (!handle) throw new Error("No folder is open. Open a folder first.");
  return handle;
}

async function resolveDir(root: DirHandle, segments: string[], create: boolean): Promise<DirHandle> {
  let dir = root;
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create });
  }
  return dir;
}

async function resolveParentDir(root: DirHandle, path: string, create: boolean): Promise<{ parent: DirHandle; name: string }> {
  const segments = splitPath(path);
  const name = segments.pop();
  if (!name) throw new Error("Invalid path");
  const parent = await resolveDir(root, segments, create);
  return { parent, name };
}

// ── Notes repository backed by the File System Access API ──
export class FsaNotesRepository implements NotesRepository {
  private channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("beebot.noteStore.sync") : null;
  private recoveryCheckedForVault = new Set<string>();

  constructor(private readonly getRoot: () => DirHandle = requireHandle) {}

  private historyPath(root: DirHandle, notePath: string) {
    return `fsa:${root.name}:${normalizeNotePath(notePath)}`;
  }

  private async restoreEmergencyRecovery(root: DirHandle) {
    if (this.recoveryCheckedForVault.has(root.name)) return;
    this.recoveryCheckedForVault.add(root.name);
    try {
      const raw = localStorage.getItem("beebot.emergency_recovery");
      if (!raw) return;
      const recovery = JSON.parse(raw) as {
        backend?: string;
        vaultName?: string;
        path?: string;
        content?: string;
        expectedHash?: string;
        mtimeMs?: number;
      };
      if (recovery.backend !== "fsa" || recovery.vaultName !== root.name || !recovery.path || typeof recovery.content !== "string") return;

      const current = await this.readNote(recovery.path);
      if (recovery.expectedHash && current?.contentHash !== recovery.expectedHash) return;

      const notePath = normalizeNotePath(recovery.path);
      const { parent, name } = await resolveParentDir(root, notePath, true);
      const writable = await (await parent.getFileHandle(name, { create: true })).createWritable();
      await writable.write(recovery.content);
      await writable.close();
      const now = recovery.mtimeMs || Date.now();
      const record: NoteRecord = {
        content: recovery.content,
        ctimeMs: current?.ctimeMs ?? now,
        mtimeMs: now,
        contentHash: await hashContent(recovery.content),
        title: titleFromContent(notePath, recovery.content),
      };
      await noteStore.snapshotVersion(this.historyPath(root, notePath), record);
      localStorage.removeItem("beebot.emergency_recovery");
    } catch (error) {
      console.error("[FsaNotesRepository] recovery restore failed", error);
    }
  }

  private notify(paths: string[]) {
    try { this.channel?.postMessage({ paths }); } catch { /* best-effort cross-tab notification */ }
  }

  async listEntries(input: ListVaultEntriesInput = {}): Promise<VaultEntry[]> {
    const root = this.getRoot();
    await this.restoreEmergencyRecovery(root);
    const entries: VaultEntry[] = [];
    const query = String(input.query || "").trim().toLowerCase();

    const walk = async (dir: DirHandle, base: string) => {
      const dirs: [string, DirHandle][] = [];
      const files: [string, FileHandle][] = [];
      for await (const [name, child] of dir.entries()) {
        if (name.startsWith(".")) continue;
        if (child.kind === "directory") dirs.push([name, child as DirHandle]);
        else if (name.toLowerCase().endsWith(".md")) files.push([name, child as FileHandle]);
      }
      dirs.sort((a, b) => a[0].localeCompare(b[0]));
      files.sort((a, b) => a[0].localeCompare(b[0]));

      // Folders first (Obsidian ordering), recursing into each before listing files.
      for (const [name, child] of dirs) {
        const path = base ? `${base}/${name}` : name;
        entries.push({ path, name, kind: "folder", depth: splitPath(path).length - 1 });
        await walk(child, path);
      }
      for (const [name] of files) {
        const path = base ? `${base}/${name}` : name;
        // METADATA-ONLY listing: do NOT read each file's content here. Reading
        // 1M files during a vault walk would freeze the UI for minutes. The
        // title from the filename is the fast, correct default; the real
        // content-derived title resolves lazily when the note is opened
        // (readNote already does that for a single file).
        const title = titleFromPath(path);
        entries.push({ path, name: titleFromPath(path), title, kind: "note", depth: splitPath(path).length - 1 });
      }
    };

    await walk(root, "");
    if (!query) return entries;
    return entries.filter((entry) =>
      entry.path.toLowerCase().includes(query) ||
      entry.name.toLowerCase().includes(query) ||
      String(entry.title || "").toLowerCase().includes(query),
    );
  }

  async listNotes(input: ListNotesInput = {}): Promise<NoteFile[]> {
    const entries = await this.listEntries();
    let notes = entries.filter((entry) => entry.kind === "note");
    if (input.createdAfter != null) {
      notes = notes.filter((entry) => (entry.ctimeMs ?? entry.mtimeMs ?? 0) >= input.createdAfter!);
    }
    if (input.modifiedAfter != null) {
      notes = notes.filter((entry) => (entry.mtimeMs ?? 0) >= input.modifiedAfter!);
    }
    if (input.sortBy) {
      notes.sort((a, b) => {
        const valA = input.sortBy === "ctime" ? (a.ctimeMs ?? a.mtimeMs ?? 0) : input.sortBy === "title" ? (a.title || a.path) : (a.mtimeMs ?? 0);
        const valB = input.sortBy === "ctime" ? (b.ctimeMs ?? b.mtimeMs ?? 0) : input.sortBy === "title" ? (b.title || b.path) : (b.mtimeMs ?? 0);
        if (valA < valB) return input.sortOrder === "asc" ? -1 : 1;
        if (valA > valB) return input.sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    }
    const limited = notes.slice(0, input.limit || 500);
    return limited.map((entry) => ({
      path: entry.path,
      title: entry.title || titleFromPath(entry.path),
      content: "",
      ctimeMs: entry.ctimeMs,
      mtimeMs: entry.mtimeMs,
    }));
  }

  async queryByDate(input: import("../contracts/notes").QueryByDateInput = {}): Promise<NoteFile[]> {
    const dateRange = String(input.dateRange || "today").toLowerCase();
    const action = String(input.action || "modified").toLowerCase();
    const now = new Date();
    let after = 0;
    if (dateRange === "today") {
      after = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (dateRange === "yesterday") {
      after = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    } else if (dateRange === "this_week") {
      after = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    } else if (dateRange === "this_month") {
      after = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    } else if (typeof input.createdAfter === "number") {
      after = input.createdAfter;
    } else if (typeof input.modifiedAfter === "number") {
      after = input.modifiedAfter;
    }
    const filter = action === "created"
      ? { createdAfter: after, sortBy: "ctime" as const, sortOrder: "desc" as const }
      : { modifiedAfter: after, sortBy: "mtime" as const, sortOrder: "desc" as const };
    return this.listNotes({ ...filter, limit: input.limit || 500 });
  }

  async readNote(path: string): Promise<NoteFile | null> {
    const root = this.getRoot();
    const notePath = normalizeNotePath(path);
    try {
      const { parent, name } = await resolveParentDir(root, notePath, false);
      const fileHandle = await parent.getFileHandle(name);
      const file = await fileHandle.getFile();
      const content = await file.text();
      let ctimeMs = file.lastModified;
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fmMatch) {
        const createdMatch = fmMatch[1].match(/^created:\s*(.+)$/m);
        if (createdMatch) {
          const parsed = Date.parse(createdMatch[1].trim());
          if (!isNaN(parsed) && parsed > 0) ctimeMs = Math.min(ctimeMs, parsed);
        }
      }
      return {
        path: notePath,
        title: titleFromContent(notePath, content),
        content,
        ctimeMs,
        mtimeMs: file.lastModified,
        contentHash: await hashContent(content),
      };
    } catch {
      return null;
    }
  }

  async writeNote(input: WriteNoteInput): Promise<NoteFile> {
    const root = this.getRoot();
    const notePath = normalizeNotePath(input.path);
    const current = await this.readNote(notePath);
    if (input.expectedHash && current?.contentHash !== input.expectedHash) {
      throw new Error("Note changed outside this editor. Reload before saving.");
    }
    const { parent, name } = await resolveParentDir(root, notePath, true);
    const fileHandle = await parent.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(input.content);
    await writable.close();
    this.notify([notePath]);
    const now = Date.now();
    const saved = {
      path: notePath,
      title: titleFromContent(notePath, input.content),
      content: input.content,
      ctimeMs: current?.ctimeMs ?? now,
      mtimeMs: now,
      contentHash: await hashContent(input.content),
    };
    await noteStore.snapshotVersion(this.historyPath(root, notePath), saved);
    return saved;
  }

  async deleteNote(path: string): Promise<void> {
    const root = this.getRoot();
    const norm = normalizeNotePath(path);
    const { parent, name } = await resolveParentDir(root, norm, false);
    await parent.removeEntry(name);
    this.notify([norm]);
  }

  async createFolder(path: string): Promise<VaultEntry> {
    const root = this.getRoot();
    const segments = splitPath(path);
    await resolveDir(root, segments, true);
    const folderPath = segments.join("/");
    this.notify([folderPath]);
    return { path: folderPath, name: segments[segments.length - 1] || folderPath, kind: "folder", depth: segments.length - 1 };
  }

  async deleteFolder(path: string): Promise<void> {
    const root = this.getRoot();
    const { parent, name } = await resolveParentDir(root, path, false);
    await parent.removeEntry(name, { recursive: true });
    this.notify([path]);
  }

  async renamePath(input: RenamePathInput): Promise<VaultEntry> {
    const root = this.getRoot();
    const isNote = input.oldPath.toLowerCase().endsWith(".md");
    if (isNote) {
      const oldPath = normalizeNotePath(input.oldPath);
      const newPath = normalizeNotePath(input.newPath);
      const existing = await this.readNote(oldPath);
      if (!existing) throw new Error("Note not found");
      await this.writeNote({ path: newPath, content: existing.content });
      await this.deleteNote(oldPath);
      this.notify([oldPath, newPath]);
      return { path: newPath, name: titleFromPath(newPath), title: titleFromContent(newPath, existing.content), kind: "note", depth: splitPath(newPath).length - 1 };
    }

    // Folder rename = recursive copy then delete (no native move in FSA).
    const copyDir = async (fromSegments: string[], toSegments: string[]) => {
      const src = await resolveDir(root, fromSegments, false);
      await resolveDir(root, toSegments, true);
      for await (const [name, child] of src.entries()) {
        if (name.startsWith(".")) continue;
        if (child.kind === "directory") {
          await copyDir([...fromSegments, name], [...toSegments, name]);
        } else {
          const file = await (child as FileHandle).getFile();
          const destParent = await resolveDir(root, toSegments, true);
          const destFile = await destParent.getFileHandle(name, { create: true });
          const writable = await destFile.createWritable();
          await writable.write(await file.text());
          await writable.close();
        }
      }
    };
    await copyDir(splitPath(input.oldPath), splitPath(input.newPath));
    await this.deleteFolder(input.oldPath);
    const segments = splitPath(input.newPath);
    this.notify([input.oldPath, input.newPath]);
    return { path: input.newPath, name: segments[segments.length - 1] || input.newPath, kind: "folder", depth: segments.length - 1 };
  }

  async revealPath(): Promise<void> {
    throw new Error("Reveal in Finder is available in the desktop app.");
  }

  watchNotes(onChange: (paths: string[]) => void): { unsubscribe: () => void } {
    // The File System Access API has no change events — poll the vault for a cheap
    // `path:mtime` signature and fire when it shifts (external edits, adds, deletes).
    // ponytail: 2.5s poll, signature from listNotes (catches file add/edit/delete; a
    // folder with no files is the blind spot). Interval is the only knob the platform offers.
    let signature = "";
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const notes = await this.listNotes();
        const next = notes.map((n) => `${n.path}:${n.mtimeMs}`).sort().join("|");
        if (signature && next !== signature) onChange([]);
        signature = next;
      } catch { /* permission revoked / vault closed — go quiet */ }
    };
    void poll();
    const timer = setInterval(poll, 2500);

    const onMsg = (event: MessageEvent) => {
      onChange(event.data?.paths || []);
    };
    if (this.channel) this.channel.addEventListener("message", onMsg);

    return {
      unsubscribe: () => {
        stopped = true;
        clearInterval(timer);
        if (this.channel) this.channel.removeEventListener("message", onMsg);
      },
    };
  }

  async listVersions(path: string): Promise<NoteVersion[]> {
    const root = this.getRoot();
    const notePath = normalizeNotePath(path);
    const versions = await noteStore.listVersions(this.historyPath(root, notePath));
    return versions.map((version) => ({ ...version, path: notePath }));
  }

  getVersionContent(id: number): Promise<string | null> {
    return noteStore.getVersionContent(id);
  }

  emergencySaveSync(path: string, content: string, expectedHash?: string): void {
    try {
      const root = this.getRoot();
      localStorage.setItem("beebot.emergency_recovery", JSON.stringify({
        backend: "fsa",
        vaultName: root.name,
        path: normalizeNotePath(path),
        content,
        expectedHash,
        mtimeMs: Date.now(),
      }));
      this.notify([normalizeNotePath(path)]);
    } catch (err) {
      console.error("[FsaNotesRepository] emergencySaveSync failed", err);
    }
  }
}

// ── Vault repository backed by the File System Access API ──
class FsaVaultRepository implements VaultRepository {
  async getActiveVault(): Promise<VaultInfo> {
    const handle = fsaStore.get();
    if (!handle) return { name: "BeeBot Browser Vault", path: "browser-local-preview", active: true };
    return { name: handle.name, path: handle.name, active: true };
  }

  async listVaults(): Promise<VaultInfo[]> {
    return [await this.getActiveVault()];
  }

  private async pick(): Promise<VaultInfo | null> {
    if (!isFileSystemAccessSupported()) {
      throw new Error("Opening a device folder needs Chrome, Edge or Brave (or the desktop app).");
    }
    try {
      const handle = await fsaWindow().showDirectoryPicker!({ id: "beebot-vault", mode: "readwrite" });
      await fsaStore.set(handle);
      return { name: handle.name, path: handle.name, active: true };
    } catch (error) {
      // User dismissed the picker.
      if (error instanceof DOMException && error.name === "AbortError") return null;
      throw error;
    }
  }

  async createVault(): Promise<VaultInfo | null> {
    return this.pick();
  }

  async openVault(): Promise<VaultInfo | null> {
    return this.pick();
  }

  async switchVault(): Promise<VaultInfo> {
    const picked = await this.pick();
    return picked || this.getActiveVault();
  }

  async revealActiveVault(): Promise<void> {
    throw new Error("Open vault location is available in the desktop app.");
  }

  // The browser tracks a single granted folder — there's no recent list to prune.
  async forgetVault(): Promise<void> {}
}

export const fsaNotesRepository = new FsaNotesRepository();
export const fsaVaultRepository = new FsaVaultRepository();
