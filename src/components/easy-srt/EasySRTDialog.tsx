import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, X, Subtitles, Plus, Minimize2, Settings, Key, Wifi, WifiOff, Volume2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { VideoUploader } from "./VideoUploader";
import { ProcessingView } from "./ProcessingView";
import { SRTPreview } from "./SRTPreview";
import { TranslationHistory } from "./TranslationHistory";
import { SRTSettingsDialog } from "./SRTSettingsDialog";
import { TTSPanel } from "./TTSPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useBackgroundJobs } from "@/contexts/BackgroundJobsContext";
import { useSRTSettings } from "@/hooks/useSRTSettings";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";

interface EasySRTDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

type ViewState = "upload" | "processing" | "preview";

export function EasySRTDialog({ open, onOpenChange, userId }: EasySRTDialogProps) {
  const [viewState, setViewState] = useState<ViewState>("upload");
  const [selectedTranslation, setSelectedTranslation] = useState<any>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [showMinimizeHint, setShowMinimizeHint] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const queryClient = useQueryClient();
  const { setDialogHandler } = useBackgroundJobs();
  const { getAIMode } = useSRTSettings();

  // Fetch user's translation history
  const { data: translations, isLoading, refetch } = useQuery({
    queryKey: ["srt-translations", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("srt_translations")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: open && !!userId,
  });

  // Real-time subscription for translation updates - two channels for reliability
  useEffect(() => {
    if (!open || !userId) return;

    // Channel 1: Listen to all user's translations for history updates
    const historyChannel = supabase
      .channel(`srt-history-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "srt_translations",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Invalidate history query
          queryClient.invalidateQueries({ queryKey: ["srt-translations", userId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(historyChannel);
    };
  }, [open, userId, queryClient]);

  // Channel 2: Listen specifically to current job for instant status updates
  useEffect(() => {
    if (!open || !currentJobId) return;

    const jobChannel = supabase
      .channel(`srt-job-${currentJobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "srt_translations",
          filter: `id=eq.${currentJobId}`,
        },
        (payload) => {
          const newData = payload.new as any;
          console.log("Job update received:", newData.status, newData.progress_percent);
          
          // Invalidate specific translation query for ProcessingView
          queryClient.invalidateQueries({ queryKey: ["srt-translation", currentJobId] });
          queryClient.invalidateQueries({ queryKey: ["srt-translations", userId] });
          
          if (newData.status === "completed") {
            setSelectedTranslation(newData);
            setViewState("preview");
            toast.success("ဘာသာပြန်ခြင်း အောင်မြင်ပါသည်!");
          } else if (newData.status === "failed") {
            toast.error(newData.error_message || "ဘာသာပြန်ရာတွင် အမှားရှိပါသည်");
            setViewState("upload");
            setCurrentJobId(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(jobChannel);
    };
  }, [open, currentJobId, userId, queryClient]);

  const handleUploadComplete = (jobId: string) => {
    setCurrentJobId(jobId);
    setViewState("processing");
    setShowMinimizeHint(true);
    
    // Show hint to user that they can minimize
    setTimeout(() => {
      toast.info("Modal ပိတ်လို့ရပါပြီ", {
        description: "နောက်ကွယ်မှာ ဆက်လုပ်နေပါမည်။ ပြီးသွားရင် အသိပေးပါမည်။",
        duration: 5000,
      });
    }, 2000);
  };

  // Register this dialog's handler for background job click navigation
  const handleOpenJobFromNotification = useCallback((jobId: string) => {
    // First fetch the job to get its status
    supabase
      .from("srt_translations")
      .select("*")
      .eq("id", jobId)
      .single()
      .then(({ data }) => {
        if (data) {
          if (!open) {
            onOpenChange(true);
          }
          handleSelectTranslation(data);
        }
      });
  }, [open, onOpenChange]);

  useEffect(() => {
    setDialogHandler(handleOpenJobFromNotification);
  }, [setDialogHandler, handleOpenJobFromNotification]);

  const handleSelectTranslation = (translation: any) => {
    setSelectedTranslation(translation);
    if (translation.status === "completed") {
      setViewState("preview");
    } else if (["processing", "extracting", "transcribing", "translating", "generating"].includes(translation.status)) {
      setCurrentJobId(translation.id);
      setViewState("processing");
    }
  };

  const handleNewTranslation = () => {
    setSelectedTranslation(null);
    setCurrentJobId(null);
    setViewState("upload");
  };

  const handleRefresh = () => {
    refetch();
    toast.success("ပြန်လည်ရယူပြီးပါပြီ");
  };

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setViewState("upload");
      setSelectedTranslation(null);
      setCurrentJobId(null);
      setShowMinimizeHint(false);
    }
  }, [open]);

  const handleMinimize = () => {
    toast.info("နောက်ကွယ်မှာ ဆက်လုပ်နေပါမည်", {
      description: "ပြီးသွားရင် notification နဲ့ အသိပေးပါမည်",
      duration: 3000,
    });
    onOpenChange(false);
  };

  const aiMode = getAIMode();

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!inset-0 !translate-x-0 !translate-y-0 !max-w-[calc(100vw-20px)] !w-[calc(100vw-20px)] !h-[calc(100dvh-20px-env(safe-area-inset-top,0px))] !max-h-[calc(100dvh-20px-env(safe-area-inset-top,0px))] flex flex-col !p-0 !gap-0 !rounded-[16px] border-border/30 overflow-hidden bg-background/95 backdrop-blur-2xl [&>button:last-child]:hidden m-[10px] mt-[max(10px,env(safe-area-inset-top,10px))] pb-[env(safe-area-inset-bottom)]">
        {/* Accessibility */}
        <VisuallyHidden.Root>
          <DialogTitle>Easy Burmese SRT</DialogTitle>
          <DialogDescription>AI-powered English to Burmese subtitle translation tool</DialogDescription>
        </VisuallyHidden.Root>

        {/* Header */}
        <DialogHeader className="p-4 sm:p-5 pb-0 shrink-0 border-b border-border/30">
          <div className="flex items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30 ring-2 ring-amber-500/20">
                  <Subtitles className="h-5 w-5 text-white" />
                </div>
                {(translations?.length ?? 0) > 0 && (
                  <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
                    <span className="text-[8px] text-white font-bold">{translations.length}</span>
                  </div>
                )}
              </div>
              <div>
                <DialogTitle className="text-lg sm:text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text flex items-center gap-2">
                  Easy Burmese SRT
                  <Badge 
                    variant="secondary" 
                    className="text-[10px] px-1.5 bg-amber-500/10 text-amber-500 border-amber-500/20"
                  >
                    Beta
                  </Badge>
                </DialogTitle>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  {(translations?.length ?? 0) > 0 ? (
                    <span className="text-green-500">{translations.length} translation{translations.length > 1 ? 's' : ''}</span>
                  ) : (
                    `Translate videos to Burmese subtitles with AI`
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* AI Settings Button with Mode Indicator */}
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-primary/30 transition-all text-xs"
              >
                {aiMode.mode === "personal" ? (
                  <Key className="h-3.5 w-3.5 text-amber-500" />
                ) : aiMode.mode === "gateway" ? (
                  <Wifi className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="hidden sm:inline text-muted-foreground">
                  {aiMode.mode === "personal" ? "API Key" : aiMode.mode === "gateway" ? "Gateway" : "Setup"}
                </span>
                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              </button>

              {/* Refresh Button */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-primary/30 transition-all" 
                onClick={() => refetch()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>

              {/* Close Button */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 rounded-xl border border-border/50 bg-muted/30 hover:bg-destructive/20 hover:border-destructive/30 transition-all" 
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Main Content with Tabs */}
        <Tabs defaultValue="srt" className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 sm:px-5 pt-2 shrink-0 border-b border-border/30">
            <TabsList className="bg-muted/30 h-9">
              <TabsTrigger value="srt" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-500">
                <Subtitles className="h-3.5 w-3.5 mr-1.5" />
                SRT Translation
              </TabsTrigger>
              <TabsTrigger value="tts" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-500">
                <Volume2 className="h-3.5 w-3.5 mr-1.5" />
                Text-to-Speech
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="srt" className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden mt-0">
            {/* Sidebar - Translation History */}
            <div className="w-full lg:w-72 shrink-0 flex flex-col border-r border-border/30 bg-muted/10">
              <div className="p-4 border-b border-border/50">
                <Button
                  onClick={handleNewTranslation}
                  className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-amber-500/20"
                >
                  <Plus className="h-4 w-4" />
                  ဘာသာပြန်အသစ်
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <TranslationHistory
                  translations={translations || []}
                  isLoading={isLoading}
                  selectedId={selectedTranslation?.id}
                  onSelect={handleSelectTranslation}
                  userId={userId}
                />
              </ScrollArea>
            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <AnimatePresence mode="wait">
                {viewState === "upload" && (
                  <motion.div
                    key="upload"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="flex-1 flex items-center justify-center p-4 sm:p-8"
                  >
                    <VideoUploader
                      userId={userId}
                      onUploadComplete={handleUploadComplete}
                    />
                  </motion.div>
                )}

                {viewState === "processing" && currentJobId && (
                  <motion.div
                    key="processing"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex-1 flex items-center justify-center p-4 sm:p-8"
                  >
                    <ProcessingView 
                      jobId={currentJobId}
                      onComplete={(translation) => {
                        setSelectedTranslation(translation);
                        setViewState("preview");
                        toast.success("ဘာသာပြန်ခြင်း အောင်မြင်ပါသည်!");
                      }}
                      onError={(error) => {
                        toast.error(error);
                        setViewState("upload");
                        setCurrentJobId(null);
                      }}
                    />
                  </motion.div>
                )}

                {viewState === "preview" && selectedTranslation && (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex-1 overflow-hidden"
                  >
                    <SRTPreview
                      translation={selectedTranslation}
                      onRegenerate={() => {
                        setViewState("upload");
                        setSelectedTranslation(null);
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Mobile: New Translation Button */}
              <div className="md:hidden p-4 border-t border-border/50 bg-card/50">
                <Button
                  onClick={handleNewTranslation}
                  className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
                >
                  <Plus className="h-4 w-4" />
                  ဘာသာပြန်အသစ်
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tts" className="flex-1 overflow-auto mt-0">
            <TTSPanel userId={userId} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
    
    {/* Settings Dialog */}
    <SRTSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
