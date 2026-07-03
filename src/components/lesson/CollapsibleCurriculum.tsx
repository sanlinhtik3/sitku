import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LessonCurriculum } from "./LessonCurriculum";
import { cn } from "@/lib/utils";

interface CollapsibleCurriculumProps {
  courseTitle: string;
  lessons: any[];
  currentLessonId: string;
  courseSlug: string;
  completedLessonIds: string[];
  onLessonClick: (lessonSlug: string) => void;
  isEnrolled?: boolean;
}

const STORAGE_KEY = "lesson-sidebar-collapsed";

export const CollapsibleCurriculum = (props: CollapsibleCurriculumProps) => {
  const { lessons, completedLessonIds } = props;
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : false;
  });

  const totalLessons = lessons.length;
  const completedCount = completedLessonIds.length;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div
      className={cn(
        "relative h-full transition-all duration-300 ease-in-out",
        isCollapsed ? "w-14" : "w-80 lg:w-96"
      )}
    >
      {/* Toggle Button */}
      <Button
        onClick={toggleCollapse}
        variant="ghost"
        size="icon"
        className="absolute -right-3 top-8 z-20 h-7 w-7 rounded-full border border-border/50 bg-background shadow-lg hover:bg-muted hover:border-border transition-all"
        title={isCollapsed ? "Expand lessons" : "Collapse lessons"}
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </Button>

      {/* Curriculum Content */}
      <div className={cn("h-full", isCollapsed && "overflow-hidden")}>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-3 pt-8 px-2">
            <div className="text-center space-y-2">
              <div className="text-xs font-bold text-muted-foreground/70">
                {completedCount}/{totalLessons}
              </div>
              <div 
                className="text-xs text-muted-foreground/60 rotate-0"
                style={{ writingMode: 'vertical-rl' }}
              >
                Lessons
              </div>
            </div>
          </div>
        ) : (
          <LessonCurriculum {...props} />
        )}
      </div>
    </div>
  );
};
