import { memo } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { Loader2 } from "@/components/flowstate/solarIcons";
import { FuiChartLegend, FuiWidget } from "@/design-system/fui";

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
      <div className="flowstate-chart-tooltip">
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
  const avgIncome = data.length ? Math.round(data.reduce((sum, item) => sum + item.income, 0) / data.length) : 0;
  const avgExpense = data.length ? Math.round(data.reduce((sum, item) => sum + item.expense, 0) / data.length) : 0;
  const symbol = currency === "THB" ? "฿" : currency === "USD" ? "$" : currency === "MMK" ? "Ks" : currency;

  return (
    <FuiWidget
      className={cn("flowstate-glass flowstate-monthly-trend", compact && "flowstate-widget-compact")}
      eyebrow="Six-month signal"
      title="Monthly trend"
      description={`Average income ${symbol}${avgIncome.toLocaleString()} · expense ${symbol}${avgExpense.toLocaleString()}`}
      action={<FuiChartLegend items={[{ label: "Income", color: "var(--bb-positive)" }, { label: "Expense", color: "var(--bb-negative)" }]} />}
    >
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
        <div className={cn("flowstate-trend-canvas", compact && "!h-[140px]")}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="2 5"
                stroke="var(--fui-chart-grid, var(--bb-border))"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fill: "var(--bb-text-4)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--bb-text-4)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatYAxis}
                width={45}
              />
              <Tooltip content={<CustomTooltip currency={symbol} />} />
              <Line
                type="monotone"
                dataKey="income"
                stroke="var(--bb-positive)"
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                name="Income"
              />
              <Line
                type="monotone"
                dataKey="expense"
                stroke="var(--bb-negative)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                name="Expenses"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </FuiWidget>
  );
});

MonthlyTrendChart.displayName = "MonthlyTrendChart";
