import { useState, useEffect, memo, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Brain, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getToolIcon, getToolConfig } from "./tool-config";
import type { ThinkingStep } from "@/hooks/agent-chat/types";

// Re-export for consumers
export type { ThinkingStep };

// v12.0: Parse result count from detail text for confidence badge
function parseResultCount(detail?: string): number | null {
  if (!detail) return null;
  const match = detail.match(/(\d+)\s*(results?|articles?|items?|sources?|transactions?|tasks?|accounts?|URLs?)/i);
  return match ? parseInt(match[1], 10) : null;
}

// v12.0: Confidence dot based on result count
function ConfidenceDot({ count }: { count: number }) {
  if (count === 0) return <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500/80 ml-1" title="No results" />;
  if (count <= 3) return <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500/80 ml-1" title={`${count} results`} />;
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 shadow-[0_0_4px_hsl(142,70%,45%,0.5)] ml-1" title={`${count} results`} />;
}

// v12.0: Live elapsed timer for loading steps.
// Uses requestAnimationFrame instead of setInterval so DOM writes are batched with
// the browser's paint cycle — no drift, no jank during high-frequency thought streams,
// and automatically paused when the tab is hidden.
function LiveTimer({ startTime }: { startTime: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const start = new Date(startTime).getTime();
    let rafId: number;
    let lastSecond = -1;

    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
      // Only write to the DOM when the displayed value actually changes (once per second).
      if (elapsed !== lastSecond) {
        lastSecond = elapsed;
        if (ref.current) {
          ref.current.textContent = `(${elapsed}s...)`;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [startTime]);
  return <span ref={ref} className="text-[9px] text-muted-foreground/60 ml-1 font-mono" />;
}

// v16.6.3: Static duration display using startedAt→timestamp delta
function StaticDuration({ startTime, endTime }: { startTime: string; endTime: string }) {
  const [display] = useState(() => {
    const ms = Math.max(0, new Date(endTime).getTime() - new Date(startTime).getTime());
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  });
  return <span className="text-[9px] text-muted-foreground/50 ml-1 font-mono">({display})</span>;
}

const ThinkingStepCard = memo(function ThinkingStepCard({ thought, showDetail = false, isStreaming = false }: { thought: ThinkingStep & { _count?: number }; showDetail?: boolean; isStreaming?: boolean }) {
  const Icon = getToolIcon(thought.tool_name);
  const toolConfig = getToolConfig(thought.tool_name || "");
  const resultCount = thought.status === "done" ? parseResultCount(thought.detail) : null;
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "flex items-start gap-2 py-1.5 px-2 rounded-md border-l-2",
        thought.status === "loading" && "bg-purple-500/5 border-l-purple-500/40",
        thought.status === "done" && "bg-green-500/5 border-l-green-500/40",
        thought.status === "error" && "bg-red-500/5 border-l-red-500/40"
      )}
    >
      <div className="mt-0.5 flex-shrink-0">
        {thought.status === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 text-purple-400 animate-spin" />
        ) : thought.status === "done" ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-red-500" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-3 w-3", toolConfig.color)} />
          <span className={cn(
            "text-xs font-medium truncate",
            thought.status === "loading" && "text-purple-400",
            thought.status === "done" && "text-muted-foreground",
            thought.status === "error" && "text-red-400"
          )}>
            {thought.title}
            {(thought as any)._count > 1 && (
              <span className="ml-1 text-[9px] opacity-60">×{(thought as any)._count}</span>
            )}
          </span>
          {/* v12.0: Execution timer — only show LiveTimer during active streaming */}
          {thought.status === "loading" && thought.timestamp && isStreaming && <LiveTimer startTime={thought.timestamp} />}
          {/* Show static "stalled" badge for loading thoughts on non-streaming messages */}
          {thought.status === "loading" && thought.timestamp && !isStreaming && (
            <span className="text-[9px] text-amber-400/70 ml-1 font-mono">(stalled)</span>
          )}
          {thought.status === "done" && thought.startedAt && <StaticDuration startTime={thought.startedAt} endTime={thought.timestamp} />}
          {/* v12.0: Confidence badge */}
          {resultCount !== null && <ConfidenceDot count={resultCount} />}
        </div>
        
        {/* v16.6.0: Always show detail for loading steps (live context) */}
        {(showDetail || thought.status === "loading") && thought.detail && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
            {thought.detail}
          </p>
        )}
      </div>
    </motion.div>
  );
});

export interface ThinkingAccordionProps {
  thoughts: ThinkingStep[];
  isStreaming?: boolean;
  hasContent?: boolean;
  className?: string;
}

export const ThinkingAccordion = memo(function ThinkingAccordion({ thoughts, isStreaming = false, hasContent = false, className }: ThinkingAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Two-layer deduplication to keep the thought list clean during fast streams (v11.0):
  //
  //   Layer 1 — ID dedup: The SSE stream can re-emit the same step ID multiple times
  //   (e.g. a "loading" followed by a "done" update for the same logical step). We keep
  //   only the first occurrence so each ID appears exactly once.
  //
  //   Layer 2 — Fingerprint collapse: Parallel tool calls sometimes produce structurally
  //   identical steps (same tool_name + detail + status). Rather than repeating them, we
  //   collapse extras into a count badge (e.g. "×3") on the first occurrence.
  //   Only "done" steps are collapsed; "loading"/"error" steps always stay visible
  //   individually so the user can see distinct in-flight operations.
  const displayThoughts = useMemo(() => {
    const raw = Array.isArray(thoughts) ? thoughts : [];

    // ═══ FIX: "Best status wins" dedup — done/error always beats loading for same ID ═══
    const STATUS_PRIORITY: Record<string, number> = { loading: 0, error: 1, done: 2 };
    const idMap = new Map<string, ThinkingStep>();
    for (const t of raw) {
      const existing = idMap.get(t.id);
      if (!existing) {
        idMap.set(t.id, t);
      } else {
        // Keep the one with higher status priority (done > error > loading)
        const existingPri = STATUS_PRIORITY[existing.status] ?? 0;
        const newPri = STATUS_PRIORITY[t.status] ?? 0;
        if (newPri > existingPri) {
          idMap.set(t.id, t);
        }
      }
    }
    const idDeduped = Array.from(idMap.values());

    // Layer 2: collapse identical completed steps into a count badge
    const fingerprints = new Map<string, { thought: ThinkingStep; count: number }>();
    const result: (ThinkingStep & { _count?: number })[] = [];
    for (const t of idDeduped) {
      const fp = `${t.tool_name || ''}|${t.detail || ''}|${t.status}`;
      const existing = fingerprints.get(fp);
      if (existing && t.status === "done") {
        existing.count++;
        (existing.thought as any)._count = existing.count;
      } else {
        fingerprints.set(fp, { thought: t, count: 1 });
        result.push(t);
      }
    }
    return result;
  }, [thoughts]);
  if (displayThoughts.length === 0) return null;
  
  const doneCount = displayThoughts.filter(t => t.status === "done").length;
  const loadingCount = displayThoughts.filter(t => t.status === "loading").length;
  const errorCount = displayThoughts.filter(t => t.status === "error").length;
  const totalCount = displayThoughts.length;
  
  const isActivelyThinking = isStreaming && loadingCount > 0;
  // Auto-expand while the agent is actively thinking AND the chat bubble has no content yet,
  // so users see live progress without having to click. Once the assistant starts writing
  // prose (hasContent=true) the accordion collapses to give content room. Explicit user
  // toggles (isExpanded) always take priority over the auto-expand heuristic.
  const shouldShowExpanded = isExpanded || (isActivelyThinking && !hasContent);
  
  return (
    <Collapsible 
      open={shouldShowExpanded} 
      onOpenChange={setIsExpanded}
      className={cn("mb-2", className)}
    >
      <CollapsibleTrigger asChild>
        <button 
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-[var(--glass-radius-card)] transition-all text-xs",
            "hover:bg-muted/30 focus:outline-none focus:ring-1 focus:ring-purple-500/30",
            isActivelyThinking
              ? "bg-purple-500/8 border border-transparent text-purple-400 animate-pulse"
              : "bg-muted/20 border border-border/20 text-muted-foreground"
          )}
        >
          <Brain className={cn("h-3.5 w-3.5", isStreaming && loadingCount > 0 && "animate-pulse")} />
          
          <span className="font-medium">
            {loadingCount > 0 ? (
              <>Thinking... ({doneCount}/{totalCount})</>
            ) : errorCount > 0 ? (
              <>View {totalCount} step{totalCount > 1 ? "s" : ""} ({errorCount} error{errorCount > 1 ? "s" : ""})</>
            ) : (
              <>View {doneCount} thinking step{doneCount > 1 ? "s" : ""}</>
            )}
          </span>
          
          {shouldShowExpanded ? (
            <ChevronUp className="h-3 w-3 ml-auto" />
          ) : (
            <ChevronDown className="h-3 w-3 ml-auto" />
          )}
        </button>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <AnimatePresence mode="popLayout">
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 space-y-1 pl-3 border-l-2 border-purple-500/20"
          >
            {displayThoughts.map((thought) => (
              <ThinkingStepCard key={thought.id} thought={thought} showDetail={true} isStreaming={isStreaming} />
            ))}
          </motion.div>
        </AnimatePresence>
      </CollapsibleContent>
    </Collapsible>
  );
});
