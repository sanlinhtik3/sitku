import { useState, useCallback, useEffect } from "react";
import { motion } from "motion/react";
import { Upload, Film, FileVideo, Loader2, AlertCircle, Languages, Youtube, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { extractYouTubeId } from "@/lib/videoUtils";

interface VideoUploaderProps {
  userId: string;
  onUploadComplete: (jobId: string) => void;
}

const SUPPORTED_FORMATS = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

const SOURCE_LANGUAGES = [
  { code: "en", name: "English", nameNative: "English" },
  { code: "th", name: "Thai", nameNative: "ไทย" },
  { code: "ja", name: "Japanese", nameNative: "日本語" },
  { code: "ko", name: "Korean", nameNative: "한국어" },
  { code: "zh", name: "Chinese", nameNative: "中文" },
  { code: "auto", name: "Auto Detect", nameNative: "အလိုအလျောက်" },
];

export function VideoUploader({ userId, onUploadComplete }: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState("en");
  
  // YouTube state
  const [uploadMode, setUploadMode] = useState<"file" | "youtube">("file");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [youtubePreview, setYoutubePreview] = useState<{
    thumbnail: string;
  } | null>(null);

  const validateFile = (file: File): string | null => {
    if (!SUPPORTED_FORMATS.includes(file.type)) {
      return "ဗီဒီယိုဖိုင် format မမှန်ပါ။ MP4, WebM, MOV, MKV သာ support လုပ်ပါသည်။";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "ဖိုင်အရွယ်အစား 500MB ထက်ကြီးနေပါသည်။";
    }
    return null;
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const file = e.dataTransfer.files[0];
    if (file) {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setSelectedFile(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (file) {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setSelectedFile(file);
    }
  }, []);

  // YouTube URL validation
  const validateYoutubeUrl = useCallback((url: string) => {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      setYoutubeVideoId(videoId);
      setYoutubePreview({
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
      });
      setError(null);
    } else {
      setYoutubeVideoId(null);
      setYoutubePreview(null);
      if (url.trim()) {
        setError("YouTube URL မမှန်ကန်ပါ။ ပြန်စစ်ပါ။");
      }
    }
  }, []);

  // Validate YouTube URL when it changes
  useEffect(() => {
    if (youtubeUrl) {
      validateYoutubeUrl(youtubeUrl);
    } else {
      setYoutubeVideoId(null);
      setYoutubePreview(null);
      setError(null);
    }
  }, [youtubeUrl, validateYoutubeUrl]);

  // File upload handler
  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      // Step 1: Create translation record first (10%)
      setUploadProgress(10);
      
      const { data: translation, error: dbError } = await supabase
        .from("srt_translations")
        .insert({
          user_id: userId,
          video_name: selectedFile.name,
          video_source: "upload",
          status: "processing",
          source_language: sourceLanguage,
          progress_percent: 0,
          file_size_bytes: selectedFile.size,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Step 2: Upload video to storage (10% - 80%)
      setUploadProgress(20);
      const filePath = `${userId}/${translation.id}/${selectedFile.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from("srt-videos")
        .upload(filePath, selectedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      setUploadProgress(80);

      // Step 3: Get public URL and update record
      const { data: urlData } = supabase.storage
        .from("srt-videos")
        .getPublicUrl(filePath);

      await supabase
        .from("srt_translations")
        .update({ video_url: urlData.publicUrl })
        .eq("id", translation.id);

      setUploadProgress(90);

      // Step 4: Trigger processing edge function
      const { error: fnError } = await supabase.functions.invoke("easy-srt-process", {
        body: { 
          translationId: translation.id,
          sourceLanguage: sourceLanguage 
        },
      });

      if (fnError) {
        console.error("Processing function error:", fnError);
      }

      setUploadProgress(100);
      toast.success("ဗီဒီယို တင်ပြီးပါပြီ! ဘာသာပြန်နေပါသည်...");
      onUploadComplete(translation.id);
      
    } catch (err: any) {
      console.error("Upload error:", err);
      setError(err.message || "Upload failed");
      toast.error("ဗီဒီယိုတင်ရာတွင် အမှားရှိပါသည်");
    } finally {
      setIsUploading(false);
    }
  };

  // YouTube submit handler
  const handleYoutubeSubmit = async () => {
    if (!youtubeVideoId) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      setUploadProgress(20);
      
      // Create translation record with YouTube source
      const { data: translation, error: dbError } = await supabase
        .from("srt_translations")
        .insert({
          user_id: userId,
          video_name: `YouTube: ${youtubeVideoId}`,
          video_source: "youtube",
          youtube_url: youtubeUrl,
          youtube_video_id: youtubeVideoId,
          status: "processing",
          source_language: sourceLanguage,
          progress_percent: 0,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setUploadProgress(50);

      // Trigger processing edge function
      const { error: fnError } = await supabase.functions.invoke("easy-srt-process", {
        body: { 
          translationId: translation.id,
          sourceLanguage: sourceLanguage 
        },
      });

      if (fnError) {
        console.error("Processing function error:", fnError);
      }

      setUploadProgress(100);
      toast.success("YouTube ဗီဒီယို လက်ခံပြီးပါပြီ! ဘာသာပြန်နေပါသည်...");
      onUploadComplete(translation.id);
      
    } catch (err: any) {
      console.error("YouTube submit error:", err);
      setError(err.message || "YouTube ဗီဒီယို process လုပ်ရာတွင် အမှားရှိပါသည်");
      toast.error("YouTube ဗီဒီယို process လုပ်ရာတွင် အမှားရှိပါသည်");
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const selectedLanguage = SOURCE_LANGUAGES.find(l => l.code === sourceLanguage);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Language Selector */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <label className="block text-sm font-medium text-foreground mb-2">
          <Languages className="inline-block h-4 w-4 mr-2 text-amber-500" />
          ဗီဒီယို၏ မူရင်းဘာသာစကား
        </label>
        <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
          <SelectTrigger className="w-full sm:w-64 bg-card/50 border-border/50">
            <SelectValue>
              {selectedLanguage && (
                <span className="flex items-center gap-2">
                  <span>{selectedLanguage.name}</span>
                  <span className="text-muted-foreground text-xs">
                    ({selectedLanguage.nameNative})
                  </span>
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SOURCE_LANGUAGES.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                <span className="flex items-center gap-2">
                  <span>{lang.name}</span>
                  <span className="text-muted-foreground text-xs">
                    ({lang.nameNative})
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1.5">
          ဗီဒီယိုထဲတွင် ပြောနေသော ဘာသာစကားကို ရွေးချယ်ပါ
        </p>
      </motion.div>

      {/* Upload Mode Tabs */}
      <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as "file" | "youtube")} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="file" className="gap-2">
            <Upload className="h-4 w-4" />
            ဖိုင်တင်ပါ
          </TabsTrigger>
          <TabsTrigger value="youtube" className="gap-2">
            <Youtube className="h-4 w-4" />
            YouTube Link
          </TabsTrigger>
        </TabsList>

        {/* File Upload Tab */}
        <TabsContent value="file">
          <motion.div
            className={cn(
              "relative border-2 border-dashed rounded-2xl p-8 sm:p-12 transition-all duration-300",
              isDragging
                ? "border-amber-500 bg-amber-500/10 scale-[1.02]"
                : "border-border/50 bg-card/30 hover:border-amber-500/50 hover:bg-card/50",
              error && uploadMode === "file" && "border-destructive/50 bg-destructive/5"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            {/* Decorative Elements */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 flex flex-col items-center text-center gap-4">
              {/* Icon */}
              <div className={cn(
                "p-4 rounded-2xl transition-colors",
                isDragging
                  ? "bg-amber-500/20"
                  : selectedFile
                    ? "bg-green-500/20"
                    : "bg-muted/50"
              )}>
                {selectedFile ? (
                  <FileVideo className="h-12 w-12 text-green-500" />
                ) : (
                  <Upload className={cn(
                    "h-12 w-12 transition-colors",
                    isDragging ? "text-amber-500" : "text-muted-foreground"
                  )} />
                )}
              </div>

              {/* Text */}
              {selectedFile ? (
                <div className="space-y-2">
                  <p className="text-lg font-medium text-foreground">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-lg font-medium text-foreground">
                    ဗီဒီယိုဖိုင်ကို ဤနေရာသို့ ဆွဲချပါ
                  </p>
                  <p className="text-sm text-muted-foreground">
                    သို့မဟုတ် နှိပ်၍ ရွေးချယ်ပါ
                  </p>
                </div>
              )}

              {/* Error Message */}
              {error && uploadMode === "file" && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-destructive text-sm"
                >
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </motion.div>
              )}

              {/* File Input */}
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isUploading}
              />
            </div>
          </motion.div>

          {/* Selected File Actions */}
          {selectedFile && !isUploading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 flex flex-col sm:flex-row gap-3"
            >
              <Button
                onClick={handleUpload}
                className="flex-1 gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-amber-500/20"
              >
                <Film className="h-4 w-4" />
                ဘာသာပြန်ခြင်း စတင်ပါ
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedFile(null);
                  setError(null);
                }}
                className="sm:w-auto"
              >
                ဖိုင်ပြောင်းပါ
              </Button>
            </motion.div>
          )}

          {/* Supported Formats */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {["MP4", "WebM", "MOV", "MKV"].map((format) => (
              <span
                key={format}
                className="px-2.5 py-1 rounded-full bg-muted/50 text-xs text-muted-foreground"
              >
                {format}
              </span>
            ))}
            <span className="text-xs text-muted-foreground">• Max 500MB</span>
          </div>
        </TabsContent>

        {/* YouTube Link Tab */}
        <TabsContent value="youtube">
          <motion.div
            className={cn(
              "relative border-2 border-dashed rounded-2xl p-8 transition-all duration-300",
              "border-border/50 bg-card/30",
              error && uploadMode === "youtube" && "border-destructive/50 bg-destructive/5",
              youtubePreview && "border-red-500/50 bg-red-500/5"
            )}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            {/* Decorative Elements */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-red-500/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-6">
              {/* YouTube Icon */}
              <div className={cn(
                "p-4 rounded-2xl transition-colors",
                youtubePreview ? "bg-red-500/20" : "bg-muted/50"
              )}>
                <Youtube className={cn(
                  "h-12 w-12 transition-colors",
                  youtubePreview ? "text-red-500" : "text-muted-foreground"
                )} />
              </div>

              {/* URL Input */}
              <div className="w-full max-w-md space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  <Link2 className="inline-block h-4 w-4 mr-2 text-red-500" />
                  YouTube URL ထည့်ပါ
                </label>
                <Input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  className="bg-background/50"
                  disabled={isUploading}
                />
              </div>

              {/* YouTube Preview */}
              {youtubePreview && youtubeVideoId && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full max-w-md rounded-xl overflow-hidden border border-border/50 bg-card/50"
                >
                  <img
                    src={youtubePreview.thumbnail}
                    alt="YouTube Video Thumbnail"
                    className="w-full aspect-video object-cover"
                  />
                  <div className="p-3">
                    <p className="text-sm text-muted-foreground">
                      Video ID: <span className="text-foreground font-mono">{youtubeVideoId}</span>
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Error Message */}
              {error && uploadMode === "youtube" && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-destructive text-sm"
                >
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* YouTube Submit Button */}
          {youtubeVideoId && !isUploading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 flex flex-col sm:flex-row gap-3"
            >
              <Button
                onClick={handleYoutubeSubmit}
                className="flex-1 gap-2 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white shadow-lg shadow-red-500/20"
              >
                <Film className="h-4 w-4" />
                ဘာသာပြန်ခြင်း စတင်ပါ
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setYoutubeUrl("");
                  setYoutubeVideoId(null);
                  setYoutubePreview(null);
                  setError(null);
                }}
                className="sm:w-auto"
              >
                ပယ်ဖျက်ပါ
              </Button>
            </motion.div>
          )}

          {/* YouTube Info */}
          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground">
              YouTube ဗီဒီယို link ကို ထည့်ပြီး ဘာသာပြန်နိုင်ပါသည်
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Upload Progress */}
      {isUploading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 space-y-3"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {uploadMode === "youtube" ? "YouTube ဗီဒီယို ပို့နေပါသည်..." : "ဗီဒီယိုတင်နေပါသည်..."}
            </span>
            <span className="text-foreground font-medium">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
        </motion.div>
      )}
    </div>
  );
}
