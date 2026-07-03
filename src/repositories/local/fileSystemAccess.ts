import type {
  ListNotesInput,
  ListVaultEntriesInput,
  NoteFile,
  NotesRepository,
  RenamePathInput,
  VaultEntry,
  VaultInfo,
  VaultRepository,
  WriteNoteInput,
} from "@/repositories/contracts";
import { hashContent, normalizeNotePath, titleFromContent, titleFromPath } from "./browserLocal";

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
class FsaNotesRepository implements NotesRepository {
  async listEntries(input: ListVaultEntriesInput = {}): Promise<VaultEntry[]> {
    const root = requireHandle();
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
    const notes = entries.filter((entry) => entry.kind === "note");
    const limited = notes.slice(0, input.limit || 500);
    return limited.map((entry) => ({
      path: entry.path,
      title: entry.title || titleFromPath(entry.path),
      content: "",
      mtimeMs: entry.mtimeMs,
    }));
  }

  async readNote(path: string): Promise<NoteFile | null> {
    const root = requireHandle();
    const notePath = normalizeNotePath(path);
    try {
      const { parent, name } = await resolveParentDir(root, notePath, false);
      const fileHandle = await parent.getFileHandle(name);
      const file = await fileHandle.getFile();
      const content = await file.text();
      return {
        path: notePath,
        title: titleFromContent(notePath, content),
        content,
        mtimeMs: file.lastModified,
        contentHash: await hashContent(content),
      };
    } catch {
      return null;
    }
  }

  async writeNote(input: WriteNoteInput): Promise<NoteFile> {
    const root = requireHandle();
    const notePath = normalizeNotePath(input.path);
    const { parent, name } = await resolveParentDir(root, notePath, true);
    const fileHandle = await parent.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(input.content);
    await writable.close();
    return {
      path: notePath,
      title: titleFromContent(notePath, input.content),
      content: input.content,
      mtimeMs: Date.now(),
      contentHash: await hashContent(input.content),
    };
  }

  async deleteNote(path: string): Promise<void> {
    const root = requireHandle();
    const { parent, name } = await resolveParentDir(root, normalizeNotePath(path), false);
    await parent.removeEntry(name);
  }

  async createFolder(path: string): Promise<VaultEntry> {
    const root = requireHandle();
    const segments = splitPath(path);
    await resolveDir(root, segments, true);
    const folderPath = segments.join("/");
    return { path: folderPath, name: segments[segments.length - 1] || folderPath, kind: "folder", depth: segments.length - 1 };
  }

  async deleteFolder(path: string): Promise<void> {
    const root = requireHandle();
    const { parent, name } = await resolveParentDir(root, path, false);
    await parent.removeEntry(name, { recursive: true });
  }

  async renamePath(input: RenamePathInput): Promise<VaultEntry> {
    const root = requireHandle();
    const isNote = input.oldPath.toLowerCase().endsWith(".md");
    if (isNote) {
      const oldPath = normalizeNotePath(input.oldPath);
      const newPath = normalizeNotePath(input.newPath);
      const existing = await this.readNote(oldPath);
      if (!existing) throw new Error("Note not found");
      await this.writeNote({ path: newPath, content: existing.content });
      await this.deleteNote(oldPath);
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
    return { unsubscribe: () => { stopped = true; clearInterval(timer); } };
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
}

export const fsaNotesRepository = new FsaNotesRepository();
export const fsaVaultRepository = new FsaVaultRepository();
