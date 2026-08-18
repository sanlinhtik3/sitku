import { CaseMinimalistic, Wallet } from "@solar-icons/react";

interface AppNavProps {
  onOpenConsultant: () => void;
  onOpenCfo: () => void;
  activeRoom?: string;
}

// One source of truth for the nav-button look (was duplicated verbatim ×2).
const NAV_ITEM = "group flex min-h-10 w-full items-center gap-3 rounded-[var(--bb-radius-control,10px)] px-2 py-2 text-left text-[13.5px] transition-colors duration-[130ms] hover:bg-[var(--bb-sidebar-hover,var(--bb-bg-3))] hover:text-[var(--bb-text-1)]";
const NAV_ICON = "flex h-5 w-5 shrink-0 items-center justify-center text-[var(--bb-text-3)] transition-colors duration-[130ms] group-hover:text-[var(--beebot-accent)]";

// App navigation — reach the Agent Consultant + Personal CFO surfaces from the notes
// workspace (bidirectional: closing either returns here). Pinned to the sidebar bottom.
export function AppNav({ onOpenConsultant, onOpenCfo, activeRoom }: AppNavProps) {
  return (
    <nav aria-label="Sitku spaces" className="sidebar-app-nav flex shrink-0 flex-col gap-0.5 px-3 pb-3 pt-1">
      <button type="button" onClick={onOpenConsultant} className={`${NAV_ITEM} ${activeRoom === "consultant" ? "bg-[var(--bb-sidebar-hover,var(--bb-bg-3))] text-[var(--bb-text-1)] font-medium" : "text-[var(--bb-sidebar-text,var(--bb-text-2))]"}`}>
        <span className={NAV_ICON}><CaseMinimalistic className="h-[18px] w-[18px]" /></span>
        <span className="truncate">Agent Consultant</span>
      </button>
      <button type="button" onClick={onOpenCfo} className={`${NAV_ITEM} ${activeRoom === "cfo" ? "bg-[var(--bb-sidebar-hover,var(--bb-bg-3))] text-[var(--bb-text-1)] font-medium" : "text-[var(--bb-sidebar-text,var(--bb-text-2))]"}`}>
        <span className={NAV_ICON}><Wallet className="h-[18px] w-[18px]" /></span>
        <span className="truncate">Personal CFO</span>
      </button>
    </nav>
  );
}
