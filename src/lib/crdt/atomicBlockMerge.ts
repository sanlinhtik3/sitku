import * as Y from "yjs";

/**
 * Pillar 2: "Notion's Shield" — Yjs CRDT & Atomic Block Sync Engine.
 *
 * Uses Yjs (Conflict-Free Replicated Data Type) to atomically merge concurrent edits
 * across multiple tabs, offline sessions, or background syncs without data loss or conflicts.
 */

export function atomicBlockMerge(base: string, local: string, remote: string): string {
  if (local === remote) return local;
  if (local === base) return remote; // Local didn't touch it, take remote
  if (remote === base) return local; // Remote didn't touch it, take local

  try {
    return yjsAtomicMerge(base, local, remote);
  } catch (error) {
    console.warn("[CRDT] Yjs merge fallback", error);
    return fallbackBlockMerge(base, local, remote);
  }
}

/**
 * True Yjs CRDT 3-way merge using mathematical State Vectors & Updates.
 */
function yjsAtomicMerge(base: string, local: string, remote: string): string {
  // 1. Create a base Y.Doc representing the common ancestor
  const docBase = new Y.Doc();
  const textBase = docBase.getText("content");
  if (base) textBase.insert(0, base);

  // 2. Clone into two separate documents representing Local and Remote branches
  const docLocal = new Y.Doc();
  Y.applyUpdate(docLocal, Y.encodeStateAsUpdate(docBase));
  const textLocal = docLocal.getText("content");

  const docRemote = new Y.Doc();
  Y.applyUpdate(docRemote, Y.encodeStateAsUpdate(docBase));
  const textRemote = docRemote.getText("content");

  // 3. Apply changes from base -> local using atomic string diff
  applyStringDiffToYText(textLocal, base, local);

  // 4. Apply changes from base -> remote using atomic string diff
  applyStringDiffToYText(textRemote, base, remote);

  // 5. Merge Remote's CRDT update into Local's document!
  // Yjs mathematically converges insertions and deletions without conflicts.
  const remoteUpdate = Y.encodeStateAsUpdate(docRemote);
  Y.applyUpdate(docLocal, remoteUpdate);

  return textLocal.toString();
}

/**
 * Computes a character/word-level diff between `oldText` and `newText`
 * and applies it as atomic Yjs operations onto `ytext`.
 */
function applyStringDiffToYText(ytext: Y.Text, oldText: string, newText: string) {
  if (oldText === newText) return;

  // Find common prefix length
  let prefix = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (prefix < minLen && oldText[prefix] === newText[prefix]) {
    prefix++;
  }

  // Find common suffix length
  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }

  const delLen = oldText.length - prefix - suffix;
  const insertText = newText.slice(prefix, newText.length - suffix);

  docTransact(ytext.doc, () => {
    if (delLen > 0) {
      ytext.delete(prefix, delLen);
    }
    if (insertText.length > 0) {
      ytext.insert(prefix, insertText);
    }
  });
}

function docTransact(doc: Y.Doc | null, fn: () => void) {
  if (doc) doc.transact(fn);
  else fn();
}

/**
 * Fallback Block & Line-level 3-way merge in case of CRDT init errors.
 */
function fallbackBlockMerge(base: string, local: string, remote: string): string {
  const baseBlocks = splitBlocks(base);
  const localBlocks = splitBlocks(local);
  const remoteBlocks = splitBlocks(remote);

  const maxLen = Math.max(baseBlocks.length, localBlocks.length, remoteBlocks.length);
  const mergedBlocks: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const b = baseBlocks[i] ?? "";
    const l = localBlocks[i] ?? "";
    const r = remoteBlocks[i] ?? "";

    if (l === r) {
      if (l !== "") mergedBlocks.push(l);
      continue;
    }
    if (l === b) {
      if (r !== "") mergedBlocks.push(r);
      continue;
    }
    if (r === b) {
      if (l !== "") mergedBlocks.push(l);
      continue;
    }

    const mergedBlock = mergeLines(b, l, r);
    if (mergedBlock !== "") mergedBlocks.push(mergedBlock);
  }

  return mergedBlocks.join("\n\n");
}

function splitBlocks(text: string): string[] {
  return text.split(/\r?\n\r?\n/).map((b) => b.trim()).filter((b) => b.length > 0);
}

function mergeLines(base: string, local: string, remote: string): string {
  const baseLines = base.split(/\r?\n/);
  const localLines = local.split(/\r?\n/);
  const remoteLines = remote.split(/\r?\n/);

  const maxLen = Math.max(baseLines.length, localLines.length, remoteLines.length);
  const outLines: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const b = baseLines[i] ?? "";
    const l = localLines[i] ?? "";
    const r = remoteLines[i] ?? "";

    if (l === r) {
      if (l !== "") outLines.push(l);
    } else if (l === b) {
      if (r !== "") outLines.push(r);
    } else if (r === b) {
      if (l !== "") outLines.push(l);
    } else {
      if (l !== "") outLines.push(l);
      if (r !== "" && r !== l) outLines.push(r);
    }
  }

  return outLines.join("\n");
}
