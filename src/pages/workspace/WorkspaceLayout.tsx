/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Settings as SolarSettings } from "@solar-icons/react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { PanelRightClose, Check } from "lucide-react";
import { useWorkspace } from "./WorkspaceContext";
import { SidebarNavigation } from "./SidebarNavigation";
import { NoteEditorPanel } from "./NoteEditorPanel";
import { MicroErrorBoundary } from "@/components/MicroErrorBoundary";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { nativePlatform } from "@/lib/nativeExperience";
import { EvMobileDashboard } from "@/features/ev-voice/ui/EvMobileDashboard";

export const WorkspaceLayout = React.memo(function WorkspaceLayout() {
  const {
    ready,
    userId,
    interfaceFontStack,
    appearanceSettings,
    textFontStack,
    monospaceFontStack,
    cfoOpen,
    consultantOpen,
    ribbonActions,
    ribbonButtonClass,
    chromeButtonActiveClass,
    settingsOpen,
    setSettingsOpen,
    toggleRibbonItem,
    updateAppearanceSettings,
    showSidebar,
    showMainEditor,
    beginResize,
    resizing,
    isMobile,
    mobileView,
    setMobileView,
    activePath,
    activeVault,
    noteList,
    activeNote,
    hasJarvisKey,
    jarvisOn,
    openSearchModal,
    openCfo,
    openConsultant,
  } = useWorkspace();
  const productRoomOpen = cfoOpen || consultantOpen;
  const { keyboardHeight, isKeyboardOpen } = useKeyboardInset();
  const openEv = React.useCallback(() => {
    window.dispatchEvent(new Event("beebot:ev-open"));
  }, []);

  if (!ready || !userId) {
    return (
      <div className="h-full w-full bg-background flex items-center justify-center text-muted-foreground">
        <div className="h-9 w-9 rounded-full border-2 border-border/40 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="bb-shell h-full w-full overflow-hidden bg-[var(--bb-bg-0)] text-foreground"
      data-keyboard-open={isKeyboardOpen || undefined}
      data-native-platform={nativePlatform()}
      data-mobile-view={isMobile ? mobileView : undefined}
      style={{
        fontFamily: `var(--beebot-interface-font, ${interfaceFontStack})`,
        "--beebot-interface-font": interfaceFontStack,
        "--beebot-text-font": textFontStack,
        "--beebot-mono-font": monospaceFontStack,
        "--beebot-note-font-size": `${appearanceSettings.fontSize}px`,
        "--bb-keyboard-inset": `${keyboardHeight}px`,
      } as CSSProperties}
    >
      {/* ponytail: Grok-style DOM hibernation when in isolated room (?_s=cfo/consultant) */}
      <div
        className="h-full min-h-0 flex flex-col"
        aria-hidden={productRoomOpen || undefined}
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
          // Keep the workspace laid out behind a full-screen product room. CodeMirror,
          // the Repository tree, and device-folder handles retain their dimensions/state,
          // so closing CFO/Consultant is instant and never needs a reload to recover.
          ...(productRoomOpen ? { visibility: "hidden", pointerEvents: "none" } : {}),
        }}
      >
        <div className="flex-1 min-h-0 flex bg-[var(--bb-bg-0)]">
          {isMobile && mobileView === "home" && (
            <EvMobileDashboard
              vaultName={activeVault?.name || "Sitku Vault"}
              noteCount={noteList.length}
              activeNote={activeNote ? { title: activeNote.title } : null}
              voiceEnabled={jarvisOn}
              providerReady={hasJarvisKey}
              onOpenVoice={openEv}
              onOpenNotes={() => setMobileView("files")}
              onOpenCfo={openCfo}
              onOpenConsultant={openConsultant}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
          {appearanceSettings.showRibbon && (
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <nav className="bb-glass hidden md:flex w-[52px] shrink-0 border-r border-[var(--bb-border)] flex-col items-center justify-between py-[14px]">
                  <div className="flex flex-col items-center gap-2">
                    {ribbonActions
                      .filter((action: any) => appearanceSettings.ribbonItems.includes(action.id))
                      .map((action: any) => {
                        const ActionIcon = action.icon;
                        return (
                          <Button key={action.id} title={action.label} variant="ghost" size="icon" className={cn(ribbonButtonClass, action.active && chromeButtonActiveClass)} onClick={action.run}>
                            <ActionIcon className={cn(action.iconSize || "h-[18px] w-[18px]", "shrink-0")} />
                          </Button>
                        );
                      })}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <Button title="Settings" variant="ghost" size="icon" className={cn(ribbonButtonClass, settingsOpen && chromeButtonActiveClass)} onClick={() => setSettingsOpen(true)}>
                      <SolarSettings className="h-[18px] w-[18px]" />
                    </Button>
                  </div>
                </nav>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-56">
                {ribbonActions.map((action: any) => {
                  const enabled = appearanceSettings.ribbonItems.includes(action.id);
                  const ActionIcon = action.icon;
                  return (
                    <ContextMenuItem key={action.id} onClick={() => toggleRibbonItem(action.id)}>
                      <Check className={cn("mr-2 h-4 w-4", enabled ? "opacity-100 text-[var(--beebot-accent)]" : "opacity-0")} />
                      <ActionIcon className="mr-2 h-4 w-4" strokeWidth={1.8} />
                      {action.label}
                    </ContextMenuItem>
                  );
                })}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => updateAppearanceSettings({ showRibbon: false })}>
                  <PanelRightClose className="mr-2 h-4 w-4" />
                  Hide ribbon
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )}

          <MicroErrorBoundary name="Sidebar" resetKeys={[activePath, activeVault]}>
            <SidebarNavigation />
          </MicroErrorBoundary>

          {/* Sidebar ↔ Main resize handle — hairline default, accent on hover/drag. */}
          {!isMobile && showSidebar && showMainEditor && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              onPointerDown={(event) => beginResize("sidebar", event)}
              className={cn(
                "native-resize-handle group relative w-1 shrink-0 cursor-col-resize select-none transition-colors",
                resizing === "sidebar" ? "bg-[var(--bb-accent)]" : "bg-transparent hover:bg-[var(--bb-accent-soft)]",
              )}
              style={{ touchAction: "none" }}
            />
          )}

          <MicroErrorBoundary name="Editor Panel" resetKeys={[activePath, activeVault]}>
            <NoteEditorPanel />
          </MicroErrorBoundary>
        </div>

      </div>
    </div>
  );
});
