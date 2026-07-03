import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { VaultEntry } from "@/repositories/contracts/notes";

interface UseNoteTreeArgs {
  entryList: VaultEntry[];
  activePath: string | null;
  isSearching: boolean;
  visibleNotes: { path: string }[];
  setSidebarOpen: (open: boolean) => void;
}

// Owns the note tree's self-contained view state, extracted verbatim from the workspace host.
// NOTE: `noteContents` deliberately stays in the host — it's a shared prefetch cache also read by
// the backlinks/graph features, not tree-only. The host instantiates this hook (not <Sidebar/>),
// because `revealFolderInTree` is also driven by the breadcrumb.
export function useNoteTree({ entryList, activePath, isSearching, visibleNotes, setSidebarOpen }: UseNoteTreeArgs) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [highlightedTreePath, setHighlightedTreePath] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treeScrollRef = useRef<HTMLDivElement | null>(null);

  const visibleEntries = useMemo(() => {
    // While searching, surface matching notes plus the folders on their path.
    if (isSearching) {
      const resultPaths = new Set(visibleNotes.map((note) => note.path));
      return entryList.filter((entry) => {
        if (entry.kind === "note") return resultPaths.has(entry.path);
        return [...resultPaths].some((notePath) => notePath.startsWith(`${entry.path}/`));
      });
    }
    // Otherwise show an entry only when every ancestor folder is expanded.
    return entryList.filter((entry) => {
      const parts = entry.path.split("/");
      parts.pop();
      let prefix = "";
      for (const part of parts) {
        prefix = prefix ? `${prefix}/${part}` : part;
        if (!expandedFolders.has(prefix)) return false;
      }
      return true;
    });
  }, [entryList, expandedFolders, isSearching, visibleNotes]);

  const toggleFolder = useCallback((folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  }, []);

  const collapseAllFolders = useCallback(() => setExpandedFolders(new Set()), []);

  const expandAllFolders = useCallback(() => {
    setExpandedFolders(new Set(entryList.filter((entry) => entry.kind === "folder").map((entry) => entry.path)));
  }, [entryList]);

  // Reveal the active note in the tree by expanding all of its ancestor folders.
  useEffect(() => {
    if (!activePath) return;
    const parts = activePath.split("/");
    parts.pop();
    if (!parts.length) return;
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      let prefix = "";
      for (const part of parts) {
        prefix = prefix ? `${prefix}/${part}` : part;
        next.add(prefix);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [activePath]);

  // Reveal a folder in the sidebar tree: expand its ancestors, scroll to it, flash a highlight.
  const revealFolderInTree = useCallback((folderPath: string) => {
    if (!folderPath) return;
    setSidebarOpen(true);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      let prefix = "";
      for (const part of folderPath.split("/")) {
        prefix = prefix ? `${prefix}/${part}` : part;
        next.add(prefix);
      }
      return next;
    });
    // Setting highlightedTreePath drives the scroll: the effect below calls
    // rowVirtualizer.scrollToIndex (virtualization-aware).
    setHighlightedTreePath(folderPath);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedTreePath(null), 1200);
  }, [setSidebarOpen]);

  // Virtualize the file tree so vaults with thousands of notes stay smooth.
  const rowVirtualizer = useVirtualizer({
    count: visibleEntries.length,
    getScrollElement: () => treeScrollRef.current,
    estimateSize: () => 38,
    overscan: 14,
  });

  // When a folder is revealed (e.g. from a breadcrumb), scroll the virtual list to it.
  useEffect(() => {
    if (!highlightedTreePath) return;
    const index = visibleEntries.findIndex((entry) => entry.path === highlightedTreePath);
    if (index >= 0) rowVirtualizer.scrollToIndex(index, { align: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedTreePath, visibleEntries]);

  return {
    visibleEntries,
    expandedFolders,
    toggleFolder,
    expandAllFolders,
    collapseAllFolders,
    treeScrollRef,
    rowVirtualizer,
    highlightedTreePath,
    revealFolderInTree,
  };
}
