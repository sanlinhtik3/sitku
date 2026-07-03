import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Subtitles, Sparkles, Loader2 } from "lucide-react";
import { useBackgroundJobs } from "@/contexts/BackgroundJobsContext";
import { Progress } from "@/components/ui/progress";

interface EasySRTWidgetProps {
  userId: string;
  onClick: () => void;
  delay?: number;
  completedCount?: number;
  isLoading?: boolean;
}

export const EasySRTWidget = memo(({ userId, onClick, delay = 0, completedCount = 0, isLoading = false }: EasySRTWidgetProps) => {
  const { activeJobs, hasActiveJobs } = useBackgroundJobs();
  const latestActiveJob = activeJobs[0];

  return (
    <div
      className="h-full animate-fade-in transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
      style={{ animationDelay: `${delay * 1000}ms`, animationFillMode: "backwards" }}
    >
      <Card
        className="cursor-pointer transition-all duration-300 border-border/30 bg-card/30 backdrop-blur-xl hover:border-primary/20 hover:shadow-[0_0_30px_hsl(var(--primary)/0.08)] group h-full overflow-hidden relative rounded-2xl"
        onClick={onClick}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.03] via-transparent to-orange-500/[0.03] opacity-0 group-hover:opacity-100 transition-opacity" />
        
        {hasActiveJobs && (
          <div className="absolute top-2 right-2">
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 animate-pulse">
              <Loader2 className="h-2.5 w-2.5 animate-spin text-amber-500" />
              <span className="text-[9px] font-medium text-amber-500">{activeJobs.length}</span>
            </div>
          </div>
        )}
        
        <CardContent className="p-2.5 sm:p-4 relative">
          <div className="flex flex-col items-center text-center gap-1.5 sm:gap-3">
            <div className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20 transition-transform group-hover:scale-110 shrink-0 relative">
              <Subtitles className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
              <div className={`absolute -top-1 -right-1 ${hasActiveJobs ? 'animate-pulse' : ''}`}>
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              </div>
            </div>
            <div className="w-full">
              <p className="text-[11px] sm:text-xs font-medium text-muted-foreground">Easy SRT</p>
              {hasActiveJobs && latestActiveJob ? (
                <div className="mt-1">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <span className="text-xs font-bold text-amber-500">{latestActiveJob.progress}%</span>
                  </div>
                  <Progress value={latestActiveJob.progress} className="h-1" />
                  <p className="text-[9px] text-muted-foreground/80 mt-1 truncate">{latestActiveJob.stepMessage}</p>
                </div>
              ) : (
                <>
                  <p className="text-lg sm:text-xl font-bold mt-0.5 bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                    {isLoading ? "..." : completedCount}
                  </p>
                  <p className="hidden sm:block text-[10px] text-muted-foreground/80 mt-0.5">ဘာသာပြန်ပြီးပါပြီ</p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

EasySRTWidget.displayName = "EasySRTWidget";
