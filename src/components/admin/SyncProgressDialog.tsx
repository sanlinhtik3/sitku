import { memo, useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Brain, Loader2, CheckCircle, XCircle, Clock, Zap, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface SyncProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

interface SyncStatus {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
  currentItem?: string;
}

export const SyncProgressDialog = memo(({
  open,
  onOpenChange,
  onComplete
}: SyncProgressDialogProps) => {
  const [status, setStatus] = useState<SyncStatus>({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0,
    currentItem: undefined
  });
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      // Fetch queue status counts
      const { data: queueData, error: queueError } = await supabase
        .from("kb_embedding_sync_queue")
        .select("status, content_id");

      if (queueError) throw queueError;

      // Count by status
      const counts = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0
      };

      let processingContentId: string | null = null;

      queueData?.forEach((item: { status: string; content_id: string }) => {
        const s = item.status as keyof typeof counts;
        if (counts[s] !== undefined) {
          counts[s]++;
        }
        if (item.status === 'processing') {
          processingContentId = item.content_id;
        }
      });

      const total = counts.pending + counts.processing + counts.completed + counts.failed;

      // Get current processing item title
      let currentItem: string | undefined;
      if (processingContentId) {
        const { data: contentData } = await supabase
          .from("ai_generated_content")
          .select("title")
          .eq("id", processingContentId)
          .single();
        currentItem = contentData?.title || undefined;
      }

      setStatus({
        ...counts,
        total,
        currentItem
      });

      // Check if complete (no pending or processing)
      if (total > 0 && counts.pending === 0 && counts.processing === 0) {
        setIsComplete(true);
        onComplete?.();
      }

    } catch (err: any) {
      console.error("Error fetching sync progress:", err);
      setError(err.message);
    }
  }, [onComplete]);

  // Polling effect
  useEffect(() => {
    if (!open) return;

    // Initial fetch
    fetchProgress();

    // Poll every 2 seconds
    const interval = setInterval(fetchProgress, 2000);

    return () => clearInterval(interval);
  }, [open, fetchProgress]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setIsComplete(false);
      setError(null);
    }
  }, [open]);

  // Trigger process_queue periodically to process items
  useEffect(() => {
    if (!open || isComplete) return;

    const processQueue = async () => {
      try {
        await supabase.functions.invoke("sync-kb-embeddings", {
          body: { action: "process_queue" }
        });
      } catch (err) {
        console.error("Error processing queue:", err);
      }
    };

    // Process every 3 seconds
    const processInterval = setInterval(processQueue, 3000);
    // Initial process
    processQueue();

    return () => clearInterval(processInterval);
  }, [open, isComplete]);

  const progressPercent = status.total > 0 
    ? Math.round(((status.completed + status.failed) / status.total) * 100)
    : 0;

  const cleanTitle = (title: string | undefined): string => {
    if (!title) return "Processing...";
    return title
      .replace(/^_+|_+$/g, "")
      .replace(/__+/g, " - ")
      .replace(/_/g, " ")
      .trim() || "Processing...";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-purple-500/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isComplete ? (
              <CheckCircle className="h-5 w-5 text-green-400" />
            ) : (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Brain className="h-5 w-5 text-purple-400" />
              </motion.div>
            )}
            {isComplete ? "Sync Complete" : "Syncing Embeddings"}
          </DialogTitle>
          <DialogDescription>
            {isComplete 
              ? "All knowledge entries have been processed"
              : "Generating vector embeddings for semantic search"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">
                {status.completed + status.failed} / {status.total} Items
              </span>
            </div>
            <Progress value={progressPercent} className="h-3" />
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-2 gap-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-400" />
                <span className="text-xs text-muted-foreground">Pending</span>
              </div>
              <p className="text-xl font-bold text-amber-400 mt-1">{status.pending}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20"
            >
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-400" />
                <span className="text-xs text-muted-foreground">Processing</span>
              </div>
              <p className="text-xl font-bold text-blue-400 mt-1">{status.processing}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="p-3 rounded-lg bg-green-500/10 border border-green-500/20"
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span className="text-xs text-muted-foreground">Completed</span>
              </div>
              <p className="text-xl font-bold text-green-400 mt-1">{status.completed}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="p-3 rounded-lg bg-red-500/10 border border-red-500/20"
            >
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-400" />
                <span className="text-xs text-muted-foreground">Failed</span>
              </div>
              <p className="text-xl font-bold text-red-400 mt-1">{status.failed}</p>
            </motion.div>
          </div>

          {/* Current Item */}
          {!isComplete && status.currentItem && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-3 rounded-lg bg-muted/30 border border-border"
            >
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Currently:</span>
                <span className="font-medium truncate">{cleanTitle(status.currentItem)}</span>
              </div>
            </motion.div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              Error: {error}
            </div>
          )}

          {/* Complete Message */}
          {isComplete && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center"
            >
              <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
              <p className="font-medium text-green-400">Sync Complete!</p>
              <p className="text-xs text-muted-foreground mt-1">
                {status.completed} items processed successfully
                {status.failed > 0 && `, ${status.failed} failed`}
              </p>
            </motion.div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant={isComplete ? "default" : "outline"}
              onClick={() => onOpenChange(false)}
            >
              {isComplete ? "Done" : "Close"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

SyncProgressDialog.displayName = "SyncProgressDialog";
