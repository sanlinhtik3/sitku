import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface StatCardWithProgressProps {
  title: string;
  value: number;
  icon: LucideIcon;
  progress: number;
  trend?: number;
  suffix?: string;
  colorClass?: string;
}

export const StatCardWithProgress = ({
  title,
  value,
  icon: Icon,
  progress,
  trend,
  suffix = "",
  colorClass = "text-primary"
}: StatCardWithProgressProps) => {
  const circumference = 2 * Math.PI * 35;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] overflow-hidden h-full">
      <CardContent className="p-3 sm:p-4 md:p-5 h-full flex flex-col justify-between">
        {/* Mobile-optimized: Compact 2-column layout */}
        <div className="flex flex-col gap-2 sm:gap-3">
          {/* Icon and Progress Row - Compact for 2-column layout */}
          <div className="flex items-start justify-between gap-2">
            <div className={`p-2 rounded-lg bg-gradient-to-br from-background to-muted/20 flex-shrink-0 ${colorClass}`}>
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            {/* Compact progress ring */}
            <div className="relative h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0">
              <svg className="transform -rotate-90 w-full h-full" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  stroke="hsl(var(--muted))"
                  strokeWidth="3"
                  fill="none"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  strokeDasharray={2 * Math.PI * 14}
                  strokeDashoffset={2 * Math.PI * 14 - (progress / 100) * 2 * Math.PI * 14}
                  className={`${colorClass} transition-all duration-1000 ease-out`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-[9px] sm:text-[10px] font-bold ${colorClass}`}>{Math.round(progress)}%</span>
              </div>
            </div>
          </div>

          {/* Title - Truncated for narrow columns */}
          <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide line-clamp-1">
            {title}
          </p>

          {/* Value - Large and prominent */}
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-1">
              <p className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight leading-none">
                {value.toLocaleString()}
              </p>
              {suffix && (
                <span className="text-[10px] sm:text-xs text-muted-foreground truncate">
                  {suffix}
                </span>
              )}
            </div>

            {/* Trend - Compact for mobile */}
            {trend !== undefined && (
              <div className="flex items-center gap-1">
                {trend > 0 ? (
                  <>
                    <TrendingUp className="h-3 w-3 text-success flex-shrink-0" />
                    <span className="text-[10px] sm:text-xs text-success font-medium">+{trend}%</span>
                  </>
                ) : trend < 0 ? (
                  <>
                    <TrendingDown className="h-3 w-3 text-destructive flex-shrink-0" />
                    <span className="text-[10px] sm:text-xs text-destructive font-medium">{trend}%</span>
                  </>
                ) : (
                  <span className="text-[10px] sm:text-xs text-muted-foreground">—</span>
                )}
                <span className="text-[9px] sm:text-[10px] text-muted-foreground truncate">vs last</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
