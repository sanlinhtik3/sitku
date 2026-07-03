import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import {
  FileVideo,
  HardDrive,
  Clock,
  Calendar,
  Languages,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  FileText,
  Film,
  Cpu,
  DollarSign,
  Timer,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatFileSize, getStatusInfo, formatTokens, formatCost, formatProcessingTime } from "./utils";
import { cn } from "@/lib/utils";

interface Translation {
  id: string;
  video_name: string;
  video_url: string;
  status: string;
  created_at: string;
  file_size_bytes?: number | null;
  source_language?: string | null;
  srt_content?: string | null;
  progress_percent?: number | null;
  // AI Usage tracking
  ai_tokens_input?: number | null;
  ai_tokens_output?: number | null;
  ai_tokens_total?: number | null;
  ai_cost_estimate?: number | null;
  ai_model_used?: string | null;
  processing_time_ms?: number | null;
}

interface VideoDetailDialogProps {
  translation: Translation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownloadSRT?: () => void;
  onViewBurnIn?: () => void;
}

const SOURCE_LANGUAGES: Record<string, { name: string; nameNative: string }> = {
  en: { name: "English", nameNative: "English" },
  th: { name: "Thai", nameNative: "ไทย" },
  ja: { name: "Japanese", nameNative: "日本語" },
  ko: { name: "Korean", nameNative: "한국어" },
  zh: { name: "Chinese", nameNative: "中文" },
  auto: { name: "Auto Detect", nameNative: "အလိုအလျောက်" },
};

export function VideoDetailDialog({
  translation,
  open,
  onOpenChange,
  onDownloadSRT,
  onViewBurnIn,
}: VideoDetailDialogProps) {
  if (!translation) return null;

  const statusInfo = getStatusInfo(translation.status);
  const sourceLang = translation.source_language
    ? SOURCE_LANGUAGES[translation.source_language] || { name: translation.source_language, nameNative: "" }
    : { name: "Unknown", nameNative: "" };

  const hasAIStats = translation.ai_tokens_total && translation.ai_tokens_total > 0;

  const getStatusIcon = () => {
    switch (translation.status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />;
    }
  };

  const handleDownloadSRT = () => {
    if (!translation.srt_content) return;

    const blob = new Blob([translation.srt_content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${translation.video_name.replace(/\.[^/.]+$/, "")}_burmese.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    if (onDownloadSRT) onDownloadSRT();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <FileVideo className="h-5 w-5 text-amber-500" />
            </div>
            Video Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Video Name */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl bg-card/50 border border-border/50"
          >
            <p className="text-sm text-muted-foreground mb-1">File Name</p>
            <p className="font-medium text-foreground truncate">{translation.video_name}</p>
          </motion.div>

          {/* Stats Grid */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="grid grid-cols-2 gap-3"
          >
            {/* File Size */}
            <div className="p-3 rounded-xl bg-card/50 border border-border/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <HardDrive className="h-4 w-4" />
                <span className="text-xs">File Size</span>
              </div>
              <p className="font-medium text-foreground">
                {formatFileSize(translation.file_size_bytes)}
              </p>
            </div>

            {/* Source Language */}
            <div className="p-3 rounded-xl bg-card/50 border border-border/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Languages className="h-4 w-4" />
                <span className="text-xs">Source</span>
              </div>
              <p className="font-medium text-foreground">
                {sourceLang.name}
                {sourceLang.nameNative && (
                  <span className="text-xs text-muted-foreground ml-1">
                    ({sourceLang.nameNative})
                  </span>
                )}
              </p>
            </div>

            {/* Created Date */}
            <div className="p-3 rounded-xl bg-card/50 border border-border/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Calendar className="h-4 w-4" />
                <span className="text-xs">Created</span>
              </div>
              <p className="font-medium text-foreground text-sm">
                {formatDistanceToNow(new Date(translation.created_at), { addSuffix: true })}
              </p>
            </div>

            {/* Status */}
            <div className="p-3 rounded-xl bg-card/50 border border-border/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs">Status</span>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon()}
                <p
                  className={cn(
                    "font-medium",
                    translation.status === "completed" && "text-green-500",
                    translation.status === "failed" && "text-destructive",
                    translation.status !== "completed" && translation.status !== "failed" && "text-amber-500"
                  )}
                >
                  {statusInfo.labelMm}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Progress (if processing) */}
          {translation.status !== "completed" && translation.status !== "failed" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Progress</span>
                <span className="text-sm font-medium text-amber-500">
                  {translation.progress_percent || 0}%
                </span>
              </div>
              <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                  style={{ width: `${translation.progress_percent || 0}%` }}
                />
              </div>
            </motion.div>
          )}

          {/* AI Usage Statistics */}
          {hasAIStats && (
            <>
              <Separator className="bg-border/50" />
              
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2 text-foreground">
                  <Cpu className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-medium">AI Usage Statistics</h4>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Input Tokens */}
                  <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-1.5 text-blue-400 mb-0.5">
                      <Zap className="h-3 w-3" />
                      <span className="text-xs">Input Tokens</span>
                    </div>
                    <p className="font-medium text-foreground text-sm">
                      {formatTokens(translation.ai_tokens_input)}
                    </p>
                  </div>

                  {/* Output Tokens */}
                  <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <div className="flex items-center gap-1.5 text-purple-400 mb-0.5">
                      <Zap className="h-3 w-3" />
                      <span className="text-xs">Output Tokens</span>
                    </div>
                    <p className="font-medium text-foreground text-sm">
                      {formatTokens(translation.ai_tokens_output)}
                    </p>
                  </div>

                  {/* Total Tokens */}
                  <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    <div className="flex items-center gap-1.5 text-cyan-400 mb-0.5">
                      <Cpu className="h-3 w-3" />
                      <span className="text-xs">Total Tokens</span>
                    </div>
                    <p className="font-medium text-foreground text-sm">
                      {formatTokens(translation.ai_tokens_total)}
                    </p>
                  </div>

                  {/* Estimated Cost */}
                  <div className="p-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-1.5 text-green-400 mb-0.5">
                      <DollarSign className="h-3 w-3" />
                      <span className="text-xs">Est. Cost</span>
                    </div>
                    <p className="font-medium text-foreground text-sm">
                      {formatCost(translation.ai_cost_estimate)}
                    </p>
                  </div>
                </div>

                {/* Model & Processing Time */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="h-3 w-3" />
                    <span>{translation.ai_model_used || "Unknown model"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Timer className="h-3 w-3" />
                    <span>{formatProcessingTime(translation.processing_time_ms)}</span>
                  </div>
                </div>
              </motion.div>
            </>
          )}

          <Separator className="bg-border/50" />

          {/* Download Actions */}
          {translation.status === "completed" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="space-y-2"
            >
              <p className="text-sm font-medium text-muted-foreground">Downloads</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadSRT}
                  disabled={!translation.srt_content}
                  className="flex-1 gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Download SRT
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    if (onViewBurnIn) onViewBurnIn();
                  }}
                  disabled={!translation.srt_content}
                  className="flex-1 gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
                >
                  <Film className="h-4 w-4" />
                  Video + Subtitles
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}