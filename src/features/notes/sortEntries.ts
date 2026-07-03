import type { VaultEntry } from "@/repositories/contracts/notes";
import { noteOrder } from "@/repositories/local/noteOrderStore";

// Tree ordering lives in the RENDERER (not a backend) so it works for EVERY backend —
// IndexedDB and the Electron disk runtime alike. Composite DFS key: folder segments rank
// by name (folders before notes via the "0"/"1" prefix); a note leaf ranks by its
// persisted weight (mtime backfill → newest at bottom; drag-reorder rewrites it).
export function sortVaultEntries(entries: VaultEntry[]): VaultEntry[] {
  const weights = noteOrder.assign(
    entries.filter((e) => e.kind === "note").map((e) => ({ path: e.path, mtimeMs: e.mtimeMs ?? 0 })),
  );
  const key = (e: VaultEntry) =>
    e.path.split("/").map((seg, i, arr) =>
      i === arr.length - 1 && e.kind === "note"
        ? "1" + String(weights[e.path] ?? 0).padStart(16, "0") + seg.toLowerCase()
        : "0" + seg.toLowerCase(),
    ).join(" ");
  return entries.map((e) => ({ e, k: key(e) })).sort((a, b) => a.k.localeCompare(b.k)).map((x) => x.e);
}
