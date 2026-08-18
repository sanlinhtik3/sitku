import React from "react";
import { cn } from "@/lib/utils";
import { Settings as SolarSettings } from "@solar-icons/react";
import { SidebarHeader } from "@/features/notes/sidebar/SidebarHeader";
import { AppNav } from "@/features/notes/sidebar/AppNav";
import { BookmarksSection } from "@/features/notes/sidebar/BookmarksSection";
import { NoteTree } from "@/features/notes/sidebar/NoteTree";
import { useWorkspace } from "./WorkspaceContext";
import { MicroErrorBoundary } from "@/components/MicroErrorBoundary";

export function SidebarNavigation() {
  const {
    showSidebar,
    isMobile,
    resizing,
    sidebarWidth,
    isDesktopShell,
    draggableRegion,
    activeVault,
    recentVaults,
    isVaultBusy,
    openSearchModal,
    handleOpenVault,
    setCreateVaultOpen,
    handleRevealVault,
    handleSwitchVault,
    handleForgetVault,
    openConsultant,
    openCfo,
    activeRoom,
    needsReopenFolder,
    handleReopenFolder,
    bookmarkEntries,
    openNotePath,
    revealFolderInTree,
    handleToggleBookmark,
    visibleEntries,
    rowVirtualizer,
    treeScrollRef,
    isLoading,
    activePath,
    expandedFolders,
    highlightedTreePath,
    bookmarks,
    noteContents,
    toggleFolder,
    prefetchNote,
    moveEntryViaDnd,
    reorderEntry,
    sidebarActions,
    setSettingsOpen,
    settingsOpen,
    setMobileView,
  } = useWorkspace();

  return (
    <aside
      className={cn(
        "bb-glass shrink-0 flex-col min-h-0 overflow-hidden",
        showSidebar ? "flex" : "hidden",
        isMobile
          ? "w-full flex-1 m-0 rounded-none border-0"
          : isDesktopShell
            ? "m-0 rounded-none border-solid shadow-none"
            : "m-[10px_0_10px_10px] rounded-[18px] border-solid shadow-[0_18px_50px_-16px_rgba(0,0,0,0.6)]",
        !isMobile && resizing !== "sidebar" ? "transition-[width] duration-200 ease-out" : "",
      )}
      style={{
        ...(!isMobile ? { width: sidebarWidth } : {}),
        backgroundColor: "var(--bb-sidebar-bg, var(--bb-glass-surface))",
        color: "var(--bb-sidebar-text, var(--bb-text-1))",
        borderColor: "var(--bb-sidebar-border, var(--bb-glass-border))",
        ...(!isMobile ? isDesktopShell ? {
          borderTopWidth: 0,
          borderRightWidth: "var(--bb-sb-border-right, 0.5px)",
          borderBottomWidth: 0,
          borderLeftWidth: 0,
          borderRadius: 0,
          boxShadow: "none",
        } : {
          borderTopWidth: "var(--bb-sb-border-top, 0.5px)",
          borderRightWidth: "var(--bb-sb-border-right, 0.5px)",
          borderBottomWidth: "var(--bb-sb-border-bottom, 0.5px)",
          borderLeftWidth: "var(--bb-sb-border-left, 0.5px)",
          borderRadius: "var(--bb-radius-panel, 18px)",
          boxShadow: "var(--bb-shadow-panel, 0 18px 50px -16px rgba(0,0,0,.6))",
        } : {}),
        ...(isMobile ? { viewTransitionName: "bb-mobile-scene" } : {}),
      }}
    >
      <SidebarHeader
        isMobile={isMobile}
        isDesktopShell={isDesktopShell}
        draggableRegion={draggableRegion}
        activeVault={activeVault}
        recentVaults={recentVaults}
        isVaultBusy={isVaultBusy}
        onSearch={openSearchModal}
        onOpenVault={handleOpenVault}
        onCreateVault={() => setCreateVaultOpen(true)}
        onRevealVault={handleRevealVault}
        onSwitchVault={handleSwitchVault}
        onForgetVault={handleForgetVault}
        onHome={() => setMobileView("home")}
      />

      <AppNav onOpenConsultant={openConsultant} onOpenCfo={openCfo} activeRoom={activeRoom} />

      {needsReopenFolder && (
        <div className="px-2.5 pb-2">
          <button
            onClick={handleReopenFolder}
            className="w-full rounded-md border border-[var(--bb-border)] bg-[var(--bb-bg-1)] px-3 py-2 text-left transition-colors hover:bg-[var(--bb-bg-3)]"
          >
            <span className="block text-[11px] font-semibold text-[var(--beebot-accent)]">Reopen vault folder</span>
            <span className="block text-[11px] text-[var(--bb-text-3)]">Grant access again to continue editing on disk.</span>
          </button>
        </div>
      )}
      <BookmarksSection
        entries={bookmarkEntries}
        onOpenNote={openNotePath}
        onRevealFolder={revealFolderInTree}
        onToggleBookmark={handleToggleBookmark}
      />
      <MicroErrorBoundary name="File Tree" resetKeys={[activeVault, activePath]}>
        <NoteTree
          visibleEntries={visibleEntries}
          rowVirtualizer={rowVirtualizer}
          treeScrollRef={treeScrollRef}
          isLoading={isLoading}
          activePath={activePath}
          expandedFolders={expandedFolders}
          highlightedTreePath={highlightedTreePath}
          bookmarks={bookmarks}
          noteContents={noteContents}
          onToggleFolder={toggleFolder}
          onOpenNote={openNotePath}
          onPrefetch={prefetchNote}
          onMoveEntry={moveEntryViaDnd}
          onReorderEntry={reorderEntry}
          actions={sidebarActions}
        />
      </MicroErrorBoundary>

      {/* Sidebar footer — Settings, pinned to the bottom. */}
      <div className="mt-auto shrink-0 px-3 pb-3 pt-2">
        <button
          type="button"
          title="Settings"
          onClick={() => setSettingsOpen(true)}
          className={cn(
            "group flex min-h-10 w-full items-center gap-3 rounded-[var(--bb-radius-control,10px)] px-2 py-2 text-left text-[13.5px] text-[var(--bb-sidebar-text,var(--bb-text-2))] transition-colors duration-[130ms] hover:bg-[var(--bb-sidebar-hover,var(--bb-bg-3))] hover:text-[var(--bb-text-1)]",
            settingsOpen && "bg-[var(--bb-sidebar-hover,var(--bb-bg-3))] text-[var(--bb-text-1)]"
          )}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--bb-text-3)] transition-colors duration-[130ms] group-hover:text-[var(--beebot-accent)]">
            <SolarSettings className="h-[18px] w-[18px]" />
          </span>
          <span className="truncate">Settings</span>
        </button>
      </div>
    </aside>
  );
}
