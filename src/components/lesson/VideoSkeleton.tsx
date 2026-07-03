import { Skeleton } from "@/components/ui/skeleton";

export const VideoSkeleton = () => {
  return (
    <div className="w-full aspect-video bg-muted/30 rounded-lg flex items-center justify-center">
      <div className="text-center space-y-3">
        <Skeleton className="h-16 w-16 rounded-full mx-auto" />
        <Skeleton className="h-3 w-32 mx-auto" />
      </div>
    </div>
  );
};
