import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Download, RefreshCw, Check, Edit2, Save, X, Copy, FileText, Film, Play, ChevronDown, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VideoPreviewPlayer } from "./VideoPreviewPlayer";
import { VideoBurnIn } from "./VideoBurnIn";
import { SubtitleStyleEditor } from "./SubtitleStyleEditor";
import { useSubtitleStyles, SubtitleStyle } from "@/hooks/useSubtitleStyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SRTPreviewProps {
  translation: {
    id: string;
    video_name: string;
    video_url: string;
    srt_content: string | null;
    original_text: string | null;
    translated_text: string | null;
    created_at: string;
  };
  onRegenerate: () => void;
}

export function SRTPreview({ translation, onRegenerate }: SRTPreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(translation.srt_content || "");
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "srt" | "original" | "translated" | "burnin">("preview");
  const [videoSignedUrl, setVideoSignedUrl] = useState<string | null>(null);
  const [showStyleEditor, setShowStyleEditor] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(true);
  const [urlError, setUrlError] = useState<string | null>(null);
  
  // Subtitle styles
  const { defaultStyle } = useSubtitleStyles();
  const [currentStyle, setCurrentStyle] = useState<SubtitleStyle>(defaultStyle);

  // Sync with default style
  useEffect(() => {
    setCurrentStyle(defaultStyle);
  }, [defaultStyle]);

  // Fetch video URL on mount and when translation changes with proper cleanup
  useEffect(() => {
    const controller = new AbortController();
    
    // Reset state when translation changes
    setVideoSignedUrl(null);
    setActiveTab("preview");
    setEditedContent(translation.srt_content || "");
    setIsEditing(false);
    setIsLoadingUrl(true);
    setUrlError(null);
    
    const loadVideoUrl = async () => {
      if (!translation.video_url) {
        setIsLoadingUrl(false);
        return;
      }
      
      try {
        const urlParts = translation.video_url.split("/srt-videos/");
        const filePath = urlParts.length > 1 ? decodeURIComponent(urlParts[1]) : translation.video_url;
        
        const { data, error } = await supabase.storage
          .from("srt-videos")
          .createSignedUrl(filePath, 3600);

        if (error) throw error;
        
        if (!controller.signal.aborted) {
          setVideoSignedUrl(data.signedUrl);
        }
      } catch (err) {
        console.error("Error getting video URL:", err);
        if (!controller.signal.aborted) {
          setUrlError("Video URL ရယူရာတွင် အမှားရှိပါသည်");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingUrl(false);
        }
      }
    };

    loadVideoUrl();
    
    return () => controller.abort();
  }, [translation.id, translation.video_url]);

  // Handle tab change
  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
  };

  // Handle style change from editor
  const handleStyleChange = useCallback((style: SubtitleStyle) => {
    setCurrentStyle(style);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("srt_translations")
        .update({ srt_content: editedContent })
        .eq("id", translation.id);

      if (error) throw error;
      
      toast.success("SRT ဖိုင် သိမ်းဆည်းပြီးပါပြီ");
      setIsEditing(false);
    } catch (err) {
      console.error("Save error:", err);
      toast.error("သိမ်းဆည်းရာတွင် အမှားရှိပါသည်");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadSRT = () => {
    const content = isEditing ? editedContent : translation.srt_content;
    if (!content) {
      toast.error("SRT content မရှိပါ");
      return;
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${translation.video_name.replace(/\.[^/.]+$/, "")}_burmese.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success("SRT ဖိုင် download လုပ်ပြီးပါပြီ");
  };

  const handleCopy = () => {
    const content = activeTab === "srt" 
      ? (isEditing ? editedContent : translation.srt_content)
      : activeTab === "original" 
        ? translation.original_text 
        : translation.translated_text;
    
    if (content) {
      navigator.clipboard.writeText(content);
      toast.success("Clipboard သို့ ကူးယူပြီးပါပြီ");
    }
  };

  const getActiveContent = () => {
    if (activeTab === "srt") {
      return isEditing ? editedContent : translation.srt_content;
    } else if (activeTab === "original") {
      return translation.original_text;
    }
    return translation.translated_text;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-border/50 bg-gradient-to-r from-green-500/5 via-transparent to-green-500/5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <Check className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">ဘာသာပြန်ခြင်း အောင်မြင်ပါသည်!</h3>
              <p className="text-sm text-muted-foreground">{translation.video_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowStyleEditor(true)}
              className="gap-1.5"
            >
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Style</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-1.5"
            >
              <Copy className="h-4 w-4" />
              <span className="hidden sm:inline">Copy</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              className="gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">အသစ်ပြုလုပ်ပါ</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background/95 backdrop-blur-xl border-border/50">
                <DropdownMenuItem 
                  onSelect={(e) => {
                    e.preventDefault();
                    handleDownloadSRT();
                  }}
                  className="gap-2 cursor-pointer"
                >
                  <FileText className="h-4 w-4" />
                  Download SRT File
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onSelect={(e) => {
                    e.preventDefault();
                    setActiveTab("burnin");
                  }}
                  className="gap-2 cursor-pointer"
                >
                  <Film className="h-4 w-4" />
                  Video with Subtitles
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 sm:px-6 py-3 border-b border-border/50 flex items-center gap-1 sm:gap-2 overflow-x-auto">
        {[
          { id: "preview" as const, label: "Preview", icon: Play },
          { id: "srt" as const, label: "SRT File", icon: FileText },
          { id: "original" as const, label: "Original", icon: FileText },
          { id: "translated" as const, label: "Translated", icon: FileText },
          { id: "burnin" as const, label: "Burn-in", icon: Film },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              "px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap",
              activeTab === tab.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}

        {activeTab === "srt" && (
          <div className="ml-auto flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditedContent(translation.srt_content || "");
                    setIsEditing(false);
                  }}
                  className="gap-1.5"
                >
                  <X className="h-4 w-4" />
                  <span className="hidden sm:inline">Cancel</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="gap-1.5"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "..." : <span className="hidden sm:inline">Save</span>}
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="gap-1.5"
              >
                <Edit2 className="h-4 w-4" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6">
          {/* Video Preview Tab */}
          {activeTab === "preview" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {isLoadingUrl ? (
                <div className="aspect-video w-full min-h-[300px] bg-card/50 rounded-xl border border-border/50 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                    <p className="text-muted-foreground text-sm">Video URL ရယူနေပါသည်...</p>
                  </div>
                </div>
              ) : urlError ? (
                <div className="aspect-video w-full min-h-[300px] bg-card/50 rounded-xl border border-border/50 flex items-center justify-center">
                  <div className="text-center p-4">
                    <p className="text-destructive mb-3">{urlError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setUrlError(null);
                        setIsLoadingUrl(true);
                        // Re-trigger fetch
                        const loadUrl = async () => {
                          try {
                            const urlParts = translation.video_url.split("/srt-videos/");
                            const filePath = urlParts.length > 1 ? decodeURIComponent(urlParts[1]) : translation.video_url;
                            const { data, error } = await supabase.storage.from("srt-videos").createSignedUrl(filePath, 3600);
                            if (error) throw error;
                            setVideoSignedUrl(data.signedUrl);
                          } catch (err) {
                            setUrlError("Video URL ရယူရာတွင် အမှားရှိပါသည်");
                          } finally {
                            setIsLoadingUrl(false);
                          }
                        };
                        loadUrl();
                      }}
                    >
                      ပြန်ကြိုးစားပါ
                    </Button>
                  </div>
                </div>
              ) : videoSignedUrl ? (
                <VideoPreviewPlayer
                  videoUrl={videoSignedUrl}
                  srtContent={translation.srt_content}
                  originalSrtContent={(translation as any).original_srt_content}
                  subtitleStyle={currentStyle}
                  className="aspect-video max-h-[60vh] w-full min-h-[300px]"
                />
              ) : (
                <div className="aspect-video w-full min-h-[300px] bg-card/50 rounded-xl border border-border/50 flex items-center justify-center">
                  <p className="text-muted-foreground">Video မရှိပါ</p>
                </div>
              )}
              <p className="text-sm text-muted-foreground text-center mt-4">
                💡 Video ကို ကြည့်ရှုပြီး subtitle များကို preview ကြည့်နိုင်ပါသည်
              </p>
            </motion.div>
          )}

          {/* Burn-in Tab */}
          {activeTab === "burnin" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {videoSignedUrl && translation.srt_content ? (
                <VideoBurnIn
                  videoUrl={videoSignedUrl}
                  srtContent={translation.srt_content}
                  videoName={translation.video_name}
                  subtitleStyle={currentStyle}
                />
              ) : (
                <div className="p-6 rounded-xl border border-border/50 bg-card/50 text-center">
                  <p className="text-muted-foreground">
                    {!translation.srt_content 
                      ? "SRT content မရှိပါ" 
                      : "Video URL ကို ရယူနေပါသည်..."}
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* Text Content Tabs (SRT, Original, Translated) */}
          {(activeTab === "srt" || activeTab === "original" || activeTab === "translated") && (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative"
            >
              {activeTab === "srt" && isEditing ? (
                <Textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="min-h-[400px] font-mono text-sm bg-card/50 border-border/50 resize-none"
                  placeholder="SRT content..."
                />
              ) : (
                <pre className="p-4 rounded-xl bg-card/50 border border-border/50 font-mono text-sm whitespace-pre-wrap break-words overflow-x-auto">
                  {getActiveContent() || "Content not available"}
                </pre>
              )}
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Subtitle Style Editor Dialog */}
      <SubtitleStyleEditor
        open={showStyleEditor}
        onOpenChange={setShowStyleEditor}
        currentStyle={currentStyle}
        onStyleChange={handleStyleChange}
        previewText="ဒီနေ့ ဘယ်လို ဆက်ဆံရမလဲ"
      />
    </div>
  );
}