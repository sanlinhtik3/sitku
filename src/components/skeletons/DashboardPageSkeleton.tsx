import { Skeleton } from "@/components/ui/skeleton";
import { GlassmorphicCard } from "@/components/ui/FuturisticElements";
import { LoadingState } from "@/components/ui/LoadingState";

export const DashboardPageSkeleton = () => {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      {/* Header Section */}
      <div className="mb-6 sm:mb-8 md:mb-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl bg-muted/30" />
              <Skeleton className="h-8 w-48 bg-muted/30" />
            </div>
            <Skeleton className="h-4 w-64 bg-muted/30" />
          </div>
          <Skeleton className="h-10 w-full sm:w-64 rounded-lg bg-muted/30" />
        </div>
      </div>

      {/* Widget Grid */}
      <GlassmorphicCard className="p-4 sm:p-6" glow>
        <LoadingState variant="widget" count={4} columns={4} />
      </GlassmorphicCard>
    </div>
  );
};
