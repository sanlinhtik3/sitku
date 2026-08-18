/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { Suspense, lazy, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { ChatRoundLine, MagicStick3 } from "@solar-icons/react";
import { Home } from "lucide-react";
import { TabStrip } from "@/features/notes/tabs/TabStrip";
import { ChromeCluster } from "@/features/notes/chrome/ChromeCluster";
import { LiveMarkdownEditor } from "@/components/editor/LiveMarkdownEditor";
import { NoteReader } from "@/components/editor/NoteReader";
import type { MarkdownCommand } from "@/components/editor/cm/types";
import { MicroErrorBoundary } from "@/components/MicroErrorBoundary";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useEditorWorkspace } from "./WorkspaceContext";

const BeeBotChatView = lazy(() =>
  import("@/components/agent-chat/BeeBotChatView").then((m) => ({
    default: m.BeeBotChatView,
  })),
);

const SignalsPanel = lazy(() =>
  import("@/features/content-signals/SignalsPanel").then((m) => ({
    default: m.SignalsPanel,
  })),
);

export function NoteEditorPanel() {
  const {
    showMainContent,
    isMobile,
    isDesktopShell,
    draggableRegion,
    openTabNotes,
    activePath,
    isDirty,
    tabActions,
    handleCreateNote,
    activeNote,
    folderFromPath,
    handleCreateFolder,
    handleOpenVault,
    setCommandOpen,
    showSidebar,
    FILE_MANAGER,
    interactiveRegion,
    sidebarOpen,
    editorMode,
    skillsOpen,
    settingsOpen,
    agentOpen,
    openContentSignals,
    setSidebarOpen,
    setEditorMode,
    setSkillsOpen,
    setSettingsOpen,
    setAgentOpen,
    appearanceSettings,
    chromeButtonClass,
    chromeButtonActiveClass,
    mobileView,
    setMobileView,
    handleEditorKeyDown,
    textFontStack,
    renderNoteHeader,
    draft,
    onEditorType,
    commitEditorDraft,
    editorInstanceRef,
    promptLinkAndApply,
    flushTitleSync,
    dataviewNotes,
    handleWikilinkActivate,
    isResolvedWikilink,
    getEmbedContent,
    applyMarkdownCommand,
    railOpen,
    beginResize,
    resizing,
    agentWidth,
    railTab,
    setRailTab,
    location,
    userId,
    initialMessage,
  } = useEditorWorkspace();

  const documentScrollRef = React.useRef<HTMLDivElement | null>(null);
  const pendingScrollRatioRef = React.useRef<number | null>(null);
  const pendingCursorRef = React.useRef<number | null>(null);
  const changeEditorMode = React.useCallback((mode: "edit" | "preview") => {
    const scroll = documentScrollRef.current;
    if (scroll) {
      pendingScrollRatioRef.current = scroll.scrollTop / Math.max(1, scroll.scrollHeight - scroll.clientHeight);
    }
    if (mode === "preview") commitEditorDraft();
    setEditorMode(mode);
  }, [commitEditorDraft, setEditorMode]);

  React.useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (editorMode === "edit" && pendingCursorRef.current != null) {
        editorInstanceRef.current?.setCursor(pendingCursorRef.current);
        pendingCursorRef.current = null;
      } else if (pendingScrollRatioRef.current != null && documentScrollRef.current) {
        const scroll = documentScrollRef.current;
        scroll.scrollTop = pendingScrollRatioRef.current * Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      }
      pendingScrollRatioRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [editorMode, editorInstanceRef]);

  React.useEffect(() => window.beebotDesktop?.onDesktopCommand?.((command) => {
    if (!command.startsWith("format:")) return;
    applyMarkdownCommand(command.slice("format:".length) as MarkdownCommand);
  }), [applyMarkdownCommand]);

  const jumpToSignalParagraph = React.useCallback((paragraph: number) => {
    const content = editorInstanceRef.current?.getMarkdown() || draft;
    if (paragraph <= 1) {
      editorInstanceRef.current?.setCursor(0);
      return;
    }
    const parts = content.split(/\n\s*\n+/);
    let offset = 0;
    for (let index = 0; index < parts.length; index += 1) {
      if (index + 1 === paragraph) {
        editorInstanceRef.current?.setCursor(offset);
        return;
      }
      offset += parts[index].length + 2;
    }
  }, [draft, editorInstanceRef]);

  return (
    <>
      <main className={cn(
        "fui-note-workspace min-w-0 min-h-0 flex-col bg-transparent",
        showMainContent && (!isMobile || mobileView === "editor") ? "flex" : "hidden",
        isMobile ? "w-full" : isDesktopShell ? "flex-1" : "flex-1 mt-[10px]",
      )}
      style={isMobile ? { viewTransitionName: "bb-mobile-scene" } : undefined}>
        <header
          className="bb-mobile-editor-toolbar h-[44px] shrink-0 text-[var(--bb-text-1)] flex items-center overflow-hidden px-1.5"
          style={draggableRegion}
        >
          {isMobile && (
            <button type="button" className="bb-mobile-home-control" onClick={() => setMobileView("home")} aria-label="Open E.V home">
              <Home className="h-4 w-4" />
            </button>
          )}
          <TabStrip
            tabs={openTabNotes}
            activePath={activePath}
            isDirty={isDirty}
            actions={tabActions}
            onCreateNote={() => handleCreateNote(activeNote ? folderFromPath(activeNote.path) : "")}
            onCreateFolder={() => handleCreateFolder(activeNote ? folderFromPath(activeNote.path) : "")}
            onOpenVault={handleOpenVault}
            onOpenCommandPalette={() => setCommandOpen(true)}
            showSidebar={showSidebar}
            fileManagerLabel={FILE_MANAGER}
            draggableRegion={draggableRegion}
            interactiveRegion={interactiveRegion}
          />

          <ChromeCluster
            sidebarOpen={sidebarOpen}
            editorMode={editorMode}
            skillsOpen={skillsOpen}
            settingsOpen={settingsOpen}
            agentOpen={agentOpen}
            signalsOpen={railOpen && railTab === "signals"}
            onToggleSidebar={() => setSidebarOpen((value: boolean) => !value)}
            onSetEditorMode={changeEditorMode}
            onOpenSkills={() => setSkillsOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onToggleAgent={() => setAgentOpen((value: boolean) => !value)}
            onOpenSignals={openContentSignals}
            signalsAvailable={Boolean(activeNote)}
            showSkillsButton={appearanceSettings.showSkillsButton}
            showPanelButton={appearanceSettings.showPanelButton}
            chromeButtonClass={chromeButtonClass}
            chromeButtonActiveClass={chromeButtonActiveClass}
            interactiveRegion={interactiveRegion}
          />
        </header>
        {/* Editor Section */}
        {(!isMobile || mobileView === "editor") && (
          <section className="flex-1 min-h-0 min-w-0 flex flex-col" style={{ borderTopLeftRadius: "var(--bb-radius-panel)" }}>
            <div className="min-h-0 w-full flex-1 flex flex-col">
              <ContextMenu>
                <ContextMenuTrigger asChild disabled={Boolean(window.beebotDesktop && appearanceSettings.nativeMenus)}>
                  <div
                    ref={documentScrollRef}
                    className={cn(
                      "bb-mobile-editor-scroll h-full min-h-0 bg-[var(--bb-bg-0)] flex-1",
                      editorMode === "edit" ? "overflow-hidden" : "overflow-y-auto",
                    )}
                    style={{ viewTransitionName: "bb-note" } as CSSProperties}
                    onKeyDown={handleEditorKeyDown}
                  >
                    <div className={cn(
                      "mx-auto w-full px-4 pt-5 sm:px-8 sm:pt-[30px]",
                      editorMode === "edit" ? "flex h-full min-h-0 flex-col pb-0" : "pb-28 sm:pb-24",
                      appearanceSettings.readableLineLength ? "max-w-[740px]" : "max-w-none",
                    )}>
                      {renderNoteHeader()}
                      <MicroErrorBoundary name="Note Editor" resetKeys={[activeNote?.path, editorMode]}>
                        <Suspense fallback={<div className="h-32 animate-pulse rounded-lg bg-[var(--bb-bg-2)]" aria-label="Loading workspace" />}>
                          {editorMode === "edit" ? (
                            <LiveMarkdownEditor
                              key={activeNote?.path || "empty-note"}
                              value={draft}
                              onDirty={onEditorType}
                              editable={Boolean(activeNote)}
                              spellCheck={appearanceSettings.spellcheck}
                              fontFamily={textFontStack}
                              editorRef={editorInstanceRef}
                              onLinkShortcut={promptLinkAndApply}
                              onBlur={flushTitleSync}
                              placeholder="Start writing…"
                              notes={dataviewNotes}
                              onWikilinkActivate={handleWikilinkActivate}
                              isResolvedTarget={isResolvedWikilink}
                              getNoteContent={getEmbedContent}
                              className="min-h-0 flex-1"
                            />
                          ) : (
                            <div style={{ fontFamily: textFontStack }}>
                              <NoteReader
                                content={draft}
                                onWikilinkActivate={handleWikilinkActivate}
                                isResolvedTarget={isResolvedWikilink}
                                getNoteContent={getEmbedContent}
                                notes={dataviewNotes}
                                className="!mx-0 !max-w-none !px-0 !py-0"
                                onEditRequest={(offset) => {
                                  pendingCursorRef.current = offset;
                                  changeEditorMode("edit");
                                }}
                              />
                            </div>
                          )}
                        </Suspense>
                      </MicroErrorBoundary>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-64">
                  {editorMode === "edit" ? (
                    <>
                      <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("link")}>
                        Add link
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>Format</ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-48">
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("bold")}>Bold</ContextMenuItem>
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("italic")}>Italic</ContextMenuItem>
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("strikethrough")}>Strikethrough</ContextMenuItem>
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("highlight")}>Highlight</ContextMenuItem>
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("inline-code")}>Code</ContextMenuItem>
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("math")}>Math</ContextMenuItem>
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("comment")}>Comment</ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("clear")}>Clear formatting</ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>Paragraph</ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-48">
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("bullet-list")}>Bullet list</ContextMenuItem>
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("numbered-list")}>Numbered list</ContextMenuItem>
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("task-list")}>Task list</ContextMenuItem>
                          <ContextMenuSeparator />
                          {[1, 2, 3, 4, 5, 6].map((level) => (
                            <ContextMenuItem disabled={!activeNote} key={level} onClick={() => applyMarkdownCommand(`heading-${level}`)}>
                              Heading {level}
                            </ContextMenuItem>
                          ))}
                          <ContextMenuSeparator />
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("body")}>Body</ContextMenuItem>
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("quote")}>Quote</ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>Insert</ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-48">
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("footnote")}>Footnote</ContextMenuItem>
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("table")}>Table</ContextMenuItem>
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("callout")}>Callout</ContextMenuItem>
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("horizontal-rule")}>Horizontal rule</ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("code-block")}>Code block</ContextMenuItem>
                          <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("math-block")}>Math block</ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => document.execCommand('cut')}>Cut</ContextMenuItem>
                      <ContextMenuItem onClick={() => document.execCommand('copy')}>Copy</ContextMenuItem>
                      <ContextMenuItem onClick={() => document.execCommand('paste')}>Paste</ContextMenuItem>
                      <ContextMenuItem onClick={() => document.execCommand('insertText')}>Paste as plain text</ContextMenuItem>
                      <ContextMenuItem onClick={() => document.execCommand('selectAll')}>Select all</ContextMenuItem>
                    </>
                  ) : (
                    <>
                      <ContextMenuItem onClick={() => document.execCommand('copy')}>Copy</ContextMenuItem>
                      <ContextMenuItem onClick={() => document.execCommand('selectAll')}>Select all</ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            </div>
          </section>
        )}
      </main>

      {/* Right Rail / Agent Resizer */}
      {!isMobile && railOpen && (
        <div
          onPointerDown={(event) => beginResize("agent", event)}
          className={cn(
            "group relative w-1 shrink-0 cursor-col-resize select-none transition-colors",
            resizing === "agent" ? "bg-[var(--bb-accent)]" : "bg-transparent hover:bg-[var(--bb-accent-soft)]"
          )}
          style={{ touchAction: "none" }}
        />
      )}

      {/* Unified Floating Right Panel */}
      {(isMobile ? mobileView === "agent" : railOpen) && (
        <aside
          className={cn(
            "bb-mobile-agent-pane bb-glass shrink-0 m-[10px_10px_10px_0] rounded-[var(--bb-radius-panel)] border-[0.5px] border-[var(--bb-border)] shadow-[var(--bb-shadow-panel)] overflow-hidden flex flex-col min-h-0",
            isMobile ? "w-full flex-1 m-0 rounded-none border-0" : "",
            !isMobile && resizing !== "agent" ? "transition-[width] duration-200 ease-out" : ""
          )}
          style={{
            ...(!isMobile ? { width: agentWidth } : {}),
            ...(isMobile ? { viewTransitionName: "bb-mobile-scene" } : {}),
          }}
        >
          {/* Segmented Control Header */}
          <div className="bb-mobile-segmented flex flex-shrink-0 items-center justify-between border-b border-[var(--bb-border)] bg-transparent p-[10px_14px]">
            {isMobile && (
              <button type="button" className="bb-mobile-home-control mr-2" onClick={() => setMobileView("home")} aria-label="Open E.V home">
                <Home className="h-4 w-4" />
              </button>
            )}
            <div className="flex flex-1 gap-[2px] rounded-[var(--bb-radius-control)] border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-[2px]">
              {[
                { key: "assistant", label: "Assistant", Icon: ChatRoundLine },
                { key: "signals", label: "Signals", Icon: MagicStick3 },
              ].map((tab) => {
                const isActive = railTab === tab.key;
                const TabIcon = tab.Icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setRailTab(tab.key as "assistant" | "signals")}
                    className={cn(
                      "flex-1 h-[28px] min-h-[40px] md:min-h-0 rounded-[var(--bb-radius-control)] flex items-center justify-center gap-1.5 text-[12px] font-medium transition-all duration-[130ms]",
                      isActive
                        ? "bg-[var(--bb-sidebar-hover)] text-[var(--bb-text-1)] shadow-[var(--bb-shadow)]"
                        : "text-[var(--bb-text-3)] hover:text-[var(--bb-text-1)]"
                    )}
                  >
                    <TabIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Context Pill */}
          {railTab === "assistant" && (
            <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-[var(--bb-border)] p-[8px_14px] text-[11.5px] text-[var(--bb-text-3)]">
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bb-info)]" />
              <span>Context:</span>
              <span className="truncate font-medium text-[var(--bb-text-1)]">
                {activeNote ? (activeNote.title || activeNote.path?.split("/").slice(-1)[0]?.replace(/\.md$/i, "") || "Untitled") : "BeeBot Architecture"}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10.5px] text-[var(--bb-text-4)]">note</span>
            </div>
          )}

          {/* Tab Contents */}
          <div className={cn("flex-1 min-h-0 flex flex-col", railTab === "assistant" ? "p-0 overflow-hidden" : "p-4 overflow-y-auto")}>
            <MicroErrorBoundary name="Right Rail" resetKeys={[activeNote?.path, railTab]}>
              {railTab === "assistant" && (
              <div className="flex-1 min-h-0 flex flex-col">
                <Suspense fallback={<div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">Loading BeeBot...</div>}>
                  <BeeBotChatView
                    key={location.key}
                    userId={userId}
                    open={true}
                    initialMessage={initialMessage}
                    embedded
                  />
                </Suspense>
              </div>
            )}

            {railTab === "signals" && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-xs text-[var(--bb-text-3)]">Loading signals…</div>}>
                <SignalsPanel
                  notePath={activeNote?.path}
                  getContent={() => editorInstanceRef.current?.getMarkdown() || draft}
                  onJumpToParagraph={jumpToSignalParagraph}
                />
              </Suspense>
            )}
            </MicroErrorBoundary>
          </div>
        </aside>
      )}
    </>
  );
}
