import { memo, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";

export interface DailyTrend {
  day: string;
  date: string;
  income: number;
  expense: number;
}

interface DailyTrendChartProps {
  data: DailyTrend[];
  isLoading?: boolean;
  currency?: string;
  compact?: boolean;
}

const CustomTooltip = ({ active, payload, label, currency }: any) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0]?.payload;
    return (
      <div className="bg-popover/95 backdrop-blur-md border border-border/50 rounded-lg p-3 shadow-xl">
        <p className="font-medium text-sm mb-2">{dataPoint?.date || label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground capitalize">{entry.name}:</span>
            <span className="font-medium">
              {currency} {entry.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const DailyTrendChart = memo(({
  data,
  isLoading = false,
  currency = "Ks",
  compact = false,
}: DailyTrendChartProps) => {
  const formatYAxis = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(0)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  // Calculate summary stats
  const stats = useMemo(() => {
    if (data.length === 0) return null;

    const daysWithExpense = data.filter(d => d.expense > 0);
    const daysWithIncome = data.filter(d => d.income > 0);

    const peakExpenseDay = data.reduce((max, d) => 
      d.expense > max.expense ? d : max, data[0]);
    
    const peakIncomeDay = data.reduce((max, d) => 
      d.income > max.income ? d : max, data[0]);

    const avgExpense = daysWithExpense.length > 0 
      ? daysWithExpense.reduce((sum, d) => sum + d.expense, 0) / daysWithExpense.length 
      : 0;

    const avgIncome = daysWithIncome.length > 0
      ? daysWithIncome.reduce((sum, d) => sum + d.income, 0) / daysWithIncome.length
      : 0;

    return {
      peakExpenseDay,
      peakIncomeDay,
      avgExpense,
      avgIncome,
      activeDays: daysWithExpense.length + daysWithIncome.length,
    };
  }, [data]);

  // Show every 5th day on x-axis for cleaner display
  const xAxisTicks = useMemo(() => {
    return data
      .filter((_, i) => i % 5 === 0 || i === data.length - 1)
      .map(d => d.day);
  }, [data]);

  return (
    <div className={cn(
      "rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl overflow-hidden",
      compact ? "p-3" : "p-4"
    )}>
      <h3 className={cn("font-semibold text-foreground mb-3", compact ? "text-sm" : "text-base")}>
        Daily Trend (This Month)
      </h3>

      {isLoading ? (
        <div className={cn(
          "flex items-center justify-center",
          compact ? "h-[140px]" : "h-[200px]"
        )}>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data.length === 0 ? (
        <div className={cn(
          "flex items-center justify-center text-muted-foreground text-sm",
          compact ? "h-[140px]" : "h-[200px]"
        )}>
          No data available
        </div>
      ) : (
        <div className={cn(compact ? "h-[140px]" : "h-[200px]")}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.3}
              />
              <XAxis
                dataKey="day"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
                ticks={xAxisTicks}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
                tickFormatter={formatYAxis}
                width={40}
              />
              <Tooltip content={<CustomTooltip currency={currency} />} />
              <Legend
                wrapperStyle={{ fontSize: "10px" }}
                iconType="circle"
                iconSize={6}
              />
              <Area
                type="monotone"
                dataKey="income"
                stroke="#22C55E"
                strokeWidth={2}
                fill="url(#incomeGradient)"
                name="Income"
              />
              <Area
                type="monotone"
                dataKey="expense"
                stroke="#EF4444"
                strokeWidth={2}
                fill="url(#expenseGradient)"
                name="Expenses"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary below chart */}
      {!isLoading && stats && (
        <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-rose-500/10">
            <TrendingDown className="h-4 w-4 text-rose-500" />
            <div className="min-w-0">
              <span className="text-[10px] text-muted-foreground block">Peak Expense</span>
              <p className="font-semibold text-rose-500 text-xs truncate">
                Day {stats.peakExpenseDay.day} • {currency} {Math.round(stats.peakExpenseDay.expense).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <div className="min-w-0">
              <span className="text-[10px] text-muted-foreground block">Peak Income</span>
              <p className="font-semibold text-emerald-500 text-xs truncate">
                Day {stats.peakIncomeDay.day} • {currency} {Math.round(stats.peakIncomeDay.income).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

DailyTrendChart.displayName = "DailyTrendChart";
