import { useState } from "react";
import { motion } from "motion/react";
import { FileVideo, Check, Loader2, AlertCircle, Clock, Trash2, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VideoDetailDialog } from "./VideoDetailDialog";
import { formatFileSize } from "./utils";

interface Translation {
  id: string;
  video_name: string;
  video_url: string;
  status: string;
  created_at: string;
  user_id: string;
  file_size_bytes?: number | null;
  source_language?: string | null;
  srt_content?: string | null;
  progress_percent?: number | null;
}

interface TranslationHistoryProps {
  translations: Translation[];
  isLoading: boolean;
  selectedId?: string;
  onSelect: (translation: Translation) => void;
  userId: string;
}

export function TranslationHistory({
  translations,
  isLoading,
  selectedId,
  onSelect,
  userId,
}: TranslationHistoryProps) {
  const [deleteTarget, setDeleteTarget] = useState<Translation | null>(null);
  const [detailTarget, setDetailTarget] = useState<Translation | null>(null);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (translation: Translation) => {
      // 1. Delete from storage
      if (translation.video_url) {
        const urlParts = translation.video_url.split("/srt-videos/");
        const filePath = urlParts.length > 1 ? decodeURIComponent(urlParts[1]) : "";
        
        if (filePath) {
          const { error: storageError } = await supabase.storage
            .from("srt-videos")
            .remove([filePath]);
          
          if (storageError) {
            console.warn("Storage delete warning:", storageError);
            // Continue even if storage delete fails (file might already be deleted)
          }
        }
      }
      
      // 2. Delete from database
      const { error: dbError } = await supabase
        .from("srt_translations")
        .delete()
        .eq("id", translation.id)
        .eq("user_id", userId);
      
      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["srt-translations", userId] });
      toast.success("ဗီဒီယိုဖျက်ပြီးပါပြီ");
      setDeleteTarget(null);
    },
    onError: (error) => {
      console.error("Delete error:", error);
      toast.error("ဖျက်ရာတွင် အမှားရှိပါသည်");
    },
  });

  const handleDeleteClick = (e: React.MouseEvent, translation: Translation) => {
    e.stopPropagation();
    setDeleteTarget(translation);
  };

  const handleInfoClick = (e: React.MouseEvent, translation: Translation) => {
    e.stopPropagation();
    setDetailTarget(translation);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-3 rounded-xl bg-muted/30">
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (translations.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="p-3 rounded-2xl bg-muted/30 inline-block mb-3">
          <FileVideo className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          ဘာသာပြန်ထားသော ဗီဒီယိုများ မရှိသေးပါ
        </p>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <Check className="h-4 w-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "pending":
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "border-green-500/30 bg-green-500/5";
      case "failed":
        return "border-destructive/30 bg-destructive/5";
      case "pending":
        return "border-border/50";
      default:
        return "border-amber-500/30 bg-amber-500/5";
    }
  };

  return (
    <>
      <div className="p-2 space-y-1">
        {translations.map((translation, index) => (
          <motion.div
            key={translation.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="group relative"
          >
            <button
              onClick={() => onSelect(translation)}
              className={cn(
                "w-full p-2.5 rounded-xl border text-left transition-all",
                "hover:bg-card/80 hover:shadow-sm",
                selectedId === translation.id
                  ? "bg-primary/10 border-primary/30 ring-1 ring-primary/20"
                  : getStatusColor(translation.status)
              )}
            >
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-muted/50 shrink-0">
                  <FileVideo className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 pr-6">
                  <p className="text-sm font-medium text-foreground truncate">
                    {translation.video_name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusIcon(translation.status)}
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(translation.created_at), { addSuffix: true })}
                    </span>
                    {translation.file_size_bytes && (
                      <>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(translation.file_size_bytes)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </button>
            
            {/* Action buttons - visible on hover */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Info button */}
              <button
                onClick={(e) => handleInfoClick(e, translation)}
                className={cn(
                  "p-1.5 rounded-lg transition-all",
                  "hover:bg-primary/10 hover:text-primary",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50"
                )}
                title="အသေးစိတ်ကြည့်ရန်"
              >
                <Info className="h-4 w-4" />
              </button>
              
              {/* Delete button */}
              <button
                onClick={(e) => handleDeleteClick(e, translation)}
                disabled={deleteMutation.isPending}
                className={cn(
                  "p-1.5 rounded-lg transition-all",
                  "hover:bg-destructive/10 hover:text-destructive",
                  "focus:outline-none focus:ring-2 focus:ring-destructive/50",
                  deleteMutation.isPending && "opacity-50 cursor-not-allowed"
                )}
                title="ဖျက်မည်"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-background/95 backdrop-blur-xl border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              ဗီဒီယိုဖျက်မှာ သေချာပါသလား?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              "{deleteTarget?.video_name}" ကို ဖျက်လိုက်ပါက ပြန်ရယူ၍ မရနိုင်ပါ။
              ဗီဒီယိုဖိုင်နှင့် ဘာသာပြန်ထားသော စာသားများ အားလုံး ပျက်သွားပါမည်။
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={deleteMutation.isPending}
              className="border-border/50"
            >
              မဖျက်တော့ပါ
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              ဖျက်မည်
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Video Detail Dialog */}
      <VideoDetailDialog
        translation={detailTarget}
        open={!!detailTarget}
        onOpenChange={(open) => !open && setDetailTarget(null)}
        onViewBurnIn={() => {
          if (detailTarget) {
            onSelect(detailTarget);
          }
        }}
      />
    </>
  );
}
