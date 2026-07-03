import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Clock, User, GraduationCap, Tag, Play, Info, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { OptimizedImage } from "@/components/OptimizedImage";

interface EnrolledCourse {
  id: string;
  course_id: string;
  status: string;
  access_expires_at: string | null;
  is_expired: boolean;
  courses: {
    id: string;
    slug: string;
    title: string;
    description: string;
    thumbnail_url: string;
    category: string;
    instructor_name: string | null;
    difficulty: string | null;
    is_free: boolean;
    lesson_count?: number;
  };
}

interface CourseProgressInfo {
  course_id: string;
  total_lessons: number;
  completed_lessons: number;
  progress_percentage: number;
}

interface EnrolledCourseCardProps {
  course: EnrolledCourse;
  daysRemaining: number | null;
  onViewDetails: (course: EnrolledCourse) => void;
  progressInfo?: CourseProgressInfo;
}

export const EnrolledCourseCard = ({ course, daysRemaining, onViewDetails, progressInfo }: EnrolledCourseCardProps) => {
  const navigate = useNavigate();
  const courseData = course.courses;
  const [firstLessonSlug, setFirstLessonSlug] = useState<string | null>(null);

  useEffect(() => {
    const fetchFirstLesson = async () => {
      const { data } = await supabase
        .from("lessons")
        .select("slug")
        .eq("course_id", course.course_id)
        .eq("is_published", true)
        .order("order_index", { ascending: true })
        .limit(1)
        .single();
      
      if (data) {
        setFirstLessonSlug(data.slug);
      }
    };
    
    fetchFirstLesson();
  }, [course.course_id]);

  const handleContinueLearning = () => {
    if (!firstLessonSlug) {
      toast.error("No lessons available for this course yet");
      return;
    }
    navigate(`/course/${courseData.slug}/lesson/${firstLessonSlug}`);
  };
  const isFree = courseData.is_free;

  const getDifficultyColor = (difficulty: string | null) => {
    switch (difficulty?.toLowerCase()) {
      case 'beginner': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'intermediate': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'advanced': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getExpiryBadge = () => {
    if (isFree) return null;
    if (course.is_expired) {
      return <Badge variant="destructive" className="gap-1"><Clock className="h-3 w-3" />Expired</Badge>;
    }
    if (daysRemaining !== null) {
      if (daysRemaining <= 3) {
        return <Badge variant="destructive" className="gap-1"><Clock className="h-3 w-3" />{daysRemaining} days left</Badge>;
      } else if (daysRemaining <= 7) {
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 gap-1"><Clock className="h-3 w-3" />{daysRemaining} days left</Badge>;
      } else {
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />{daysRemaining} days left</Badge>;
      }
    }
    return null;
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 group">
      <div className="aspect-video relative overflow-hidden bg-muted">
        {courseData.thumbnail_url ? (
          <OptimizedImage
            src={courseData.thumbnail_url} 
            alt={courseData.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        <div className="absolute top-2 right-2">
          <Badge variant={isFree ? "outline" : "default"}>
            {isFree ? "Free" : "Premium"}
          </Badge>
        </div>
      </div>
      
      <CardContent className="p-4 space-y-4">
        <div>
          <h3 className="font-semibold text-lg line-clamp-2 mb-2">{courseData.title}</h3>
          
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            {courseData.instructor_name && (
              <div className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                <span className="line-clamp-1">{courseData.instructor_name}</span>
              </div>
            )}
            {courseData.lesson_count !== undefined && (
              <div className="flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" />
                <span>{courseData.lesson_count} lessons</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {courseData.difficulty && (
            <Badge variant="outline" className={getDifficultyColor(courseData.difficulty)}>
              <GraduationCap className="h-3 w-3 mr-1" />
              {courseData.difficulty}
            </Badge>
          )}
          {courseData.category && (
            <Badge variant="outline">
              <Tag className="h-3 w-3 mr-1" />
              {courseData.category}
            </Badge>
          )}
          {getExpiryBadge()}
        </div>

        {progressInfo && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{progressInfo.progress_percentage.toFixed(0)}%</span>
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </div>
            </div>
            <Progress value={progressInfo.progress_percentage} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {progressInfo.completed_lessons} of {progressInfo.total_lessons} lessons completed
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleContinueLearning}
            variant="hero"
            className="flex-1 gap-2"
            disabled={!firstLessonSlug}
          >
            <Play className="h-4 w-4" />
            Continue Learning
          </Button>
          <Button
            onClick={() => onViewDetails(course)}
            variant="outline"
            size="icon"
            title="View Details"
          >
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
