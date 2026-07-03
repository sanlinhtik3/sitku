import { memo, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { TOOL_LABELS } from "@/hooks/agent-chat/types";
import type { ToolProgressStep } from "./ExecutionTimeline";
import type { TaskPlanStep } from "./TaskDecompositionCard";

interface LiveActivitySentenceProps {
  /** Most-recently active tool, if any. */
  toolProgressSteps: ToolProgressStep[];
  /** Plan step currently running, if a structured plan exists. */
  taskPlanSteps: TaskPlanStep[];
  /** Free-form narration coming from the SSE stream. */
  latestNarration?: string;
  /** Higher-level status string (e.g. "Verifying citations…"). */
  currentStatus: string | null;
  /** Hide entirely when nothing useful to say. */
  isStreaming: boolean;
}

/**
 * Single, prominent "what the agent is doing right now" sentence.
 *
 * Composes the best available signal in this priority order:
 *   1. Currently running tool + its context (e.g. "🌐 Searching the web for 'X'")
 *   2. Currently running plan step (e.g. "✍️ Writing the report")
 *   3. Free-form narration message
 *   4. Generic thinking-status text
 *
 * Animates the message in with a brief typewriter reveal whenever the message
 * changes, so the sentence always *feels* alive even between status updates.
 */
export const LiveActivitySentence = memo(function LiveActivitySentence({
  toolProgressSteps,
  taskPlanSteps,
  latestNarration,
  currentStatus,
  isStreaming,
}: LiveActivitySentenceProps) {
  if (!isStreaming) return null;

  const sentence = pickSentence({ toolProgressSteps, taskPlanSteps, latestNarration, currentStatus });
  if (!sentence) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={sentence.key}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -2 }}
        transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
        className="flex items-baseline gap-1.5 px-1 min-h-[18px]"
      >
        <span className="text-base leading-none translate-y-[1px]">{sentence.emoji}</span>
        <Typewriter
          text={sentence.text}
          highlight={sentence.highlight}
          className="text-[12.5px] text-foreground/85 leading-relaxed font-medium"
        />
        <DotTicker />
      </motion.div>
    </AnimatePresence>
  );
});

interface ChosenSentence {
  key: string;
  emoji: string;
  text: string;
  /** Optional substring that should be italicised inside `text` (e.g. a query). */
  highlight?: string;
}

function pickSentence({
  toolProgressSteps,
  taskPlanSteps,
  latestNarration,
  currentStatus,
}: Omit<LiveActivitySentenceProps, "isStreaming">): ChosenSentence | null {
  // 1) Active tool — most natural & precise signal.
  const runningTool = toolProgressSteps.find((s) => s.status === "running");
  if (runningTool) {
    const phrased = phraseForTool(runningTool);
    if (phrased) return { key: `tool-${runningTool.id}-${runningTool.context || ""}`, ...phrased };
  }

  // 2) Active plan step.
  const runningPlan = taskPlanSteps.find((s) => s.status === "running");
  if (runningPlan) {
    const label = runningPlan.label || TOOL_LABELS[runningPlan.tool] || "Working";
    return {
      key: `plan-${runningPlan.id || runningPlan.tool}`,
      emoji: runningPlan.emoji || "🛠️",
      text: label,
      highlight: runningPlan.context,
    };
  }

  // 3) Narration message.
  if (latestNarration) {
    return { key: `narr-${latestNarration}`, emoji: "💬", text: latestNarration };
  }

  // 4) Generic status fallback.
  if (currentStatus) {
    return { key: `status-${currentStatus}`, emoji: emojiForStatus(currentStatus), text: stripLeadingEmoji(currentStatus) };
  }

  // No meaningful signal yet — let the focal card's default "Thinking…" do the
  // talking instead of duplicating it here.
  return null;
}

/** Tool-specific natural-language phrasing (verb + object). */
function phraseForTool(step: ToolProgressStep): { emoji: string; text: string; highlight?: string } | null {
  const tool = step.tool;
  const ctx = (step.context || "").trim();

  switch (tool) {
    case "search_web":
    case "browser_search":
    case "search_web_deep":
      return { emoji: "🌐", text: ctx ? `Searching the web for "${ctx}"` : "Searching the web", highlight: ctx };
    case "search_knowledge_base":
      return { emoji: "📚", text: ctx ? `Looking up "${ctx}" in your knowledge base` : "Searching the knowledge base", highlight: ctx };
    case "browser_scrape":
      return { emoji: "📄", text: ctx ? `Reading ${ctx}` : "Reading webpage", highlight: ctx };
    case "browser_map":
      return { emoji: "🗺️", text: ctx ? `Mapping ${ctx}` : "Mapping site structure", highlight: ctx };
    case "generate_image":
      return { emoji: "🎨", text: ctx ? `Painting "${ctx}"` : "Generating image", highlight: ctx };
    case "generate_file":
      return { emoji: "📝", text: ctx ? `Writing ${ctx}` : "Generating file", highlight: ctx };
    case "manage_flowstate":
      return { emoji: "💰", text: "Updating FlowState" };
    case "manage_workspace_task":
      return { emoji: "✅", text: "Managing tasks" };
    case "recall_user_facts":
    case "recall_episodic_memory":
      return { emoji: "🧠", text: ctx ? `Recalling memories of "${ctx}"` : "Recalling memories", highlight: ctx };
    case "remember_user_fact":
      return { emoji: "💡", text: "Remembering this for later" };
    case "spawn_sub_agent":
      return { emoji: "🤖", text: ctx ? `Delegating: ${ctx}` : "Spawning sub-agent", highlight: ctx };
    case "ask_other_agents":
      return { emoji: "📡", text: "Asking other agents" };
    case "manage_telegram_bot":
    case "broadcast_message":
      return { emoji: "📨", text: ctx ? `Broadcasting to ${ctx}` : "Sending message", highlight: ctx };
    case "schedule_task":
      return { emoji: "⏰", text: ctx ? `Scheduling: ${ctx}` : "Scheduling task", highlight: ctx };
    case "generate_ai_content":
      return { emoji: "✨", text: ctx ? `Drafting ${ctx}` : "Drafting AI content", highlight: ctx };
    case "super_plan_and_execute":
      return { emoji: "⚡", text: "Planning & executing" };
  }

  // Fallback: convert tool name to natural phrase.
  const label = TOOL_LABELS[tool] || tool.replace(/_/g, " ");
  return { emoji: step.emoji || "🛠️", text: ctx ? `${label}: ${ctx}` : `Running ${label}`, highlight: ctx };
}

function emojiForStatus(status: string): string {
  const m = status.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}])/u);
  if (m) return m[1];
  const l = status.toLowerCase();
  if (l.includes("search") || l.includes("ရှာ")) return "🔎";
  if (l.includes("write") || l.includes("ရေး")) return "✍️";
  if (l.includes("verif") || l.includes("စစ်")) return "✅";
  if (l.includes("plan")) return "📋";
  return "🧠";
}

function stripLeadingEmoji(s: string): string {
  return s.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]+\s*/u, "");
}

/** Reveals the text character-by-character (~4 chars/frame at 60fps ≈ 240 cps). */
function Typewriter({ text, highlight, className }: { text: string; highlight?: string; className?: string }) {
  const [revealed, setRevealed] = useState("");
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    let i = 0;
    setRevealed("");
    const tick = () => {
      i = Math.min(i + 4, text.length);
      setRevealed(text.slice(0, i));
      if (i < text.length) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [text]);

  // If a highlight substring is provided, italicise it inside the revealed text.
  if (highlight && revealed.includes(highlight)) {
    const idx = revealed.indexOf(highlight);
    const before = revealed.slice(0, idx);
    const after = revealed.slice(idx + highlight.length);
    return (
      <span className={cn(className)}>
        {before}
        <em className="not-italic font-semibold text-primary/95">{highlight}</em>
        {after}
      </span>
    );
  }

  return <span className={className}>{revealed}</span>;
}

/** Three-dot ticker that animates while the agent is working. */
function DotTicker() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 4), 350);
    return () => clearInterval(id);
  }, []);
  const dots = "·".repeat(tick) || " ";
  return (
    <span className="text-foreground/40 font-mono text-[12px] tabular-nums" aria-hidden>
      {dots}
    </span>
  );
}
