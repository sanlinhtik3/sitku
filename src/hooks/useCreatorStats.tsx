import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface CreatorStats {
  totalCourses: number;
  totalEnrollments: number;
  totalRevenue: number;
  totalViews: number;
}

export const useCreatorStats = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<CreatorStats>({
    totalCourses: 0,
    totalEnrollments: 0,
    totalRevenue: 0,
    totalViews: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchStats();
  }, [user]);

  const fetchStats = async () => {
    try {
      // Get courses
      const { data: courses, error: coursesError } = await supabase
        .from("courses")
        .select("id, view_count, price")
        .eq("created_by", user?.id);

      if (coursesError) throw coursesError;

      const totalCourses = courses?.length || 0;
      const totalViews = courses?.reduce((sum, c) => sum + (c.view_count || 0), 0) || 0;

      // Get enrollments
      const courseIds = courses?.map(c => c.id) || [];
      let totalEnrollments = 0;
      let totalRevenue = 0;

      if (courseIds.length > 0) {
        const { data: enrollments, error: enrollError } = await supabase
          .from("enrollments")
          .select("final_price")
          .in("course_id", courseIds)
          .eq("status", "approved");

        if (enrollError) throw enrollError;

        totalEnrollments = enrollments?.length || 0;
        totalRevenue = enrollments?.reduce((sum, e) => sum + (parseFloat(e.final_price?.toString() || "0")), 0) || 0;
      }

      setStats({
        totalCourses,
        totalEnrollments,
        totalRevenue: totalRevenue * 0.7, // 70% creator share
        totalViews,
      });
    } catch (error) {
      console.error("Error fetching creator stats:", error);
    } finally {
      setLoading(false);
    }
  };

  return {
    stats,
    loading,
    refresh: fetchStats,
  };
};
