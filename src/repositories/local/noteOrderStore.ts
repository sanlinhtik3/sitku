// Per-note ordering weight, persisted, so the tree order survives content edits AND
// the title→filename rename. Two sources of weight:
//   • backfill (first sight): the note's own mtimeMs — monotonic per note, so a newer
//     note lands below older ones (newest = largest = bottom). NOT a shared Date.now()
//     (that tied every unseen note in one list pass and let names decide the order).
//   • drag-reorder: setOrder() rewrites a folder's notes to sequential weights.
//
// ponytail: localStorage map keyed by path. Path is mutable (title-sync renames), so
// rename() migrates the weight. Weight only ranks notes WITHIN a folder (the tree sort
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
  // Backfill unseen notes with their own mtimeMs; return the full weight map.
  assign(notes: { path: string; mtimeMs: number }[]): OrderMap {
    const map = read();
    let changed = false;
    for (const { path, mtimeMs } of notes) {
      if (map[path] === undefined) { map[path] = mtimeMs; changed = true; }
    }
    if (changed) write(map);
    return map;
  },
  get(path: string): number | undefined {
    return read()[path];
  },
  // Reorder: rewrite the given sibling paths to sequential weights in array order.
  // Tiny integers sort before mtime weights, so a freshly-created note (mtime weight)
  // still appends below a folder that's been hand-ordered — until the next reorder.
  setOrder(paths: string[]): void {
    const map = read();
    paths.forEach((path, i) => { map[path] = i; });
    write(map);
  },
  // Carry a note's weight across a rename so it keeps its position.
  rename(oldPath: string, newPath: string): void {
    const map = read();
    if (map[oldPath] === undefined) return;
    map[newPath] = map[oldPath];
    delete map[oldPath];
    write(map);
  },
};
