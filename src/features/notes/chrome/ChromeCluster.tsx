// Right-side chrome cluster of the notes header — the small icon buttons after
// the tab strip: sidebar toggle, edit/reading view, skills, settings, BeeBot
// panel toggle. Extracted verbatim from the host 1:1.
import { memo } from "react";
import {
  SidebarMinimalistic,
  PenNewRound,
  Book,
  MagicStick3,
} from "@solar-icons/react";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

export type EditorMode = "edit" | "preview";

export interface ChromeClusterProps {
  sidebarOpen: boolean;
  editorMode: EditorMode;
  skillsOpen: boolean;
  settingsOpen: boolean;
  agentOpen: boolean;
  onToggleSidebar: () => void;
  onSetEditorMode: (mode: EditorMode) => void;
  onOpenSkills: () => void;
  onOpenSettings: () => void;
  onToggleAgent: () => void;
  showSkillsButton?: boolean;
  showPanelButton?: boolean;
  chromeButtonClass?: string;
  chromeButtonActiveClass?: string;
  interactiveRegion: CSSProperties;
}

const BTN_CLASS =
  "h-[34px] w-[34px] rounded-[11px] bg-transparent text-[#9b9b9d] hover:bg-[#1a1a1c] hover:text-[#ededed] transition-colors duration-[140ms] shrink-0 flex items-center justify-center border-none cursor-pointer";
const ACTIVE_BTN_CLASS =
  "bg-[rgba(255,255,255,0.10)] text-[#f2f2f2] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.12)]";

export const ChromeCluster = memo(function ChromeCluster({
  sidebarOpen,
  editorMode,
  skillsOpen,
  settingsOpen,
  agentOpen,
  onToggleSidebar,
  onSetEditorMode,
  onOpenSkills,
  onOpenSettings,
  onToggleAgent,
  showSkillsButton = false,
  showPanelButton = false,
  interactiveRegion,
}: Omit<ChromeClusterProps, "chromeButtonClass" | "chromeButtonActiveClass">) {
  return (
    <div
      className="shrink-0 flex items-center gap-[3px] pl-2 ml-1.5"
      style={interactiveRegion}
    >
      {/* Toggle Sidebar */}
      <button
        type="button"
        title="Toggle sidebar"
        className={cn(
          BTN_CLASS,
          "hidden md:inline-flex",
          sidebarOpen && ACTIVE_BTN_CLASS
        )}
        onClick={onToggleSidebar}
      >
        <SidebarMinimalistic
          className={cn(
            "h-[18px] w-[18px] shrink-0 transition-transform duration-150",
            !sidebarOpen && "transform scale-x-[-1]"
          )}
        />
      </button>

      {/* Segmented Edit/Read Control */}
      <div className="flex items-center gap-[2px] bg-[rgba(255,255,255,0.05)] rounded-[11px] p-[2px] mx-[2px] shrink-0">
        <button
          type="button"
          title="Editing view"
          className={cn(
            "h-[30px] w-[34px] rounded-[9px] flex items-center justify-center text-[#9b9b9d] hover:text-[#c8c8c8] transition-all duration-[130ms] border-none cursor-pointer",
            editorMode === "edit"
              ? "bg-[rgba(255,255,255,0.11)] text-[#f2f2f2] shadow-[0_1px_3px_rgba(0,0,0,0.4),_inset_0_0_0_0.5px_rgba(255,255,255,0.10)]"
              : ""
          )}
          onClick={() => onSetEditorMode("edit")}
        >
          <PenNewRound className="h-[15px] w-[15px] shrink-0" />
        </button>
        <button
          type="button"
          title="Reading view"
          className={cn(
            "h-[30px] w-[34px] rounded-[9px] flex items-center justify-center text-[#9b9b9d] hover:text-[#c8c8c8] transition-all duration-[130ms] border-none cursor-pointer",
            editorMode === "preview"
              ? "bg-[rgba(255,255,255,0.11)] text-[#f2f2f2] shadow-[0_1px_3px_rgba(0,0,0,0.4),_inset_0_0_0_0.5px_rgba(255,255,255,0.10)]"
              : ""
          )}
          onClick={() => onSetEditorMode("preview")}
        >
          <Book className="h-[15px] w-[15px] shrink-0" />
        </button>
      </div>

      {/* Skills button — opt-in via Settings (hidden by default) */}
      {showSkillsButton && (
        <button
          type="button"
          title="Skills"
          className={cn(
            BTN_CLASS,
            "hidden md:inline-flex",
            skillsOpen && ACTIVE_BTN_CLASS
          )}
          onClick={onOpenSkills}
        >
          <MagicStick3 className="h-[15px] w-[15px] shrink-0" />
        </button>
      )}

      {/* Right panel (Agent Consultant) toggle — opt-in via Settings (hidden by default) */}
      {showPanelButton && (
        <button
          type="button"
          title="Toggle panel"
          className={cn(
            BTN_CLASS,
            "hidden md:inline-flex",
            agentOpen && ACTIVE_BTN_CLASS
          )}
          onClick={onToggleAgent}
        >
          <SidebarMinimalistic className="h-[18px] w-[18px] shrink-0 transform scale-x-[-1]" />
        </button>
      )}
    </div>
  );
});

