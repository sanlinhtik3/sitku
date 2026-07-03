import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Film, Download, Loader2, CheckCircle, AlertCircle, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SubtitleStyle, DEFAULT_STYLE } from "@/hooks/useSubtitleStyles";

interface VideoBurnInProps {
  videoUrl: string;
  srtContent: string;
  videoName: string;
  subtitleStyle?: SubtitleStyle;
  onClose?: () => void;
}

type BurnStatus = "idle" | "loading" | "processing" | "completed" | "error" | "unsupported";

// Convert hex color to ASS format (&HBBGGRR)
function hexToASS(hex: string): string {
  // Remove # if present
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "&HFFFFFF";
  
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  
  return `&H${b}${g}${r}`;
}

// Convert SubtitleStyle to FFmpeg force_style string
function styleToFFmpegFormat(style: SubtitleStyle): string {
  const parts: string[] = [
    `FontName=${style.font_family}`,
    `FontSize=${style.font_size}`,
    `PrimaryColour=${hexToASS(style.text_color)}`,
    `OutlineColour=${hexToASS(style.outline_color)}`,
    `Outline=${style.outline_width}`,
    `Shadow=${style.shadow_enabled ? 1 : 0}`,
    `Bold=${style.font_weight === "bold" ? 1 : 0}`,
  ];

  // Use X/Y position if available, otherwise fall back to legacy position
  if (style.position_x !== undefined && style.position_y !== undefined) {
    // Custom positioning via MarginL, MarginR, MarginV
    // ASS alignment for custom positioning
    let alignment = 2; // Default: bottom center
    switch (style.text_alignment) {
      case "left":
        alignment = 1;
        break;
      case "right":
        alignment = 3;
        break;
      case "center":
      default:
        alignment = 2;
        break;
    }
    
    // Calculate margins based on position_y (inverted: 0=top, 100=bottom)
    const marginV = Math.round((100 - style.position_y) * 4); // Convert to pixels
    parts.push(`Alignment=${alignment}`);
    parts.push(`MarginV=${marginV}`);
  } else {
    // Legacy position (top/middle/bottom)
    let alignment = 2; // Default: bottom center
    switch (style.position) {
      case "top":
        alignment = 8; // top center
        break;
      case "middle":
        alignment = 5; // middle center
        break;
      case "bottom":
      default:
        alignment = 2; // bottom center
        break;
    }
    parts.push(`Alignment=${alignment}`);
    parts.push(`MarginV=${style.vertical_margin}`);
  }

  return parts.join(",");
}

export function VideoBurnIn({ 
  videoUrl, 
  srtContent, 
  videoName, 
  subtitleStyle = DEFAULT_STYLE,
  onClose 
}: VideoBurnInProps) {
  const [status, setStatus] = useState<BurnStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const ffmpegRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check for cross-origin isolation support
  const isCrossOriginIsolated = typeof window !== "undefined" && window.crossOriginIsolated;

  const loadFFmpeg = useCallback(async () => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Check for SharedArrayBuffer support
    if (!isCrossOriginIsolated) {
      setStatus("unsupported");
      setProgressMessage("ဤ feature ကို အသုံးပြုရန် Cross-Origin Isolation လိုအပ်ပါသည်");
      return null;
    }

    setStatus("loading");
    setProgressMessage("FFmpeg ကို ဒေါင်းလုဒ်လုပ်နေပါသည်...");
    setProgress(10);

    // Set a timeout for stalled operations (2 minutes)
    timeoutRef.current = setTimeout(() => {
      if (status === "loading" || status === "processing") {
        setStatus("error");
        setProgressMessage("လုပ်ဆောင်ချက်သည် အချိန်ကုန်သွားပါသည်။ ကျေးဇူးပြု၍ ထပ်ကြိုးစားပါ။");
      }
    }, 120000);

    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util");

      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      // Log progress
      ffmpeg.on("log", ({ message }) => {
        console.log("[FFmpeg]", message);
      });

      // Track encoding progress
      ffmpeg.on("progress", ({ progress: p }) => {
        const percent = Math.round(p * 100);
        setProgress(30 + percent * 0.6); // 30-90% range for encoding
        setProgressMessage(`Video ထဲသို့ စာတန်းထိုးနေပါသည်... ${percent}%`);
      });

      setProgress(20);
      setProgressMessage("FFmpeg Core ကို ဒေါင်းလုဒ်လုပ်နေပါသည်...");

      // Load FFmpeg with CDN URLs
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      setProgress(30);
      return { ffmpeg, fetchFile };
    } catch (err) {
      console.error("FFmpeg load error:", err);
      throw new Error("FFmpeg ကို ဒေါင်းလုဒ်မလုပ်နိုင်ပါ");
    }
  }, [isCrossOriginIsolated, status]);

  const burnSubtitles = useCallback(async () => {
    try {
      const result = await loadFFmpeg();
      if (!result) return; // Unsupported browser

      const { ffmpeg, fetchFile } = result;
      
      setStatus("processing");
      setProgressMessage("Video ဖိုင်ကို ပြင်ဆင်နေပါသည်...");

      // Fetch video file
      const videoData = await fetchFile(videoUrl);
      await ffmpeg.writeFile("input.mp4", videoData);

      // Write SRT file with proper encoding
      const encoder = new TextEncoder();
      const srtData = encoder.encode(srtContent);
      await ffmpeg.writeFile("subtitles.srt", srtData);

      setProgressMessage("စာတန်းထိုးနေပါသည်...");

      // Build force_style from user's subtitle style
      const forceStyle = styleToFFmpegFormat(subtitleStyle);
      console.log("[FFmpeg] Using style:", forceStyle);

      // Burn subtitles using subtitles filter with user's custom style
      await ffmpeg.exec([
        "-i", "input.mp4",
        "-vf", `subtitles=subtitles.srt:force_style='${forceStyle}'`,
        "-c:a", "copy",
        "-preset", "fast",
        "output.mp4"
      ]);

      // Clear timeout on success
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setProgress(95);
      setProgressMessage("ဖိုင်ကို ပြင်ဆင်နေပါသည်...");

      // Read output file
      const data = await ffmpeg.readFile("output.mp4");
      // Handle FileData type properly - it can be string or Uint8Array
      let blobData: BlobPart;
      if (typeof data === "string") {
        blobData = data;
      } else {
        // Create a new ArrayBuffer copy to avoid SharedArrayBuffer issues
        const buffer = new ArrayBuffer(data.byteLength);
        new Uint8Array(buffer).set(data);
        blobData = buffer;
      }
      const blob = new Blob([blobData], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);

      setOutputUrl(url);
      setStatus("completed");
      setProgress(100);
      setProgressMessage("အောင်မြင်ပါသည်!");

      toast.success("Video ထဲသို့ စာတန်းထည့်သွင်းပြီးပါပြီ");
    } catch (err: any) {
      console.error("Burn error:", err);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setStatus("error");
      setProgressMessage(err.message || "အမှားတစ်ခု ဖြစ်ပွားပါသည်");
      toast.error("Video ပြုလုပ်ရာတွင် အမှားရှိပါသည်");
    }
  }, [videoUrl, srtContent, subtitleStyle, loadFFmpeg]);

  const handleDownload = useCallback(() => {
    if (outputUrl) {
      const a = document.createElement("a");
      a.href = outputUrl;
      a.download = `${videoName.replace(/\.[^/.]+$/, "")}_burmese_subtitled.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Video ဒေါင်းလုဒ်လုပ်ပြီးပါပြီ");
    }
  }, [outputUrl, videoName]);

  const handleReset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
    }
    setStatus("idle");
    setProgress(0);
    setProgressMessage("");
    setOutputUrl(null);
  }, [outputUrl]);

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {/* Unsupported Browser State */}
        {status === "unsupported" && (
          <motion.div
            key="unsupported"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-6 rounded-xl border border-amber-500/30 bg-amber-500/5 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 rounded-full bg-amber-500/20">
                <AlertTriangle className="h-8 w-8 text-amber-500" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-amber-600">Browser Support Required</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {progressMessage}
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  ဤ feature သည် SharedArrayBuffer လိုအပ်ပြီး Cross-Origin Isolation headers ရှိရပါမည်။
                  Production တွင် ဤ feature ကို အသုံးပြုနိုင်ရန် Chrome (v92+) သို့မဟုတ် Firefox (v79+) ကို အသုံးပြုပါ။
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleReset} className="gap-2">
                  <X className="h-4 w-4" />
                  ပိတ်ပါ
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {status === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-6 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 rounded-full bg-primary/10">
                <Film className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Video ထဲသို့ စာတန်းထည့်သွင်းပါ</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  ဘာသာပြန်ထားသော စာတန်းများကို video ထဲသို့ တိုက်ရိုက်ထည့်သွင်းနိုင်ပါသည်
                </p>
                <p className="text-xs text-primary mt-2">
                  💡 Your custom subtitle style will be applied
                </p>
                {!isCrossOriginIsolated && (
                  <p className="text-xs text-amber-500 mt-2">
                    ⚠️ Browser support check pending...
                  </p>
                )}
              </div>
              <Button
                onClick={burnSubtitles}
                className="gap-2 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white"
              >
                <Film className="h-4 w-4" />
                စာတန်းထည့်သွင်းပါ
              </Button>
              <p className="text-xs text-muted-foreground">
                ⚠️ ဤလုပ်ဆောင်ချက်သည် သင့်ဘရောက်ဇာတွင် လုပ်ဆောင်ပြီး အချိန်အနည်းငယ်ကြာနိုင်ပါသည်
              </p>
            </div>
          </motion.div>
        )}

        {(status === "loading" || status === "processing") && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-6 rounded-xl border border-primary/30 bg-primary/5 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <div className="p-4 rounded-full bg-primary/20">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-primary/30"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
              <div>
                <h3 className="font-semibold text-lg">လုပ်ဆောင်နေပါသည်...</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {progressMessage}
                </p>
              </div>
              <div className="w-full max-w-xs">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">{Math.round(progress)}%</p>
              </div>
              <p className="text-xs text-muted-foreground">
                ⏱️ Video အရွယ်အစားပေါ်မူတည်၍ 1-5 မိနစ်ကြာနိုင်ပါသည်
              </p>
            </div>
          </motion.div>
        )}

        {status === "completed" && (
          <motion.div
            key="completed"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-6 rounded-xl border border-green-500/30 bg-green-500/5 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 rounded-full bg-green-500/20">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-green-600">အောင်မြင်ပါသည်!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Video ထဲသို့ စာတန်းထည့်သွင်းပြီးပါပြီ
                </p>
              </div>

              {/* Preview output video */}
              {outputUrl && (
                <div className="w-full max-w-md rounded-lg overflow-hidden bg-black">
                  <video
                    src={outputUrl}
                    controls
                    className="w-full"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleDownload}
                  className="gap-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
                >
                  <Download className="h-4 w-4" />
                  ဒေါင်းလုဒ်လုပ်ပါ
                </Button>
                <Button variant="outline" onClick={handleReset} className="gap-2">
                  <X className="h-4 w-4" />
                  ပိတ်ပါ
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {status === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-6 rounded-xl border border-destructive/30 bg-destructive/5 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 rounded-full bg-destructive/20">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-destructive">အမှားဖြစ်ပွားပါသည်</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {progressMessage}
                </p>
              </div>
              <Button variant="outline" onClick={handleReset} className="gap-2">
                ပြန်လည်ကြိုးစားပါ
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
