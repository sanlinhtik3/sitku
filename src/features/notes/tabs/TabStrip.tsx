// Tab strip for the notes workspace — the scrollable row of open-note tabs
// (each with a per-tab dropdown + close button + right-click context menu) and
// the trailing "New…" dropdown (note / folder / open folder / command palette).
// Extracted verbatim from the host so behavior is byte-identical.
import { memo } from "react";
import {
  DocumentText,
  CloseSquare,
  SidebarMinimalistic,
  TrashBinTrash,
  SliderVertical,
  Copy,
  ShareCircle,
  PenNewRound,
  AddSquare,
  DocumentAdd,
  AddFolder,
  FolderWithFiles,
  Keyboard,
} from "@solar-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import type { NoteFile, VaultEntry } from "@/repositories/contracts/notes";

function titleFromPath(notePath: string) {
  return notePath.split("/").pop()?.replace(/\.md$/i, "") || notePath;
}

export interface TabActions {
  onOpen: (path: string) => void;
  onClose: (path: string) => void;
  onCloseOthers: (path: string) => void;
  onCloseAll: () => void;
  onSplit: (path: string, direction: "right" | "down") => void;
  onCopyPath: (entry: VaultEntry) => void;
  onRevealEntry: (entry: VaultEntry) => void;
  onRename: (entry: VaultEntry) => void;
}

export interface TabStripProps {
  tabs: NoteFile[];
  activePath: string | null;
  isDirty: boolean;
  actions: TabActions;
  // "New…" dropdown
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onOpenVault: () => void;
  onOpenCommandPalette: () => void;
  // Chrome
  showSidebar: boolean;
  fileManagerLabel: string;
  draggableRegion: CSSProperties;
  interactiveRegion: CSSProperties;
}

export const TabStrip = memo(function TabStrip({
  tabs,
  activePath,
  isDirty,
  actions,
  onCreateNote,
  onCreateFolder,
  onOpenVault,
  onOpenCommandPalette,
  showSidebar,
  fileManagerLabel,
  draggableRegion,
  interactiveRegion,
}: TabStripProps) {
  return (
    <div
      className="hidden md:flex flex-1 min-w-0 items-center overflow-hidden bg-transparent"
      style={{ ...draggableRegion, paddingLeft: showSidebar ? undefined : "calc(0.375rem + var(--titlebar-safe))" }}
    >
      <div className="flex-1 min-w-0 overflow-x-auto">
        <div className="flex min-w-max items-center gap-[6px] p-[2px]" style={interactiveRegion}>
          {tabs.map((note) => {
            const isActiveTab = activePath === note.path;
            const tabTitle = note.title || titleFromPath(note.path);
            const tabEntry: VaultEntry = { path: note.path, name: titleFromPath(note.path), kind: "note", depth: note.path.split("/").length - 1 };
            const dirty = isActiveTab && isDirty;
            return (
              <ContextMenu key={note.path}>
                <ContextMenuTrigger asChild>
                  <div
                    onMouseDown={(event) => {
                      if (event.button === 1) {
                        event.preventDefault();
                        actions.onClose(note.path);
                      }
                    }}
                    className={cn(
                      "group relative h-[34px] max-w-[220px] min-w-[132px] flex items-center gap-[6px] px-2.5 text-[12.5px] rounded-[12px] transition-all duration-[150ms] cursor-pointer tracking-[-0.01em]",
                      isActiveTab
                        ? "bg-[rgba(255,255,255,0.09)] text-[#f2f2f2] shadow-[0_1px_3px_rgba(0,0,0,0.35),_inset_0_0_0_0.5px_rgba(255,255,255,0.10)]"
                        : "text-[#9b9b9d] hover:bg-[rgba(255,255,255,0.045)] hover:text-[#ededed]",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 flex items-center gap-1.5 text-left border-none bg-transparent p-0 cursor-pointer text-inherit font-inherit"
                      onClick={() => actions.onOpen(note.path)}
                    >
                      <DocumentText className={cn("h-[14px] w-[14px] shrink-0", isActiveTab ? "text-[var(--beebot-accent)]" : "text-[#7a7a7c]")} />
                      <span className="truncate flex-1">{tabTitle}</span>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "tab-x h-[18px] w-[18px] shrink-0 rounded-full inline-flex items-center justify-center text-[#9b9b9d] transition-all duration-[140ms] hover:bg-[rgba(255,255,255,0.14)] hover:text-[#f2f2f2] hover:opacity-100 border-none cursor-pointer p-0",
                        dirty ? "opacity-100" : "opacity-0 group-hover:opacity-75"
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        actions.onClose(note.path);
                      }}
                      aria-label={`Close ${tabTitle}`}
                    >
                      {dirty ? (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-90 group-hover:hidden" />
                          <CloseSquare className="hidden h-[14px] w-[14px] group-hover:block" />
                        </>
                      ) : (
                        <CloseSquare className="h-[14px] w-[14px]" />
                      )}
                    </button>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-52">
                  <ContextMenuItem onClick={() => actions.onClose(note.path)}><CloseSquare className="mr-2 h-4 w-4" />Close</ContextMenuItem>
                  <ContextMenuItem onClick={() => actions.onCloseOthers(note.path)}><SidebarMinimalistic className="mr-2 h-4 w-4 transform rotate-180" />Close others</ContextMenuItem>
                  <ContextMenuItem onClick={actions.onCloseAll}><TrashBinTrash className="mr-2 h-4 w-4" />Close all</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => actions.onSplit(note.path, "right")}><SliderVertical className="mr-2 h-4 w-4" />Split right</ContextMenuItem>
                  <ContextMenuItem onClick={() => actions.onSplit(note.path, "down")}><SliderVertical className="mr-2 h-4 w-4 rotate-90" />Split down</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => actions.onCopyPath(tabEntry)}><Copy className="mr-2 h-4 w-4" />Copy path</ContextMenuItem>
                  <ContextMenuItem onClick={() => actions.onRevealEntry(tabEntry)}><ShareCircle className="mr-2 h-4 w-4" />Reveal in {fileManagerLabel}</ContextMenuItem>
                  <ContextMenuItem onClick={() => actions.onRename(tabEntry)}><PenNewRound className="mr-2 h-4 w-4" />Rename</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="New tab"
                className="h-[34px] w-[34px] shrink-0 rounded-[12px] bg-transparent text-[#9b9b9d] hover:bg-[#1a1a1c] hover:text-[#ededed] data-[state=open]:bg-[#1a1a1c] data-[state=open]:text-[#ededed] transition-colors duration-[140ms] flex items-center justify-center border-none cursor-pointer"
              >
                <AddSquare className="h-[17px] w-[17px] shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={onCreateNote}>
                <DocumentAdd className="mr-2 h-4 w-4" />
                New note
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCreateFolder}>
                <AddFolder className="mr-2 h-4 w-4" />
                New folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenVault}>
                <FolderWithFiles className="mr-2 h-4 w-4" />
                Open folder from device…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onOpenCommandPalette}>
                <Keyboard className="mr-2 h-4 w-4" />
                Command palette
                <span className="ml-auto text-[11px] tracking-widest text-[var(--bb-text-4)]">⌘P</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
});
