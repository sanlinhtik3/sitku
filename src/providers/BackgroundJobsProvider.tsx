import { ReactNode, useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { BackgroundJobsContext, BackgroundJob } from "@/contexts/BackgroundJobsContext";

interface BackgroundJobsProviderProps {
  children: ReactNode;
}

export function BackgroundJobsProvider({ children }: BackgroundJobsProviderProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const dialogHandlerRef = useRef<((jobId: string) => void) | null>(null);
  const notifiedJobsRef = useRef<Set<string>>(new Set());
  const previousProgressRef = useRef<Map<string, number>>(new Map());

  // Fetch all active/recent jobs for this user
  const { data: jobs = [] } = useQuery({
    queryKey: ["background-srt-jobs", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("srt_translations")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["pending", "processing", "extracting", "transcribing", "translating", "generating", "completed", "failed"])
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Subscribe to realtime updates only when there are active jobs
  const hasActiveJobs = jobs.some((job: any) => !["completed", "failed"].includes(job.status));
  
  useEffect(() => {
    if (!user?.id || !hasActiveJobs) return;

    const channel = supabase
      .channel(`user-srt-jobs-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "srt_translations",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["background-srt-jobs", user.id] });
          queryClient.invalidateQueries({ queryKey: ["srt-stats", user.id] });
          
          const newData = payload.new as any;
          if (newData) {
            const jobId = newData.id;
            const progress = newData.progress_percent || 0;
            const prevProgress = previousProgressRef.current.get(jobId) || 0;
            
            // Show progress toast at milestones
            if (newData.status === "processing" || newData.status === "transcribing" || newData.status === "translating") {
              const milestones = [25, 50, 75];
              for (const milestone of milestones) {
                if (prevProgress < milestone && progress >= milestone) {
                  toast.info(`${milestone}% ပြီးပါပြီ`, {
                    description: newData.step_message || `ဘာသာပြန်နေသည်...`,
                    duration: 3000,
                  });
                }
              }
            }
            
            // Show completion toast (only once)
            if (newData.status === "completed" && !notifiedJobsRef.current.has(jobId)) {
              notifiedJobsRef.current.add(jobId);
              toast.success("ဘာသာပြန်ခြင်း အောင်မြင်ပါပြီ! ✓", {
                description: "SRT ဖိုင်ကို ကြည့်ရှုနိုင်ပါပြီ",
                duration: 5000,
                action: {
                  label: "ကြည့်ရှုမည်",
                  onClick: () => dialogHandlerRef.current?.(jobId),
                },
              });
            }
            
            // Show error toast (only once)
            if (newData.status === "failed" && !notifiedJobsRef.current.has(jobId)) {
              notifiedJobsRef.current.add(jobId);
              toast.error("ဘာသာပြန်ခြင်း မအောင်မြင်ပါ", {
                description: newData.error_message || "အမှားတစ်ခုဖြစ်ပွားခဲ့သည်",
                duration: 5000,
              });
            }
            
            previousProgressRef.current.set(jobId, progress);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Transform DB data to BackgroundJob format
  const transformedJobs: BackgroundJob[] = jobs.map((job: any) => ({
    id: job.id,
    videoName: job.video_url?.split("/").pop() || "video",
    status: job.status,
    progress: job.progress_percent || 0,
    stepMessage: job.step_message || getDefaultStepMessage(job.status),
    currentStep: job.current_step || job.status,
    startedAt: new Date(job.created_at),
    errorMessage: job.error_message,
  }));

  const activeJobs = transformedJobs.filter(
    (job) => !["completed", "failed"].includes(job.status)
  );
  
  const completedJobs = transformedJobs.filter(
    (job) => job.status === "completed"
  );

  const openJobDialog = useCallback((jobId: string) => {
    dialogHandlerRef.current?.(jobId);
  }, []);

  const setDialogHandler = useCallback((handler: (jobId: string) => void) => {
    dialogHandlerRef.current = handler;
  }, []);

  return (
    <BackgroundJobsContext.Provider
      value={{
        activeJobs,
        completedJobs,
        hasActiveJobs: activeJobs.length > 0,
        activeCount: activeJobs.length,
        openJobDialog,
        setDialogHandler,
      }}
    >
      {children}
    </BackgroundJobsContext.Provider>
  );
}

function getDefaultStepMessage(status: string): string {
  switch (status) {
    case "pending": return "စောင့်ဆိုင်းနေသည်...";
    case "processing": return "လုပ်ဆောင်နေသည်...";
    case "extracting": return "ဗီဒီယို ဆွဲထုတ်နေသည်...";
    case "transcribing": return "AI စာသားပြောင်းနေသည်...";
    case "translating": return "ဘာသာပြန်နေသည်...";
    case "generating": return "SRT ဖိုင်ထုတ်နေသည်...";
    case "completed": return "ပြီးဆုံးပါပြီ! ✓";
    case "failed": return "အမှားရှိပါသည်";
    default: return "လုပ်ဆောင်နေသည်...";
  }
}
