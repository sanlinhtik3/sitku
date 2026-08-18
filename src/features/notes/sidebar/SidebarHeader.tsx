import type { CSSProperties } from "react";
import {
  Magnifer,
  AddSquare,
  AltArrowDown,
  FolderWithFiles,
  ShareCircle,
  CheckCircle,
  CloseCircle,
  Diskette,
  Home,
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
  isMobile: boolean;
  isDesktopShell: boolean;
  draggableRegion: CSSProperties;
  activeVault: VaultInfo | null;
  recentVaults: VaultInfo[];
  isVaultBusy: boolean;
  onSearch: () => void;
  onOpenVault: () => void;
  onCreateVault: () => void;
  onRevealVault: () => void;
  onSwitchVault: (path: string) => void;
  onForgetVault: (path: string) => void;
  onHome: () => void;
}

// Search-first sidebar chrome. Creation stays available from the repository
// context menu, command palette, and editor tab menu instead of competing here.
export function SidebarHeader({
  isMobile,
  isDesktopShell,
  draggableRegion,
  activeVault,
  recentVaults,
  isVaultBusy,
  onSearch,
  onOpenVault,
  onCreateVault,
  onRevealVault,
  onSwitchVault,
  onForgetVault,
  onHome,
}: SidebarHeaderProps) {
  return (
    <div className="sidebar-header shrink-0 px-3 pb-2 select-none">
      {/* Native titlebar gutter. High-frequency actions live with the vault below. */}
      <div className="sidebar-native-titlebar-row h-[44px] flex items-center gap-0.5 shrink-0" style={draggableRegion}>
        {/* In macOS Electron shell (isDesktopShell), OS renders interactive native traffic lights.
            Reserve safe gutter so native buttons don't overlap HTML elements. On web/PWA render decorative dots. */}
        {isMobile ? (
          <button type="button" className="sidebar-mobile-home" onClick={onHome} aria-label="Open E.V home">
            <Home className="h-4 w-4" />
            <span>E.V Home</span>
          </button>
        ) : isDesktopShell ? (
          <div className="mobile-window-controls w-[68px] shrink-0" aria-hidden="true" />
        ) : (
          <div className="mobile-window-controls flex items-center gap-2 pl-1 pr-3" aria-hidden="true">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
        )}
      </div>

      {/* Codex-style workspace switcher with search in the same visual row. */}
      <div className="sidebar-vault-row mt-0.5 flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={activeVault?.path || "Switch vault"}
              className="sidebar-workspace-switcher group flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-[var(--bb-radius-control)] border border-transparent bg-transparent px-2 py-1.5 text-left transition-colors duration-[130ms] hover:bg-[var(--bb-sidebar-hover,var(--bb-bg-3))]"
            >
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="truncate text-[14px] font-semibold leading-tight text-[var(--bb-sidebar-text,var(--bb-text-1))]">
                  {activeVault?.name || "BeeBot Vault"}
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-medium leading-none text-[var(--bb-text-4)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] shrink-0" />
                  <span className="truncate">{activeVault?.noteCount || 0} notes · synced</span>
                </span>
              </div>
              <AltArrowDown className="h-[13px] w-[13px] shrink-0 text-[var(--bb-text-4)] transition-colors group-hover:text-[var(--bb-text-2)]" />
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
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-[var(--bb-bg-4)] hover:text-[var(--bb-text-1)] group-hover/vault:opacity-100"
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
        <Button
          title="Search notes  (⌘ K)"
          aria-label="Search notes"
          variant="ghost"
          size="icon"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[var(--bb-radius-control)] bg-transparent text-[var(--bb-text-3)] transition-colors duration-[130ms] hover:bg-[var(--bb-sidebar-hover,var(--bb-bg-3))] hover:text-[var(--bb-text-1)]"
          onClick={onSearch}
        >
          <Magnifer className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
