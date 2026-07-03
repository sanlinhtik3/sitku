import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, MousePointerClick, BookOpen, FileText, UserCheck, Users } from "lucide-react";
import { AnalyticsCard } from "./AnalyticsCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

interface AnalyticsData {
  current: {
    totalViews: number;
    totalEngagements: number;
    postViews: number;
    courseViews: number;
    enrollments: number;
    newUsers: number;
  };
  previous: {
    totalViews: number;
    totalEngagements: number;
    postViews: number;
    courseViews: number;
    enrollments: number;
    newUsers: number;
  };
  trend: {
    totalViews: number;
    totalEngagements: number;
    postViews: number;
    courseViews: number;
    enrollments: number;
    newUsers: number;
  };
  chartData: Array<{
    date: string;
    views: number;
    engagements: number;
    enrollments: number;
  }>;
}

export const AnalyticsOverview = ({ timeRange }: { timeRange: 7 | 14 | 28 | 90 }) => {
  const isMobile = useIsMobile();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const fetchAnalytics = async () => {
    try {
      const now = new Date();
      const currentPeriodStart = new Date(now.getTime() - timeRange * 24 * 60 * 60 * 1000);
      const previousPeriodStart = new Date(now.getTime() - timeRange * 2 * 24 * 60 * 60 * 1000);

      // Fetch current period data
      const [postViewsCurrent, courseViewsCurrent, postEngagementsCurrent, courseEngagementsCurrent, enrollmentsCurrent, usersCurrent] = await Promise.all([
        supabase.from("post_views").select("id", { count: "exact" }).gte("viewed_at", currentPeriodStart.toISOString()),
        supabase.from("course_views").select("id", { count: "exact" }).gte("viewed_at", currentPeriodStart.toISOString()),
        supabase.from("post_engagements").select("id", { count: "exact" }).gte("engaged_at", currentPeriodStart.toISOString()),
        supabase.from("course_engagements").select("id", { count: "exact" }).gte("engaged_at", currentPeriodStart.toISOString()),
        supabase.from("enrollments").select("id", { count: "exact" }).gte("created_at", currentPeriodStart.toISOString()),
        supabase.from("profiles").select("id", { count: "exact" }).gte("created_at", currentPeriodStart.toISOString()),
      ]);

      // Fetch previous period data
      const [postViewsPrevious, courseViewsPrevious, postEngagementsPrevious, courseEngagementsPrevious, enrollmentsPrevious, usersPrevious] = await Promise.all([
        supabase.from("post_views").select("id", { count: "exact" }).gte("viewed_at", previousPeriodStart.toISOString()).lt("viewed_at", currentPeriodStart.toISOString()),
        supabase.from("course_views").select("id", { count: "exact" }).gte("viewed_at", previousPeriodStart.toISOString()).lt("viewed_at", currentPeriodStart.toISOString()),
        supabase.from("post_engagements").select("id", { count: "exact" }).gte("engaged_at", previousPeriodStart.toISOString()).lt("engaged_at", currentPeriodStart.toISOString()),
        supabase.from("course_engagements").select("id", { count: "exact" }).gte("engaged_at", previousPeriodStart.toISOString()).lt("engaged_at", currentPeriodStart.toISOString()),
        supabase.from("enrollments").select("id", { count: "exact" }).gte("created_at", previousPeriodStart.toISOString()).lt("created_at", currentPeriodStart.toISOString()),
        supabase.from("profiles").select("id", { count: "exact" }).gte("created_at", previousPeriodStart.toISOString()).lt("created_at", currentPeriodStart.toISOString()),
      ]);

      const current = {
        totalViews: (postViewsCurrent.count || 0) + (courseViewsCurrent.count || 0),
        totalEngagements: (postEngagementsCurrent.count || 0) + (courseEngagementsCurrent.count || 0),
        postViews: postViewsCurrent.count || 0,
        courseViews: courseViewsCurrent.count || 0,
        enrollments: enrollmentsCurrent.count || 0,
        newUsers: usersCurrent.count || 0,
      };

      const previous = {
        totalViews: (postViewsPrevious.count || 0) + (courseViewsPrevious.count || 0),
        totalEngagements: (postEngagementsPrevious.count || 0) + (courseEngagementsPrevious.count || 0),
        postViews: postViewsPrevious.count || 0,
        courseViews: courseViewsPrevious.count || 0,
        enrollments: enrollmentsPrevious.count || 0,
        newUsers: usersPrevious.count || 0,
      };

      const trend = {
        totalViews: calculateTrend(current.totalViews, previous.totalViews),
        totalEngagements: calculateTrend(current.totalEngagements, previous.totalEngagements),
        postViews: calculateTrend(current.postViews, previous.postViews),
        courseViews: calculateTrend(current.courseViews, previous.courseViews),
        enrollments: calculateTrend(current.enrollments, previous.enrollments),
        newUsers: calculateTrend(current.newUsers, previous.newUsers),
      };

      // Fetch chart data
      const { data: viewsData } = await supabase
        .from("post_views")
        .select("viewed_at")
        .gte("viewed_at", currentPeriodStart.toISOString())
        .order("viewed_at");

      const { data: engagementsData } = await supabase
        .from("post_engagements")
        .select("engaged_at")
        .gte("engaged_at", currentPeriodStart.toISOString())
        .order("engaged_at");

      const { data: enrollmentsData } = await supabase
        .from("enrollments")
        .select("created_at")
        .gte("created_at", currentPeriodStart.toISOString())
        .order("created_at");

      // Group by date
      const chartDataMap: Record<string, { views: number; engagements: number; enrollments: number }> = {};
      
      for (let i = timeRange - 1; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        chartDataMap[dateStr] = { views: 0, engagements: 0, enrollments: 0 };
      }

      viewsData?.forEach((view) => {
        const date = new Date(view.viewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (chartDataMap[date]) chartDataMap[date].views++;
      });

      engagementsData?.forEach((engagement) => {
        const date = new Date(engagement.engaged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (chartDataMap[date]) chartDataMap[date].engagements++;
      });

      enrollmentsData?.forEach((enrollment) => {
        const date = new Date(enrollment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (chartDataMap[date]) chartDataMap[date].enrollments++;
      });

      const chartData = Object.entries(chartDataMap).map(([date, values]) => ({
        date,
        ...values,
      }));

      setData({ current, previous, trend, chartData });
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-[110px] sm:h-[130px]" />
          ))}
        </div>
        <Skeleton className="h-[250px] sm:h-[400px]" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Metrics Grid - Mobile: 2 columns, Desktop: 3 columns */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
        <AnalyticsCard
          title="Total Views"
          value={data.current.totalViews}
          trend={data.trend.totalViews}
          icon={Eye}
          colorClass="text-primary"
        />
        <AnalyticsCard
          title="Total Engagements"
          value={data.current.totalEngagements}
          trend={data.trend.totalEngagements}
          icon={MousePointerClick}
          colorClass="text-secondary"
        />
        <AnalyticsCard
          title="Post Views"
          value={data.current.postViews}
          trend={data.trend.postViews}
          icon={FileText}
          colorClass="text-accent"
        />
        <AnalyticsCard
          title="Course Views"
          value={data.current.courseViews}
          trend={data.trend.courseViews}
          icon={BookOpen}
          colorClass="text-success"
        />
        <AnalyticsCard
          title="New Enrollments"
          value={data.current.enrollments}
          trend={data.trend.enrollments}
          icon={UserCheck}
          colorClass="text-primary"
        />
        <AnalyticsCard
          title="New Users"
          value={data.current.newUsers}
          trend={data.trend.newUsers}
          icon={Users}
          colorClass="text-secondary"
        />
      </div>

      {/* Chart */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="px-4 sm:px-6 pb-3 sm:pb-4">
          <CardTitle className="text-base sm:text-lg">{timeRange}-Day Performance</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
            <LineChart data={data.chartData} margin={{ left: isMobile ? -20 : 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="date" 
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
              fontSize={isMobile ? 9 : 11}
              angle={timeRange === 90 ? -45 : 0}
              textAnchor={timeRange === 90 ? "end" : "middle"}
              height={timeRange === 90 ? 60 : 30}
              tickFormatter={(value, index) => {
                if (isMobile) {
                  if (timeRange <= 7) return value;
                  if (timeRange === 14) return index % 2 === 0 ? value : '';
                  if (timeRange === 28) return index % 4 === 0 ? value : '';
                  if (timeRange === 90) return index % 10 === 0 ? value : '';
                }
                if (timeRange <= 14) return value;
                if (timeRange === 28) return index % 2 === 0 ? value : '';
                if (timeRange === 90) return index % 7 === 0 ? value : '';
                return value;
              }}
            />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                fontSize={isMobile ? 9 : 11}
                width={isMobile ? 30 : 40}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="views" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                name="Views"
              />
              <Line 
                type="monotone" 
                dataKey="engagements" 
                stroke="hsl(var(--secondary))" 
                strokeWidth={2}
                name="Engagements"
              />
              <Line 
                type="monotone" 
                dataKey="enrollments" 
                stroke="hsl(var(--success))" 
                strokeWidth={2}
                name="Enrollments"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};
