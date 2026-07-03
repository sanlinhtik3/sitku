import { memo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface MonthlyData {
  month: string;
  income: number;
  expense: number;
}

interface MonthlyTrendChartProps {
  data: MonthlyData[];
  isLoading?: boolean;
  currency?: string;
  compact?: boolean;
}

const CustomTooltip = ({ active, payload, label, currency }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover/95 backdrop-blur-md border border-border/50 rounded-lg p-3 shadow-xl">
        <p className="font-medium text-sm mb-2">{label}</p>
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

export const MonthlyTrendChart = memo(({
  data,
  isLoading = false,
  currency = "Ks",
  compact = false,
}: MonthlyTrendChartProps) => {
  const formatYAxis = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(0)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  return (
    <div className={cn(
      "rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl overflow-hidden",
      compact ? "p-3" : "p-4"
    )}>
      <h3 className={cn("font-semibold text-foreground mb-3", compact ? "text-sm" : "text-base")}>
        Monthly Trend
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
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.3}
              />
              <XAxis
                dataKey="month"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
                tickFormatter={formatYAxis}
                width={45}
              />
              <Tooltip content={<CustomTooltip currency={currency} />} />
              <Legend
                wrapperStyle={{ fontSize: "11px" }}
                iconType="circle"
                iconSize={8}
              />
              <Line
                type="monotone"
                dataKey="income"
                stroke="#22C55E"
                strokeWidth={2.5}
                dot={{ fill: "#22C55E", strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                name="Income"
              />
              <Line
                type="monotone"
                dataKey="expense"
                stroke="#EF4444"
                strokeWidth={2.5}
                dot={{ fill: "#EF4444", strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                name="Expenses"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary below chart */}
      {!isLoading && data.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-2 gap-4">
          <div className="text-center">
            <span className="text-xs text-muted-foreground">Avg Income</span>
            <p className="font-semibold text-emerald-500 text-sm">
              {currency} {Math.round(
                data.reduce((sum, d) => sum + d.income, 0) / data.length
              ).toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <span className="text-xs text-muted-foreground">Avg Expense</span>
            <p className="font-semibold text-rose-500 text-sm">
              {currency} {Math.round(
                data.reduce((sum, d) => sum + d.expense, 0) / data.length
              ).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

MonthlyTrendChart.displayName = "MonthlyTrendChart";
