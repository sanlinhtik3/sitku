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
import { UserGrowthData } from "@/hooks/useUserStatistics";
import { TrendingUp } from "lucide-react";

interface UserGrowthChartProps {
  data: UserGrowthData[];
}

export const UserGrowthChart = ({ data }: UserGrowthChartProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          User Growth Over Time
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => {
                const date = new Date(value);
                return `${date.getMonth() + 1}/${date.getDate()}`;
              }}
            />
            <YAxis />
            <Tooltip
              labelFormatter={(value) => {
                return new Date(value).toLocaleDateString();
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="total_users"
              stroke="hsl(var(--primary))"
              name="Total Users"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="new_users"
              stroke="hsl(var(--chart-2))"
              name="New Users"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
