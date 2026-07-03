import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

export interface LiveThinkingIndicatorProps {
  currentStatus: string | null;
  isActive: boolean;
  botEmoji?: string;
  className?: string;
  currentStep?: number;
  totalSteps?: number;
  showDetails?: boolean;
  toolCalls?: { name: string; status: string }[];
  relayRound?: number;
  totalRelayRounds?: number;
  relayStartTime?: number;
  compact?: boolean;
  stepCountLabel?: string;
  onClick?: () => void;
  latestNarration?: string;
}

/**
 * Compact single-line agent status indicator
 * Phase-aware colored dot + status text + timer
 */
export function LiveThinkingIndicator({
  currentStatus, isActive, className,
  relayStartTime, stepCountLabel, onClick, latestNarration,
}: LiveThinkingIndicatorProps) {
  const timerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isActive) return;
    const start = relayStartTime || Date.now();
    const tick = () => {
      if (!timerRef.current) return;
      const s = Math.floor((Date.now() - start) / 1000);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      timerRef.current.textContent = m > 0
        ? `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
        : s > 0 ? `${String(sec).padStart(2, "0")}s` : "";
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isActive, relayStartTime]);

  if (!isActive) return null;

  const phase = getPhaseColor(currentStatus);
  const displayText = currentStatus || "Thinking...";
  const fullText = stepCountLabel ? `${stepCountLabel} · ${displayText}` : displayText;

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-col gap-0.5 py-1.5 px-1",
        onClick && "cursor-pointer rounded-lg hover:bg-muted/15 transition-colors group",
        className,
      )}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Primary row: dot + status + timer */}
      <div className="flex items-center gap-2.5">
        {/* Phase-aware pulsing dot */}
        <div className="relative flex h-2 w-2 shrink-0">
          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-60", phase.dot)} />
          <span className={cn("relative inline-flex rounded-full h-2 w-2", phase.dot)} />
        </div>

        {/* Status text with smooth swap */}
        <AnimatePresence mode="wait">
          <motion.span
            key={fullText}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.15 }}
            className="text-[13px] text-muted-foreground font-medium truncate min-w-0"
          >
            {fullText}
          </motion.span>
        </AnimatePresence>

        {/* Timer */}
        <span
          ref={timerRef}
          className="text-[11px] text-muted-foreground/40 font-mono tabular-nums shrink-0 ml-auto"
        />
      </div>

      {/* Secondary row: latest narration — conversational subtitle */}
      <AnimatePresence mode="wait">
        {latestNarration && (
          <motion.p
            key={latestNarration}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="text-[12px] text-muted-foreground/60 leading-relaxed pl-[18px] truncate"
          >
            {latestNarration}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

interface PhaseColor { dot: string }

function getPhaseColor(status: string | null): PhaseColor {
  if (!status) return { dot: "bg-amber-400" };
  const l = status.toLowerCase();
  if (l.includes("✍️") || l.includes("ရေး") || l.includes("final") || l.includes("assembl") || l.includes("ပြင်ဆင်"))
    return { dot: "bg-emerald-400" };
  if (l.includes("🔍") || l.includes("ရှာ") || l.includes("search") || l.includes("စစ်ဆေး") || l.includes("verif"))
    return { dot: "bg-sky-400" };
  if (l.includes("📡") || l.includes("data") || l.includes("ဆွဲယူ") || l.includes("connect") || l.includes("ချိတ်ဆက်"))
    return { dot: "bg-violet-400" };
  if (l.includes("execut") || l.includes("tool") || l.includes("work"))
    return { dot: "bg-primary" };
  return { dot: "bg-amber-400" };
}
