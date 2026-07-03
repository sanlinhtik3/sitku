import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, Users, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Course {
  id: string;
  title: string;
  enrollments: number;
  thumbnail_url?: string;
  category: string;
  difficulty?: string;
  lessonCount?: number;
}

export const RecentCoursesGrid = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const { data: coursesData, error } = await supabase
        .from("courses")
        .select("id, title, thumbnail_url, category, difficulty")
        .order("created_at", { ascending: false })
        .limit(6);

      if (error) throw error;

      if (coursesData) {
        const coursesWithStats = await Promise.all(
          coursesData.map(async (course) => {
            const [enrollmentsRes, lessonsRes] = await Promise.all([
              supabase
                .from("enrollments")
                .select("id", { count: "exact" })
                .eq("course_id", course.id),
              supabase
                .from("lessons")
                .select("id", { count: "exact" })
                .eq("course_id", course.id)
            ]);

            return {
              ...course,
              enrollments: enrollmentsRes.count || 0,
              lessonCount: lessonsRes.count || 0,
            };
          })
        );

        setCourses(coursesWithStats);
      }
    } catch (error) {
      console.error("Error fetching courses:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDifficultyColor = (difficulty: string | undefined) => {
    switch (difficulty) {
      case "beginner":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "intermediate":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "advanced":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-muted/50 text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-semibold">Recent Courses</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-[200px] sm:h-[220px]" />
          ))}
        </div>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recent Courses</h3>
        </div>
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-center">No courses available yet.</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => navigate("/admin#courses")}
            >
              Create Your First Course
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <h3 className="text-base sm:text-lg font-semibold">Recent Courses</h3>
        <Button 
          variant="ghost" 
          size="sm"
          className="w-full sm:w-auto h-11 sm:h-auto active:scale-95 transition-transform"
          onClick={() => navigate("/admin#courses")}
        >
          View All
          <ArrowUpRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {courses.map((course) => (
          <Card 
            key={course.id}
            className="border-border/40 bg-card/50 backdrop-blur-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 active:scale-[0.98] cursor-pointer group"
            onClick={() => navigate("/admin#courses")}
          >
            <CardContent className="p-0">
              {/* Thumbnail */}
              <div className="relative h-36 sm:h-32 overflow-hidden rounded-t-lg">
                {course.thumbnail_url ? (
                  <img 
                    src={course.thumbnail_url} 
                    alt={course.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                    <span className="text-4xl opacity-20">📚</span>
                  </div>
                )}
              </div>
              
              {/* Content */}
              <div className="p-4 sm:p-4 space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge 
                      variant="outline" 
                      className={`${getDifficultyColor(course.difficulty)} text-xs`}
                    >
                      {course.difficulty?.charAt(0).toUpperCase()}{course.difficulty?.slice(1) || "Beginner"}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {course.category}
                    </Badge>
                  </div>
                  
                  <h4 className="font-semibold text-sm sm:text-sm line-clamp-2 group-hover:text-primary transition-colors min-h-[40px] sm:min-h-0">
                    {course.title}
                  </h4>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>{course.lessonCount} lessons</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      <span>{course.enrollments}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
