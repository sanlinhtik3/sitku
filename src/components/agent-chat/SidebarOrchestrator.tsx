// ═══ Sidebar Orchestrator (V2) ═══
// V2: Animated transitions, consistent mobile handling, compact code.

import { ReactNode, useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { AnimatePresence, motion } from "motion/react";

interface SidebarOrchestratorProps {
  artifactPanel: ReactNode | null;
  toolsPanel: ReactNode | null;
  subtaskPanel?: ReactNode | null;
  threadPanel?: ReactNode | null;
  showArtifact: boolean;
  showTools: boolean;
  showSubtasks?: boolean;
  showThread?: boolean;
}

const MIN_W = 280;
const MAX_W = 600;
const DEFAULT_W = 360;

export function SidebarOrchestrator({
  artifactPanel, toolsPanel, subtaskPanel, threadPanel,
  showArtifact, showTools, showSubtasks = false, showThread = false,
}: SidebarOrchestratorProps) {
  const isMobile = useIsMobile();
  const [width, setWidth] = useState(DEFAULT_W);
  const dragState = useRef({ active: false, startX: 0, startW: DEFAULT_W });

  const startDrag = useCallback((clientX: number) => {
    dragState.current = { active: true, startX: clientX, startW: width };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  const onMouseDown = useCallback((e: React.MouseEvent) => { e.preventDefault(); startDrag(e.clientX); }, [startDrag]);
  const onTouchStart = useCallback((e: React.TouchEvent) => { startDrag(e.touches[0].clientX); }, [startDrag]);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragState.current.active) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const delta = dragState.current.startX - clientX;
      setWidth(Math.min(MAX_W, Math.max(MIN_W, dragState.current.startW + delta)));
    };
    const onUp = () => {
      if (!dragState.current.active) return;
      dragState.current.active = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, []);

  // Priority: Tools > Subtasks > Artifact > Thread (Thread is the secondary/additive one)
  const activeKey = showTools ? "tools"
    : showSubtasks && subtaskPanel ? "subtasks"
    : showArtifact ? "artifact"
    : showThread && threadPanel ? "thread"
    : null;
  const activeContent = activeKey === "tools" ? toolsPanel
    : activeKey === "subtasks" ? subtaskPanel
    : activeKey === "artifact" ? artifactPanel
    : activeKey === "thread" ? threadPanel
    : null;

  if (!activeKey || !activeContent) return null;

  // Mobile: full-width, no resize
  if (isMobile) return <>{activeContent}</>;

  return (
    <div
      className={cn(
        "flex flex-col shrink-0 h-full max-h-full overflow-hidden relative",
        // macOS-style floating glass panel (matches ChatSessionSidebar + main chat panel)
        // Margins are unconditional so the bottom gap from the window edge never collapses.
        "mt-1.5 mb-1.5 mr-1.5 lg:rounded-2xl lg:border lg:border-border/40",
        "bg-card/30 backdrop-blur-xl",
        "shadow-[0_8px_32px_-12px_rgba(0,0,0,0.45)]",
      )}
      style={{ width: `${width}px` }}
    >
      {/* Resize handle (sits just outside the rounded edge) */}
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        className="absolute -left-1.5 top-0 bottom-0 w-2 z-20 cursor-col-resize hover:bg-primary/20 active:bg-primary/40 transition-colors rounded-full"
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={activeKey}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          transition={{ duration: 0.08 }}
          className="flex-1 min-h-0 flex flex-col overflow-hidden lg:rounded-2xl"
        >
          {activeContent}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
