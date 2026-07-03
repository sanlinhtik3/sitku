import { Lock, PlayCircle, Clock, User, CheckCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LessonBreadcrumb } from "./LessonBreadcrumb";
import { LessonNavigation } from "./LessonNavigation";
import { InstructorCard } from "./InstructorCard";
import { MarkdownContent } from "./MarkdownContent";
import { VideoSkeleton } from "./VideoSkeleton";
import { TextLessonReader } from "./TextLessonReader";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { extractYouTubeId, extractVimeoId } from "@/lib/videoUtils";

interface LessonVideoPlayerProps {
  canAccess: boolean;
  youtubeUrl: string;
  vimeoUrl?: string;
  videoPlatform?: 'youtube' | 'vimeo';
  title: string;
  description: string;
  instructorName: string;
  durationMinutes?: number;
  onAccessDenied: () => void;
  courseSlug: string;
  courseTitle: string;
  lessonNumber: number;
  totalLessons: number;
  lessonType: "video" | "text" | "quiz" | "homework";
  textContent?: string;
  isCompleted?: boolean;
  isLocked: boolean;
  isPublished: boolean;
  isPrivate: boolean;
  lessonId: string;
  userId: string | undefined;
  onCompletionToggle: (completed: boolean) => void;
  // Navigation props
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  previousTitle?: string;
  nextTitle?: string;
}

export const LessonVideoPlayer = ({
  canAccess,
  youtubeUrl,
  vimeoUrl,
  videoPlatform = 'youtube',
  title,
  description,
  instructorName,
  durationMinutes,
  onAccessDenied,
  courseSlug,
  courseTitle,
  lessonNumber,
  totalLessons,
  lessonType,
  textContent,
  isCompleted,
  isLocked,
  isPublished,
  isPrivate,
  lessonId,
  userId,
  onCompletionToggle,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  previousTitle,
  nextTitle,
}: LessonVideoPlayerProps) => {
  const [videoLoading, setVideoLoading] = useState(true);
  
  const videoId = videoPlatform === 'youtube' 
    ? extractYouTubeId(youtubeUrl || '')
    : extractVimeoId(vimeoUrl || '');
  
  const getLessonTypeBadge = () => {
    switch (lessonType) {
      case "video":
        return <Badge variant="secondary" className="text-xs gap-1"><PlayCircle className="h-3 w-3" />Video</Badge>;
      case "text":
        return <Badge variant="secondary" className="text-xs gap-1"><FileText className="h-3 w-3" />Text</Badge>;
      case "quiz":
        return <Badge variant="secondary" className="text-xs">Quiz</Badge>;
      case "homework":
        return <Badge variant="secondary" className="text-xs">Homework</Badge>;
      default:
        return null;
    }
  };

  // Render text lesson
  if (lessonType === 'text') {
    return (
      <div className="space-y-0">
        {/* Breadcrumb */}
        <LessonBreadcrumb
          courseSlug={courseSlug}
          courseTitle={courseTitle}
          lessonTitle={title}
          lessonNumber={lessonNumber}
          totalLessons={totalLessons}
        />

        {/* Access Check for Text Lessons */}
        {!canAccess ? (
          <div className="flex flex-col items-center justify-center py-16 bg-muted/30 rounded-lg border border-border/50">
            <Lock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">This lesson is locked</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-6 px-4">
              Enroll in this course to access all lessons and materials
            </p>
            <Button variant="default" size="sm" onClick={onAccessDenied}>
              Unlock Lesson
            </Button>
          </div>
        ) : textContent ? (
          <TextLessonReader content={textContent} title={title} className="mt-4" />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 bg-muted/30 rounded-lg border border-border/50">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No content available for this lesson yet.</p>
          </div>
        )}

        {/* Navigation */}
        <LessonNavigation
          onPrevious={onPrevious}
          onNext={onNext}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          previousTitle={previousTitle}
          nextTitle={nextTitle}
          lessonId={lessonId}
          userId={userId}
          isCompleted={!!isCompleted}
          isLocked={isLocked}
          isPublished={isPublished}
          isPrivate={isPrivate}
          onCompletionToggle={onCompletionToggle}
          className="mt-6"
        />

        {/* Lesson Info */}
        <div className="pt-6 space-y-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              {getLessonTypeBadge()}
              {isCompleted && (
                <Badge variant="outline" className="text-xs gap-1 border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-3 w-3" />
                  Completed
                </Badge>
              )}
            </div>
            <h1 className="text-xl md:text-2xl font-bold leading-tight mb-3">{title}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <User className="h-4 w-4" />
                {instructorName}
              </span>
            </div>
          </div>

          {/* Instructor Card */}
          {description && (
            <div className="pt-6 border-t border-border/30">
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70 mb-4">About This Lesson</h2>
                  <MarkdownContent content={description} />
                </div>
                <div className="w-full lg:w-80 flex-shrink-0">
                  <InstructorCard
                    name={instructorName}
                    bio="Expert instructor with years of experience in teaching and course development."
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render video lesson (existing logic)
  return (
    <div className="space-y-0">
      {/* Breadcrumb */}
      <LessonBreadcrumb
        courseSlug={courseSlug}
        courseTitle={courseTitle}
        lessonTitle={title}
        lessonNumber={lessonNumber}
        totalLessons={totalLessons}
      />

      {/* Video Player */}
      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
        {videoLoading && canAccess && videoId && (
          <div className="absolute inset-0 z-10">
            <VideoSkeleton />
          </div>
        )}
        {canAccess && videoId ? (
          videoPlatform === 'youtube' ? (
            <iframe
              className="absolute top-0 left-0 w-full h-full"
              src={`https://www.youtube.com/embed/${videoId}?rel=0`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              onLoad={() => setVideoLoading(false)}
            />
          ) : (
            <iframe
              className="absolute top-0 left-0 w-full h-full"
              src={`https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0&controls=1&playsinline=1&dnt=1&like=0&watchlater=0&share=0`}
              title={title}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              onLoad={() => setVideoLoading(false)}
            />
          )
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm">
            <Lock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">This lesson is locked</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-6 px-4">
              Enroll in this course to access all lessons and materials
            </p>
            <Button variant="default" size="sm" onClick={onAccessDenied}>
              Unlock Lesson
            </Button>
          </div>
        )}
      </div>

      {/* Navigation - Between Video and Lesson Info */}
      <LessonNavigation
        onPrevious={onPrevious}
        onNext={onNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        previousTitle={previousTitle}
        nextTitle={nextTitle}
        lessonId={lessonId}
        userId={userId}
        isCompleted={!!isCompleted}
        isLocked={isLocked}
        isPublished={isPublished}
        isPrivate={isPrivate}
        onCompletionToggle={onCompletionToggle}
        className="mt-4"
      />

      {/* Lesson Info */}
      <div className="pt-2 space-y-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            {getLessonTypeBadge()}
            {isCompleted && (
              <Badge variant="outline" className="text-xs gap-1 border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400">
                <CheckCircle className="h-3 w-3" />
                Completed
              </Badge>
            )}
          </div>
          <h1 className="text-xl md:text-2xl font-bold leading-tight mb-3">{title}</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              {instructorName}
            </span>
            {durationMinutes && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {durationMinutes} min
              </span>
            )}
          </div>
        </div>

        {/* Split Layout: Description + Instructor Card */}
        {description && (
          <div className="pt-6 border-t border-border/30">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left: Description (scrollable) */}
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70 mb-4">About This Lesson</h2>
                <MarkdownContent content={description} />
              </div>
              
              {/* Right: Sticky Instructor Card */}
              <div className="w-full lg:w-80 flex-shrink-0">
                <InstructorCard
                  name={instructorName}
                  bio="Expert instructor with years of experience in teaching and course development."
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
