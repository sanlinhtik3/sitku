import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserStatistics } from "@/hooks/useUserStatistics";
import { UserGrowthChart } from "./analytics/UserGrowthChart";
import { ActiveUsersChart } from "./analytics/ActiveUsersChart";
import { CourseCompletionChart } from "./analytics/CourseCompletionChart";
import { RevenuePerUserChart } from "./analytics/RevenuePerUserChart";
import { Users, UserCheck, GraduationCap, DollarSign } from "lucide-react";

export const UserStatisticsDashboard = () => {
  const [timeRange, setTimeRange] = useState<number>(30);
  const { data, isLoading } = useUserStatistics(timeRange);

  const latestUserGrowth = data?.userGrowth[data.userGrowth.length - 1];
  const totalActiveUsers = data?.activeUsers.reduce((sum, day) => sum + day.active_users, 0) || 0;
  const avgCompletionRate = data?.courseCompletion.length
    ? Math.round(
        data.courseCompletion.reduce((sum, course) => sum + course.completion_rate, 0) /
          data.courseCompletion.length
      )
    : 0;
  const latestRevenue = data?.revenuePerUser[data?.revenuePerUser.length - 1];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">User Statistics</h2>
        <Select
          value={timeRange.toString()}
          onValueChange={(value) => setTimeRange(Number(value))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latestUserGrowth?.total_users || 0}</div>
            <p className="text-xs text-muted-foreground">
              +{latestUserGrowth?.new_users || 0} new today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalActiveUsers}</div>
            <p className="text-xs text-muted-foreground">
              In the last {timeRange} days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Completion Rate</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgCompletionRate}%</div>
            <p className="text-xs text-muted-foreground">
              Across all courses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Per User</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${latestRevenue?.revenue_per_user.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">
              Current month
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <UserGrowthChart data={data?.userGrowth || []} />
        <ActiveUsersChart data={data?.activeUsers || []} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <CourseCompletionChart data={data?.courseCompletion || []} />
        <RevenuePerUserChart data={data?.revenuePerUser || []} />
      </div>
    </div>
  );
};
