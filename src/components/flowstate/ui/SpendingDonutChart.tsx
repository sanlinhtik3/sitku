import { memo, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";

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

const RADIAN = Math.PI / 180;

const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null; // Don't show label for small slices
  
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-[10px] font-medium"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const CustomTooltip = ({ active, payload, currency }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-popover/95 backdrop-blur-md border border-border/50 rounded-lg p-3 shadow-xl">
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
      return [{ category: "No data", amount: 1, percentage: 100, color: "#374151" }];
    }
    return data;
  }, [data]);

  const totalAmount = useMemo(() => 
    data.reduce((sum, item) => sum + item.amount, 0)
  , [data]);

  return (
    <div className={cn(
      "rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl overflow-hidden",
      compact ? "p-3" : "p-4"
    )}>
      <h3 className={cn("font-semibold text-foreground mb-3", compact ? "text-sm" : "text-base")}>
        Spending by Category
      </h3>

      <div className="flex flex-col lg:flex-row items-center gap-4">
        {/* Chart */}
        <div className={cn("w-full", compact ? "h-[140px]" : "h-[180px]", "lg:w-1/2")}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                innerRadius={compact ? 35 : 45}
                outerRadius={compact ? 60 : 75}
                paddingAngle={2}
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
        </div>

        {/* Legend */}
        <div className={cn(
          "w-full lg:w-1/2 grid gap-1.5",
          compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-1"
        )}>
          {data.slice(0, compact ? 4 : 6).map((item, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div 
                className="w-2.5 h-2.5 rounded-full shrink-0" 
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground truncate text-xs flex-1">
                {item.category}
              </span>
              <span className="text-xs font-medium tabular-nums">
                {item.percentage.toFixed(0)}%
              </span>
            </div>
          ))}
          {data.length > (compact ? 4 : 6) && (
            <p className="text-xs text-muted-foreground col-span-2">
              +{data.length - (compact ? 4 : 6)} more
            </p>
          )}
        </div>
      </div>

      {/* Total */}
      <div className="mt-3 pt-3 border-t border-border/30 flex justify-between items-center">
        <span className="text-xs text-muted-foreground">Total Expenses</span>
        <span className="font-semibold text-sm">
          {currency} {totalAmount.toLocaleString()}
        </span>
      </div>
    </div>
  );
});

SpendingDonutChart.displayName = "SpendingDonutChart";
