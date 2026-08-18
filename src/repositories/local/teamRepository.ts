import type {
  TeamRepository,
  TeamRepositoryEnvelope,
  TeamWorkspaceState,
} from "@/repositories/contracts/team";

const DB_NAME = "sitku-team-os";
const DB_VERSION = 2;
const STORE = "workspace";
const ATTACHMENT_STORE = "attachments";
const RECORD_KEY = "primary";
const FALLBACK_KEY = "sitku.team-os.v2.fallback";

export function teamChecksum(state: TeamWorkspaceState): string {
  const input = JSON.stringify(state);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseEnvelope(payload: string | null): TeamRepositoryEnvelope | null {
  if (!payload) return null;
  const envelope = JSON.parse(payload) as TeamRepositoryEnvelope;
  if (envelope?.state?.schemaVersion !== 2) throw new Error("Unsupported Team OS backup version.");
  if (teamChecksum(envelope.state) !== envelope.checksum) throw new Error("Team OS backup checksum mismatch.");
  return envelope;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      if (!request.result.objectStoreNames.contains(ATTACHMENT_STORE)) request.result.createObjectStore(ATTACHMENT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Team OS database open blocked"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Team OS transaction aborted"));
  });
}

class BrowserTeamRepository implements TeamRepository {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db() {
    if (!this.dbPromise) this.dbPromise = openDb();
    return this.dbPromise;
  }

  async load(): Promise<TeamRepositoryEnvelope | null> {
    try {
      const db = await this.db();
      const transaction = db.transaction(STORE, "readonly");
      const value = await requestResult(transaction.objectStore(STORE).get(RECORD_KEY));
      await transactionDone(transaction);
      return value ? parseEnvelope(JSON.stringify(value)) : null;
    } catch (error) {
      console.warn("[teamRepository] IndexedDB load failed; using recovery fallback", error);
      return parseEnvelope(localStorage.getItem(FALLBACK_KEY));
    }
  }

  async save(state: TeamWorkspaceState, expectedRevision: number): Promise<TeamRepositoryEnvelope> {
    const envelope: TeamRepositoryEnvelope = {
      revision: expectedRevision + 1,
      checksum: teamChecksum(state),
      updatedAt: new Date().toISOString(),
      state,
    };
    try {
      const db = await this.db();
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      const current = await requestResult(store.get(RECORD_KEY)) as TeamRepositoryEnvelope | undefined;
      if ((current?.revision || 0) !== expectedRevision) {
        transaction.abort();
        throw new Error("Team OS data changed outside this window. Reload before saving.");
      }
      store.put(envelope, RECORD_KEY);
      await transactionDone(transaction);
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(envelope));
      return envelope;
    } catch (error) {
      if (error instanceof Error && error.message.includes("outside this window")) throw error;
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(envelope));
      console.warn("[teamRepository] IndexedDB save failed; recovery fallback updated", error);
      return envelope;
    }
  }

  async exportBackup(): Promise<string> {
    const envelope = await this.load();
    if (!envelope) throw new Error("No Team OS data is available to export.");
    return JSON.stringify({ format: "sitku-team-os", exportedAt: new Date().toISOString(), ...envelope }, null, 2);
  }

  async importBackup(payload: string): Promise<TeamRepositoryEnvelope> {
    const parsed = JSON.parse(payload) as TeamRepositoryEnvelope & { format?: string };
    if (parsed.format && parsed.format !== "sitku-team-os") throw new Error("This is not a Sitku Team OS backup.");
    if (!parsed.state || teamChecksum(parsed.state) !== parsed.checksum) throw new Error("Team OS backup checksum mismatch.");
    const current = await this.load();
    return this.save(parsed.state, current?.revision || 0);
  }

  async putAttachment(input: { id: string; name: string; mediaType: string; data: ArrayBuffer }) {
    const db = await this.db();
    const transaction = db.transaction(ATTACHMENT_STORE, "readwrite");
    transaction.objectStore(ATTACHMENT_STORE).put({
      name: input.name,
      mediaType: input.mediaType,
      data: new Blob([input.data], { type: input.mediaType }),
    }, input.id);
    await transactionDone(transaction);
    return { storageKey: input.id, size: input.data.byteLength };
  }

  async getAttachment(storageKey: string): Promise<ArrayBuffer | null> {
    const db = await this.db();
    const transaction = db.transaction(ATTACHMENT_STORE, "readonly");
    const record = await requestResult(transaction.objectStore(ATTACHMENT_STORE).get(storageKey)) as { data?: Blob } | undefined;
    await transactionDone(transaction);
    return record?.data ? record.data.arrayBuffer() : null;
  }

  async deleteAttachment(storageKey: string) {
    const db = await this.db();
    const transaction = db.transaction(ATTACHMENT_STORE, "readwrite");
    transaction.objectStore(ATTACHMENT_STORE).delete(storageKey);
    await transactionDone(transaction);
  }
}

class DesktopTeamRepository implements TeamRepository {
  constructor(private readonly api: TeamRepository) {}
  load() { return this.api.load(); }
  save(state: TeamWorkspaceState, expectedRevision: number) { return this.api.save(state, expectedRevision); }
  exportBackup() { return this.api.exportBackup(); }
  importBackup(payload: string) { return this.api.importBackup(payload); }
  putAttachment(input: { id: string; name: string; mediaType: string; data: ArrayBuffer }) { return this.api.putAttachment(input); }
  getAttachment(storageKey: string) { return this.api.getAttachment(storageKey); }
  deleteAttachment(storageKey: string) { return this.api.deleteAttachment(storageKey); }
}

export function createTeamRepository(): TeamRepository {
  const desktop = typeof window !== "undefined" ? window.beebotLocalRuntime?.team : undefined;
  return desktop ? new DesktopTeamRepository(desktop) : new BrowserTeamRepository();
}
