import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

export const EnrollmentTrendsChart = () => {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = useState("7");
  const [data, setData] = useState<{ date: string; enrollments: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEnrollmentData();
  }, [timeRange]);

  const fetchEnrollmentData = async () => {
    setLoading(true);
    try {
      const days = parseInt(timeRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select("created_at")
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Group by date
      const groupedData: Record<string, number> = {};
      enrollments?.forEach((enrollment) => {
        const date = new Date(enrollment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        groupedData[date] = (groupedData[date] || 0) + 1;
      });

      // Fill in missing dates with 0
      const chartData = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        chartData.push({
          date: dateStr,
          enrollments: groupedData[dateStr] || 0,
        });
      }

      setData(chartData);
    } catch (error) {
      console.error("Error fetching enrollment data:", error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-4 px-4 sm:px-6">
        <CardTitle className="text-base sm:text-lg font-semibold">Enrollment Trends</CardTitle>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-full sm:w-[130px] h-11 sm:h-10">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="pb-4 px-2 sm:px-6">
        {loading ? (
          <Skeleton className="w-full h-[200px] sm:h-[300px]" />
        ) : (
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 300}>
          <AreaChart data={data} margin={{ left: -20, right: 10 }}>
            <defs>
              <linearGradient id="colorEnrollments" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              dataKey="date" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={isMobile ? 9 : 10}
              tickLine={false}
              axisLine={false}
              interval={isMobile ? 'preserveStartEnd' : 0}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "14px",
                padding: "12px",
              }}
              labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
              cursor={{ stroke: "hsl(var(--border))", strokeWidth: 2 }}
            />
            <Area 
              type="monotone" 
              dataKey="enrollments" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              fill="url(#colorEnrollments)"
              name="Enrollments"
            />
          </AreaChart>
        </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
