import { useState, memo } from "react";
import { Button } from "@/components/ui/button";
import { MonthlyTrendChart } from "./MonthlyTrendChart";
import { DailyTrendChart, DailyTrend } from "./DailyTrendChart";
import { Calendar, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

interface MonthlyData {
  month: string;
  income: number;
  expense: number;
}

interface TrendChartSwitcherProps {
  monthlyData: MonthlyData[];
  dailyData: DailyTrend[];
  isMonthlyLoading: boolean;
  isDailyLoading: boolean;
  currency: string;
  compact?: boolean;
}

export const TrendChartSwitcher = memo(({
  monthlyData,
  dailyData,
  isMonthlyLoading,
  isDailyLoading,
  currency,
  compact = false,
}: TrendChartSwitcherProps) => {
  const [view, setView] = useState<"monthly" | "daily">("monthly");

  return (
    <div className="space-y-3">
      {/* Toggle Buttons */}
      <div className="flex items-center justify-end">
        <div className="flex gap-1 p-1 bg-muted/50 backdrop-blur-sm rounded-lg border border-border/30">
          <Button
            variant={view === "monthly" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("monthly")}
            className={cn(
              "h-7 px-3 text-xs gap-1.5 transition-all duration-200",
              view === "monthly" 
                ? "bg-primary text-primary-foreground shadow-md" 
                : "hover:bg-muted text-muted-foreground"
            )}
          >
            <Calendar className="h-3 w-3" />
            Monthly
          </Button>
          <Button
            variant={view === "daily" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("daily")}
            className={cn(
              "h-7 px-3 text-xs gap-1.5 transition-all duration-200",
              view === "daily" 
                ? "bg-primary text-primary-foreground shadow-md" 
                : "hover:bg-muted text-muted-foreground"
            )}
          >
            <CalendarDays className="h-3 w-3" />
            Daily
          </Button>
        </div>
      </div>

      {/* Chart */}
      {view === "monthly" ? (
        <MonthlyTrendChart
          data={monthlyData}
          isLoading={isMonthlyLoading}
          currency={currency}
          compact={compact}
        />
      ) : (
        <DailyTrendChart
          data={dailyData}
          isLoading={isDailyLoading}
          currency={currency}
          compact={compact}
        />
      )}
    </div>
  );
});

TrendChartSwitcher.displayName = "TrendChartSwitcher";
