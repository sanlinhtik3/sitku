// Pasted/dropped files (images, PDFs, …) live here as blobs in IndexedDB,
// referenced from markdown as `![name](attachment:<id>)`. The reader resolves
// the id to an object URL at render time. Keeps note text short + readable
// instead of inlining megabyte data: URLs.
//
// ponytail: IndexedDB-only — attachments don't travel with the on-disk .md in
// the Electron build (separate stores). Add a runtime writeAttachment IPC that
// drops files into an `attachments/` folder if portability with the files matters.

const DB_NAME = "beebot-attachments";
const STORE = "files";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

interface StoredAttachment {
  blob: Blob;
  name: string;
  type: string;
}

export async function saveAttachment(file: File | Blob, name = ""): Promise<string> {
  // ponytail: id varies per call by index in the paste loop, so two files pasted
  // in the same millisecond still get distinct ids.
  const id = `${Date.now().toString(36)}-${Math.round(performance.now() * 1000).toString(36)}`;
  const record: StoredAttachment = { blob: file, name, type: file.type || "application/octet-stream" };
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return id;
}

// Object URLs are cached for the session — one per distinct viewed attachment.
// ponytail: not revoked (bounded by attachments-viewed-this-session); revoke on
// note close if a long session with many large files shows memory pressure.
const urlCache = new Map<string, string>();

export async function getAttachment(id: string): Promise<{ url: string; type: string; name: string } | null> {
  const cached = urlCache.get(id);
  const db = await open();
  const record = await new Promise<StoredAttachment | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredAttachment | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!record) return null;
  const url = cached ?? URL.createObjectURL(record.blob);
  urlCache.set(id, url);
  return { url, type: record.type, name: record.name };
}
