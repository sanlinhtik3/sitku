import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getToolConfig, formatToolSummary } from "./tool-config";
import { ToolResultRenderer } from "./tool-renderers/registry";

export interface CompletedToolStep {
  id: string;
  name: string;
  label: string;
  status: "success" | "error";
  summary: string;
  context?: string;
  result?: any;
  timestamp: Date;
}

interface AgentToolStepProps {
  name: string;
  status: "pending" | "running" | "success" | "error";
  label?: string;
  summary?: string;
  result?: any;
  showDetails?: boolean;
  className?: string;
}

export function AgentToolStep({
  name, status, label, summary, result, showDetails = false, className,
}: AgentToolStepProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const config = getToolConfig(name);
  const Icon = config.icon;
  const displayLabel = label || config.label;
  const displaySummary = summary || formatToolSummary(name, result);
  
  const isLoading = status === "pending" || status === "running";
  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("group", className)}
    >
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div 
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-[var(--glass-radius-card)] transition-all duration-200",
            "bg-[hsl(var(--glass-bg))] backdrop-blur-[var(--glass-blur)] border border-[hsl(var(--glass-border))]",
            isLoading && "border-purple-500/20 bg-purple-500/5",
            isSuccess && "border-green-500/20 bg-green-500/5",
            isError && "border-red-500/20 bg-red-500/5",
            showDetails && "cursor-pointer hover:bg-[hsl(var(--glass-bg-hover))]"
          )}
        >
          {/* Status indicator */}
          <div className="relative flex-shrink-0">
            {isLoading ? (
              <Loader2 className={cn("h-3.5 w-3.5 animate-spin", config.color)} />
            ) : isSuccess ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : isError ? (
              <XCircle className="h-3.5 w-3.5 text-red-500" />
            ) : (
              <Icon className={cn("h-3.5 w-3.5", config.color)} />
            )}
          </div>

          {!isLoading && (
            <Icon className={cn("h-3 w-3 opacity-50", config.color)} />
          )}

          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className={cn(
              "text-xs font-medium",
              isLoading && "text-purple-400",
              isSuccess && "text-green-400",
              isError && "text-red-400",
              !isLoading && !isSuccess && !isError && "text-muted-foreground"
            )}>
              {displayLabel}
            </span>
            
            {displaySummary && !isLoading && (
              <span className="text-[10px] text-muted-foreground/70 truncate">
                {displaySummary}
              </span>
            )}
            
            {isLoading && (
              <span className="text-[10px] text-muted-foreground/70 animate-pulse">
                Processing...
              </span>
            )}
          </div>

          {showDetails && result && (
            <CollapsibleTrigger asChild>
              <button 
                className="p-0.5 rounded hover:bg-[hsl(var(--glass-bg-hover))] transition-colors opacity-0 group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                {isExpanded ? (
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>
          )}
        </div>

        {showDetails && result && (
          <CollapsibleContent>
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-1.5 ml-4 pl-3 border-l-2 border-[hsl(var(--glass-border))]"
                >
                  {/* Per-tool rich renderer (search → result cards, scrape → page
                       preview, image → progressive thumb, etc.) with smart JSON
                       fallback for unmapped tool families. */}
                  <ToolResultRenderer name={name} status={status} result={result} compact={false} />
                </motion.div>
              )}
            </AnimatePresence>
          </CollapsibleContent>
        )}
      </Collapsible>
    </motion.div>
  );
}

// Component to render a list of tool steps
interface ToolStepListProps {
  activeTools: { name: string; status: "pending" | "running" | "success" | "error"; result?: any }[];
  completedTools: CompletedToolStep[];
  showDetails?: boolean;
  className?: string;
}

export function ToolStepList({ 
  activeTools, completedTools, showDetails = false, className 
}: ToolStepListProps) {
  const allTools = [
    ...completedTools.map(t => ({ 
      name: t.name, status: t.status as "success" | "error", result: t.result,
      label: t.label, summary: t.summary, isCompleted: true,
    })),
    ...activeTools.map(t => ({ ...t, isCompleted: false })),
  ];

  if (allTools.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className={cn("space-y-1", className)}
    >
      {allTools.map((tool, idx) => (
        <AgentToolStep
          key={`${tool.name}-${idx}`}
          name={tool.name}
          status={tool.status}
          label={(tool as any).label}
          summary={(tool as any).summary}
          result={tool.result}
          showDetails={showDetails}
        />
      ))}
    </motion.div>
  );
}
