import { memo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format } from "date-fns";
import { Loader2, Sparkles } from "@/components/flowstate/solarIcons";
import { FuiChartLegend, FuiWidget } from "@/design-system/fui";

interface MonthData {
  month: string;
  income: number;
  expense: number;
  net: number;
}

interface HistoryComparisonChartProps {
  data: MonthData[];
  currency: string;
  isLoading?: boolean;
  variant?: "default" | "home";
}

const getCurrencySymbol = (currency: string) => {
  switch (currency) {
    case "MMK": return "Ks";
    case "THB": return "฿";
    case "USD": return "$";
    case "USDT": return "₮";
    default: return currency;
  }
};

const formatAmount = (value: number, currency: string) => {
  const symbol = getCurrencySymbol(currency);
  if (value >= 1000000) {
    return `${symbol}${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${symbol}${(value / 1000).toFixed(0)}K`;
  }
  return `${symbol}${value.toFixed(0)}`;
};

export const HistoryComparisonChart = memo(function HistoryComparisonChart({
  data,
  currency,
  isLoading,
  variant = "default",
}: HistoryComparisonChartProps) {
  const chartData = data.map(d => ({
    name: format(new Date(d.month + "-01"), "MMM"),
    Income: d.income,
    Expenses: d.expense,
  }));
  const latest = data[data.length - 1] ?? { income: 0, expense: 0, net: 0 };
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date());

  if (isLoading) {
    return (
      <FuiWidget title="Monthly comparison" className={variant === "home" ? "flowstate-glass flowstate-home-comparison" : undefined}>
        <div className="flex items-center justify-center h-[200px]">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </FuiWidget>
    );
  }

  return (
    <FuiWidget
      className={variant === "home" ? "flowstate-glass flowstate-home-comparison" : undefined}
      eyebrow="Six-month ledger"
      title="Monthly comparison"
      description={variant === "home" ? `${monthLabel} · income ${formatAmount(latest.income, currency)} vs expense ${formatAmount(latest.expense, currency)}` : undefined}
      action={<FuiChartLegend items={[{ label: "Income", color: "var(--bb-positive)" }, { label: "Expenses", color: "var(--bb-negative)" }]} />}
    >
      <div className={variant === "home" ? "h-[150px]" : "h-[200px]"}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={0} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="2 5" stroke="var(--fui-chart-grid, var(--bb-border))" vertical={false} />
            <XAxis 
              dataKey="name" 
              tick={{ fontSize: 10, fill: "var(--bb-text-4)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              tickFormatter={(value) => formatAmount(value, currency)}
              tick={{ fontSize: 10, fill: "var(--bb-text-4)" }}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip 
              formatter={(value: number) => [formatAmount(value, currency), ""]}
              contentStyle={{
                backgroundColor: "var(--bb-bg-2)",
                color: "var(--bb-text-1)",
                border: "1px solid var(--bb-border)",
                borderRadius: "var(--bb-radius-control)",
                fontSize: "12px",
              }}
            />
            <Bar 
              dataKey="Income" 
              fill="var(--bb-positive)"
              radius={[2, 2, 0, 0]}
            />
            <Bar 
              dataKey="Expenses" 
              fill="var(--bb-negative)"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {variant === "home" && (
        <div className="flowstate-comparison-brief">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <span><strong>AI brief</strong> — {latest.income === 0 && latest.expense === 0 ? "Add transactions to unlock a monthly comparison." : latest.net >= 0 ? "Income is covering expenses. Keep the positive margin consistent." : "Expenses are above income. Review the largest category before adding new commitments."}</span>
        </div>
      )}
    </FuiWidget>
  );
});
