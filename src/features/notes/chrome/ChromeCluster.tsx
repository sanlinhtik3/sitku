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
  signalsOpen: boolean;
  onToggleSidebar: () => void;
  onSetEditorMode: (mode: EditorMode) => void;
  onOpenSkills: () => void;
  onOpenSettings: () => void;
  onToggleAgent: () => void;
  onOpenSignals: () => void;
  signalsAvailable?: boolean;
  showSkillsButton?: boolean;
  showPanelButton?: boolean;
  chromeButtonClass?: string;
  chromeButtonActiveClass?: string;
  interactiveRegion: CSSProperties;
}

const BTN_CLASS =
  "bb-native-control h-[34px] w-[34px] rounded-[var(--bb-radius-control)] bg-transparent text-[var(--bb-text-3)] hover:bg-[var(--bb-bg-3)] hover:text-[var(--bb-text-1)] transition-[color,background-color,box-shadow,transform] duration-[140ms] shrink-0 flex items-center justify-center border-none cursor-pointer";
const ACTIVE_BTN_CLASS =
  "bg-[var(--bb-bg-3)] text-[var(--bb-text-1)] shadow-[inset_0_0_0_0.5px_var(--bb-border)]";

export const ChromeCluster = memo(function ChromeCluster({
  sidebarOpen,
  editorMode,
  skillsOpen,
  settingsOpen,
  agentOpen,
  signalsOpen,
  onToggleSidebar,
  onSetEditorMode,
  onOpenSkills,
  onOpenSettings,
  onToggleAgent,
  onOpenSignals,
  signalsAvailable = false,
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
      <div className="flex items-center gap-[2px] bg-[rgba(255,255,255,0.05)] rounded-[var(--bb-radius-control)] p-[2px] mx-[2px] shrink-0">
        <button
          type="button"
          title="Editing view"
          className={cn(
            "bb-native-control h-[30px] w-[34px] rounded-[var(--bb-radius-control)] flex items-center justify-center text-[var(--bb-text-3)] hover:text-[var(--bb-text-1)] transition-[color,background-color,box-shadow,transform] duration-[130ms] border-none cursor-pointer",
            editorMode === "edit"
              ? "bg-[var(--bb-bg-3)] text-[var(--bb-text-1)] shadow-[0_1px_3px_rgba(0,0,0,0.25),_inset_0_0_0_0.5px_var(--bb-border)]"
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
            "bb-native-control h-[30px] w-[34px] rounded-[var(--bb-radius-control)] flex items-center justify-center text-[var(--bb-text-3)] hover:text-[var(--bb-text-1)] transition-[color,background-color,box-shadow,transform] duration-[130ms] border-none cursor-pointer",
            editorMode === "preview"
              ? "bg-[var(--bb-bg-3)] text-[var(--bb-text-1)] shadow-[0_1px_3px_rgba(0,0,0,0.25),_inset_0_0_0_0.5px_var(--bb-border)]"
              : ""
          )}
          onClick={() => onSetEditorMode("preview")}
        >
          <Book className="h-[15px] w-[15px] shrink-0" />
        </button>
      </div>

      <button
        type="button"
        title={signalsOpen ? "Close content signals" : "Open content signals"}
        aria-label={signalsOpen ? "Close content signals" : "Open content signals"}
        disabled={!signalsAvailable}
        className={cn(
          BTN_CLASS,
          signalsOpen && ACTIVE_BTN_CLASS,
          !signalsAvailable && "cursor-not-allowed opacity-40",
        )}
        onClick={onOpenSignals}
      >
        <MagicStick3 className="h-[16px] w-[16px] shrink-0" />
      </button>

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
