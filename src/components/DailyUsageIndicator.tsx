import { memo } from "react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, Clock, Crown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProPlan } from "@/hooks/useProPlan";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DailyUsageIndicatorProps {
  className?: string;
  variant?: 'compact' | 'full' | 'banner';
  showUpgrade?: boolean;
}

export const DailyUsageIndicator = memo(({ 
  className, 
  variant = 'compact',
  showUpgrade = true
}: DailyUsageIndicatorProps) => {
  const { isPro, dailyLimit, usesToday, remainingUses, resetsAt, loading } = useProPlan();
  const navigate = useNavigate();

  if (loading) return null;

  const usagePercentage = (usesToday / dailyLimit) * 100;
  const isLow = remainingUses <= 1;
  const isExhausted = remainingUses <= 0;

  // Format reset time
  const formatResetTime = () => {
    if (!resetsAt) return '';
    const resetDate = new Date(resetsAt);
    const now = new Date();
    const diffMs = resetDate.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m`;
    }
    return `${diffMinutes}m`;
  };

  // Compact variant - just a small indicator
  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs",
              isExhausted && "bg-destructive/20 text-destructive",
              isLow && !isExhausted && "bg-amber-500/20 text-amber-500",
              !isLow && "bg-primary/10 text-primary",
              className
            )}>
              <Zap className="h-3 w-3" />
              <span className="font-medium">{remainingUses}/{dailyLimit}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Daily uses remaining: {remainingUses} of {dailyLimit}</p>
            <p className="text-muted-foreground text-xs">Resets in {formatResetTime()}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full variant with progress bar
  if (variant === 'full') {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Zap className={cn(
              "h-4 w-4",
              isExhausted && "text-destructive",
              isLow && !isExhausted && "text-amber-500",
              !isLow && "text-primary"
            )} />
            <span className="font-medium">Daily Uses</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-bold",
              isExhausted && "text-destructive",
              isLow && !isExhausted && "text-amber-500"
            )}>
              {remainingUses}
            </span>
            <span className="text-muted-foreground">/ {dailyLimit}</span>
          </div>
        </div>
        
        <Progress 
          value={usagePercentage} 
          className={cn(
            "h-2",
            isExhausted && "[&>div]:bg-destructive",
            isLow && !isExhausted && "[&>div]:bg-amber-500"
          )}
        />
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>Resets in {formatResetTime()}</span>
          </div>
          {!isPro && showUpgrade && (
            <Button 
              variant="link" 
              size="sm" 
              className="h-auto p-0 text-xs text-primary"
              onClick={() => navigate('/ai-content-pricing')}
            >
              Upgrade to Pro
              <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Banner variant for prominent display
  return (
    <div className={cn(
      "relative overflow-hidden rounded-lg p-4",
      isExhausted && "bg-destructive/10 border border-destructive/30",
      isLow && !isExhausted && "bg-amber-500/10 border border-amber-500/30",
      !isLow && "bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20",
      className
    )}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {isExhausted ? (
              <Badge variant="destructive" className="text-xs">Limit Reached</Badge>
            ) : isLow ? (
              <Badge className="bg-amber-500 text-white text-xs">Running Low</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                <Zap className="h-3 w-3 mr-1" />
                {remainingUses} uses left
              </Badge>
            )}
            {isPro && (
              <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-500">
                <Crown className="h-3 w-3 mr-1" />
                Pro
              </Badge>
            )}
          </div>
          
          <Progress 
            value={usagePercentage} 
            className={cn(
              "h-2 mb-2",
              isExhausted && "[&>div]:bg-destructive",
              isLow && !isExhausted && "[&>div]:bg-amber-500"
            )}
          />
          
          <p className="text-xs text-muted-foreground">
            {isExhausted 
              ? `Daily limit reached. Resets in ${formatResetTime()}`
              : `${usesToday} of ${dailyLimit} daily uses consumed`
            }
          </p>
        </div>
        
        {!isPro && showUpgrade && (
          <Button 
            size="sm" 
            onClick={() => navigate('/ai-content-pricing')}
            className="shrink-0"
          >
            <Crown className="h-4 w-4 mr-1" />
            Upgrade
          </Button>
        )}
      </div>
    </div>
  );
});

DailyUsageIndicator.displayName = "DailyUsageIndicator";
