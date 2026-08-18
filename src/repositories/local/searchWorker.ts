/// <reference lib="webworker" />
// Off-main-thread note search index. Keeps a lowercased index in worker memory
// so per-keystroke queries never block the UI thread (and never re-hash notes).

import {
  buildSearchIndex,
  getAllTagsFromIndex,
  getGraphDataFromIndex,
  getNoteAstFromIndex,
  patchSearchIndex,
  querySearchIndex,
  type SearchIndexDoc,
} from "./searchIndex";

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

interface PatchMessage {
  kind: "patch";
  id: number;
  upserts: { path: string; title: string; content: string }[];
  removedPaths: string[];
}

interface GetAstMessage {
  kind: "get_ast";
  id: number;
  path: string;
}

interface GetGraphMessage {
  kind: "get_graph";
  id: number;
}

interface GetAllTagsMessage {
  kind: "get_all_tags";
  id: number;
}

type InMessage = SyncMessage | PatchMessage | QueryMessage | GetAstMessage | GetGraphMessage | GetAllTagsMessage;

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let index: SearchIndexDoc[] = [];

ctx.onmessage = (event: MessageEvent<InMessage>) => {
  const msg = event.data;

  if (msg.kind === "sync") {
    index = buildSearchIndex(msg.notes);
    ctx.postMessage({ id: msg.id, ok: true, count: index.length });
    return;
  }

  if (msg.kind === "patch") {
    index = patchSearchIndex(index, msg.upserts, msg.removedPaths);
    ctx.postMessage({ id: msg.id, ok: true, count: index.length });
    return;
  }

  if (msg.kind === "query") {
    const q = String(msg.q || "").toLowerCase().trim();
    const limit = msg.limit || 40;
    ctx.postMessage({ id: msg.id, results: querySearchIndex(index, q, limit) });
    return;
  }

  if (msg.kind === "get_ast") {
    ctx.postMessage({ id: msg.id, ast: getNoteAstFromIndex(index, msg.path) });
    return;
  }

  if (msg.kind === "get_graph") {
    ctx.postMessage({ id: msg.id, graph: getGraphDataFromIndex(index) });
    return;
  }

  if (msg.kind === "get_all_tags") {
    ctx.postMessage({ id: msg.id, tags: getAllTagsFromIndex(index) });
    return;
  }
};

export {};
