import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, Unlock, Edit, Trash2, ChevronUp, ChevronDown, EyeOff, FileText, Star, Eye } from "lucide-react";

interface Lesson {
  id: string;
  title: string;
  description?: string;
  youtube_url?: string;
  vimeo_url?: string;
  video_platform?: 'youtube' | 'vimeo';
  is_locked: boolean;
  is_private?: boolean;
  is_published?: boolean;
  duration_minutes?: number;
  order_index: number;
  course_id: string;
  section_id?: string;
}

interface LessonCardProps {
  lesson: Lesson;
  onEdit: (lesson: Lesson) => void;
  onDelete: (lessonId: string) => void;
  onMoveUp: (lessonId: string) => void;
  onMoveDown: (lessonId: string) => void;
  isFirst: boolean;
  isLast: boolean;
}

export function LessonCard({
  lesson,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: LessonCardProps) {
  return (
    <Card className="p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {lesson.is_locked ? (
          <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <Unlock className="h-4 w-4 text-primary flex-shrink-0" />
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-base">{lesson.title}</h4>
            {lesson.is_private ? (
              <EyeOff className="w-4 h-4 text-destructive" />
            ) : (
              <Eye className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!lesson.is_published && (
              <Badge variant="outline" className="gap-1">
                <FileText className="w-3 h-3 text-yellow-600" />
                Draft
              </Badge>
            )}
            {lesson.is_private && (
              <Badge variant="destructive" className="gap-1">
                <Lock className="w-3 h-3" />
                Private
              </Badge>
            )}
            {lesson.is_locked && (
              <Badge variant="secondary" className="gap-1">
                <Star className="w-3 h-3" />
                Premium
              </Badge>
            )}
            {!lesson.is_locked && lesson.is_published && !lesson.is_private && (
              <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
                Public & Free
              </Badge>
            )}
            {lesson.duration_minutes && (
              <span className="text-sm text-muted-foreground">
                {lesson.duration_minutes} min
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onMoveUp(lesson.id)}
          disabled={isFirst}
          title="Move up"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onMoveDown(lesson.id)}
          disabled={isLast}
          title="Move down"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => onEdit(lesson)}
          title="Edit lesson"
        >
          <Edit className="h-4 w-4" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => onDelete(lesson.id)}
          title="Delete lesson"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
