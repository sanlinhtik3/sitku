import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface CourseRecommendation {
  courseId: string;
  courseTitle: string;
  reason: string;
  priority: "high" | "medium" | "low";
  expectedBenefit: string;
  category: string;
  difficulty: string;
  description: string;
  instructorName: string | null;
}

export const useCourseRecommendations = () => {
  const { user, session } = useAuth();

  return useQuery({
    queryKey: ["course-recommendations", user?.id],
    queryFn: async () => {
      // Ensure we have a valid session before calling
      if (!user || !session?.access_token) {
        return [];
      }

      try {
        const { data, error } = await supabase.functions.invoke("get-course-recommendations");

        if (error) {
          // Don't throw on auth errors or payment errors - just return empty array
          if (error.message?.includes("401") || error.message?.includes("Unauthorized")) {
            console.warn("Auth not ready for recommendations");
            return [];
          }
          // Handle 402/429 payment/rate limit errors gracefully
          if (error.message?.includes("402") || error.message?.includes("429") || 
              error.message?.includes("credits") || error.message?.includes("rate limit")) {
            console.warn("AI credits exhausted or rate limited");
            return [];
          }
          console.error("Error fetching recommendations:", error);
          return [];
        }

        // Check if response contains an error (402/429 errors may come as data.error)
        if (data?.error) {
          console.warn("Recommendations unavailable:", data.error);
          return [];
        }

        return (data?.recommendations || []) as CourseRecommendation[];
      } catch (err) {
        console.error("Failed to fetch recommendations:", err);
        return [];
      }
    },
    enabled: !!user && !!session?.access_token,
    staleTime: 1000 * 60 * 30, // 30 minutes
    retry: 1,
  });
};
