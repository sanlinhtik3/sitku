import { memo } from "react";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

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
}: HistoryComparisonChartProps) {
  const chartData = data.map(d => ({
    name: format(new Date(d.month + "-01"), "MMM"),
    Income: d.income,
    Expenses: d.expense,
  }));

  if (isLoading) {
    return (
      <Card className="p-4 border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-center h-[200px]">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 border-border/50 bg-card/50 backdrop-blur-sm">
      <h4 className="font-medium text-sm mb-4">Monthly Comparison</h4>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={0} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              dataKey="name" 
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              tickFormatter={(value) => formatAmount(value, currency)}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip 
              formatter={(value: number) => [formatAmount(value, currency), ""]}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Legend 
              wrapperStyle={{ fontSize: "11px" }}
              iconType="circle"
              iconSize={8}
            />
            <Bar 
              dataKey="Income" 
              fill="hsl(142, 76%, 36%)" 
              radius={[4, 4, 0, 0]}
            />
            <Bar 
              dataKey="Expenses" 
              fill="hsl(0, 84%, 60%)" 
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
});
