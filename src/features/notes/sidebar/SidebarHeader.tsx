import type { CSSProperties } from "react";
import {
  Magnifer,
  AddSquare,
  AddFolder,
  AltArrowDown,
  FolderWithFiles,
  ShareCircle,
  CheckCircle,
  CloseCircle,
  Diskette,
  DoubleAltArrowDown,
  DoubleAltArrowUp,
} from "@solar-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { VaultInfo } from "@/repositories/contracts/vault";

interface SidebarHeaderProps {
  showSidebar: boolean;
  isDesktopShell: boolean;
  sidebarWidth: number;
  draggableRegion: CSSProperties;
  activeVault: VaultInfo | null;
  recentVaults: VaultInfo[];
  isVaultBusy: boolean;
  onSearch: () => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onOpenVault: () => void;
  onCreateVault: () => void;
  onRevealVault: () => void;
  onSwitchVault: (path: string) => void;
  onForgetVault: (path: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

// Sidebar top chrome: the search/new/folder icon row (with the macOS traffic-light gutter strip)
// and the vault dropdown + expand/collapse. Extracted verbatim from the workspace host.
export function SidebarHeader({
  showSidebar,
  isDesktopShell,
  sidebarWidth,
  draggableRegion,
  activeVault,
  recentVaults,
  isVaultBusy,
  onSearch,
  onNewNote,
  onNewFolder,
  onOpenVault,
  onCreateVault,
  onRevealVault,
  onSwitchVault,
  onForgetVault,
  onExpandAll,
  onCollapseAll,
}: SidebarHeaderProps) {
  return (
    <div className="shrink-0 px-3 pt-0 pb-2.5 select-none">
      {/* Traffic-light / button toolbar row */}
      <div className="h-[44px] flex items-center gap-0.5 shrink-0" style={draggableRegion}>
        {/* In macOS Electron shell (isDesktopShell), OS renders interactive native traffic lights.
            Reserve safe gutter so native buttons don't overlap HTML elements. On web/PWA render decorative dots. */}
        {isDesktopShell ? (
          <div className="w-[68px] shrink-0" aria-hidden="true" />
        ) : (
          <div className="flex items-center gap-2 pl-1 pr-3" aria-hidden="true">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
        )}
        {/* Toolbar buttons — opt OUT of the window-drag region, or macOS eats
            the clicks (the row above is -webkit-app-region: drag for the title bar). */}
        <div className="ml-auto flex items-center gap-0.5" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
          <Button
            title="Search notes  (⌘ K)"
            aria-label="Search notes"
            variant="ghost"
            size="icon"
            className="h-[34px] w-[34px] rounded-[11px] bg-transparent text-[#c4c4c6] hover:bg-[rgba(255,255,255,0.07)] hover:text-[#ededed] transition-colors duration-[130ms] flex items-center justify-center"
            onClick={onSearch}
          >
            <Magnifer className="h-4 w-4" />
          </Button>
          <Button
            title="New note"
            aria-label="New note"
            variant="ghost"
            size="icon"
            className="h-[34px] w-[34px] rounded-[11px] bg-transparent text-[#c4c4c6] hover:bg-[rgba(255,255,255,0.07)] hover:text-[#ededed] transition-colors duration-[130ms] flex items-center justify-center"
            onClick={onNewNote}
          >
            <AddSquare className="h-[17px] w-[17px]" />
          </Button>
          <Button
            title="New folder"
            aria-label="New folder"
            variant="ghost"
            size="icon"
            className="h-[34px] w-[34px] rounded-[11px] bg-transparent text-[#c4c4c6] hover:bg-[rgba(255,255,255,0.07)] hover:text-[#ededed] transition-colors duration-[130ms] flex items-center justify-center"
            onClick={onNewFolder}
          >
            <AddFolder className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Vault Switcher & Expand/Collapse controls */}
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={activeVault?.path || "Switch vault"}
              className="flex-1 flex items-center justify-between gap-2 border-[0.5px] border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] rounded-[11px] p-[6px_9px] transition-all duration-[130ms] text-left min-w-0"
            >
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="text-[12.5px] font-semibold text-[#e8e8ea] leading-tight truncate">
                  {activeVault?.name || "BeeBot Vault"}
                </span>
                <span className="flex items-center gap-1.5 text-[9.5px] font-medium text-[#7a7a7c] leading-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] shrink-0" />
                  <span className="truncate">{activeVault?.noteCount || 0} notes · synced</span>
                </span>
              </div>
              <AltArrowDown className="h-[13px] w-[13px] text-[#6a6a6c] hover:text-[#c4c4c6] transition-colors shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel>Vault</DropdownMenuLabel>
            <DropdownMenuItem onClick={onOpenVault} disabled={isVaultBusy}>
              <FolderWithFiles className="mr-2 h-4 w-4" />
              Open existing vault
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCreateVault} disabled={isVaultBusy}>
              <AddSquare className="mr-2 h-4 w-4" />
              Create new vault
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRevealVault}>
              <ShareCircle className="mr-2 h-4 w-4" />
              Open vault location
            </DropdownMenuItem>
            {recentVaults.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Recent</DropdownMenuLabel>
                {recentVaults.map((recent) => (
                  // The remove ✕ is a SIBLING of the item, not a child — clicking it
                  // physically can't trigger the item's select (which was switching vaults).
                  <div key={recent.path} className="group/vault relative flex items-center">
                    <DropdownMenuItem
                      onClick={() => onSwitchVault(recent.path)}
                      disabled={isVaultBusy || recent.active}
                      className="flex-1 min-w-0 pr-8"
                    >
                      {recent.active ? (
                        <CheckCircle className="mr-2 h-4 w-4 text-[var(--beebot-accent)]" />
                      ) : (
                        <Diskette className="mr-2 h-4 w-4" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate">{recent.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{recent.noteCount || 0} notes</span>
                      </span>
                    </DropdownMenuItem>
                    {!recent.active && (
                      <button
                        type="button"
                        title="Remove from Recent"
                        aria-label="Remove from Recent"
                        onClick={() => onForgetVault(recent.path)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-[rgba(255,255,255,0.10)] hover:text-[#ededed] group-hover/vault:opacity-100"
                      >
                        <CloseCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Tree expand / collapse buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            title="Expand all"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-[8px] text-[#9b9b9d] hover:bg-[#1a1a1c] hover:text-[#ededed] transition-colors duration-[130ms] flex items-center justify-center"
            onClick={onExpandAll}
          >
            <DoubleAltArrowDown className="h-[14px] w-[14px]" />
          </Button>
          <Button
            title="Collapse all"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-[8px] text-[#9b9b9d] hover:bg-[#1a1a1c] hover:text-[#ededed] transition-colors duration-[130ms] flex items-center justify-center"
            onClick={onCollapseAll}
          >
            <DoubleAltArrowUp className="h-[14px] w-[14px]" />
          </Button>
        </div>
      </div>
    </div>
  );
}
