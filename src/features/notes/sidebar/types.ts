import type { RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { VaultEntry } from "@/repositories/contracts/notes";

// Cross-cutting CRUD / vault handlers. They live in the workspace host (they depend on the
// notes repo, navigation, dialogs, toast — shared with tabs/editor/breadcrumb) and travel to
// the tree as ONE stable object instead of a dozen separate props (avoids prop-drilling sprawl).
export interface SidebarActions {
  createNote: (folder?: string) => void;
  createFolder: (parent?: string) => void;
  duplicate: (entry: VaultEntry) => void;
  move: (entry: VaultEntry) => void;
  searchInFolder: (entry: VaultEntry) => void;
  toggleBookmark: (entry: VaultEntry) => void;
  openToSide: (entry: VaultEntry) => void;
  copyPath: (entry: VaultEntry) => void;
  reveal: (entry: VaultEntry) => void;
  rename: (entry: VaultEntry) => void;
  remove: (entry: VaultEntry) => void;
  openVault: () => void;
}

export interface NoteTreeProps {
  visibleEntries: VaultEntry[];
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  treeScrollRef: RefObject<HTMLDivElement>;
  isLoading: boolean;
  activePath: string | null;
  expandedFolders: Set<string>;
  highlightedTreePath: string | null;
  bookmarks: string[];
  noteContents: Record<string, string>;
  onToggleFolder: (path: string) => void;
  onOpenNote: (path: string) => void;
  onPrefetch: (path: string) => void;
  // Drag a row onto a folder → move it there ("" = repository root).
  onMoveEntry: (source: VaultEntry, targetFolder: string) => void;
  // Drag a note above/below another note in the same folder → reorder.
  onReorderEntry: (source: VaultEntry, targetPath: string, before: boolean) => void;
  actions: SidebarActions;
}
