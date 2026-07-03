import { Skeleton } from "@/components/ui/skeleton";
import { GlassmorphicCard } from "@/components/ui/FuturisticElements";
import { LoadingState } from "@/components/ui/LoadingState";

export const LearnPageSkeleton = () => {
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

      <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl bg-muted/30" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-40 bg-muted/30" />
            <Skeleton className="h-4 w-72 bg-muted/30" />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-9 w-20 rounded-full bg-muted/30" />
          ))}
        </div>

        {/* Search */}
        <GlassmorphicCard className="p-3 sm:p-4">
          <Skeleton className="h-10 w-full bg-muted/30" />
        </GlassmorphicCard>

        {/* Posts Grid */}
        <LoadingState variant="post" count={9} columns={3} />
      </div>
    </div>
  );
};
