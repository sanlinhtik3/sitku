import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LessonListItem } from "./LessonListItem";

interface Lesson {
  id: string;
  slug: string;
  title: string;
  lesson_type: "video" | "quiz" | "homework" | "text";
  is_locked: boolean;
  is_published: boolean;
  is_private: boolean;
  section_id: string;
  section?: {
    id: string;
    title: string;
    order_index: number;
  };
  order_index: number;
  duration_minutes?: number;
}

interface LessonCurriculumProps {
  courseTitle: string;
  lessons: Lesson[];
  currentLessonId: string;
  courseSlug: string;
  completedLessonIds: string[];
  onLessonClick: (slug: string) => void;
  isEnrolled?: boolean;
}

export const LessonCurriculum = ({
  courseTitle,
  lessons,
  currentLessonId,
  courseSlug,
  completedLessonIds,
  onLessonClick,
  isEnrolled = false,
}: LessonCurriculumProps) => {
  // Group lessons by section
  const lessonsBySection = lessons.reduce((acc, lesson) => {
    const sectionTitle = lesson.section?.title || "Uncategorized";
    if (!acc[sectionTitle]) {
      acc[sectionTitle] = [];
    }
    acc[sectionTitle].push(lesson);
    return acc;
  }, {} as Record<string, Lesson[]>);

  // Calculate progress
  const totalLessons = lessons.length;
  const completedCount = completedLessonIds.length;
  const progressPercentage = totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0;

  return (
    <div className="border border-border/30 rounded-lg overflow-hidden h-full flex flex-col bg-card/30">
      {/* Progress Header */}
      <div className="p-4 space-y-3 border-b border-border/30 bg-card/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Course Progress</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completedCount} of {totalLessons} lessons completed
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              {Math.round(progressPercentage)}%
            </div>
          </div>
        </div>
        <Progress value={progressPercentage} className="h-2" />
      </div>

      {/* Scrollable Lesson List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {Object.entries(lessonsBySection).map(([sectionTitle, sectionLessons]) => (
            <div key={sectionTitle} className="space-y-1">
              {/* Section Header */}
              <div className="flex items-center gap-2 px-2 py-2.5 bg-muted/30 rounded-md border border-border/20">
                <div className="h-1 w-1 rounded-full bg-primary/60" />
                <span className="text-xs uppercase tracking-wider text-foreground/90 font-bold flex-1">
                  {sectionTitle}
                </span>
                <span className="text-xs font-mono text-muted-foreground/70 bg-background/50 px-1.5 py-0.5 rounded">
                  {sectionLessons.length}
                </span>
              </div>
              
              {/* Lessons */}
              <div className="space-y-0.5">
                {sectionLessons.map((lesson) => (
                  <LessonListItem
                    key={lesson.id}
                    title={lesson.title}
                    lessonType={lesson.lesson_type}
                    isLocked={lesson.is_locked}
                    isCompleted={completedLessonIds.includes(lesson.id)}
                    isActive={lesson.id === currentLessonId}
                    durationMinutes={lesson.duration_minutes}
                    orderIndex={lesson.order_index}
                    onClick={() => onLessonClick(lesson.slug)}
                    hasAccess={isEnrolled}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
