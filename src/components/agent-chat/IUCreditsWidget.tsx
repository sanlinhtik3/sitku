import { memo, useMemo } from "react";
import { Infinity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

interface IUCreditsWidgetProps {
  dailyRemaining: number;
  dailyLimit: number;
  bonus: number;
  balance: number;
  isUnlimited: boolean;
}

type StatusPhase = "daily" | "bonus" | "balance" | "exhausted";

function getStatusPhase(daily: number, bonus: number, balance: number): StatusPhase {
  if (daily > 0) return "daily";
  if (bonus > 0) return "bonus";
  if (balance > 0) return "balance";
  return "exhausted";
}

const STATUS_CONFIG: Record<StatusPhase, { label: string; dotClass: string }> = {
  daily:     { label: "Daily IU used first",  dotClass: "bg-purple-500" },
  bonus:     { label: "Using Bonus IU",       dotClass: "bg-emerald-400" },
  balance:   { label: "Using IU Balance",     dotClass: "bg-amber-400" },
  exhausted: { label: "All IU exhausted",     dotClass: "bg-red-400" },
};

interface Segment {
  percent: number;
  colorClass: string;
  label: string;
  value: number;
}

export const IUCreditsWidget = memo(({
  dailyRemaining,
  dailyLimit,
  bonus,
  balance,
  isUnlimited,
}: IUCreditsWidgetProps) => {
  const total = dailyRemaining + bonus + balance;
  const capacity = dailyLimit + bonus + balance;

  const segments = useMemo(() => {
    if (capacity <= 0) return [];
    const segs: Segment[] = [];
    const pct = (v: number) => (v / capacity) * 100;

    if (dailyRemaining > 0) segs.push({ percent: pct(dailyRemaining), colorClass: "bg-purple-500", label: "Daily", value: dailyRemaining });
    if (bonus > 0) segs.push({ percent: pct(bonus), colorClass: "bg-emerald-400", label: "Bonus", value: bonus });
    if (balance > 0) segs.push({ percent: pct(balance), colorClass: "bg-amber-400", label: "Balance", value: balance });

    return segs;
  }, [dailyRemaining, bonus, balance, capacity]);

  const phase = getStatusPhase(dailyRemaining, bonus, balance);
  const status = STATUS_CONFIG[phase];

  return (
    <div className="bg-muted/20 rounded-xl p-2.5 border border-border/20 mt-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-foreground/80">
          Intelligence Units
        </span>
        <span className="text-xs font-semibold text-foreground">
          {isUnlimited ? (
            <span className="inline-flex items-center gap-1">
              <Infinity className="h-3.5 w-3.5" />
              <span>No Limit IU</span>
            </span>
          ) : (
            `${Math.round(total)} left`
          )}
        </span>
      </div>

      {/* Multi-segment progress bar with tooltips */}
      <TooltipProvider delayDuration={200}>
        <div className="h-2.5 w-full rounded-full bg-muted/30 overflow-hidden flex">
          {isUnlimited ? (
            <div className="h-full w-full bg-gradient-to-r from-purple-500 to-primary rounded-full" />
          ) : (
            segments.map((seg, i) => (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "h-full transition-all duration-500 cursor-default",
                      seg.colorClass,
                      i === 0 && "rounded-l-full",
                      i === segments.length - 1 && "rounded-r-full"
                    )}
                    style={{ width: `${Math.min(seg.percent, 100)}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs font-medium">
                  {seg.label}: {Math.round(seg.value)}
                </TooltipContent>
              </Tooltip>
            ))
          )}
        </div>
      </TooltipProvider>

      {/* Contextual status line */}
      <div className="flex items-center gap-1 mt-1.5">
        <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", status.dotClass)} />
        <span className="text-[10px] text-muted-foreground/70">{isUnlimited ? "No Limit IU (Personal Key)" : status.label}</span>
      </div>
    </div>
  );
});

IUCreditsWidget.displayName = "IUCreditsWidget";
