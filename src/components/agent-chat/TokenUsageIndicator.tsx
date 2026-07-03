import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TokenUsageIndicatorProps {
  totalTokens: { input: number; output: number };
  /** Approximate context window limit for the current model */
  contextLimit?: number;
}

const DEFAULT_CONTEXT_LIMIT = 1_000_000; // Gemini default

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export const TokenUsageIndicator = memo(function TokenUsageIndicator({
  totalTokens,
  contextLimit = DEFAULT_CONTEXT_LIMIT,
}: TokenUsageIndicatorProps) {
  const totalUsed = totalTokens.input + totalTokens.output;

  // Don't show if no tokens used yet
  if (totalUsed === 0) return null;

  const usagePercent = Math.min(100, Math.round((totalTokens.input / contextLimit) * 100));

  const status = useMemo(() => {
    if (usagePercent >= 95) return { color: "text-red-400", bg: "bg-red-500", label: "Critical" };
    if (usagePercent >= 80) return { color: "text-amber-400", bg: "bg-amber-500", label: "High" };
    if (usagePercent >= 50) return { color: "text-yellow-400", bg: "bg-yellow-500", label: "Medium" };
    return { color: "text-emerald-400", bg: "bg-emerald-500", label: "OK" };
  }, [usagePercent]);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 cursor-default select-none">
            {/* Mini progress bar */}
            <div className="w-8 h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500", status.bg)}
                style={{ width: `${Math.max(3, usagePercent)}%` }}
              />
            </div>
            <span className={cn("text-[10px] font-mono tabular-nums", status.color)}>
              {usagePercent}%
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs space-y-1 max-w-52">
          <div className="font-semibold">Context Usage</div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Input</span>
            <span className="font-mono">{formatTokenCount(totalTokens.input)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Output</span>
            <span className="font-mono">{formatTokenCount(totalTokens.output)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Limit</span>
            <span className="font-mono">{formatTokenCount(contextLimit)}</span>
          </div>
          {usagePercent >= 80 && (
            <div className="pt-1 border-t border-border/50 text-amber-400">
              Context getting full. Consider starting a new chat.
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
