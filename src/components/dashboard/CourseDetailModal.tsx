import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Play, Crown, Calendar, Tag, BookOpen, User, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CourseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: {
    id: string;
    course_id: string;
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
  };
  daysRemaining: number | null;
}

export const CourseDetailModal = ({
  isOpen,
  onClose,
  course,
  daysRemaining,
}: CourseDetailModalProps) => {
  const navigate = useNavigate();
  const [firstLessonSlug, setFirstLessonSlug] = useState<string | null>(null);
  const isPremium = !course.courses.is_free;

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
    
    if (isOpen) {
      fetchFirstLesson();
    }
  }, [course.course_id, isOpen]);

  const handleContinueLearning = () => {
    if (!firstLessonSlug) {
      toast.error("No lessons available for this course yet");
      return;
    }
    navigate(`/course/${course.courses.slug}/lesson/${firstLessonSlug}`);
    onClose();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Course Details</DialogTitle>
          <DialogDescription>
            View your enrollment information and continue learning
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Course Thumbnail */}
          <div className="relative h-64 w-full rounded-lg overflow-hidden">
            <img
              src={course.courses.thumbnail_url || "https://images.unsplash.com/photo-1639322537228-f710d846310a?w=500"}
              alt={course.courses.title}
              className="w-full h-full object-cover"
            />
            {isPremium && (
              <div className="absolute top-4 right-4 bg-gradient-to-r from-amber-500 to-yellow-500 text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-lg">
                <Crown className="h-5 w-5" />
                <span className="text-sm font-semibold">Premium Access</span>
              </div>
            )}
          </div>

          {/* Course Title & Info */}
          <div className="space-y-3">
            <h3 className="text-xl font-bold">{course.courses.title}</h3>
            
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              {course.courses.instructor_name && (
                <div className="flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  <span>{course.courses.instructor_name}</span>
                </div>
              )}
              {course.courses.lesson_count !== undefined && (
                <div className="flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4" />
                  <span>{course.courses.lesson_count} lessons</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {course.courses.difficulty && (
                <Badge variant="outline" className="gap-1">
                  <GraduationCap className="h-3 w-3" />
                  {course.courses.difficulty}
                </Badge>
              )}
              {course.courses.category && (
                <Badge variant="outline" className="gap-1">
                  <Tag className="h-3 w-3" />
                  {course.courses.category}
                </Badge>
              )}
            </div>
          </div>

          <Separator />

          {/* Description */}
          <div>
            <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Description</h4>
            <p className="text-sm leading-relaxed">{course.courses.description}</p>
          </div>

          <Separator />

          {/* Access Information */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Access Information</h4>
            
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Access Type</span>
                <Badge className={isPremium ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-white border-0" : ""}>
                  {isPremium ? (
                    <>
                      <Crown className="h-3 w-3 mr-1" />
                      Premium
                    </>
                  ) : (
                    "Free"
                  )}
                </Badge>
              </div>

              {isPremium && (
                <>
                  {course.is_expired ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge variant="destructive">Expired</Badge>
                    </div>
                  ) : daysRemaining !== null ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Days Remaining</span>
                        <span className={`text-sm font-semibold ${
                          daysRemaining <= 3 ? 'text-destructive' : 
                          daysRemaining <= 7 ? 'text-yellow-600 dark:text-yellow-400' : 
                          'text-green-600 dark:text-green-400'
                        }`}>
                          {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Expires On
                        </span>
                        <span className="text-sm font-medium">
                          {formatDate(course.access_expires_at)}
                        </span>
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Close
            </Button>
            <Button 
              onClick={handleContinueLearning} 
              variant="hero"
              className="flex-1 gap-2"
              disabled={!firstLessonSlug}
            >
              <Play className="h-4 w-4" />
              Continue Learning
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
