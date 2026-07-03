import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CheckCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface LessonNavigationProps {
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  previousTitle?: string;
  nextTitle?: string;
  className?: string;
  // Mark as complete props
  lessonId: string;
  userId: string | undefined;
  isCompleted: boolean;
  isLocked: boolean;
  isPublished: boolean;
  isPrivate: boolean;
  onCompletionToggle: (completed: boolean) => void;
}

export const LessonNavigation = ({
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  previousTitle,
  nextTitle,
  className,
  lessonId,
  userId,
  isCompleted,
  isLocked,
  isPublished,
  isPrivate,
  onCompletionToggle,
}: LessonNavigationProps) => {
  return (
    <div className={cn(
      "flex items-center justify-between gap-3 py-4",
      className
    )}>
      {/* Previous Button - Icon Only */}
      <Button 
        variant="outline" 
        size="icon"
        onClick={onPrevious}
        disabled={!hasPrevious}
        className="h-12 w-12 rounded-full group flex-shrink-0"
        title={previousTitle ? `Previous: ${previousTitle}` : "Previous lesson"}
      >
        <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
      </Button>
      
      {/* Mark as Complete Button - Center */}
      <MarkAsCompleteButton
        lessonId={lessonId}
        userId={userId}
        isCompleted={isCompleted}
        isLocked={isLocked}
        isPublished={isPublished}
        isPrivate={isPrivate}
        onToggle={onCompletionToggle}
      />
      
      {/* Next Button - Icon Only */}
      <Button 
        variant="default" 
        size="icon"
        onClick={onNext}
        disabled={!hasNext}
        className="h-12 w-12 rounded-full group flex-shrink-0"
        title={nextTitle ? `Next: ${nextTitle}` : "Next lesson"}
      >
        <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
      </Button>
    </div>
  );
};

// Extracted Mark as Complete Button component
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MarkAsCompleteButtonProps {
  lessonId: string;
  userId: string | undefined;
  isCompleted: boolean;
  isLocked: boolean;
  isPublished: boolean;
  isPrivate: boolean;
  onToggle: (completed: boolean) => void;
}

const MarkAsCompleteButton = ({
  lessonId,
  userId,
  isCompleted,
  isLocked,
  isPublished,
  isPrivate,
  onToggle,
}: MarkAsCompleteButtonProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleToggleComplete = async () => {
    if (!userId) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to track your progress",
        variant: "destructive",
      });
      return;
    }

    if (isLocked) {
      toast({
        title: "Lesson Locked",
        description: "Please enroll in this course to mark lessons as complete",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Backend validation: check lesson status and user role
      const { data: lessonData } = await supabase
        .from("lessons")
        .select("is_locked, is_published, is_private")
        .eq("id", lessonId)
        .single();

      if (lessonData?.is_locked) {
        toast({
          title: "Lesson Locked",
          description: "This lesson must be unlocked before marking as complete",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Check if lesson is published and not private
      if (!lessonData?.is_published || lessonData?.is_private) {
        // Check if user is admin
        const { data: userRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .single();

        const isAdmin = userRole?.role === 'admin';

        if (!isAdmin) {
          toast({
            title: "Cannot Mark as Complete",
            description: !lessonData?.is_published 
              ? "This lesson is not yet published"
              : "This lesson is private and only accessible to administrators",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }
      }

      const { data: existingProgress } = await supabase
        .from("user_lesson_progress")
        .select("*")
        .eq("user_id", userId)
        .eq("lesson_id", lessonId)
        .maybeSingle();

      if (existingProgress) {
        const { error } = await supabase
          .from("user_lesson_progress")
          .update({
            completed: !isCompleted,
            completed_at: !isCompleted ? new Date().toISOString() : null,
          })
          .eq("id", existingProgress.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_lesson_progress")
          .insert({
            user_id: userId,
            lesson_id: lessonId,
            completed: true,
            completed_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      onToggle(!isCompleted);
      toast({
        title: !isCompleted ? "Lesson Completed!" : "Marked as Incomplete",
        description: !isCompleted
          ? "Great job! Keep up the momentum."
          : "Progress updated",
      });
    } catch (error) {
      console.error("Error toggling lesson completion:", error);
      toast({
        title: "Error",
        description: "Failed to update progress. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleToggleComplete}
      disabled={isLoading || isLocked}
      size="lg"
      variant={isCompleted ? "outline" : "default"}
      className={cn(
        "gap-2 min-h-[48px] px-6 font-semibold transition-all",
        isCompleted && "bg-green-500/10 border-green-500/30 text-green-600 hover:bg-green-500/20 hover:border-green-500/50 dark:text-green-400",
        isLocked && "opacity-50 cursor-not-allowed"
      )}
      title={isLocked ? "Enroll in this course to track progress" : undefined}
    >
      {isCompleted ? (
        <>
          <CheckCircle className="h-5 w-5" />
          <span className="hidden sm:inline">Completed</span>
        </>
      ) : (
        <>
          <Circle className="h-5 w-5" />
          <span className="hidden sm:inline">{isLocked ? "Locked" : "Mark as Complete"}</span>
        </>
      )}
    </Button>
  );
};
