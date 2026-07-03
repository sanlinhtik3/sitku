import { memo, useState } from "react";
import { Globe, ExternalLink, Loader2, AlertCircle, ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { getFaviconUrl, getDisplayHostname } from "@/lib/favicon";
import { cn } from "@/lib/utils";
import type { ToolRendererProps } from "./types";

/**
 * Renders `browser_scrape` results as a website preview: favicon + page title +
 * hostname + first ~3 lines of content with a "Show more" toggle.
 */
export const BrowserScrapeCard = memo(function BrowserScrapeCard({
  status,
  result,
  args,
}: ToolRendererProps) {
  const [expanded, setExpanded] = useState(false);
  const url = (args?.url as string) || (result && (result as Record<string, unknown>).url as string) || "";

  if (status === "running" || status === "pending") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/30 border border-border/20">
        <Loader2 className="h-3.5 w-3.5 text-emerald-400 animate-spin shrink-0" />
        <span className="text-xs text-muted-foreground/80 truncate">
          Reading {url ? <span className="text-foreground/85 italic">{getDisplayHostname(url)}</span> : "page"}…
        </span>
      </div>
    );
  }

  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;

  if (r.error || r.needs_setup) {
    return (
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-[11px] text-amber-200/85">
          {r.needs_setup ? "Firecrawl API key needed to read pages." : String(r.error).slice(0, 200)}
        </div>
      </div>
    );
  }

  const title = (r.title as string) || (r.metadata as Record<string, unknown>)?.title as string || url || "Page";
  const content = (r.markdown as string) || (r.content as string) || (r.text as string) || "";
  const hostname = url ? getDisplayHostname(url) : null;
  const faviconSrc = url ? getFaviconUrl(url, 32) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl bg-card/30 border border-border/20 overflow-hidden"
    >
      <a
        href={url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-start gap-2.5 px-3 py-2 group",
          url && "hover:bg-muted/15 transition-colors",
        )}
      >
        {faviconSrc ? (
          <img src={faviconSrc} alt="" width={20} height={20} className="h-5 w-5 rounded-sm bg-muted/40 shrink-0 mt-0.5" />
        ) : (
          <Globe className="h-5 w-5 text-emerald-400/80 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium text-foreground/95 line-clamp-1 group-hover:text-primary transition-colors">
              {title}
            </span>
            {url && (
              <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/40 group-hover:text-muted-foreground/70 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          {hostname && <div className="text-[10px] text-emerald-400/70 mt-0.5 truncate">{hostname}</div>}
        </div>
      </a>

      {content && (
        <div className="border-t border-border/10 px-3 py-2 bg-muted/[0.04]">
          <p className={cn(
            "text-[11px] leading-relaxed text-muted-foreground/85 whitespace-pre-line",
            !expanded && "line-clamp-3",
          )}>
            {content}
          </p>
          {content.length > 240 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1.5 text-[10px] text-primary/70 hover:text-primary flex items-center gap-1"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
              {expanded ? "Show less" : "Show full content"}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
});
