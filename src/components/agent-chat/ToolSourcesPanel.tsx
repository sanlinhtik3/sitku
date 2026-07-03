import { motion, AnimatePresence } from "motion/react";
import { X, ExternalLink, Zap, ChevronDown, ChevronUp, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { LucideIcon } from "lucide-react";
import { useState } from "react";

export interface ToolEntry {
  toolName: string;
  label: string;
  icon: LucideIcon;
  color: string;
  summary: string;
  status: "success" | "error" | "running" | "pending";
  results?: { title: string; url: string; snippet?: string }[];
}

// Keep backward compat export
export type SourceEntry = ToolEntry;

interface ToolSourcesPanelProps {
  sources: ToolEntry[];
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export function ToolSourcesPanel({ sources, isOpen, onClose, className }: ToolSourcesPanelProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col"
          >
            <PanelHeader totalTools={sources.length} hasActive={sources.some(s => s.status === "running" || s.status === "pending")} onClose={onClose} />
            <div className="flex-1 min-h-0">
              <PanelBody tools={sources} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Desktop: Embeddable — fills parent container from SidebarOrchestrator
  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      <PanelHeader totalTools={sources.length} hasActive={sources.some(s => s.status === "running" || s.status === "pending")} onClose={onClose} />
      <PanelBody tools={sources} />
    </div>
  );
}

function PanelHeader({ totalTools, hasActive, onClose }: { totalTools: number; hasActive: boolean; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30 bg-card/40 backdrop-blur-xl shrink-0">
      <div className="flex items-center gap-2">
        <div className={cn(
          "h-7 w-7 rounded-lg flex items-center justify-center",
          hasActive
            ? "bg-gradient-to-br from-violet-500/30 to-violet-500/10"
            : "bg-gradient-to-br from-primary/20 to-primary/10"
        )}>
          {hasActive ? (
            <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />
          ) : (
            <Zap className="h-4 w-4 text-primary" />
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold font-mono">
            {hasActive ? "Tools Running..." : "Tools Used"}
          </h3>
          <span className="text-[10px] text-muted-foreground font-mono">
            {totalTools} tool{totalTools !== 1 ? "s" : ""} {hasActive ? "in progress" : "executed"}
          </span>
        </div>
        {hasActive && (
          <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function PanelBody({ tools }: { tools: ToolEntry[] }) {
  return (
    <ScrollArea className="flex-1 min-h-0 overflow-hidden">
      <div className="p-3 space-y-1.5">
        {tools.map((tool, idx) => (
          <ToolRow key={idx} tool={tool} />
        ))}
      </div>
    </ScrollArea>
  );
}

function ToolRow({ tool }: { tool: ToolEntry }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = tool.icon;
  const hasResults = tool.results && tool.results.length > 0;
  const isActive = tool.status === "running" || tool.status === "pending";

  return (
    <div className="space-y-1 w-full overflow-hidden">
      <button
        onClick={() => hasResults && setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-card/40 border transition-all text-left",
          isActive
            ? "border-violet-500/20 shadow-[0_0_8px_rgba(139,92,246,0.08)]"
            : "border-border/20",
          hasResults ? "hover:bg-card/60 cursor-pointer" : "cursor-default"
        )}
      >
        <div className={cn("h-6 w-6 rounded-lg bg-muted/50 flex items-center justify-center shrink-0", tool.color)}>
          {isActive ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Icon className="h-3.5 w-3.5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-foreground block truncate font-mono">{tool.label}</span>
          {tool.summary && (
            <span className="text-[10px] text-muted-foreground block truncate">{tool.summary}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full font-mono",
            isActive
              ? "bg-violet-500/20 text-violet-400"
              : tool.status === "success"
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-red-500/20 text-red-400"
          )}>
            {isActive ? "..." : tool.status === "success" ? "✓" : "✗"}
          </span>
          {hasResults && (
            expanded
              ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
              : <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expandable search results for search_web */}
      {expanded && hasResults && (
        <div className="ml-8 mr-1 p-1.5 bg-card/20 backdrop-blur-md border border-border/10 rounded-xl max-h-[40vh] overflow-y-auto overflow-x-hidden divide-y divide-border/10">
          {tool.results!.map((result, rIdx) => (
            <a
              key={rIdx}
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 px-2.5 py-2 rounded-lg hover:bg-muted/20 transition-colors group overflow-hidden"
            >
              <div className="h-5 w-5 rounded-md bg-muted/30 flex items-center justify-center shrink-0 mt-0.5">
                <Globe className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground/90 truncate group-hover:text-primary transition-colors">
                  {result.title}
                </p>
                {result.snippet && (
                  <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{result.snippet}</p>
                )}
                <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                  {(() => { try { return new URL(result.url).hostname; } catch { return result.url; } })()}
                </p>
              </div>
              <ExternalLink className="h-3 w-3 text-muted-foreground/40 group-hover:text-primary/60 shrink-0 mt-1 transition-colors" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
