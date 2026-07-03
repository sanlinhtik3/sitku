import { PlayCircle, HelpCircle, FileText, Lock, CheckCircle, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface LessonListItemProps {
  title: string;
  lessonType: "video" | "quiz" | "homework" | "text";
  isLocked: boolean;
  isCompleted: boolean;
  isActive: boolean;
  durationMinutes?: number;
  onClick: () => void;
  orderIndex?: number;
  hasAccess?: boolean; // true if user is enrolled
}

export const LessonListItem = ({
  title,
  lessonType,
  isLocked,
  isCompleted,
  isActive,
  durationMinutes,
  onClick,
  orderIndex,
  hasAccess = false,
}: LessonListItemProps) => {
  const getIcon = () => {
    // Show premium star for locked lessons that user has access to
    if (isLocked && hasAccess) return <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />;
    // Show lock for locked lessons without access
    if (isLocked && !hasAccess) return <Lock className="h-3.5 w-3.5 text-red-500" />;
    if (isCompleted) return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    
    switch (lessonType) {
      case "video":
        return <PlayCircle className="h-3.5 w-3.5" />;
      case "text":
        return <FileText className="h-3.5 w-3.5" />;
      case "quiz":
        return <HelpCircle className="h-3.5 w-3.5" />;
      case "homework":
        return <FileText className="h-3.5 w-3.5" />;
      default:
        return <PlayCircle className="h-3.5 w-3.5" />;
    }
  };

  return (
    <button
      onClick={onClick}
      data-active={isActive}
      className={cn(
        "w-full text-left p-3 rounded-md transition-all duration-200",
        "flex items-center gap-2.5 group relative min-h-[48px]",
        isActive && [
          "bg-primary/10 border-l-[3px] border-primary pl-2.5",
          "shadow-sm"
        ],
        !isActive && "hover:bg-muted/50 hover:scale-[1.01]"
      )}
    >
      {/* Episode Number */}
      {orderIndex !== undefined && (
        <span className={cn(
          "text-sm font-mono font-bold flex-shrink-0 w-8",
          isActive ? "text-primary" : "text-muted-foreground/80"
        )}>
          {String(orderIndex + 1).padStart(2, '0')}
        </span>
      )}

      {/* Icon */}
      <div className={cn(
        "flex-shrink-0",
        isActive && "text-primary",
        !isActive && !isLocked && "text-muted-foreground group-hover:text-foreground"
      )}>
        {getIcon()}
      </div>
      
      {/* Title & Duration */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium line-clamp-1 leading-snug",
          isActive && "text-primary font-semibold",
          !isActive && "text-foreground"
        )}>
          {title}
        </p>
        {durationMinutes && (
          <p className="text-xs text-muted-foreground/70 mt-1">
            {durationMinutes} min
          </p>
        )}
      </div>

      {/* Completed Check */}
      {isCompleted && !isActive && (
        <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
      )}
    </button>
  );
};
