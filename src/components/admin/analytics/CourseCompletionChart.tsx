import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CourseCompletionData } from "@/hooks/useUserStatistics";
import { GraduationCap } from "lucide-react";

interface CourseCompletionChartProps {
  data: CourseCompletionData[];
}

export const CourseCompletionChart = ({ data }: CourseCompletionChartProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          Course Completion Rates
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="course_title"
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis />
            <Tooltip
              formatter={(value, name) => {
                if (name === "completion_rate") return [`${value}%`, "Completion Rate"];
                return [value, name];
              }}
            />
            <Legend />
            <Bar
              dataKey="completion_rate"
              fill="hsl(var(--chart-4))"
              name="Completion Rate (%)"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
