import { CaseMinimalistic, Wallet } from "@solar-icons/react";

interface AppNavProps {
  onOpenConsultant: () => void;
  onOpenCfo: () => void;
}

// One source of truth for the nav-button look (was duplicated verbatim ×2).
const NAV_ITEM = "group flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left text-[13px] text-[#c4c4c6] transition-colors duration-[130ms] hover:bg-[#1a1a1c] hover:text-[#ededed]";
const NAV_TILE = "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-[#1a1a1c] text-[#9b9b9d] group-hover:text-[var(--beebot-accent)] transition-colors duration-[130ms]";

// App navigation — reach the Agent Consultant + Personal CFO surfaces from the notes
// workspace (bidirectional: closing either returns here). Pinned to the sidebar bottom.
export function AppNav({ onOpenConsultant, onOpenCfo }: AppNavProps) {
  return (
    <nav className="shrink-0 border-b border-[rgba(255,255,255,0.05)] p-[2px_10px_8px] flex flex-col gap-[1px]">
      <button type="button" onClick={onOpenConsultant} className={NAV_ITEM}>
        <span className={NAV_TILE}><CaseMinimalistic className="h-[15px] w-[15px]" /></span>
        <span className="truncate">Agent Consultant</span>
      </button>
      <button type="button" onClick={onOpenCfo} className={NAV_ITEM}>
        <span className={NAV_TILE}><Wallet className="h-[15px] w-[15px]" /></span>
        <span className="truncate">Personal CFO</span>
      </button>
    </nav>
  );
}
