import { memo, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/flowstate/CategoryIcon";
import { FuiBadge, FuiWidget } from "@/design-system/fui";

interface CategoryData {
  category: string;
  categoryMy?: string | null;
  icon: string;
  color: string;
  amount: number;
  [key: string]: any;
  percentage: number;
}

interface SpendingDonutChartProps {
  data: CategoryData[];
  currency?: string;
  compact?: boolean;
}

const CustomTooltip = ({ active, payload, currency }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="flowstate-chart-tooltip">
        <p className="font-medium text-sm">{data.category}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {currency} {data.amount.toLocaleString()} ({data.percentage.toFixed(1)}%)
        </p>
      </div>
    );
  }
  return null;
};

export const SpendingDonutChart = memo(({ data, currency = "Ks", compact = false }: SpendingDonutChartProps) => {
  const chartData = useMemo(() => {
    if (data.length === 0) {
      return [{ category: "No data", amount: 1, percentage: 100, color: "var(--bb-bg-4)" }];
    }
    return data;
  }, [data]);

  const totalAmount = useMemo(() => 
    data.reduce((sum, item) => sum + item.amount, 0)
  , [data]);
  const symbol = currency === "THB" ? "฿" : currency === "USD" ? "$" : currency === "MMK" ? "Ks" : currency;
  const formattedTotal = totalAmount >= 1_000_000
    ? `${symbol}${(totalAmount / 1_000_000).toFixed(1)}M`
    : totalAmount >= 1_000
      ? `${symbol}${(totalAmount / 1_000).toFixed(0)}K`
      : `${symbol}${totalAmount.toLocaleString()}`;
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date());

  return (
    <FuiWidget
      className={cn("flowstate-glass flowstate-spending-card", compact && "flowstate-widget-compact")}
      eyebrow="Expense allocation"
      title="Spending by category"
      description={`${monthLabel} · category share`}
      action={<FuiBadge tone={totalAmount > 0 ? "danger" : "offline"}>{formattedTotal} total</FuiBadge>}
    >
      <div className="flowstate-spending-body">
        {/* Chart */}
        <div className="flowstate-donut-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                label={false}
                innerRadius={46}
                outerRadius={59}
                paddingAngle={1.5}
                cornerRadius={2}
                dataKey="amount"
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.color}
                    className="transition-opacity hover:opacity-80"
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip currency={currency} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flowstate-donut-center"><strong>{formattedTotal}</strong><span>spent</span></div>
        </div>

        {/* Legend */}
        <div className="flowstate-spending-legend">
          {data.slice(0, compact ? 4 : 6).map((item, index) => (
            <div key={index} className="flowstate-spending-row">
              <div>
                <CategoryIcon
                  icon={item.icon}
                  color={item.color}
                  className="h-3.5 w-3.5"
                  containerClassName="shrink-0"
                />
                <span>{item.category}</span>
                <strong>{symbol}{item.amount.toLocaleString()}</strong>
                <em>{item.percentage.toFixed(0)}%</em>
              </div>
              <div className="flowstate-category-track"><span style={{ width: `${item.percentage}%`, backgroundColor: item.color }} /></div>
            </div>
          ))}
          {data.length > (compact ? 4 : 6) && (
            <p className="text-xs text-muted-foreground col-span-2">
              +{data.length - (compact ? 4 : 6)} more
            </p>
          )}
        </div>
      </div>

    </FuiWidget>
  );
});

SpendingDonutChart.displayName = "SpendingDonutChart";
