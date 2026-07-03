import { useState, useRef, useCallback } from "react";
import { motion } from "motion/react";
import { Scissors, Loader2, CheckCircle, AlertCircle, Music, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

interface AudioChunk {
  index: number;
  blob: Blob;
  startTime: number; // seconds
  endTime: number;   // seconds
  duration: number;  // seconds
}

interface VideoAudioSplitterProps {
  videoFile: File;
  chunkDurationMinutes?: number; // default 10 minutes
  onChunksReady: (chunks: AudioChunk[]) => void;
  onProgress?: (progress: number, message: string) => void;
}

type SplitStatus = "idle" | "loading" | "extracting" | "splitting" | "completed" | "error" | "unsupported";

/**
 * Component that extracts audio from video and splits into chunks
 * for processing long videos (30-60+ minutes)
 */
export function VideoAudioSplitter({
  videoFile,
  chunkDurationMinutes = 10,
  onChunksReady,
  onProgress
}: VideoAudioSplitterProps) {
  const [status, setStatus] = useState<SplitStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [chunks, setChunks] = useState<AudioChunk[]>([]);
  const ffmpegRef = useRef<any>(null);
  
  const isCrossOriginIsolated = typeof window !== "undefined" && window.crossOriginIsolated;
  
  const updateProgress = useCallback((pct: number, msg: string) => {
    setProgress(pct);
    setProgressMessage(msg);
    onProgress?.(pct, msg);
  }, [onProgress]);

  const extractAndSplitAudio = useCallback(async () => {
    if (!isCrossOriginIsolated) {
      setStatus("unsupported");
      setProgressMessage("SharedArrayBuffer not available - Cross-Origin Isolation required");
      return;
    }

    try {
      setStatus("loading");
      updateProgress(5, "FFmpeg ကို ဒေါင်းလုဒ်လုပ်နေပါသည်...");

      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util");

      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      // Progress tracking
      ffmpeg.on("progress", ({ progress: p }) => {
        const pct = Math.round(p * 100);
        updateProgress(20 + pct * 0.5, `Audio ထုတ်ယူနေပါသည်... ${pct}%`);
      });

      updateProgress(10, "FFmpeg Core ဒေါင်းလုဒ်လုပ်နေပါသည်...");

      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      setStatus("extracting");
      updateProgress(20, "Video ဖိုင်ကို ပြင်ဆင်နေပါသည်...");

      // Write video file to ffmpeg
      const videoData = await fetchFile(videoFile);
      await ffmpeg.writeFile("input.mp4", videoData);

      // Get video duration first
      updateProgress(25, "Video duration ရယူနေပါသည်...");
      
      // Extract audio as single MP3 first
      await ffmpeg.exec([
        "-i", "input.mp4",
        "-vn",           // No video
        "-acodec", "libmp3lame",
        "-ar", "16000",  // 16kHz sample rate (good for speech)
        "-ac", "1",      // Mono
        "-b:a", "64k",   // 64kbps bitrate
        "audio.mp3"
      ]);

      updateProgress(70, "Audio chunks ပိုင်းနေပါသည်...");
      setStatus("splitting");

      // Read the full audio file to get duration
      const audioData = await ffmpeg.readFile("audio.mp3");
      // Handle FileData type - copy to regular ArrayBuffer to avoid SharedArrayBuffer issues
      let audioBlobData: BlobPart;
      if (typeof audioData === "string") {
        audioBlobData = audioData;
      } else {
        const buffer = new ArrayBuffer(audioData.byteLength);
        new Uint8Array(buffer).set(audioData);
        audioBlobData = buffer;
      }
      const audioBlob = new Blob([audioBlobData], { type: "audio/mp3" });
      
      // Estimate duration from file size (64kbps = 8KB/s)
      const estimatedDuration = (audioBlob.size / 8000); // seconds
      const chunkDuration = chunkDurationMinutes * 60;
      const numChunks = Math.ceil(estimatedDuration / chunkDuration);

      console.log(`Audio: ${Math.round(estimatedDuration / 60)} minutes, splitting into ${numChunks} chunks`);

      const audioChunks: AudioChunk[] = [];

      // If single chunk, don't split
      if (numChunks <= 1) {
        audioChunks.push({
          index: 0,
          blob: audioBlob,
          startTime: 0,
          endTime: estimatedDuration,
          duration: estimatedDuration
        });
      } else {
        // Split into chunks
        for (let i = 0; i < numChunks; i++) {
          const startTime = i * chunkDuration;
          const endTime = Math.min((i + 1) * chunkDuration, estimatedDuration);
          const duration = endTime - startTime;
          
          updateProgress(70 + (i / numChunks) * 25, `Chunk ${i + 1}/${numChunks} ဖန်တီးနေပါသည်...`);

          const chunkFileName = `chunk_${i}.mp3`;
          await ffmpeg.exec([
            "-i", "audio.mp3",
            "-ss", String(startTime),
            "-t", String(duration),
            "-acodec", "copy",
            chunkFileName
          ]);

          const chunkData = await ffmpeg.readFile(chunkFileName);
          // Handle FileData type properly
          let chunkBlobData: BlobPart;
          if (typeof chunkData === "string") {
            chunkBlobData = chunkData;
          } else {
            const buffer = new ArrayBuffer(chunkData.byteLength);
            new Uint8Array(buffer).set(chunkData);
            chunkBlobData = buffer;
          }
          const chunkBlob = new Blob([chunkBlobData], { type: "audio/mp3" });

          audioChunks.push({
            index: i,
            blob: chunkBlob,
            startTime,
            endTime,
            duration
          });

          // Clean up chunk file
          await ffmpeg.deleteFile(chunkFileName);
        }
      }

      // Clean up
      await ffmpeg.deleteFile("input.mp4");
      await ffmpeg.deleteFile("audio.mp3");

      setChunks(audioChunks);
      setStatus("completed");
      updateProgress(100, `${audioChunks.length} chunks ဖန်တီးပြီးပါပြီ!`);

      toast.success(`Audio ${audioChunks.length} chunks ပိုင်းပြီးပါပြီ`);
      onChunksReady(audioChunks);

    } catch (err: any) {
      console.error("Audio split error:", err);
      setStatus("error");
      setProgressMessage(err.message || "Audio ထုတ်ယူရာတွင် အမှားရှိပါသည်");
      toast.error("Audio ထုတ်ယူရာတွင် အမှားရှိပါသည်");
    }
  }, [videoFile, chunkDurationMinutes, isCrossOriginIsolated, onChunksReady, updateProgress]);

  return (
    <div className="space-y-4">
      {status === "idle" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-6 rounded-xl border border-border/50 bg-card/50 text-center space-y-4"
        >
          <div className="p-4 rounded-full bg-amber-500/20 inline-block">
            <Scissors className="h-8 w-8 text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Long Video Detected</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Video ကို {chunkDurationMinutes} မိနစ် chunks များပိုင်းပြီး process လုပ်ပါမယ်
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              ဖိုင်အရွယ်အစား: {Math.round(videoFile.size / 1024 / 1024)} MB
            </p>
          </div>
          <Button
            onClick={extractAndSplitAudio}
            className="gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
          >
            <Music className="h-4 w-4" />
            Audio ထုတ်ယူပါ
          </Button>
        </motion.div>
      )}

      {status === "unsupported" && (
        <div className="p-6 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
          <p className="text-sm text-amber-600">{progressMessage}</p>
        </div>
      )}

      {(status === "loading" || status === "extracting" || status === "splitting") && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-6 rounded-xl border border-primary/30 bg-primary/5 space-y-4"
        >
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
          <div className="text-center">
            <h3 className="font-semibold">Audio Processing...</h3>
            <p className="text-sm text-muted-foreground">{progressMessage}</p>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-center text-muted-foreground">{progress}%</p>
        </motion.div>
      )}

      {status === "completed" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-6 rounded-xl border border-green-500/30 bg-green-500/5 text-center space-y-3"
        >
          <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
          <h3 className="font-semibold text-green-600">Audio Chunks Ready!</h3>
          <p className="text-sm text-muted-foreground">
            {chunks.length} chunks ဖန်တီးပြီးပါပြီ
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {chunks.map((chunk) => (
              <span key={chunk.index} className="px-2 py-1 rounded bg-muted text-xs">
                Chunk {chunk.index + 1}: {Math.round(chunk.duration / 60)}m
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {status === "error" && (
        <div className="p-6 rounded-xl border border-destructive/30 bg-destructive/5 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm text-destructive">{progressMessage}</p>
          <Button variant="outline" size="sm" onClick={() => setStatus("idle")}>
            ပြန်ကြိုးစားပါ
          </Button>
        </div>
      )}
    </div>
  );
}

// Export types for use elsewhere
export type { AudioChunk };
