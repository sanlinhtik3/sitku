import { useState, memo } from "react";
import { motion } from "motion/react";
import { Globe, ExternalLink, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFaviconUrl, getDisplayHostname } from "@/lib/favicon";
import type { ToolRendererProps } from "./types";

interface SearchResult {
  title?: string;
  url?: string;
  link?: string;
  snippet?: string;
  description?: string;
  displayed_link?: string;
  position?: number;
}

/** Normalise a single result entry coming from any of our search tool flavours
 *  (`search_web`, `browser_search`, `search_web_deep`). They all return slightly
 *  different field names, so we read whichever is present. */
function normaliseResult(r: unknown): SearchResult | null {
  if (!r || typeof r !== "object") return null;
  const x = r as Record<string, unknown>;
  const url = (x.url as string) || (x.link as string) || "";
  if (!url) return null;
  return {
    url,
    title: (x.title as string) || url,
    snippet: (x.snippet as string) || (x.description as string) || "",
    position: typeof x.position === "number" ? x.position : undefined,
  };
}

function FaviconImage({ url }: { url: string }) {
  const [errored, setErrored] = useState(false);
  const src = getFaviconUrl(url, 32);
  if (!src || errored) {
    return (
      <div className="h-4 w-4 rounded-sm bg-muted/40 flex items-center justify-center shrink-0">
        <Globe className="h-2.5 w-2.5 text-muted-foreground/60" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      decoding="async"
      onError={() => setErrored(true)}
      className="h-4 w-4 rounded-sm bg-muted/40 shrink-0"
    />
  );
}

const COLLAPSED_RESULT_COUNT = 4;

/**
 * Renders web-search tool results as a stack of native-feeling result cards
 * (favicon + title + hostname + snippet) instead of a JSON dump. Replaces the
 * "search_web → JSON" output with the same card pattern Claude.ai / ChatGPT
 * use, but compacted for the chat bubble width.
 */
export const WebSearchCard = memo(function WebSearchCard({
  status,
  result,
  args,
  compact = true,
}: ToolRendererProps) {
  const [expanded, setExpanded] = useState(false);

  const query =
    (args?.query as string) ||
    (typeof result === "object" && result && (result as Record<string, unknown>).query as string) ||
    "";

  if (status === "running" || status === "pending") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/30 border border-border/20">
        <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
        <span className="text-xs text-muted-foreground/80 truncate">
          {query ? <>Searching <span className="text-foreground/85 italic">"{query}"</span>…</> : "Searching the web…"}
        </span>
      </div>
    );
  }

  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;

  const rawResults: unknown[] = Array.isArray(r.results)
    ? (r.results as unknown[])
    : Array.isArray(r.sources)
      ? (r.sources as unknown[])
      : [];

  const normalised = rawResults.map(normaliseResult).filter((x): x is SearchResult => x !== null);

  if (normalised.length === 0) {
    if (r.error) {
      return (
        <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-[11px] text-destructive/85">
          Search failed: {String(r.error).slice(0, 120)}
        </div>
      );
    }
    return (
      <div className="px-3 py-2 rounded-lg bg-muted/20 border border-border/20 text-[11px] text-muted-foreground/70">
        No results for {query ? <span className="italic">"{query}"</span> : "your query"}.
      </div>
    );
  }

  const visible = expanded ? normalised : normalised.slice(0, COLLAPSED_RESULT_COUNT);
  const hidden = Math.max(0, normalised.length - visible.length);

  return (
    <div className="rounded-xl bg-card/30 border border-border/20 overflow-hidden">
      {query && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/10 bg-muted/10">
          <Globe className="h-3 w-3 text-emerald-400/80 shrink-0" />
          <span className="text-[11px] text-muted-foreground/70 truncate">
            Web search · <span className="italic text-foreground/85">"{query}"</span> · {normalised.length} result{normalised.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      <ul className="divide-y divide-border/10">
        {visible.map((res, idx) => (
          <SearchResultRow key={`${res.url}-${idx}`} result={res} index={idx} compact={compact} />
        ))}
      </ul>

      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors flex items-center justify-center gap-1.5 border-t border-border/10"
        >
          <ChevronDown className="h-3 w-3" />
          Show {hidden} more result{hidden === 1 ? "" : "s"}
        </button>
      )}

      {expanded && normalised.length > COLLAPSED_RESULT_COUNT && (
        <button
          onClick={() => setExpanded(false)}
          className="w-full px-3 py-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors border-t border-border/10"
        >
          Show less
        </button>
      )}
    </div>
  );
});

const SearchResultRow = memo(function SearchResultRow({
  result,
  index,
  compact,
}: {
  result: SearchResult;
  index: number;
  compact: boolean;
}) {
  const hostname = result.url ? getDisplayHostname(result.url) : null;

  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.04, 0.2) }}
    >
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "group flex items-start gap-2.5 px-3 py-2 hover:bg-muted/15 transition-colors",
          "focus:outline-none focus:bg-muted/20",
        )}
      >
        <FaviconImage url={result.url || ""} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium text-foreground/90 group-hover:text-primary transition-colors line-clamp-1">
              {result.title}
            </span>
            <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/40 group-hover:text-muted-foreground/70 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {hostname && (
            <div className="text-[10px] text-emerald-400/70 mt-0.5 truncate">
              {hostname}
            </div>
          )}
          {result.snippet && !compact && (
            <p className="text-[11px] text-muted-foreground/75 mt-1 line-clamp-2 leading-relaxed">
              {result.snippet}
            </p>
          )}
          {result.snippet && compact && (
            <p className="text-[11px] text-muted-foreground/65 mt-0.5 line-clamp-1 leading-relaxed">
              {result.snippet}
            </p>
          )}
        </div>
      </a>
    </motion.li>
  );
});

WebSearchCard.displayName = "WebSearchCard";
