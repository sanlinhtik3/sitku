import { memo, useMemo } from "react";
import { Gift, Sparkles, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CardContent } from "@/components/ui/card";
import { GlassmorphicCard } from "@/components/ui/FuturisticElements";
import { cn } from "@/lib/utils";
import { getModelDisplayName } from "@/lib/ai-models";

interface FreeBudgetIndicatorProps {
  tokensRemaining: number;
  tokensTotal: number;
  modelId?: string | null;
  grantedAt?: string | null;
  className?: string;
}

export const FreeBudgetIndicator = memo(({ 
  tokensRemaining, 
  tokensTotal,
  modelId,
  grantedAt,
  className
}: FreeBudgetIndicatorProps) => {
  const usagePercent = useMemo(() => {
    if (tokensTotal <= 0) return 0;
    return ((tokensTotal - tokensRemaining) / tokensTotal) * 100;
  }, [tokensRemaining, tokensTotal]);

  const remainingPercent = 100 - usagePercent;

  const formatTokens = (num: number) => {
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const modelName = getModelDisplayName(modelId || undefined);

  return (
    <GlassmorphicCard glow className={cn("border-green-500/30", className)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/10">
            <Gift className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <span className="font-semibold text-green-500">
              System Provided Free Budget
            </span>
            <Badge variant="secondary" className="ml-2 text-[10px] bg-green-500/10 text-green-500">
              FREE
            </Badge>
          </div>
        </div>
        
        <div className="space-y-3">
          {/* Token Progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tokens Remaining</span>
              <span className="font-medium text-green-500">
                {formatTokens(tokensRemaining)} / {formatTokens(tokensTotal)}
              </span>
            </div>
            <Progress 
              value={remainingPercent} 
              className="h-2 bg-muted/30"
            />
            <p className="text-xs text-muted-foreground text-right">
              {remainingPercent.toFixed(0)}% remaining
            </p>
          </div>

          {/* Model Info */}
          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Model</span>
            </div>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {modelName}
            </Badge>
          </div>

          {/* Active Indicator */}
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-muted-foreground">
              Using system-provided free budget
            </span>
          </div>
        </div>
      </CardContent>
    </GlassmorphicCard>
  );
});

FreeBudgetIndicator.displayName = "FreeBudgetIndicator";

// Hook to check if user has system-granted access
export function useSystemGrantedAccess(userId: string | undefined) {
  // This would be called from the component that needs to check
  // Return type: { isGranted: boolean, tokensRemaining: number, tokensTotal: number, model: string }
}
