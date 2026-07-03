import { memo } from "react";
import { motion } from "motion/react";
import { BookOpen, Loader2 } from "lucide-react";
import type { ToolRendererProps } from "./types";

interface KBArticle {
  title?: string;
  excerpt?: string;
  category?: string;
  slug?: string;
  url?: string;
  similarity?: number;
}

/**
 * Renders `search_knowledge_base` results as a tidy list of article tiles
 * showing title, category badge, similarity score, and excerpt.
 */
export const KnowledgeBaseCard = memo(function KnowledgeBaseCard({
  status,
  result,
  args,
}: ToolRendererProps) {
  const query = (args?.query as string) || "";

  if (status === "running" || status === "pending") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/30 border border-border/20">
        <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin shrink-0" />
        <span className="text-xs text-muted-foreground/80 truncate">
          Searching knowledge base{query && (
            <> for <span className="text-foreground/85 italic">"{query}"</span></>
          )}…
        </span>
      </div>
    );
  }

  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;

  const articles: KBArticle[] = Array.isArray(r.results) ? (r.results as KBArticle[]) : [];

  if (articles.length === 0 || r.empty) {
    return (
      <div className="px-3 py-2 rounded-lg bg-muted/20 border border-border/20 text-[11px] text-muted-foreground/70">
        No knowledge-base articles found{query && <> for <span className="italic">"{query}"</span></>}.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card/30 border border-amber-500/15 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/[0.06] border-b border-amber-500/15">
        <BookOpen className="h-3 w-3 text-amber-500/80 shrink-0" />
        <span className="text-[11px] text-muted-foreground/80 truncate">
          Knowledge base · <span className="text-foreground/85">{articles.length} article{articles.length === 1 ? "" : "s"}</span>
        </span>
      </div>
      <ul className="divide-y divide-border/10">
        {articles.slice(0, 6).map((a, idx) => (
          <motion.li
            key={`${a.slug || a.title}-${idx}`}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.16, delay: Math.min(idx * 0.04, 0.18) }}
            className="px-3 py-2"
          >
            <div className="flex items-start gap-2">
              <BookOpen className="h-3.5 w-3.5 text-amber-500/70 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[12px] font-medium text-foreground/90 line-clamp-1">
                    {a.title || "Untitled"}
                  </span>
                  {a.category && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-amber-500/15 text-amber-400/85 uppercase tracking-wide">
                      {a.category}
                    </span>
                  )}
                  {typeof a.similarity === "number" && (
                    <span className="text-[9px] text-muted-foreground/40 font-mono tabular-nums">
                      {(a.similarity * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                {a.excerpt && (
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-2 leading-relaxed">
                    {a.excerpt}
                  </p>
                )}
              </div>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
});
