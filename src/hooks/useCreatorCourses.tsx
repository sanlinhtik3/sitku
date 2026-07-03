import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface CreatorCourse {
  id: string;
  title: string;
  slug: string;
  description: string;
  thumbnail_url: string;
  category: string;
  difficulty: string;
  is_free: boolean;
  price: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  view_count: number;
  total_duration_minutes: number;
  enrollment_count?: number;
}

export const useCreatorCourses = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CreatorCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchCourses();
  }, [user]);

  const fetchCourses = async () => {
    try {
      const { data: coursesData, error } = await supabase
        .from("courses")
        .select("*")
        .eq("created_by", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get enrollment counts for each course
      const coursesWithEnrollments = await Promise.all(
        (coursesData || []).map(async (course) => {
          const { count } = await supabase
            .from("enrollments")
            .select("*", { count: "exact", head: true })
            .eq("course_id", course.id)
            .eq("status", "approved");

          return {
            ...course,
            enrollment_count: count || 0,
          };
        })
      );

      setCourses(coursesWithEnrollments);
    } catch (error) {
      console.error("Error fetching creator courses:", error);
    } finally {
      setLoading(false);
    }
  };

  return {
    courses,
    loading,
    refresh: fetchCourses,
  };
};
