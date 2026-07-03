import { Skeleton } from "@/components/ui/skeleton";
import { GlassmorphicCard } from "@/components/ui/FuturisticElements";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type LoadingVariant = "card" | "list" | "grid" | "full-page" | "widget" | "post" | "course";

interface LoadingStateProps {
  variant?: LoadingVariant;
  count?: number;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
  message?: string;
}

// Card skeleton - for dashboard widgets and generic cards
const CardSkeleton = () => (
  <GlassmorphicCard className="p-4 space-y-3">
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-lg bg-muted/30" />
      <div className="space-y-1.5 flex-1">
        <Skeleton className="h-4 w-24 bg-muted/30" />
        <Skeleton className="h-3 w-16 bg-muted/30" />
      </div>
    </div>
    <Skeleton className="h-8 w-20 bg-muted/30" />
  </GlassmorphicCard>
);

// Widget skeleton - for dashboard widgets
const WidgetSkeleton = () => (
  <GlassmorphicCard className="p-4 sm:p-5 space-y-3">
    <div className="flex items-start justify-between">
      <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-muted/30" />
      <Skeleton className="h-6 w-6 rounded-full bg-muted/30" />
    </div>
    <div className="space-y-1.5">
      <Skeleton className="h-5 w-24 bg-muted/30" />
      <Skeleton className="h-3 w-32 bg-muted/30" />
    </div>
    <Skeleton className="h-8 w-16 bg-muted/30" />
  </GlassmorphicCard>
);

// List item skeleton
const ListSkeleton = () => (
  <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg bg-muted/10">
    <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-muted/30" />
    <div className="flex-1 space-y-1.5">
      <Skeleton className="h-4 w-3/4 bg-muted/30" />
      <Skeleton className="h-3 w-1/2 bg-muted/30" />
    </div>
    <Skeleton className="h-8 w-16 sm:w-20 rounded-md bg-muted/30" />
  </div>
);

// Course card skeleton
const CourseSkeleton = () => (
  <GlassmorphicCard className="overflow-hidden">
    <Skeleton className="h-40 w-full bg-muted/30" />
    <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
      <Skeleton className="h-5 w-20 rounded-full bg-muted/30" />
      <Skeleton className="h-5 w-3/4 bg-muted/30" />
      <Skeleton className="h-4 w-24 bg-muted/30" />
      <Skeleton className="h-9 w-full bg-muted/30 rounded-md" />
    </div>
  </GlassmorphicCard>
);

// Post card skeleton
const PostSkeleton = () => (
  <GlassmorphicCard className="p-3 sm:p-4 space-y-2 sm:space-y-3">
    <Skeleton className="aspect-video w-full rounded-lg sm:rounded-xl bg-muted/30" />
    <Skeleton className="h-4 sm:h-5 w-16 sm:w-20 rounded-full bg-muted/30" />
    <Skeleton className="h-5 sm:h-6 w-3/4 bg-muted/30" />
    <Skeleton className="h-3 sm:h-4 w-full bg-muted/30" />
    <div className="flex items-center gap-2 sm:gap-3 pt-1 sm:pt-2">
      <Skeleton className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-muted/30" />
      <div className="space-y-1">
        <Skeleton className="h-3 sm:h-4 w-20 sm:w-24 bg-muted/30" />
        <Skeleton className="h-2 sm:h-3 w-12 sm:w-16 bg-muted/30" />
      </div>
    </div>
  </GlassmorphicCard>
);

// Full page loading
const FullPageSkeleton = ({ message }: { message?: string }) => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
    <div className="relative">
      <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
      <Loader2 className="h-10 w-10 text-primary animate-spin relative" />
    </div>
    {message && (
      <p className="text-sm text-muted-foreground animate-pulse">{message}</p>
    )}
  </div>
);

const getGridColumns = (columns: 1 | 2 | 3 | 4) => {
  switch (columns) {
    case 1:
      return "grid-cols-1";
    case 2:
      return "grid-cols-1 sm:grid-cols-2";
    case 3:
      return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
    case 4:
      return "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
    default:
      return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  }
};

export const LoadingState = ({
  variant = "card",
  count = 6,
  columns = 3,
  className,
  message,
}: LoadingStateProps) => {
  if (variant === "full-page") {
    return <FullPageSkeleton message={message} />;
  }

  const renderSkeleton = () => {
    switch (variant) {
      case "widget":
        return <WidgetSkeleton />;
      case "list":
        return <ListSkeleton />;
      case "course":
        return <CourseSkeleton />;
      case "post":
        return <PostSkeleton />;
      case "card":
      default:
        return <CardSkeleton />;
    }
  };

  if (variant === "list") {
    return (
      <div className={cn("space-y-3", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i}>{renderSkeleton()}</div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-4 sm:gap-6", getGridColumns(columns), className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>{renderSkeleton()}</div>
      ))}
    </div>
  );
};

// Empty state component for consistency
interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState = ({
  icon,
  title = "No items found",
  description,
  action,
  className,
}: EmptyStateProps) => (
  <div className={cn("text-center py-8 sm:py-12 space-y-3", className)}>
    {icon && (
      <div className="flex justify-center text-muted-foreground/50">
        {icon}
      </div>
    )}
    <h3 className="text-base sm:text-lg font-medium text-muted-foreground">{title}</h3>
    {description && (
      <p className="text-sm text-muted-foreground/70 max-w-sm mx-auto">{description}</p>
    )}
    {action && <div className="pt-2">{action}</div>}
  </div>
);
