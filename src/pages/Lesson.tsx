import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLearningStreak } from "@/hooks/useLearningStreak";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { LessonVideoPlayer } from "@/components/lesson/LessonVideoPlayer";
import { CollapsibleCurriculum } from "@/components/lesson/CollapsibleCurriculum";
import { LessonNavigation } from "@/components/lesson/LessonNavigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { checkUserRole } from "@/lib/lessonAccess";
import { Lock, AlertCircle, Star, PlayCircle, FileText } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Lesson {
  id: string;
  slug: string;
  title: string;
  description: string;
  youtube_url: string;
  vimeo_url?: string;
  video_platform?: 'youtube' | 'vimeo';
  is_locked: boolean;
  is_published: boolean;
  is_private: boolean;
  course_id: string;
  order_index: number;
  lesson_type: "video" | "text" | "quiz" | "homework";
  text_content?: string;
  section_id: string;
  section?: {
    id: string;
    title: string;
    order_index: number;
  };
  duration_minutes?: number;
}

interface Course {
  id: string;
  slug: string;
  title: string;
  is_free: boolean;
  instructor_name?: string;
}

export const Lesson = () => {
  const { courseSlug, lessonSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { trackActivity } = useLearningStreak();
  const isMobile = useIsMobile();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [allLessons, setAllLessons] = useState<Lesson[]>([]);
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([]);
  const [curriculumOpen, setCurriculumOpen] = useState(false);
  const [accessDeniedReason, setAccessDeniedReason] = useState<'private' | 'premium' | null>(null);

  const fetchLessonData = async () => {
    // Check if user is admin
    const userRole = await checkUserRole(user?.id);
    // First get the course by slug
    const { data: courseData, error: courseError } = await supabase
      .from("courses")
      .select("id, slug, title, is_free, instructor_name, is_published, created_by")
      .eq("slug", courseSlug)
      .single();

    if (courseError || !courseData) {
      console.error("Error fetching course:", courseError);
      setLoading(false);
      return;
    }

    // Check if user can access this course
    const isCreator = courseData.created_by === user?.id;
    if (!courseData.is_published && userRole !== 'admin' && !isCreator) {
      console.error("Course is not published");
      setLoading(false);
      navigate("/courses");
      return;
    }

    setCourse(courseData);

    // Build lesson query - admins can see all lessons, non-admins only public published ones
    let lessonQuery = supabase
      .from("lessons")
      .select(`
        *,
        section:lesson_sections(id, title, order_index)
      `)
      .eq("slug", lessonSlug)
      .eq("course_id", courseData.id);

    // Non-admins can only see published, non-private lessons
    if (userRole !== 'admin') {
      lessonQuery = lessonQuery
        .eq("is_published", true)
        .eq("is_private", false);
    }

    const { data: lessonData, error: lessonError } = await lessonQuery.single();

    if (lessonError || !lessonData) {
      console.error("Error fetching lesson:", lessonError);
      setLoading(false);
      return;
    }

    setLesson(lessonData as Lesson);

    // Check if lesson is private and user is not admin
    if (lessonData.is_private && userRole !== 'admin') {
      setAccessDeniedReason('private');
      setCanAccess(false);
      setLoading(false);
      return;
    }

    // Fetch all lessons for navigation
    let allLessonsQuery = supabase
      .from("lessons")
      .select(`
        *,
        section:lesson_sections(id, title, order_index)
      `)
      .eq("course_id", courseData.id);

    // Non-admins can only see published, non-private lessons
    if (userRole !== 'admin') {
      allLessonsQuery = allLessonsQuery
        .eq("is_published", true)
        .eq("is_private", false);
    }

    const { data: allLessonsData } = await allLessonsQuery.order("order_index");

    if (allLessonsData) {
      setAllLessons(allLessonsData as Lesson[]);
    }

    // Fetch user progress if logged in
    if (user && allLessonsData) {
      const { data: progressData } = await supabase
        .from("user_lesson_progress")
        .select("lesson_id")
        .eq("user_id", user.id)
        .eq("completed", true);

      if (progressData) {
        // Only include completed lessons that are in the accessible lessons list
        const accessibleLessonIds = new Set(allLessonsData.map(l => l.id));
        const filteredCompletedIds = progressData
          .map(p => p.lesson_id)
          .filter(id => accessibleLessonIds.has(id));
        setCompletedLessonIds(filteredCompletedIds);
      }
    }

    // Check access and enrollment
    let hasAccess = false;
    let userIsEnrolled = false;

    if (user) {
      const { data: enrollmentData } = await supabase
        .from("enrollments")
        .select("status")
        .eq("user_id", user.id)
        .eq("course_id", courseData.id)
        .eq("status", "approved")
        .single();

      userIsEnrolled = !!enrollmentData;
    }

    // User can access if: lesson is not locked, course is free, or user is enrolled
    if (!lessonData.is_locked || courseData.is_free || userIsEnrolled) {
      hasAccess = true;
    }

    setIsEnrolled(userIsEnrolled);
    setCanAccess(hasAccess);
    setLoading(false);
  };

  useEffect(() => {
    if (courseSlug && lessonSlug) {
      fetchLessonData();
      // Track activity when viewing lesson
      if (user) {
        trackActivity();
      }
    }
  }, [courseSlug, lessonSlug, user]);

  // Auto-scroll to active lesson
  useEffect(() => {
    if (lesson && !isMobile) {
      setTimeout(() => {
        const activeLesson = document.querySelector('[data-active="true"]');
        activeLesson?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 300);
    }
  }, [lesson?.id, isMobile]);

  const handleLessonClick = (slug: string) => {
    if (!course) return;
    navigate(`/course/${course.slug}/lesson/${slug}`);
  };

  const handleAccessDenied = () => {
    if (!user) {
      navigate("/auth");
    } else if (course) {
      navigate(`/course/${course.slug}`);
    }
  };

  const handleNavigateLesson = (direction: 'prev' | 'next') => {
    if (!lesson || !course) return;
    
    const currentIndex = allLessons.findIndex(l => l.id === lesson.id);
    const targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    
    if (targetIndex >= 0 && targetIndex < allLessons.length) {
      navigate(`/course/${course.slug}/lesson/${allLessons[targetIndex].slug}`);
    }
  };

  const getPreviousLesson = () => {
    if (!lesson) return null;
    const currentIndex = allLessons.findIndex(l => l.id === lesson.id);
    return currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  };

  const getNextLesson = () => {
    if (!lesson) return null;
    const currentIndex = allLessons.findIndex(l => l.id === lesson.id);
    return currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;
  };

  const previousLesson = getPreviousLesson();
  const nextLesson = getNextLesson();
  const currentLessonIndex = allLessons.findIndex(l => l.id === lesson?.id);

  const handleCompletionToggle = async (completed: boolean) => {
    // Optimistic UI update - update state immediately
    const previousCompletedIds = [...completedLessonIds];
    
    if (completed) {
      setCompletedLessonIds([...completedLessonIds, lesson!.id]);
    } else {
      setCompletedLessonIds(completedLessonIds.filter((id) => id !== lesson!.id));
    }

    try {
      // Persist to database in background
      if (completed) {
        // Track learning activity for streak
        await trackActivity();
      }
      // The actual database update happens in the MarkAsCompleteButton component
    } catch (error) {
      // Revert optimistic update on error
      setCompletedLessonIds(previousCompletedIds);
      console.error("Failed to update completion status:", error);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if user is typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (previousLesson) handleNavigateLesson('prev');
      }
      if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (nextLesson) handleNavigateLesson('next');
      }
      if (e.key === 'm' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (lesson) {
          handleCompletionToggle(!completedLessonIds.includes(lesson.id));
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [previousLesson, nextLesson, lesson, completedLessonIds]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-primary">Loading lesson...</div>
      </div>
    );
  }

  if (!lesson || !course) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          {accessDeniedReason === 'private' ? (
            <>
              <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
                <Lock className="w-8 h-8 text-destructive" />
              </div>
              <h2 className="text-2xl font-bold mb-3">Private Lesson</h2>
              <p className="text-muted-foreground mb-6">
                This lesson is private and only accessible to administrators. 
                If you believe you should have access, please contact support.
              </p>
            </>
          ) : (
            <>
              <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted">
                <AlertCircle className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-bold mb-3">Lesson Not Found</h2>
              <p className="text-muted-foreground mb-6">
                The lesson you're looking for doesn't exist or is no longer available.
              </p>
            </>
          )}
          <Button variant="default" onClick={() => navigate("/courses")}>
            Browse Courses
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navbar 
        onMobileLessonMenuToggle={isMobile ? () => setCurriculumOpen(!curriculumOpen) : undefined}
      />
      
      {/* Mobile: Sidebar Sheet */}
      {isMobile && (
        <Sheet open={curriculumOpen} onOpenChange={setCurriculumOpen}>
          <SheetContent side="left" className="w-80 p-0">
            <div className="h-full pt-4">
              <div className="px-4 mb-4">
                <h2 className="text-lg font-bold text-foreground">{course.title}</h2>
                <p className="text-xs text-muted-foreground mt-1">Course Curriculum</p>
              </div>
              <div className="h-[calc(100%-4rem)] overflow-hidden">
                <div className="border border-border/30 rounded-lg overflow-hidden h-full flex flex-col bg-card/30 mx-4">
                  {/* Progress Header */}
                  <div className="p-4 space-y-3 border-b border-border/30 bg-card/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">Your Progress</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {completedLessonIds.length} of {allLessons.length} completed
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-primary">
                          {Math.round((completedLessonIds.length / allLessons.length) * 100)}%
                        </div>
                      </div>
                    </div>
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/30">
                      <div 
                        className="h-full transition-all duration-500 ease-out bg-gradient-to-r from-primary via-primary to-primary/80 shadow-sm"
                        style={{ width: `${(completedLessonIds.length / allLessons.length) * 100}%` }} 
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto p-2 space-y-4">
                    {Object.entries(
                      allLessons.reduce((acc, lesson) => {
                        const sectionTitle = lesson.section?.title || "Uncategorized";
                        if (!acc[sectionTitle]) acc[sectionTitle] = [];
                        acc[sectionTitle].push(lesson);
                        return acc;
                      }, {} as Record<string, typeof allLessons>)
                    ).map(([sectionTitle, sectionLessons]) => (
                      <div key={sectionTitle} className="space-y-1">
                        <div className="flex items-center gap-2 px-2 py-2.5 bg-muted/30 rounded-md border border-border/20">
                          <div className="h-1 w-1 rounded-full bg-primary/60" />
                          <span className="text-xs uppercase tracking-wider text-foreground/90 font-bold flex-1">
                            {sectionTitle}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground/70 bg-background/50 px-1.5 py-0.5 rounded">
                            {sectionLessons.length}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {sectionLessons.map((lessonItem) => {
                            const getIcon = () => {
                              if (lessonItem.is_locked && isEnrolled) return <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />;
                              if (lessonItem.is_locked && !isEnrolled) return <Lock className="h-3.5 w-3.5 text-red-500" />;
                              if (completedLessonIds.includes(lessonItem.id)) return <span className="h-3.5 w-3.5 text-green-500">✓</span>;
                              if (lessonItem.lesson_type === 'text') return <FileText className="h-3.5 w-3.5" />;
                              return <PlayCircle className="h-3.5 w-3.5" />;
                            };

                            return (
                              <button
                                key={lessonItem.id}
                                onClick={() => {
                                  handleLessonClick(lessonItem.slug);
                                  setCurriculumOpen(false);
                                }}
                                data-active={lessonItem.id === lesson.id}
                                className={cn(
                                  "w-full text-left p-3 rounded-md transition-all duration-200",
                                  "flex items-center gap-2.5 group relative min-h-[48px]",
                                  lessonItem.id === lesson.id && [
                                    "bg-primary/10 border-l-[3px] border-primary pl-2.5",
                                    "shadow-sm"
                                  ],
                                  lessonItem.id !== lesson.id && "hover:bg-muted/50 hover:scale-[1.01]"
                                )}
                              >
                                {/* Icon */}
                                <div className={cn(
                                  "flex-shrink-0",
                                  lessonItem.id === lesson.id && "text-primary",
                                  lessonItem.id !== lesson.id && "text-muted-foreground group-hover:text-foreground"
                                )}>
                                  {getIcon()}
                                </div>
                                <span className={cn(
                                  "text-sm font-mono font-bold flex-shrink-0 w-8",
                                  lessonItem.id === lesson.id ? "text-primary" : "text-muted-foreground/80"
                                )}>
                                  {String(lessonItem.order_index + 1).padStart(2, '0')}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className={cn(
                                    "text-sm font-medium line-clamp-1 leading-snug",
                                    lessonItem.id === lesson.id && "text-primary font-semibold",
                                    lessonItem.id !== lesson.id && "text-foreground"
                                  )}>
                                    {lessonItem.title}
                                  </p>
                                  {lessonItem.duration_minutes && (
                                    <p className="text-xs text-muted-foreground/70 mt-1">
                                      {lessonItem.duration_minutes} min
                                    </p>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      <div className="flex min-h-screen bg-background pt-14">
        {/* Left: Collapsible Sidebar - Desktop Only */}
        {!isMobile && (
          <aside className="border-r border-border/30 bg-card/20">
            <CollapsibleCurriculum
              courseTitle={course.title}
              lessons={allLessons}
              currentLessonId={lesson.id}
              courseSlug={course.slug}
              completedLessonIds={completedLessonIds}
              onLessonClick={handleLessonClick}
              isEnrolled={isEnrolled}
            />
          </aside>
        )}

        {/* Right: Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {/* Video Player & Content */}
            <LessonVideoPlayer
              canAccess={canAccess}
              youtubeUrl={lesson.youtube_url || ""}
              vimeoUrl={lesson.vimeo_url}
              videoPlatform={lesson.video_platform || 'youtube'}
              title={lesson.title}
              description={lesson.description || ""}
              instructorName={course.instructor_name || "Instructor"}
              durationMinutes={lesson.duration_minutes}
              onAccessDenied={handleAccessDenied}
              courseSlug={course.slug}
              courseTitle={course.title}
              lessonNumber={currentLessonIndex + 1}
              totalLessons={allLessons.length}
              lessonType={lesson.lesson_type as "video" | "text" | "quiz" | "homework"}
              textContent={lesson.text_content}
              isCompleted={completedLessonIds.includes(lesson.id)}
              isLocked={lesson.is_locked}
              isPublished={lesson.is_published}
              isPrivate={lesson.is_private}
              lessonId={lesson.id}
              userId={user?.id}
              onCompletionToggle={handleCompletionToggle}
              onPrevious={() => handleNavigateLesson('prev')}
              onNext={() => handleNavigateLesson('next')}
              hasPrevious={!!previousLesson}
              hasNext={!!nextLesson}
              previousTitle={previousLesson?.title}
              nextTitle={nextLesson?.title}
            />
          </div>
        </main>
      </div>
    </>
  );
};

export default Lesson;