import { memo, useMemo } from "react";
import { Infinity } from "lucide-react";
import { cn } from "@/lib/utils";

interface UnifiedCreditProgressProps {
  dailyUsed: number;
  dailyLimit: number;
  proCredits: number;
  creditBalance: number;
  isAdmin?: boolean;
  showDetails?: boolean;
  compact?: boolean;
  onClick?: () => void;
  className?: string;
}

export const UnifiedCreditProgress = memo(({
  dailyUsed,
  dailyLimit,
  proCredits,
  creditBalance,
  isAdmin = false,
  compact = false,
  onClick,
  className,
}: UnifiedCreditProgressProps) => {
  const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
  const isUnlimited = dailyLimit === -1 || isAdmin;
  const total = isUnlimited ? -1 : dailyRemaining + proCredits + creditBalance;

  const segments = useMemo(() => {
    if (isUnlimited || total <= 0) return [];
    const segs: { percent: number; color: string }[] = [];
    if (dailyRemaining > 0) segs.push({ percent: (dailyRemaining / total) * 100, color: "bg-amber-500" });
    if (proCredits > 0) segs.push({ percent: (proCredits / total) * 100, color: "bg-primary" });
    if (creditBalance > 0) segs.push({ percent: (creditBalance / total) * 100, color: "bg-emerald-500" });
    return segs;
  }, [isUnlimited, total, dailyRemaining, proCredits, creditBalance]);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors", className)} onClick={onClick}>
        <div className="h-1.5 flex-1 rounded-full bg-muted/50 overflow-hidden flex">
          {isUnlimited ? (
            <div className="h-full w-full bg-gradient-to-r from-purple-500 to-primary" />
          ) : (
            segments.map((s, i) => <div key={i} className={cn("h-full", s.color)} style={{ width: `${s.percent}%` }} />)
          )}
        </div>
        <span className="text-xs font-medium min-w-fit">
          {isUnlimited ? '∞' : total}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("bg-card/30 border border-border/20 rounded-xl p-4", onClick && "cursor-pointer hover:border-primary/30", className)} onClick={onClick}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-medium text-foreground">Credits</span>
        <span className="text-sm font-semibold">
          {isUnlimited ? <Infinity className="h-4 w-4 inline" /> : `${total} left`}
        </span>
      </div>

      <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden flex">
        {isUnlimited ? (
          <div className="h-full w-full bg-gradient-to-r from-purple-500 to-primary" />
        ) : (
          segments.map((s, i) => <div key={i} className={cn("h-full", s.color)} style={{ width: `${s.percent}%` }} />)
        )}
      </div>

      {!isUnlimited && total === 0 && (
        <p className="text-xs text-destructive mt-2">Credits ကုန်သွားပါပြီ</p>
      )}
    </div>
  );
});

UnifiedCreditProgress.displayName = "UnifiedCreditProgress";

export const getTotalCredits = (
  dailyRemaining: number,
  proCredits: number,
  creditBalance: number,
  isAdmin: boolean
): number => {
  if (isAdmin) return Number.MAX_SAFE_INTEGER;
  return dailyRemaining + proCredits + creditBalance;
};
