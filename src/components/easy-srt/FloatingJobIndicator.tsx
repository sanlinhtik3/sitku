import { memo, useState } from "react";
import { Subtitles, ChevronUp, ChevronDown, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useBackgroundJobs } from "@/contexts/BackgroundJobsContext";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export const FloatingJobIndicator = memo(() => {
  const { activeJobs, hasActiveJobs } = useBackgroundJobs();
  const [isExpanded, setIsExpanded] = useState(false);

  if (!hasActiveJobs) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-6 right-4 z-50 animate-[slideUpFade_0.3s_ease-out]">
      <div className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl shadow-black/20 overflow-hidden min-w-[280px] max-w-[320px]">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between gap-3 p-3 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600">
                <Subtitles className="h-4 w-4 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-500 animate-pulse" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">
                {activeJobs.length} ခု လုပ်ဆောင်နေသည်
              </p>
              <p className="text-xs text-muted-foreground">
                နောက်ကွယ်မှာ အလုပ်လုပ်နေပါသည်
              </p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Expanded job list — CSS transition instead of motion */}
        <div
          className={cn(
            "grid transition-all duration-200 ease-out border-t border-border/50",
            isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 border-t-transparent"
          )}
        >
          <div className="overflow-hidden">
            <div className="max-h-[200px] overflow-y-auto">
              {activeJobs.map((job) => (
                <JobItem key={job.id} job={job} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

interface JobItemProps {
  job: {
    id: string;
    videoName: string;
    status: string;
    progress: number;
    stepMessage: string;
  };
}

const JobItem = memo(({ job }: JobItemProps) => {
  const statusIcon = {
    pending: <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />,
    processing: <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />,
    extracting: <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />,
    transcribing: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />,
    translating: <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-500" />,
    generating: <Loader2 className="h-3.5 w-3.5 animate-spin text-green-500" />,
    completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
    failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  }[job.status] || <Loader2 className="h-3.5 w-3.5 animate-spin" />;

  return (
    <div className="p-3 hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        {statusIcon}
        <span className="text-xs font-medium truncate flex-1">{job.videoName}</span>
        <span className="text-xs font-bold text-amber-500">{job.progress}%</span>
      </div>
      <Progress
        value={job.progress}
        className={cn("h-1.5", job.status === "failed" && "bg-destructive/20")}
      />
      <p className="text-[10px] text-muted-foreground mt-1.5 truncate">{job.stepMessage}</p>
    </div>
  );
});

FloatingJobIndicator.displayName = "FloatingJobIndicator";
JobItem.displayName = "JobItem";
