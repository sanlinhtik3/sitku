import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Crown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProPlan } from "@/hooks/useProPlan";

interface ProBadgeProps {
  className?: string;
  showDaysRemaining?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'compact' | 'icon-only';
}

export const ProBadge = memo(({ 
  className, 
  showDaysRemaining = true,
  size = 'md',
  variant = 'default'
}: ProBadgeProps) => {
  const { isPro, daysRemaining, loading } = useProPlan();

  if (loading || !isPro) return null;

  const isExpiringSoon = daysRemaining !== null && daysRemaining <= 7;

  // Icon-only variant for mobile
  if (variant === 'icon-only') {
    return (
      <div className={cn("relative", className)}>
        <Crown 
          className={cn(
            "text-amber-500 fill-amber-500",
            size === 'sm' && "h-4 w-4",
            size === 'md' && "h-5 w-5",
            size === 'lg' && "h-6 w-6"
          )} 
        />
        {showDaysRemaining && daysRemaining !== null && (
          <span className={cn(
            "absolute -top-1 -right-1 bg-amber-500 text-white font-bold rounded-full flex items-center justify-center",
            size === 'sm' && "text-[8px] h-3 w-3",
            size === 'md' && "text-[10px] h-3.5 w-3.5",
            size === 'lg' && "text-[10px] h-4 w-4"
          )}>
            {daysRemaining}
          </span>
        )}
      </div>
    );
  }

  // Compact variant
  if (variant === 'compact') {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "flex items-center gap-1 border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20",
          isExpiringSoon && "animate-pulse",
          size === 'sm' && "text-[10px] px-1.5 py-0.5",
          size === 'md' && "text-xs px-2 py-0.5",
          size === 'lg' && "text-sm px-2.5 py-1",
          className
        )}
      >
        <Crown className={cn(
          "fill-amber-500 text-amber-500",
          size === 'sm' && "h-2.5 w-2.5",
          size === 'md' && "h-3 w-3",
          size === 'lg' && "h-3.5 w-3.5"
        )} />
        <span>Pro</span>
      </Badge>
    );
  }

  // Default variant with days remaining
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "flex items-center gap-1.5 border-amber-500/50 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-600 dark:text-amber-400 hover:from-amber-500/30 hover:to-orange-500/30 transition-all",
        isExpiringSoon && "animate-pulse border-amber-500/70",
        size === 'sm' && "text-[10px] px-2 py-0.5",
        size === 'md' && "text-xs px-2.5 py-1",
        size === 'lg' && "text-sm px-3 py-1.5",
        className
      )}
    >
      <Crown className={cn(
        "fill-amber-500 text-amber-500",
        size === 'sm' && "h-3 w-3",
        size === 'md' && "h-3.5 w-3.5",
        size === 'lg' && "h-4 w-4"
      )} />
      <span className="font-semibold">Pro</span>
      {showDaysRemaining && daysRemaining !== null && (
        <>
          <span className="text-muted-foreground/60">•</span>
          <span className={cn(
            "font-medium",
            isExpiringSoon && "text-orange-500"
          )}>
            {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}
          </span>
        </>
      )}
    </Badge>
  );
});

ProBadge.displayName = "ProBadge";

// Free plan badge for comparison
export const FreePlanBadge = memo(({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) => {
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "flex items-center gap-1.5 border-muted-foreground/30 bg-muted/30 text-muted-foreground",
        size === 'sm' && "text-[10px] px-2 py-0.5",
        size === 'md' && "text-xs px-2.5 py-1",
        size === 'lg' && "text-sm px-3 py-1.5",
        className
      )}
    >
      <Sparkles className={cn(
        size === 'sm' && "h-3 w-3",
        size === 'md' && "h-3.5 w-3.5",
        size === 'lg' && "h-4 w-4"
      )} />
      <span className="font-medium">Free</span>
    </Badge>
  );
});

FreePlanBadge.displayName = "FreePlanBadge";
