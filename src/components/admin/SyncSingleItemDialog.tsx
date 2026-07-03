import { memo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Brain, Loader2, CheckCircle, XCircle, Zap, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface SyncSingleItemDialogProps {
  contentId: string | null;
  contentTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (success: boolean, contentId: string) => void;
}

type SyncStatus = "idle" | "processing" | "synced" | "failed";

export const SyncSingleItemDialog = memo(({
  contentId,
  contentTitle,
  open,
  onOpenChange,
  onComplete
}: SyncSingleItemDialogProps) => {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Refs to prevent duplicate calls and store stable callback
  const syncStartedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  // Keep callback ref updated
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Main sync effect - stable dependencies only
  useEffect(() => {
    if (!open || !contentId) {
      // Reset when dialog closes
      syncStartedRef.current = false;
      setStatus("idle");
      return;
    }

    // Prevent duplicate API calls
    if (syncStartedRef.current) {
      return;
    }
    syncStartedRef.current = true;

    // Reset state
    setStatus("processing");
    setError(null);
    setStartTime(Date.now());
    setElapsedTime(0);

    // Subscribe to real-time updates for this specific content
    const channel = supabase
      .channel(`sync-single-${contentId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ai_generated_content",
          filter: `id=eq.${contentId}`,
        },
        (payload) => {
          const newStatus = payload.new.embedding_status as SyncStatus;
          const newError = payload.new.embedding_error as string | null;

          if (newStatus === "synced") {
            setStatus("synced");
            setError(null);
            onCompleteRef.current?.(true, contentId!);
          } else if (newStatus === "failed") {
            setStatus("failed");
            setError(newError || "Unknown error");
            onCompleteRef.current?.(false, contentId!);
          } else if (newStatus === "processing") {
            setStatus("processing");
          }
        }
      )
      .subscribe();

    // Start the sync
    const startSync = async () => {
      try {
        const { data, error: invokeError } = await supabase.functions.invoke(
          "sync-kb-embeddings",
          {
            body: { action: "sync_single", content_id: contentId },
          }
        );

        if (invokeError) {
          setStatus("failed");
          setError(invokeError.message);
          onCompleteRef.current?.(false, contentId!);
          return;
        }

        // Check if the response indicates failure
        if (data?.errors > 0) {
          setStatus("failed");
          setError(data.errorMessage || "Sync failed");
          onCompleteRef.current?.(false, contentId!);
        } else if (data?.processed > 0) {
          // Success may come from real-time or here
          setStatus("synced");
          onCompleteRef.current?.(true, contentId!);
        }
      } catch (err: any) {
        setStatus("failed");
        setError(err.message || "Unknown error");
        onCompleteRef.current?.(false, contentId!);
      }
    };

    startSync();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, contentId]); // Removed onComplete from dependencies

  // Timer effect
  useEffect(() => {
    if (!startTime || status !== "processing") return;

    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime, status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const cleanTitle = (title: string): string => {
    if (!title) return "Untitled";
    return title
      .replace(/^_+|_+$/g, "")
      .replace(/__+/g, " - ")
      .replace(/_/g, " ")
      .trim() || "Untitled";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-purple-500/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {status === "synced" ? (
              <CheckCircle className="h-5 w-5 text-green-400" />
            ) : status === "failed" ? (
              <XCircle className="h-5 w-5 text-red-400" />
            ) : (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Brain className="h-5 w-5 text-purple-400" />
              </motion.div>
            )}
            {status === "synced"
              ? "Sync Complete"
              : status === "failed"
              ? "Sync Failed"
              : "Syncing Content"}
          </DialogTitle>
          <DialogDescription>
            {status === "synced"
              ? "Embeddings generated successfully"
              : status === "failed"
              ? "Failed to generate embeddings"
              : "Generating vector embeddings for semantic search"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Content being synced */}
          <div className="p-3 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">
                {cleanTitle(contentTitle)}
              </span>
            </div>
          </div>

          {/* Status Display */}
          <AnimatePresence mode="wait">
            {status === "processing" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20"
              >
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-400">Processing...</p>
                    <p className="text-xs text-muted-foreground">
                      Generating embeddings • {formatTime(elapsedTime)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-blue-500/10 text-blue-400 border-blue-500/30"
                  >
                    <Zap className="h-3 w-3 mr-1" />
                    Live
                  </Badge>
                </div>

                {/* Animated progress bar */}
                <div className="mt-3 h-1.5 bg-blue-500/20 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{
                      duration: 15,
                      ease: "easeInOut",
                    }}
                  />
                </div>
              </motion.div>
            )}

            {status === "synced" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-2" />
                </motion.div>
                <p className="font-medium text-green-400">
                  Embeddings Created Successfully!
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Completed in {formatTime(elapsedTime)}
                </p>
              </motion.div>
            )}

            {status === "failed" && (
              <motion.div
                key="failed"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-lg bg-red-500/10 border border-red-500/20"
              >
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-400">Sync Failed</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {error || "Unknown error occurred"}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            {status === "failed" && (
              <Button
                variant="outline"
                onClick={() => {
                  // Reset and retry
                  setStatus("idle");
                  setError(null);
                  // Will trigger useEffect again
                  if (contentId) {
                    onOpenChange(false);
                    setTimeout(() => onOpenChange(true), 100);
                  }
                }}
                className="gap-2"
              >
                <Loader2 className="h-4 w-4" />
                Retry
              </Button>
            )}
            <Button
              variant={status === "synced" ? "default" : "outline"}
              onClick={() => onOpenChange(false)}
            >
              {status === "synced" ? "Done" : "Close"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

SyncSingleItemDialog.displayName = "SyncSingleItemDialog";
