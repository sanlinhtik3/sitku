import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { RevenuePerUserData } from "@/hooks/useUserStatistics";
import { DollarSign } from "lucide-react";

interface RevenuePerUserChartProps {
  data: RevenuePerUserData[];
}

export const RevenuePerUserChart = ({ data }: RevenuePerUserChartProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Revenue Per User
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip
              formatter={(value: number) => {
                return `$${value.toFixed(2)}`;
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="revenue_per_user"
              stroke="hsl(var(--chart-5))"
              name="Revenue Per User"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
