import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface AnalyticsCardProps {
  title: string;
  value: number;
  trend?: number;
  icon: LucideIcon;
  colorClass?: string;
}

export const AnalyticsCard = ({ 
  title, 
  value, 
  trend, 
  icon: Icon, 
  colorClass = "text-primary" 
}: AnalyticsCardProps) => {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-md transition-all duration-200 h-full">
      <CardContent className="p-3 sm:p-4 md:p-5 h-full flex flex-col justify-between">
        {/* Mobile-optimized: Compact 2-column layout */}
        <div className="flex flex-col gap-2 sm:gap-3">
          {/* Icon and Title Row */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide line-clamp-2 flex-1">
              {title}
            </h3>
            <div className={`p-1.5 sm:p-2 rounded-lg bg-gradient-to-br from-background to-muted/20 flex-shrink-0 ${colorClass}`}>
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

          {/* Value - Large and prominent */}
          <div className="space-y-1 sm:space-y-1.5">
            <p className="text-2xl sm:text-3xl font-bold tracking-tight leading-none">
              {value.toLocaleString()}
            </p>

            {/* Trend - Compact for mobile */}
            {trend !== undefined && (
              <div className="flex items-center gap-1">
                {trend > 0 ? (
                  <>
                    <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-success flex-shrink-0" />
                    <span className="text-[10px] sm:text-xs text-success font-medium">+{trend}%</span>
                  </>
                ) : trend < 0 ? (
                  <>
                    <TrendingDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-destructive flex-shrink-0" />
                    <span className="text-[10px] sm:text-xs text-destructive font-medium">{trend}%</span>
                  </>
                ) : (
                  <span className="text-[10px] sm:text-xs text-muted-foreground">—</span>
                )}
                <span className="text-[9px] sm:text-[10px] text-muted-foreground truncate">vs last period</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
