/// <reference lib="webworker" />
// Off-main-thread note search index. Keeps a lowercased index in worker memory
// so per-keystroke queries never block the UI thread (and never re-hash notes).

interface IndexDoc {
  path: string;
  title: string;
  content: string;
  titleLower: string;
  contentLower: string;
}

interface SyncMessage {
  kind: "sync";
  id: number;
  notes: { path: string; title: string; content: string }[];
}

interface QueryMessage {
  kind: "query";
  id: number;
  q: string;
  limit: number;
}

type InMessage = SyncMessage | QueryMessage;

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let index: IndexDoc[] = [];

ctx.onmessage = (event: MessageEvent<InMessage>) => {
  const msg = event.data;

  if (msg.kind === "sync") {
    index = msg.notes.map((note) => ({
      path: note.path,
      title: note.title,
      content: note.content,
      titleLower: note.title.toLowerCase(),
      contentLower: note.content.toLowerCase(),
    }));
    ctx.postMessage({ id: msg.id, ok: true, count: index.length });
    return;
  }

  if (msg.kind === "query") {
    const q = String(msg.q || "").toLowerCase().trim();
    const limit = msg.limit || 40;
    const results: { id: string; source: "note"; title: string; path: string; snippet: string; score: number }[] = [];
    if (q) {
      for (const doc of index) {
        const inTitle = doc.titleLower.includes(q);
        const matchIndex = doc.contentLower.indexOf(q);
        if (!inTitle && matchIndex < 0) continue;
        const start = matchIndex >= 0 ? Math.max(0, matchIndex - 40) : 0;
        results.push({
          id: `note:${doc.path}`,
          source: "note",
          title: doc.title,
          path: doc.path,
          snippet: doc.content.slice(start, start + 180),
          score: inTitle ? 2 : 1,
        });
        if (results.length >= limit * 4) break;
      }
      results.sort((a, b) => b.score - a.score);
    }
    ctx.postMessage({ id: msg.id, results: results.slice(0, limit) });
    return;
  }
};

export {};
