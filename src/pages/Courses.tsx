import { useState, useEffect, useMemo, memo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { supabase } from "@/integrations/supabase/client";
import { PublicLayout } from "@/layouts/PublicLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, GraduationCap } from "lucide-react";
import { OptimizedImage } from "@/components/OptimizedImage";
import { GlassmorphicCard, PageHeader } from "@/components/ui/FuturisticElements";
import { LoadingState, EmptyState } from "@/components/ui/LoadingState";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";

interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnail_url: string;
  category: string;
  is_free: boolean;
  price: number;
  difficulty?: string;
  lessonCount?: number;
}

const CourseCard = memo(function CourseCard({ course, getDifficultyColor }: { course: Course; getDifficultyColor: (d: string) => string }) { return (
  <GlassmorphicCard className="overflow-hidden group" glow>
    <div className="relative aspect-video overflow-hidden">
      <OptimizedImage
        src={course.thumbnail_url || "https://images.unsplash.com/photo-1639322537228-f710d846310a?w=500"}
        alt={course.title}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      />
      <Badge className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-background/80 backdrop-blur-sm border-primary/30 text-[10px] sm:text-xs">
        {course.is_free ? "Free" : "Premium"}
      </Badge>
    </div>
    <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`text-[10px] sm:text-xs ${getDifficultyColor(course.difficulty || "beginner")}`}>
          {(course.difficulty || "beginner").charAt(0).toUpperCase() + (course.difficulty || "beginner").slice(1)}
        </Badge>
      </div>
      <h3 className="font-semibold text-sm sm:text-base line-clamp-2 group-hover:text-primary transition-colors">
        {course.title}
      </h3>
      <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
        <span>{course.category}</span>
        <span>·</span>
        <div className="flex items-center gap-1">
          <BookOpen className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          <span>{course.lessonCount || 0} lessons</span>
        </div>
      </div>
      <Link to={`/course/${course.slug}`} className="block pt-1 sm:pt-2">
        <Button variant="outline" className="w-full h-8 sm:h-9 text-xs sm:text-sm border-primary/30 hover:border-primary hover:bg-primary hover:text-primary-foreground transition-all">
          View Course
        </Button>
      </Link>
    </div>
  </GlassmorphicCard>
); });

const VirtualCourseGrid = ({ courses, columns, getDifficultyColor }: { courses: Course[]; columns: number; getDifficultyColor: (d: string) => string }) => {
  const rowCount = Math.ceil(courses.length / columns);
  const rowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => 320,
    overscan: 3,
  });

  return (
    <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const startIndex = virtualRow.index * columns;
        const rowCourses = courses.slice(startIndex, startIndex + columns);
        return (
          <div
            key={virtualRow.key}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 absolute left-0 w-full"
            style={{ top: virtualRow.start, height: virtualRow.size }}
          >
            {rowCourses.map((course) => (
              <CourseCard key={course.id} course={course} getDifficultyColor={getDifficultyColor} />
            ))}
          </div>
        );
      })}
    </div>
  );
};

const Courses = () => {
  usePageMeta({
    title: "Free Crypto Courses – ZOE CRYPTO",
    description: "Browse free crypto and blockchain courses from beginner to advanced. Start learning today with expert-led content.",
  });
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");

  // Responsive column count for virtual grid
  const [columns, setColumns] = useState(() => {
    if (typeof window === "undefined") return 3;
    if (window.innerWidth < 640) return 1;
    if (window.innerWidth < 1024) return 2;
    return 3;
  });

  useEffect(() => {
    const update = () => {
      if (window.innerWidth < 640) setColumns(1);
      else if (window.innerWidth < 1024) setColumns(2);
      else setColumns(3);
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses", selectedDifficulty],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      let query = supabase
        .from("courses")
        .select("*")
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (selectedDifficulty !== "all") {
        query = query.eq("difficulty", selectedDifficulty);
      }

      const { data, error } = await query;

      if (error) throw error;

      const coursesWithLessons = await Promise.all(
        (data || []).map(async (course) => {
          const { count } = await supabase
            .from("lessons")
            .select("id", { count: "exact", head: true })
            .eq("course_id", course.id);
          
          return { ...course, lessonCount: count || 0 };
        })
      );
      
      return coursesWithLessons as Course[];
    },
  });

  const getDifficultyColor = useCallback((difficulty: string) => {
    switch (difficulty) {
      case "beginner":
        return "bg-green-500/10 text-green-500 border-green-500/30";
      case "intermediate":
        return "bg-amber-500/10 text-amber-500 border-amber-500/30";
      case "advanced":
        return "bg-red-500/10 text-red-500 border-red-500/30";
      default:
        return "bg-muted/50 text-muted-foreground border-muted";
    }
  }, []);

  return (
    <PublicLayout>
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-20 md:pb-8">
        {/* Header */}
        <PageHeader
          icon={GraduationCap}
          title="Explore Courses"
          subtitle="From blockchain basics to advanced trading strategies"
        />

        {/* Difficulty Filters */}
        <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
          <div className="flex gap-1.5 sm:gap-2 min-w-max pb-2">
            {["all", "beginner", "intermediate", "advanced"].map((diff) => (
              <button
                key={diff}
                onClick={() => setSelectedDifficulty(diff)}
                className={cn(
                  "px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap",
                  selectedDifficulty === diff
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-border/50"
                )}
              >
                {diff === "all" ? "All Courses" : diff.charAt(0).toUpperCase() + diff.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Course Grid */}
        {isLoading ? (
          <LoadingState variant="course" count={6} columns={3} />
        ) : courses.length === 0 ? (
          <EmptyState 
            icon={<GraduationCap className="h-12 w-12" />}
            title="No courses found"
            description="No courses available for this difficulty level. Try selecting a different filter."
          />
        ) : courses.length <= 20 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} getDifficultyColor={getDifficultyColor} />
            ))}
          </div>
        ) : (
          <VirtualCourseGrid courses={courses} columns={columns} getDifficultyColor={getDifficultyColor} />
        )}
      </div>
    </PublicLayout>
  );
};

export default Courses;
