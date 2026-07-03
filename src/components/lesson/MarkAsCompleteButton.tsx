import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface MarkAsCompleteButtonProps {
  lessonId: string;
  userId: string | undefined;
  isCompleted: boolean;
  isLocked: boolean;
  onToggle: (completed: boolean) => void;
}

export const MarkAsCompleteButton = ({
  lessonId,
  userId,
  isCompleted,
  isLocked,
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
      // Backend validation: check if lesson is locked
      const { data: lessonData } = await supabase
        .from("lessons")
        .select("is_locked")
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
        "w-full sm:w-auto gap-2 min-h-[48px] px-6 font-semibold transition-all",
        isCompleted && "bg-green-500/10 border-green-500/30 text-green-600 hover:bg-green-500/20 hover:border-green-500/50 dark:text-green-400",
        isLocked && "opacity-50 cursor-not-allowed"
      )}
      title={isLocked ? "Enroll in this course to track progress" : undefined}
    >
      {isCompleted ? (
        <>
          <CheckCircle className="h-5 w-5" />
          Completed
        </>
      ) : (
        <>
          <Circle className="h-5 w-5" />
          {isLocked ? "Locked" : "Mark as Complete"}
        </>
      )}
    </Button>
  );
};
