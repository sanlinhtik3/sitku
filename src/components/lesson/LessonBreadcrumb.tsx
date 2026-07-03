import { Link } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface LessonBreadcrumbProps {
  courseSlug: string;
  courseTitle: string;
  lessonTitle: string;
  lessonNumber?: number;
  totalLessons?: number;
}

export const LessonBreadcrumb = ({
  courseSlug,
  courseTitle,
  lessonNumber,
  totalLessons
}: LessonBreadcrumbProps) => {
  const isMobile = useIsMobile();

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground/60 mb-4">
      {!isMobile && (
        <>
          <Link to="/courses" className="hover:text-muted-foreground transition-colors">
            Home
          </Link>
          <span className="text-muted-foreground/40">›</span>
        </>
      )}
      <Link 
        to={`/course/${courseSlug}`} 
        className={cn(
          "hover:text-muted-foreground transition-colors truncate",
          isMobile ? "max-w-[200px]" : "max-w-none"
        )}
      >
        {courseTitle}
      </Link>
      <span className="text-muted-foreground/40">›</span>
      <span className="font-semibold text-muted-foreground whitespace-nowrap">
        {isMobile ? `${lessonNumber}/${totalLessons}` : `Lesson ${lessonNumber} of ${totalLessons}`}
      </span>
    </div>
  );
};