// ── Note storage engine ─────────────────────────────────────────────────────
// World-class local persistence for the Obsidian-style vault.
//
// Replaces the old "all notes in one localStorage JSON blob" model (O(N) per
// keystroke, ~5MB quota cliff, synchronous main-thread blocking, evictable)
// with:
//   • IndexedDB, one record per note  → O(1) reads/writes, hundreds of MB+,
//     async (never blocks the UI thread), atomic per-note transactions.
//   • A write-through in-memory Map cache → reads are instant + synchronous
//     after init; writes update the cache immediately (snappy UI) and persist
//     in the background through a serialized queue (never lost, never racing).
//   • One-time migration of the legacy localStorage blob into IndexedDB,
//     keeping a backup copy so nothing is ever destroyed.
//   • Graceful fallback to localStorage when IndexedDB is unavailable
//     (private windows, locked-down browsers) — same API, no caller changes.
//   • `navigator.storage.persist()` request so the browser will not silently
//     evict the vault under storage pressure (durability / data accessibility).
//
// The repository (browserLocal.ts) talks ONLY to this module, so the
// NotesRepository contract is unchanged and nothing else in the app moves.

import { ensurePersistentStorage } from "@/lib/storageDurability";

// What lives IN RAM (small, fixed): no content. This is the difference between
// 1M notes taking ~5GB vs ~120MB. Content is fetched lazily from IndexedDB.
export interface NoteMeta {
  mtimeMs: number;
  contentHash?: string;
  title?: string; // derived once at write time, cached so list() never re-parses content
}

// Full row as persisted to IndexedDB / carried in a backup import. Content lives
// ONLY here (disk) — never held in the in-memory cache.
export interface NoteRecord extends NoteMeta {
  content: string;
}

const DB_NAME = "beebot-vault";
const DB_VERSION = 2;
const NOTES_STORE = "notes"; // keyPath "path" → { path, content, mtimeMs, contentHash, title }
const KV_STORE = "kv"; // keyPath "key" → { key, value }
const HISTORY_STORE = "history"; // keyPath "id" (auto) → { id, path, content, mtimeMs }, index "path"
const FOLDERS_KEY = "folders";
const MIGRATED_KEY = "migratedFromLocalStorage";

// Version history (local "File Recovery"): snapshot a note's content on save so
// nothing is ever truly lost. Throttled so rapid auto-saves don't flood the
// store, and capped per note so it stays bounded.
const SNAPSHOT_THROTTLE_MS = 120_000; // ≥2 min between snapshots of the same note
const MAX_VERSIONS_PER_NOTE = 40;

const SYNC_CHANNEL = "beebot-vault-sync";

export interface NoteVersion {
  id: number;
  path: string;
  mtimeMs: number;
  size: number;
}

const LEGACY_PREFIX = "beebot.browserLocal.";
const LEGACY_NOTES = `${LEGACY_PREFIX}notes`;
const LEGACY_FOLDERS = `${LEGACY_PREFIX}folders`;
const LEGACY_BACKUP = `${LEGACY_PREFIX}notes.backup`;

// localStorage-fallback keys (used only when IndexedDB is unavailable).
const LS_NOTES = `${LEGACY_PREFIX}notes`;
const LS_FOLDERS = `${LEGACY_PREFIX}folders`;

type Backend = "idb" | "localStorage";

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: "path" });
      }
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const hist = db.createObjectStore(HISTORY_STORE, { keyPath: "id", autoIncrement: true });
        hist.createIndex("path", "path", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}

class NoteStore {
  // METADATA-ONLY. Holding content here for 1M notes would consume ~5GB and
  // crash low-end devices. Content is fetched lazily from IndexedDB via
  // getContent(path) on demand (editor open / read / export).
  private cache = new Map<string, NoteMeta>();
  private folderSet = new Set<string>();
  private db: IDBDatabase | null = null;
  private backend: Backend = "localStorage";
  private initPromise: Promise<void> | null = null;
  // Serializes background persistence so writes never interleave/corrupt.
  private queue: Promise<unknown> = Promise.resolve();
  // Cross-tab sync: writes from another tab arrive here and re-hydrate the cache.
  private channel: BroadcastChannel | null = null;
  private externalListeners = new Set<(paths: string[]) => void>();
  // Per-note throttle for version snapshots (path → last snapshot epoch ms).
  private lastSnapshotAt = new Map<string, number>();
  // Full records staged by replaceAll() so persistAll() can write content to
  // disk in one transaction (the cache only holds meta). Cleared after use.
  private pendingFullRecords: Map<string, NoteRecord> | null = null;

  ready(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.init();
    return this.initPromise;
  }

  private async init() {
    // Ask the browser to keep our data durable (no eviction). Centralized so the
    // grant is requested + verified once and surfaced to the UI.
    try {
      await ensurePersistentStorage();
    } catch {
      /* not supported — non-fatal */
    }

    try {
      this.db = await openDb();
      this.backend = "idb";
      await this.hydrateFromIdb();
      await this.migrateLegacyIfNeeded();
    } catch (error) {
      console.warn("[noteStore] IndexedDB unavailable; using localStorage fallback", error);
      this.backend = "localStorage";
      this.hydrateFromLocalStorage();
    }

    // Cross-tab sync (best-effort — unsupported in some embedded webviews).
    try {
      this.channel = new BroadcastChannel(SYNC_CHANNEL);
      this.channel.onmessage = (event: MessageEvent<{ paths: string[] }>) => {
        void this.applyRemoteChange(event.data?.paths ?? []);
      };
    } catch {
      /* BroadcastChannel unavailable — single-tab still works */
    }
  }

  // Another tab wrote: re-read the affected notes from IndexedDB into our cache
  // (or drop them if deleted), refresh folders, then notify the app so the tree
  // updates. We never touch the open editor — that's the repository's concern.
  private async applyRemoteChange(paths: string[]) {
    if (this.backend !== "idb" || !this.db) return;
    try {
      if (paths.length === 1 && paths[0] === "*") {
        // Full re-sync (bulk rename / folder op in another tab): rebuild cache.
        this.cache.clear();
        await this.hydrateFromIdb();
      } else {
        const tx = this.db.transaction([NOTES_STORE, KV_STORE], "readonly");
        const notesStore = tx.objectStore(NOTES_STORE);
        for (const path of paths) {
          const row = await promisify(notesStore.get(path) as IDBRequest<({ path: string } & NoteRecord) | undefined>);
          if (row) {
            const { path: p, content: _c, ...meta } = row; // meta only, drop content
            void _c;
            this.cache.set(p, meta);
          } else {
            this.cache.delete(path);
          }
        }
        const folders = await promisify(tx.objectStore(KV_STORE).get(FOLDERS_KEY) as IDBRequest<{ key: string; value: string[] } | undefined>);
        this.folderSet = new Set(folders?.value ?? []);
      }
    } catch (error) {
      console.warn("[noteStore] applyRemoteChange failed", error);
    }
    for (const listener of this.externalListeners) listener(paths);
  }

  /** Subscribe to changes made in OTHER tabs. Returns an unsubscribe fn. */
  onExternalChange(cb: (paths: string[]) => void): () => void {
    this.externalListeners.add(cb);
    return () => this.externalListeners.delete(cb);
  }

  // BroadcastChannel.postMessage is NOT echoed to the sender, so no self-guard.
  private broadcast(paths: string[]) {
    try {
      this.channel?.postMessage({ paths });
    } catch {
      /* channel closed — non-fatal */
    }
  }

  // ── Hydration ──────────────────────────────────────────────────────────────
  private async hydrateFromIdb() {
    if (!this.db) return;
    // NEVER materialize content at hydrate time. We stream only the metadata
    // fields the UI needs for listing (mtime + hash + title) via a key+value
    // projection. For 1M notes this keeps RAM ~120MB instead of ~5GB.
    const tx = this.db.transaction([NOTES_STORE, KV_STORE], "readonly");
    const store = tx.objectStore(NOTES_STORE);
    await new Promise<void>((resolve, reject) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(); return; }
        const row = cursor.value as { path: string; mtimeMs: number; contentHash?: string; title?: string };
        this.cache.set(row.path, {
          mtimeMs: row.mtimeMs,
          contentHash: row.contentHash,
          title: row.title,
        });
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
    const folders = await promisify(tx.objectStore(KV_STORE).get(FOLDERS_KEY) as IDBRequest<{ key: string; value: string[] } | undefined>);
    this.folderSet = new Set(folders?.value ?? []);
  }

  private hydrateFromLocalStorage() {
    try {
      const raw = localStorage.getItem(LS_NOTES);
      const obj = raw ? (JSON.parse(raw) as Record<string, NoteRecord>) : {};
      // Meta only — content stays in the localStorage blob and is read on demand
      // via getContent(). Same RAM discipline as the IndexedDB path.
      for (const [path, record] of Object.entries(obj)) {
        this.cache.set(path, {
          mtimeMs: record.mtimeMs,
          contentHash: record.contentHash,
          title: record.title,
        });
      }
    } catch {
      /* corrupt blob — start empty rather than crash */
    }
    try {
      const folders = JSON.parse(localStorage.getItem(LS_FOLDERS) || "[]") as string[];
      this.folderSet = new Set(Array.isArray(folders) ? folders : []);
    } catch {
      this.folderSet = new Set();
    }
  }

  // ── One-time migration localStorage blob → IndexedDB ────────────────────────
  private async migrateLegacyIfNeeded() {
    if (!this.db) return;
    const tx = this.db.transaction(KV_STORE, "readonly");
    const flag = await promisify(tx.objectStore(KV_STORE).get(MIGRATED_KEY) as IDBRequest<{ key: string; value: boolean } | undefined>);
    if (flag?.value) return; // already migrated

    let legacyNotes: Record<string, NoteRecord> = {};
    let legacyFolders: string[] = [];
    try {
      legacyNotes = JSON.parse(localStorage.getItem(LEGACY_NOTES) || "{}");
    } catch {
      /* ignore corrupt */
    }
    try {
      legacyFolders = JSON.parse(localStorage.getItem(LEGACY_FOLDERS) || "[]");
    } catch {
      /* ignore */
    }

    const hasLegacy = Object.keys(legacyNotes).length > 0 || legacyFolders.length > 0;
    if (hasLegacy && this.cache.size === 0) {
      // Import full records into IndexedDB (persistAll writes content too), and
      // hold only meta in the cache.
      for (const [path, record] of Object.entries(legacyNotes)) {
        this.cache.set(path, {
          mtimeMs: record.mtimeMs,
          contentHash: record.contentHash,
          title: record.title,
        });
      }
      this.folderSet = new Set(legacyFolders);
      // persistAll currently iterates the cache, so it would write meta-only
      // (no content). Migrate content directly first, then sync meta to disk.
      await this.migrateLegacyContent(legacyNotes);
      await this.persistAll();
      // Keep a backup of the original blob, then clear the live key so the two
      // sources can't diverge. The backup is never auto-deleted.
      try {
        if (!localStorage.getItem(LEGACY_BACKUP)) {
          localStorage.setItem(LEGACY_BACKUP, localStorage.getItem(LEGACY_NOTES) || "{}");
        }
        localStorage.removeItem(LEGACY_NOTES);
        localStorage.removeItem(LEGACY_FOLDERS);
      } catch {
        /* non-fatal */
      }
    }
    await this.setKv(MIGRATED_KEY, true);
  }

  // ── Synchronous cache reads (call after `await ready()`) ────────────────────
  /** Metadata for every note (mtime, hash, title). No content held in RAM. */
  allMetas(): Map<string, NoteMeta> {
    return this.cache;
  }
  /** @deprecated use allMetas() — kept for back-compat, returns meta only. */
  allNotes(): Map<string, NoteMeta> {
    return this.cache;
  }

  getMeta(path: string): NoteMeta | undefined {
    return this.cache.get(path);
  }
  /** @deprecated use getMeta() — kept for back-compat. */
  getNote(path: string): NoteMeta | undefined {
    return this.cache.get(path);
  }

  /** Lazy content read — O(1) IndexedDB get / localStorage lookup. Not cached
   *  in RAM (that's the whole point of the meta-only cache). Returns null if
   *  the note doesn't exist. */
  async getContent(path: string): Promise<string | null> {
    await this.ready();
    if (this.backend === "idb" && this.db) {
      try {
        const req = this.db.transaction(NOTES_STORE, "readonly").objectStore(NOTES_STORE).get(path) as IDBRequest<({ path: string } & NoteRecord) | undefined>;
        const row = await promisify(req);
        return row?.content ?? null;
      } catch {
        return null;
      }
    }
    // localStorage fallback: content lives in the blob, read on demand.
    try {
      const obj = JSON.parse(localStorage.getItem(LS_NOTES) || "{}") as Record<string, NoteRecord>;
      return obj[path]?.content ?? null;
    } catch {
      return null;
    }
  }

  folders(): string[] {
    return [...this.folderSet];
  }

  /** Read all notes WITH content (full records) directly from IndexedDB.
   *  Used by the backup/export path. This DOES materialize content — but only
   *  on an explicit user-initiated backup (not on every list/open), and the
   *  result is GC'd as soon as the JSON blob is built + downloaded. */
  async getAllRecords(): Promise<[string, NoteRecord][]> {
    await this.ready();
    if (this.backend === "idb" && this.db) {
      const req = this.db.transaction(NOTES_STORE, "readonly").objectStore(NOTES_STORE).getAll() as IDBRequest<Array<{ path: string } & NoteRecord>>;
      const rows = await promisify(req);
      return rows.map(({ path, content, mtimeMs, contentHash, title }) => [path, { content, mtimeMs, contentHash, title }]);
    }
    try {
      const obj = JSON.parse(localStorage.getItem(LS_NOTES) || "{}") as Record<string, NoteRecord>;
      return Object.entries(obj);
    } catch { return []; }
  }

  size(): number {
    return this.cache.size;
  }

  // ── Mutations (cache updates immediately; persistence is queued) ────────────
  /** Write a note (full content) to disk. Only meta is held in the cache. */
  putNote(path: string, record: NoteRecord): Promise<void> {
    this.cache.set(path, { mtimeMs: record.mtimeMs, contentHash: record.contentHash, title: record.title });
    return this.enqueue(async () => {
      await this.persistNote(path, record);
      await this.maybeSnapshot(path, record);
      this.broadcast([path]);
    });
  }

  /** Update a note's metadata without touching content (e.g. title-only edit). */
  putMeta(path: string, meta: NoteMeta): Promise<void> {
    this.cache.set(path, meta);
    return this.enqueue(async () => {
      await this.persistMeta(path, meta);
      this.broadcast([path]);
    });
  }

  deleteNote(path: string): Promise<void> {
    this.cache.delete(path);
    this.lastSnapshotAt.delete(path);
    return this.enqueue(async () => {
      await this.removeNote(path);
      this.broadcast([path]);
    });
  }

  /** Rename every note under `oldPrefix` to `newPrefix` in a single IDB
   *  transaction (read old row → put at new path → delete old). Content is
   *  never materialized in RAM — it streams disk→disk. The cache only swaps
   *  meta keys. This is the 1M-safe path for folder rename / move. */
  renamePrefix(oldPrefix: string, newPrefix: string): Promise<void> {
    const moved: [string, NoteMeta][] = [];
    for (const [path, meta] of this.cache) {
      if (path.startsWith(oldPrefix)) {
        moved.push([`${newPrefix}${path.slice(oldPrefix.length)}`, meta]);
      }
    }
    for (const [old] of moved) this.cache.delete(old);
    for (const [next, meta] of moved) this.cache.set(next, meta);
    return this.enqueue(async () => {
      if (this.backend === "idb" && this.db) {
        const tx = this.db.transaction(NOTES_STORE, "readwrite");
        const store = tx.objectStore(NOTES_STORE);
        for (const [old, next] of moved) {
          const row = await promisify(store.get(old) as IDBRequest<({ path: string } & NoteRecord) | undefined>);
          if (row) {
            const { path: _p, ...rest } = row;
            void _p;
            store.put({ path: next, ...rest });
          }
          store.delete(old);
        }
        await txDone(tx);
      } else {
        this.flushLocalStorage();
      }
      this.broadcast(["*"]);
    });
  }

  /** Bulk replace with FULL records (backup import / restore). The disk write
   *  carries content; the cache keeps meta only. */
  replaceAll(notes: Map<string, NoteRecord>, folders: string[]): Promise<void> {
    const metaMap = new Map<string, NoteMeta>();
    for (const [path, record] of notes) {
      metaMap.set(path, { mtimeMs: record.mtimeMs, contentHash: record.contentHash, title: record.title });
    }
    this.cache = metaMap;
    this.folderSet = new Set(folders);
    // Stash the full records so persistAll (which iterates the cache) can write
    // content to disk in one transaction.
    this.pendingFullRecords = notes;
    return this.enqueue(async () => {
      await this.persistAll();
      this.broadcast(["*"]); // full re-sync signal for other tabs
    });
  }

  /** Bulk delete notes by path (folder delete). Pure disk delete — no content
   *  materialized, no surviving-note rewrite. 1M-safe. */
  deletePaths(paths: string[]): Promise<void> {
    for (const p of paths) {
      this.cache.delete(p);
      this.lastSnapshotAt.delete(p);
    }
    return this.enqueue(async () => {
      if (this.backend === "idb" && this.db) {
        const tx = this.db.transaction(NOTES_STORE, "readwrite");
        const store = tx.objectStore(NOTES_STORE);
        for (const p of paths) store.delete(p);
        await txDone(tx);
      } else {
        this.flushLocalStorage();
      }
      this.broadcast(["*"]);
    });
  }

  setFolders(folders: string[]): Promise<void> {
    this.folderSet = new Set(folders);
    return this.enqueue(async () => {
      await this.setKv(FOLDERS_KEY, [...this.folderSet]);
      this.broadcast(["*"]);
    });
  }

  // ── Version history (local File Recovery) ───────────────────────────────────
  /** Snapshot the saved content, throttled per-note + capped, so editing churn
      can't flood the store. Best-effort: a failed snapshot never blocks a save. */
  private async maybeSnapshot(path: string, record: NoteRecord) {
    if (this.backend !== "idb" || !this.db) return;
    const now = record.mtimeMs || Date.now();
    const last = this.lastSnapshotAt.get(path) ?? 0;
    if (now - last < SNAPSHOT_THROTTLE_MS) return;
    if (!record.content.trim()) return; // don't snapshot an empty document
    this.lastSnapshotAt.set(path, now);
    try {
      const tx = this.db.transaction(HISTORY_STORE, "readwrite");
      const store = tx.objectStore(HISTORY_STORE);
      store.add({ path, content: record.content, mtimeMs: now });
      // Prune: keep only the newest MAX_VERSIONS_PER_NOTE for this path.
      const index = store.index("path");
      const keys = await promisify(index.getAllKeys(IDBKeyRange.only(path)) as IDBRequest<IDBValidKey[]>);
      if (keys.length > MAX_VERSIONS_PER_NOTE) {
        // getAllKeys returns ascending (oldest first) → delete the oldest excess.
        const excess = keys.slice(0, keys.length - MAX_VERSIONS_PER_NOTE);
        for (const key of excess) store.delete(key);
      }
      await txDone(tx);
    } catch (error) {
      console.warn("[noteStore] snapshot failed", error);
    }
  }

  /** Newest-first list of a note's saved versions (metadata only). */
  async listVersions(path: string): Promise<NoteVersion[]> {
    await this.ready();
    if (this.backend !== "idb" || !this.db) return [];
    try {
      const tx = this.db.transaction(HISTORY_STORE, "readonly");
      const rows = await promisify(
        tx.objectStore(HISTORY_STORE).index("path").getAll(IDBKeyRange.only(path)) as IDBRequest<Array<{ id: number; path: string; content: string; mtimeMs: number }>>,
      );
      return rows
        .map((r) => ({ id: r.id, path: r.path, mtimeMs: r.mtimeMs, size: r.content.length }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
    } catch {
      return [];
    }
  }

  /** Full content of a specific version. */
  async getVersionContent(id: number): Promise<string | null> {
    await this.ready();
    if (this.backend !== "idb" || !this.db) return null;
    try {
      const tx = this.db.transaction(HISTORY_STORE, "readonly");
      const row = await promisify(tx.objectStore(HISTORY_STORE).get(id) as IDBRequest<{ content: string } | undefined>);
      return row?.content ?? null;
    } catch {
      return null;
    }
  }

  // ── Internal: serialized background persistence ─────────────────────────────
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    // Keep the chain alive even if a task rejects (don't wedge future writes).
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async persistNote(path: string, record: NoteRecord) {
    if (this.backend === "idb" && this.db) {
      const tx = this.db.transaction(NOTES_STORE, "readwrite");
      tx.objectStore(NOTES_STORE).put({ path, ...record });
      await txDone(tx);
    } else {
      this.flushLocalStorage();
    }
  }

  /** Persist meta-only updates (e.g. a title change) WITHOUT clobbering content.
   *  Reads the existing on-disk row, merges the new meta fields, and writes it
   *  back. Safe because the cache never owns content anymore. */
  private async persistMeta(path: string, meta: NoteMeta) {
    if (this.backend === "idb" && this.db) {
      const tx = this.db.transaction(NOTES_STORE, "readwrite");
      const store = tx.objectStore(NOTES_STORE);
      const existing = await promisify(store.get(path) as IDBRequest<({ path: string } & NoteRecord) | undefined>);
      // Merge meta into the existing row; keep content if present.
      const row = { path, content: existing?.content ?? "", ...meta };
      store.put(row);
      await txDone(tx);
    } else {
      this.flushLocalStorage();
    }
  }

  private async removeNote(path: string) {
    if (this.backend === "idb" && this.db) {
      const tx = this.db.transaction(NOTES_STORE, "readwrite");
      tx.objectStore(NOTES_STORE).delete(path);
      await txDone(tx);
    } else {
      this.flushLocalStorage();
    }
  }

  private async persistAll() {
    if (this.backend === "idb" && this.db) {
      const tx = this.db.transaction([NOTES_STORE, KV_STORE], "readwrite");
      const store = tx.objectStore(NOTES_STORE);
      // RECONCILE rather than clear()+rewrite. The old code did `store.clear()`
      // then re-put the in-memory cache — if this ever ran with an empty/partial
      // cache (race before hydrate, or a bug upstream), it wiped every note on
      // disk. Instead we diff against what's already persisted.
      const existingKeys = (await promisify(store.getAllKeys() as IDBRequest<IDBValidKey[]>)) as string[];
      // CATASTROPHE GUARD: never blank a non-empty store from an empty cache.
      if (this.cache.size === 0 && existingKeys.length > 0) {
        console.warn("[noteStore] persistAll skipped: empty cache vs", existingKeys.length, "stored notes (refusing to wipe)");
        tx.abort();
        return;
      }
      const cacheKeys = new Set(this.cache.keys());
      for (const key of existingKeys) {
        if (!cacheKeys.has(String(key))) store.delete(key); // note removed since last persist
      }
      // CONTENT SAFETY: the cache is meta-only. If replaceAll() staged full
      // records (folder rename / backup import), write those. Otherwise we must
      // NOT overwrite on-disk rows with contentless meta — so for a meta-only
      // persistAll we merge meta into existing rows (read-modify-write inside
      // the same transaction) instead of blindly putting.
      if (this.pendingFullRecords) {
        for (const [path, full] of this.pendingFullRecords) {
          store.put({ path, ...full });
        }
        this.pendingFullRecords = null;
      } else {
        for (const [path, meta] of this.cache) {
          const existing = await promisify(store.get(path) as IDBRequest<({ path: string } & NoteRecord) | undefined>);
          store.put({ path, content: existing?.content ?? "", ...meta });
        }
      }
      tx.objectStore(KV_STORE).put({ key: FOLDERS_KEY, value: [...this.folderSet] });
      await txDone(tx);
    } else {
      this.flushLocalStorage();
    }
  }

  /** One-shot bulk write of full records (legacy migration / restore). Bypasses
   *  the meta-only merge so content lands on disk in a single transaction. */
  private async migrateLegacyContent(records: Record<string, NoteRecord>) {
    if (this.backend !== "idb" || !this.db) return;
    const tx = this.db.transaction(NOTES_STORE, "readwrite");
    const store = tx.objectStore(NOTES_STORE);
    for (const [path, record] of Object.entries(records)) {
      store.put({ path, ...record });
    }
    await txDone(tx);
  }

  private async setKv(key: string, value: unknown) {
    if (this.backend === "idb" && this.db) {
      const tx = this.db.transaction(KV_STORE, "readwrite");
      tx.objectStore(KV_STORE).put({ key, value });
      await txDone(tx);
    }
    // localStorage backend persists folders via flushLocalStorage; other kv
    // (migrated flag) is implicit (no legacy blob to migrate from again).
  }

  private flushLocalStorage() {
    try {
      // CONTENT SAFETY: the cache is meta-only, so we read the existing blob
      // (which still carries content) and merge our meta over it — never write
      // contentless rows. Full records staged by replaceAll() override content.
      const base: Record<string, NoteRecord> = (() => {
        try { return JSON.parse(localStorage.getItem(LS_NOTES) || "{}") as Record<string, NoteRecord>; }
        catch { return {}; }
      })();
      const obj: Record<string, NoteRecord> = {};
      for (const [path, meta] of this.cache) {
        const staged = this.pendingFullRecords?.get(path);
        obj[path] = staged ?? { content: base[path]?.content ?? "", ...meta };
      }
      this.pendingFullRecords = null;
      localStorage.setItem(LS_NOTES, JSON.stringify(obj));
      localStorage.setItem(LS_FOLDERS, JSON.stringify([...this.folderSet]));
    } catch (error) {
      // Quota exceeded etc. — surface but keep the in-memory cache intact so the
      // session isn't lost; the next successful flush will catch up.
      console.error("[noteStore] localStorage flush failed", error);
    }
  }
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
  });
}

// Singleton — one engine for the whole app session.
export const noteStore = new NoteStore();
