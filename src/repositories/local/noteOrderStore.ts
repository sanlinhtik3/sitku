import type { VaultEntry } from "@/repositories/contracts/notes";

// Per-entry ordering weight, persisted, so the tree order survives content edits AND
// renames. Two sources of weight:
//   • backfill (first sight): the entry's own mtimeMs — monotonic per entry, so a newer
//     entry lands below older ones (newest = largest = bottom). NOT a shared Date.now()
//     (that tied every unseen note in one list pass and let names decide the order).
//   • drag-reorder: setOrder() rewrites a folder's entries to sequential weights.
//
// ponytail: localStorage map keyed by path. Path is mutable (title-sync renames), so
// rename() migrates the weight. Weight only ranks entries WITHIN a folder (the tree sort
// key groups by folder first), so per-folder sequential weights never collide across folders.

const KEY = "beebot.note-order";
type OrderMap = Record<string, number>;

function read(): OrderMap {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function write(map: OrderMap): void {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* quota — order is best-effort */ }
}

export const noteOrder = {
  // Backfill unseen entries with their own mtimeMs; return the full weight map.
  assign(entries: { path: string; mtimeMs: number }[]): OrderMap {
    const map = read();
    let changed = false;
    for (const { path, mtimeMs } of entries) {
      if (map[path] === undefined) { map[path] = mtimeMs; changed = true; }
    }
    if (changed) write(map);
    return map;
  },
  get(path: string): number | undefined {
    return read()[path];
  },
  // Reorder: rewrite the given sibling paths to sequential weights in array order.
  // Tiny integers sort before mtime weights, so a freshly-created entry (mtime weight)
  // still appends below a folder that's been hand-ordered — until the next reorder.
  setOrder(paths: string[]): void {
    const map = read();
    paths.forEach((path, i) => { map[path] = i; });
    write(map);
  },
  // Carry an entry's weight across a rename so it keeps its position.
  rename(oldPath: string, newPath: string): void {
    const map = read();
    if (map[oldPath] === undefined) return;
    map[newPath] = map[oldPath];
    delete map[oldPath];
    write(map);
  },
};

// Shared tree ordering for ALL backends (IndexedDB and Electron disk runtime).
// Composite DFS key: folder segments rank by name/weight (folders before notes via "0"/"1");
// every node ranks by its persisted weight (mtime backfill -> newest at bottom; drag-reorder rewrites it).
export function sortVaultEntries(entries: VaultEntry[]): VaultEntry[] {
  const now = Date.now();
  const weights = noteOrder.assign(entries.map((e) => ({ path: e.path, mtimeMs: e.mtimeMs || now })));
  const key = (e: VaultEntry) => {
    let cur = "";
    return e.path.split("/").map((seg, i, arr) => {
      cur = cur ? `${cur}/${seg}` : seg;
      const isLeaf = i === arr.length - 1;
      const kind = isLeaf && e.kind === "note" ? "1" : "0";
      return kind + String(weights[cur] ?? 0).padStart(16, "0") + seg.toLowerCase();
    }).join(" ");
  };
  return entries.map((e) => ({ e, k: key(e) })).sort((a, b) => a.k.localeCompare(b.k)).map((x) => x.e);
}
