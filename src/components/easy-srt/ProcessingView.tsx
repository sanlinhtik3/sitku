import { useEffect, useState, useMemo } from "react";
import { motion } from "motion/react";
import { Check, Loader2, AlertCircle, Subtitles, AudioLines, Languages, FileText, Clock, HardDrive } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatFileSize } from "./utils";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ProcessingViewProps {
  jobId: string;
  onComplete?: (translation: any) => void;
  onError?: (error: string) => void;
}

type StepConfig = {
  id: string;
  label: string;
  labelMm: string;
  icon: React.ReactNode;
  minPercent: number;
  maxPercent: number;
};

const STEPS_CONFIG: StepConfig[] = [
  { id: "extracting", label: "Extracting Audio", labelMm: "အသံထုတ်ယူနေသည်", icon: <AudioLines className="h-5 w-5" />, minPercent: 0, maxPercent: 20 },
  { id: "transcribing", label: "Transcribing", labelMm: "စာသားပြောင်းနေသည်", icon: <FileText className="h-5 w-5" />, minPercent: 20, maxPercent: 55 },
  { id: "translating", label: "Translating to Burmese", labelMm: "မြန်မာဘာသာပြန်နေသည်", icon: <Languages className="h-5 w-5" />, minPercent: 55, maxPercent: 90 },
  { id: "generating", label: "Generating SRT", labelMm: "SRT ဖိုင်ဖန်တီးနေသည်", icon: <Subtitles className="h-5 w-5" />, minPercent: 90, maxPercent: 100 },
];

export function ProcessingView({ jobId, onComplete, onError }: ProcessingViewProps) {
  const [startTime] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hasNotified, setHasNotified] = useState(false);

  // Poll for translation status - 1 second for faster updates
  const { data: translation } = useQuery({
    queryKey: ["srt-translation", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("srt_translations")
        .select("*")
        .eq("id", jobId)
        .single();

      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => {
      // Stop polling when completed or failed
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 1000;
    },
    enabled: !!jobId,
  });

  const currentStatus = translation?.status || "extracting";

  // Update elapsed time every second - stop when completed/failed
  useEffect(() => {
    if (currentStatus === "completed" || currentStatus === "failed") {
      return; // Don't update timer anymore
    }

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, currentStatus]);

  // Notify parent when completed or failed - only once
  useEffect(() => {
    if (hasNotified) return;

    if (currentStatus === "completed" && onComplete && translation) {
      setHasNotified(true);
      onComplete(translation);
    } else if (currentStatus === "failed" && onError) {
      setHasNotified(true);
      onError(translation?.error_message || "အမှားရှိပါသည်");
    }
  }, [currentStatus, translation, onComplete, onError, hasNotified]);

  // Use database progress directly
  const progressPercent = translation?.progress_percent || 0;

  // Calculate estimated remaining time
  const estimatedRemaining = useMemo(() => {
    if (progressPercent < 5 || elapsedSeconds < 3) return "တွက်ချက်နေသည်...";
    if (progressPercent >= 100) return "ပြီးပါပြီ!";
    
    const rate = progressPercent / elapsedSeconds;
    const remainingPercent = 100 - progressPercent;
    const remainingSeconds = remainingPercent / rate;
    
    if (remainingSeconds < 60) {
      return `~${Math.ceil(remainingSeconds)} စက္ကန့်`;
    }
    return `~${Math.ceil(remainingSeconds / 60)} မိနစ်`;
  }, [progressPercent, elapsedSeconds]);

  // Determine step status based on progress percent
  const getStepStatus = (step: StepConfig): "pending" | "active" | "completed" | "failed" => {
    if (currentStatus === "failed") {
      // Find which step failed based on progress
      const failedStepIndex = STEPS_CONFIG.findIndex(
        s => progressPercent >= s.minPercent && progressPercent < s.maxPercent
      );
      const stepIndex = STEPS_CONFIG.findIndex(s => s.id === step.id);
      
      if (stepIndex < failedStepIndex) return "completed";
      if (stepIndex === failedStepIndex || (failedStepIndex === -1 && stepIndex === 0)) return "failed";
      return "pending";
    }

    if (currentStatus === "completed") return "completed";

    if (progressPercent >= step.maxPercent) return "completed";
    if (progressPercent >= step.minPercent) return "active";
    return "pending";
  };

  // Format elapsed time
  const formatElapsed = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      <motion.div
        className="relative bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 sm:p-8"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        {/* Decorative Glow */}
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl animate-pulse" />
        </div>

        <div className="relative z-10">
          {/* Header */}
          <div className="text-center mb-8">
            <motion.div
              className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 mb-4"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Subtitles className="h-8 w-8 text-amber-500" />
            </motion.div>
            <h3 className="text-xl font-bold text-foreground mb-2">
              {currentStatus === "completed" 
                ? "ပြီးဆုံးပါပြီ! ✓" 
                : currentStatus === "failed"
                ? "အမှားရှိပါသည်"
                : "ဘာသာပြန်နေပါသည်..."}
            </h3>
            <p className="text-sm text-muted-foreground">
              {translation?.video_name || "Video"}
            </p>
            {translation?.file_size_bytes && (
              <div className="flex items-center justify-center gap-1.5 mt-1 text-xs text-muted-foreground">
                <HardDrive className="h-3 w-3" />
                <span>{formatFileSize(translation.file_size_bytes)}</span>
              </div>
            )}
          </div>

          {/* Progress Bar with Real Percentage */}
          <div className="mb-6">
            <div className="h-3 bg-muted/50 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
            <div className="flex justify-between items-center mt-2">
              <p className="text-sm font-medium text-foreground">
                {progressPercent}% ပြီးပါပြီ
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{formatElapsed(elapsedSeconds)}</span>
              </div>
            </div>
          </div>

          {/* Estimated Time */}
          <div className="mb-6 p-3 rounded-xl bg-muted/30 border border-border/30">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">ကျန်ချိန်:</span>
              <span className="text-sm font-medium text-foreground">{estimatedRemaining}</span>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            {STEPS_CONFIG.map((step, index) => {
              const status = getStepStatus(step);
              
              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    "flex items-center gap-4 p-3 rounded-xl transition-colors",
                    status === "active" && "bg-amber-500/10",
                    status === "completed" && "bg-green-500/10",
                    status === "failed" && "bg-destructive/10"
                  )}
                >
                  {/* Status Icon */}
                  <div
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      status === "pending" && "bg-muted/50 text-muted-foreground",
                      status === "active" && "bg-amber-500/20 text-amber-500",
                      status === "completed" && "bg-green-500/20 text-green-500",
                      status === "failed" && "bg-destructive/20 text-destructive"
                    )}
                  >
                    {status === "completed" ? (
                      <Check className="h-5 w-5" />
                    ) : status === "active" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : status === "failed" ? (
                      <AlertCircle className="h-5 w-5" />
                    ) : (
                      step.icon
                    )}
                  </div>

                  {/* Label */}
                  <div className="flex-1">
                    <p
                      className={cn(
                        "font-medium transition-colors",
                        status === "pending" && "text-muted-foreground",
                        status === "active" && "text-amber-500",
                        status === "completed" && "text-green-500",
                        status === "failed" && "text-destructive"
                      )}
                    >
                      {step.labelMm}
                    </p>
                    <p className="text-xs text-muted-foreground">{step.label}</p>
                  </div>

                  {/* Status Badge with current progress for active step */}
                  {status === "active" && (
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-500 font-medium">
                      {progressPercent}%
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Error Message */}
          {translation?.status === "failed" && translation?.error_message && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">အမှားရှိပါသည်</p>
                  <p className="text-sm text-destructive/80 mt-1">
                    {translation.error_message}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
