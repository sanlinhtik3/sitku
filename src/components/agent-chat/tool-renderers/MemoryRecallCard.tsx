import { memo } from "react";
import { Brain, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import type { ToolRendererProps } from "./types";

interface MemoryItem {
  fact?: string;
  text?: string;
  content?: string;
  category?: string;
  created_at?: string;
  similarity?: number;
}

/** Renders `recall_user_facts` / `recall_episodic_memory` as a "memories" stack. */
export const MemoryRecallCard = memo(function MemoryRecallCard({
  status,
  name,
  result,
  args,
}: ToolRendererProps) {
  const query = (args?.query as string) || "";
  const isEpisodic = name === "recall_episodic_memory";

  if (status === "running" || status === "pending") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/30 border border-border/20">
        <Loader2 className="h-3.5 w-3.5 text-cyan-500 animate-spin shrink-0" />
        <span className="text-xs text-muted-foreground/80 truncate">
          Recalling {isEpisodic ? "past conversations" : "facts about you"}{query && (
            <> for <span className="italic">"{query}"</span></>
          )}…
        </span>
      </div>
    );
  }

  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const items: MemoryItem[] =
    (Array.isArray(r.facts) ? (r.facts as MemoryItem[]) : null) ||
    (Array.isArray(r.memories) ? (r.memories as MemoryItem[]) : null) ||
    (Array.isArray(r.results) ? (r.results as MemoryItem[]) : null) ||
    [];

  if (items.length === 0) {
    return (
      <div className="px-3 py-2 rounded-lg bg-muted/20 border border-border/20 text-[11px] text-muted-foreground/70">
        No matching memories found.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card/30 border border-cyan-500/15 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/[0.06] border-b border-cyan-500/15">
        <Brain className="h-3 w-3 text-cyan-400/80" />
        <span className="text-[11px] text-muted-foreground/80">
          {isEpisodic ? "Episodic memory" : "User facts"} · {items.length} match{items.length === 1 ? "" : "es"}
        </span>
      </div>
      <ul className="divide-y divide-border/10">
        {items.slice(0, 6).map((m, idx) => {
          const text = m.fact || m.text || m.content || "";
          return (
            <motion.li
              key={idx}
              initial={{ opacity: 0, x: -3 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.14, delay: Math.min(idx * 0.04, 0.18) }}
              className="px-3 py-1.5"
            >
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-cyan-400/40 font-mono shrink-0 pt-0.5">{idx + 1}.</span>
                <p className="text-[11px] text-foreground/85 leading-relaxed line-clamp-2 flex-1">
                  {text}
                </p>
                {typeof m.similarity === "number" && (
                  <span className="text-[9px] text-muted-foreground/40 font-mono tabular-nums shrink-0">
                    {(m.similarity * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
});
