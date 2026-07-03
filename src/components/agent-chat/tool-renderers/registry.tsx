import { memo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getToolConfig, formatToolSummary } from "../tool-config";
import type { ToolRenderer, ToolRendererProps } from "./types";
import { WebSearchCard } from "./WebSearchCard";
import { BrowserScrapeCard } from "./BrowserScrapeCard";
import { KnowledgeBaseCard } from "./KnowledgeBaseCard";
import { FlowstateCard } from "./FlowstateCard";
import { ImageGenInlineCard } from "./ImageGenInlineCard";
import { MemoryRecallCard } from "./MemoryRecallCard";

/**
 * Per-tool renderer registry. Add new tool families here as we build them.
 * Falls back to `GenericToolResult` (a smart key/value summary, not raw JSON)
 * for unmapped tools.
 */
const RENDERERS: Record<string, ToolRenderer> = {
  search_web: WebSearchCard,
  browser_search: WebSearchCard,
  search_web_deep: WebSearchCard,
  browser_scrape: BrowserScrapeCard,
  search_knowledge_base: KnowledgeBaseCard,
  manage_flowstate: FlowstateCard,
  generate_image: ImageGenInlineCard,
  recall_user_facts: MemoryRecallCard,
  recall_episodic_memory: MemoryRecallCard,
};

/**
 * Set of tools whose results are rich enough to render inline below the
 * assistant message bubble (instead of only inside the SourcesPanel sidebar).
 * Mundane tools stay sidebar-only to keep the bubble flow uncluttered.
 */
export const INLINE_RENDERED_TOOLS = new Set(Object.keys(RENDERERS));

/** Whether a given tool name should auto-render below the message bubble. */
export function shouldRenderInline(toolName: string): boolean {
  return INLINE_RENDERED_TOOLS.has(toolName);
}

/**
 * The single entry point components should call to render a tool's output.
 * Decides between the bespoke renderer and the generic fallback automatically.
 */
export const ToolResultRenderer = memo(function ToolResultRenderer(props: ToolRendererProps) {
  const Renderer = RENDERERS[props.name];
  if (Renderer) return <Renderer {...props} />;
  return <GenericToolResult {...props} />;
});

/**
 * Default renderer for tools without a custom card. Shows a one-line summary
 * (via `formatToolSummary`) and lets the user expand for the raw JSON. Far
 * lighter than dumping JSON by default.
 */
export const GenericToolResult = memo(function GenericToolResult({
  name,
  status,
  result,
}: ToolRendererProps) {
  const [open, setOpen] = useState(false);
  const config = getToolConfig(name);
  const Icon = config.icon;
  const summary = formatToolSummary(name, result);

  if (status === "running" || status === "pending") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/30 border border-border/20">
        <Icon className={cn("h-3.5 w-3.5 animate-pulse shrink-0", config.color)} />
        <span className="text-xs text-muted-foreground/80 truncate">
          {config.label} working…
        </span>
      </div>
    );
  }

  if (status === "error") {
    const err =
      result && typeof result === "object" && (result as Record<string, unknown>).error
        ? String((result as Record<string, unknown>).error)
        : "Something went wrong.";
    return (
      <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-[11px] text-destructive/85">
        <span className="font-medium">{config.label}:</span> {err.slice(0, 200)}
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-card/30 border border-border/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/15 transition-colors text-left"
      >
        <Icon className={cn("h-3.5 w-3.5 shrink-0", config.color)} />
        <span className="text-[11px] text-foreground/85 font-medium truncate">{config.label}</span>
        {summary && <span className="text-[11px] text-muted-foreground/65 truncate">· {summary}</span>}
        {result != null && (
          <ChevronDown className={cn("h-3 w-3 ml-auto text-muted-foreground/50 transition-transform", open && "rotate-180")} />
        )}
      </button>
      {open && result != null && (
        <pre className="text-[10px] text-muted-foreground/70 font-mono overflow-x-auto max-h-48 px-3 py-2 border-t border-border/10 bg-black/15">
          {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
});
