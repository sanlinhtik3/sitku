import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, subDays, format } from "date-fns";

export interface UserGrowthData {
  date: string;
  total_users: number;
  new_users: number;
}

export interface ActiveUsersData {
  date: string;
  active_users: number;
}

export interface CourseCompletionData {
  course_title: string;
  completion_rate: number;
  total_enrolled: number;
  completed: number;
}

export interface RevenuePerUserData {
  month: string;
  total_revenue: number;
  total_users: number;
  revenue_per_user: number;
}

export const useUserStatistics = (timeRange: number = 30) => {
  return useQuery({
    queryKey: ["user-statistics", timeRange],
    queryFn: async () => {
      const startDate = startOfDay(subDays(new Date(), timeRange));

      // Fetch user growth data
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("created_at")
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true });

      if (profilesError) throw profilesError;

      // Process user growth data
      const growthMap = new Map<string, number>();
      profiles?.forEach((profile) => {
        const date = format(new Date(profile.created_at), "yyyy-MM-dd");
        growthMap.set(date, (growthMap.get(date) || 0) + 1);
      });

      const userGrowthData: UserGrowthData[] = [];
      let cumulativeUsers = 0;
      for (let i = 0; i <= timeRange; i++) {
        const date = format(subDays(new Date(), timeRange - i), "yyyy-MM-dd");
        const newUsers = growthMap.get(date) || 0;
        cumulativeUsers += newUsers;
        userGrowthData.push({
          date,
          total_users: cumulativeUsers,
          new_users: newUsers,
        });
      }

      // Fetch active users data (users with login attempts)
      const { data: loginAttempts, error: loginError } = await supabase
        .from("login_attempts")
        .select("email, attempt_time")
        .eq("success", true)
        .gte("attempt_time", startDate.toISOString());

      if (loginError) throw loginError;

      // Process active users data
      const activeUsersMap = new Map<string, Set<string>>();
      loginAttempts?.forEach((attempt) => {
        const date = format(new Date(attempt.attempt_time), "yyyy-MM-dd");
        if (!activeUsersMap.has(date)) {
          activeUsersMap.set(date, new Set());
        }
        activeUsersMap.get(date)?.add(attempt.email);
      });

      const activeUsersData: ActiveUsersData[] = [];
      for (let i = 0; i <= timeRange; i++) {
        const date = format(subDays(new Date(), timeRange - i), "yyyy-MM-dd");
        const activeUsers = activeUsersMap.get(date)?.size || 0;
        activeUsersData.push({ date, active_users: activeUsers });
      }

      // Fetch course completion rates
      const { data: courses, error: coursesError } = await supabase
        .from("courses")
        .select("id, title");

      if (coursesError) throw coursesError;

      const courseCompletionData: CourseCompletionData[] = [];
      for (const course of courses || []) {
        const { count: totalEnrolled } = await supabase
          .from("enrollments")
          .select("*", { count: "exact", head: true })
          .eq("course_id", course.id)
          .eq("status", "approved");

        const { data: lessons } = await supabase
          .from("lessons")
          .select("id")
          .eq("course_id", course.id)
          .eq("is_published", true);

        if (lessons && lessons.length > 0) {
          const { data: completedUsers } = await supabase
            .from("user_lesson_progress")
            .select("user_id")
            .in("lesson_id", lessons.map(l => l.id))
            .eq("completed", true);

          const uniqueCompletedUsers = new Set(
            completedUsers?.map(u => u.user_id) || []
          ).size;

          const completionRate = totalEnrolled
            ? (uniqueCompletedUsers / totalEnrolled) * 100
            : 0;

          courseCompletionData.push({
            course_title: course.title,
            completion_rate: Math.round(completionRate),
            total_enrolled: totalEnrolled || 0,
            completed: uniqueCompletedUsers,
          });
        }
      }

      // Fetch revenue per user data
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from("enrollments")
        .select("final_price, created_at")
        .eq("status", "approved")
        .gte("created_at", startDate.toISOString());

      if (enrollmentsError) throw enrollmentsError;

      const revenueMap = new Map<string, number>();
      enrollments?.forEach((enrollment) => {
        const month = format(new Date(enrollment.created_at), "yyyy-MM");
        revenueMap.set(
          month,
          (revenueMap.get(month) || 0) + Number(enrollment.final_price || 0)
        );
      });

      const { count: totalUsers } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      const revenuePerUserData: RevenuePerUserData[] = Array.from(
        revenueMap.entries()
      ).map(([month, revenue]) => ({
        month,
        total_revenue: revenue,
        total_users: totalUsers || 1,
        revenue_per_user: revenue / (totalUsers || 1),
      }));

      return {
        userGrowth: userGrowthData,
        activeUsers: activeUsersData,
        courseCompletion: courseCompletionData,
        revenuePerUser: revenuePerUserData,
      };
    },
  });
};
