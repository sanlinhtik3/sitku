import { Skeleton } from "@/components/ui/skeleton";
import { GlassmorphicCard } from "@/components/ui/FuturisticElements";

export const PageSkeleton = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar Skeleton */}
      <div className="border-b border-border/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Skeleton className="h-8 w-32 bg-muted/30" />
          <div className="flex gap-4">
            <Skeleton className="h-10 w-20 bg-muted/30" />
            <Skeleton className="h-10 w-20 bg-muted/30" />
            <Skeleton className="h-10 w-20 bg-muted/30" />
          </div>
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <Skeleton className="h-10 w-10 rounded-xl bg-muted/30" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-64 bg-muted/30" />
              <Skeleton className="h-4 w-48 bg-muted/30" />
            </div>
          </div>
          
          {/* Content Card */}
          <GlassmorphicCard className="p-6 space-y-4">
            <Skeleton className="h-6 w-3/4 bg-muted/30" />
            <Skeleton className="h-4 w-full bg-muted/30" />
            <Skeleton className="h-4 w-full bg-muted/30" />
            <Skeleton className="h-4 w-5/6 bg-muted/30" />
            <div className="pt-4">
              <Skeleton className="h-48 w-full rounded-xl bg-muted/30" />
            </div>
            <Skeleton className="h-4 w-full bg-muted/30" />
            <Skeleton className="h-4 w-4/5 bg-muted/30" />
          </GlassmorphicCard>
        </div>
      </div>
    </div>
  );
};
