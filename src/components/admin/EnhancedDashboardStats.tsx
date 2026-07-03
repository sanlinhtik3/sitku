// Enhanced Dashboard Statistics Component
// Real-time stats with trending analytics
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Users, UserCheck, Calendar, Clock } from "lucide-react";
import { StatCardWithProgress } from "./StatCardWithProgress";
import { FeaturedContentCard } from "./FeaturedContentCard";
import { EnrollmentTrendsChart } from "./EnrollmentTrendsChart";
import { RecentActivityPanel } from "./RecentActivityPanel";
import { RecentCoursesGrid } from "./RecentCoursesGrid";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnalyticsOverview } from "./analytics/AnalyticsOverview";
import { TrendingPosts } from "./analytics/TrendingPosts";
import { TrendingCourses } from "./analytics/TrendingCourses";
import { LiveStatisticsCard } from "./LiveStatisticsCard";

export const EnhancedDashboardStats = () => {
  const [stats, setStats] = useState({
    totalCourses: 0,
    totalUsers: 0,
    totalEnrollments: 0,
    activePosts: 0,
    pendingEnrollments: 0,
    courseTrend: 0,
    userTrend: 0,
    enrollmentTrend: 0,
    courseProgress: 0,
    userProgress: 0,
    enrollmentProgress: 0,
  });
  const [loading, setLoading] = useState(true);
  const [topCourse, setTopCourse] = useState<any>(null);
  const [timeRange, setTimeRange] = useState<7 | 14 | 28 | 90>(28);

  useEffect(() => {
    fetchStats();
  }, []);

  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const fetchStats = async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [
        coursesRes,
        usersRes,
        enrollmentsRes,
        postsRes,
        prevCoursesRes,
        prevUsersRes,
        prevEnrollmentsRes,
        topCourseRes,
        pendingEnrollmentsRes
      ] = await Promise.all([
        supabase.from("courses").select("id", { count: "exact" }),
        supabase.from("profiles").select("id", { count: "exact" }),
        supabase.from("enrollments").select("id", { count: "exact" }),
        supabase.from("posts").select("id", { count: "exact" }).eq("is_published", true),
        supabase.from("courses").select("id", { count: "exact" }).lt("created_at", thirtyDaysAgo.toISOString()),
        supabase.from("profiles").select("id", { count: "exact" }).lt("created_at", thirtyDaysAgo.toISOString()),
        supabase.from("enrollments").select("id", { count: "exact" }).lt("created_at", thirtyDaysAgo.toISOString()),
        supabase
          .from("courses")
          .select("id, title, thumbnail_url")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("enrollments")
          .select("id", { count: "exact" })
          .eq("status", "pending")
      ]);

      const totalCourses = coursesRes.count || 0;
      const totalUsers = usersRes.count || 0;
      const totalEnrollments = enrollmentsRes.count || 0;

      const courseTrend = calculateTrend(totalCourses, prevCoursesRes.count || 0);
      const userTrend = calculateTrend(totalUsers, prevUsersRes.count || 0);
      const enrollmentTrend = calculateTrend(totalEnrollments, prevEnrollmentsRes.count || 0);

      const courseProgress = Math.min((totalCourses / 100) * 100, 100);
      const userProgress = Math.min((totalUsers / 1000) * 100, 100);
      const enrollmentProgress = Math.min((totalEnrollments / 500) * 100, 100);

      setStats({
        totalCourses,
        totalUsers,
        totalEnrollments,
        activePosts: postsRes.count || 0,
        pendingEnrollments: pendingEnrollmentsRes.count || 0,
        courseTrend,
        userTrend,
        enrollmentTrend,
        courseProgress,
        userProgress,
        enrollmentProgress,
      });

      if (topCourseRes.data) {
        const enrollmentCount = await supabase
          .from("enrollments")
          .select("id", { count: "exact" })
          .eq("course_id", topCourseRes.data.id);

        setTopCourse({
          ...topCourseRes.data,
          enrollments: enrollmentCount.count || 0,
        });
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-[160px]" />
          <Skeleton className="h-[160px]" />
          <Skeleton className="h-[160px]" />
          <Skeleton className="h-[160px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-3 sm:px-6 animate-fade-in">
      {/* Stats Section - Mobile-first: 2 columns on mobile, 4 columns on large screens */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <StatCardWithProgress
          title="Total Courses"
          value={stats.totalCourses}
          icon={BookOpen}
          progress={stats.courseProgress}
          trend={stats.courseTrend}
          colorClass="text-primary"
        />
        <StatCardWithProgress
          title="Total Users"
          value={stats.totalUsers}
          icon={Users}
          progress={stats.userProgress}
          trend={stats.userTrend}
          colorClass="text-secondary"
        />
        <StatCardWithProgress
          title="Enrollments"
          value={stats.totalEnrollments}
          icon={UserCheck}
          progress={stats.enrollmentProgress}
          trend={stats.enrollmentTrend}
          colorClass="text-success"
        />
        <StatCardWithProgress
          title="Pending Requests"
          value={stats.pendingEnrollments}
          icon={Clock}
          progress={0}
          colorClass="text-amber-500"
          suffix={stats.pendingEnrollments === 1 ? " request" : " requests"}
        />
      </div>

      {/* Live Statistics Card */}
      <LiveStatisticsCard />

      {/* Time Range Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card border rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">Analytics Time Range</span>
        </div>
        <Select
          value={timeRange.toString()}
          onValueChange={(value) => setTimeRange(parseInt(value) as 7 | 14 | 28 | 90)}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="28">Last 28 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Analytics Overview */}
      <AnalyticsOverview timeRange={timeRange} />

      {/* Trending Content Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <TrendingPosts timeRange={timeRange} />
        <TrendingCourses timeRange={timeRange} />
      </div>

      {/* Activity Panel - Full width on mobile, hidden on desktop */}
      <div className="block lg:hidden">
        <RecentActivityPanel />
      </div>

      {/* Chart + Featured Course - Stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 order-2 lg:order-1">
          <EnrollmentTrendsChart />
        </div>
        <div className="lg:col-span-1 order-1 lg:order-2">
          {topCourse && (
            <FeaturedContentCard
              title={topCourse.title}
              enrollments={topCourse.enrollments}
              thumbnailUrl={topCourse.thumbnail_url}
              courseId={topCourse.id}
            />
          )}
        </div>
      </div>

      {/* Activity Panel - Hidden on mobile, shown on desktop */}
      <div className="hidden lg:block">
        <RecentActivityPanel />
      </div>

      {/* Recent Courses Grid */}
      <RecentCoursesGrid />
    </div>
  );
};
