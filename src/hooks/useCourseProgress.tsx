import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CourseProgress {
  course_id: string;
  course_title: string;
  course_thumbnail: string;
  total_lessons: number;
  completed_lessons: number;
  progress_percentage: number;
}

export const useCourseProgress = (userId: string | undefined) => {
  return useQuery({
    queryKey: ["course-progress", userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase.rpc("get_user_course_progress", {
        p_user_id: userId,
      });

      if (error) throw error;
      return (data || []) as CourseProgress[];
    },
    enabled: !!userId,
  });
};
