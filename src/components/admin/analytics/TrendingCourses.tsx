import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, UserCheck, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEngagement } from "@/lib/analytics";

interface TrendingCourse {
  id: string;
  title: string;
  thumbnail_url: string | null;
  slug: string;
  viewsInPeriod: number;
  enrollmentsInPeriod: number;
  engagements: number;
}

export const TrendingCourses = ({ timeRange }: { timeRange: 7 | 14 | 28 | 90 }) => {
  const [courses, setCourses] = useState<TrendingCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTrendingCourses();
  }, [timeRange]);

  const fetchTrendingCourses = async () => {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - timeRange);

      // Get all courses
      const { data: courses } = await supabase
        .from("courses")
        .select("id, title, thumbnail_url, slug, view_count")
        .order("view_count", { ascending: false })
        .limit(10);

      if (!courses) return;

      // Get views, engagements, and enrollments for each course
      const coursesWithMetrics = await Promise.all(
        courses.map(async (course) => {
          const [views, engagements, enrollments] = await Promise.all([
            supabase
              .from("course_views")
              .select("id", { count: "exact" })
              .eq("course_id", course.id)
              .gte("viewed_at", daysAgo.toISOString()),
            supabase
              .from("course_engagements")
              .select("id", { count: "exact" })
              .eq("course_id", course.id)
              .gte("engaged_at", daysAgo.toISOString()),
            supabase
              .from("enrollments")
              .select("id", { count: "exact" })
              .eq("course_id", course.id)
              .gte("created_at", daysAgo.toISOString()),
          ]);

          return {
            ...course,
            viewsInPeriod: views.count || 0,
            enrollmentsInPeriod: enrollments.count || 0,
            engagements: engagements.count || 0,
          };
        })
      );

      // Sort by combined score: views + (enrollments * 10) + (engagements * 5)
      coursesWithMetrics.sort((a, b) => {
        const scoreA = a.viewsInPeriod + (a.enrollmentsInPeriod * 10) + (a.engagements * 5);
        const scoreB = b.viewsInPeriod + (b.enrollmentsInPeriod * 10) + (b.engagements * 5);
        return scoreB - scoreA;
      });

      setCourses(coursesWithMetrics.slice(0, 5));
    } catch (error) {
      console.error("Error fetching trending courses:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCourseClick = (course: TrendingCourse) => {
    trackEngagement('course', course.id, 'click');
    navigate(`/course/${course.slug}`);
  };

  if (loading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-base sm:text-lg">Trending Courses ({timeRange} Days)</CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <div className="space-y-3 sm:space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 sm:h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="px-4 sm:px-6 pb-3 sm:pb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
          <CardTitle className="text-base sm:text-lg">Trending Courses ({timeRange} Days)</CardTitle>
          <Button
            variant="ghost" 
            size="sm"
            className="w-full sm:w-auto h-11 sm:h-auto active:scale-95 transition-transform"
            onClick={() => navigate('/admin#courses')}
          >
            See All
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <div className="space-y-2 sm:space-y-3">
          {courses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No courses yet. Create your first course to see trends!
            </p>
          ) : (
            courses.map((course) => (
              <div
                key={course.id}
                className="flex items-center gap-3 sm:gap-4 p-3 sm:p-3 border rounded-lg hover:bg-accent/50 active:bg-accent cursor-pointer transition-colors min-h-[72px] sm:min-h-0"
                onClick={() => handleCourseClick(course)}
              >
                {course.thumbnail_url && (
                  <img
                    src={course.thumbnail_url}
                    alt={course.title}
                    className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded flex-shrink-0"
                    loading="lazy"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm sm:text-base line-clamp-2">{course.title}</h4>
                  <div className="flex items-center gap-3 sm:gap-4 mt-1.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Eye className="h-3 w-3 sm:h-3 sm:w-3" />
                      <span>{course.viewsInPeriod}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <UserCheck className="h-3 w-3 sm:h-3 sm:w-3" />
                      <span>{course.enrollmentsInPeriod}</span>
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
