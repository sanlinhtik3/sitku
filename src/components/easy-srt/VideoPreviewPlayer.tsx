import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Play, Pause, Volume2, VolumeX, Maximize2, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { SubtitleStyle, DEFAULT_STYLE } from "@/hooks/useSubtitleStyles";

interface SubtitleSegment {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
  originalText?: string; // For multi-language support
}

interface TimedWord {
  word: string;
  startTime: number;
  endTime: number;
}

interface VideoPreviewPlayerProps {
  videoUrl: string;
  srtContent: string | null;
  originalSrtContent?: string | null; // Original language SRT for dual subtitles
  subtitleStyle?: SubtitleStyle;
  className?: string;
}

// Parse SRT content to subtitle segments
function parseSRT(srtContent: string): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  const blocks = srtContent.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;

    const index = parseInt(lines[0], 10);
    const timecodeMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
    );

    if (!timecodeMatch) continue;

    const startTime =
      parseInt(timecodeMatch[1]) * 3600 +
      parseInt(timecodeMatch[2]) * 60 +
      parseInt(timecodeMatch[3]) +
      parseInt(timecodeMatch[4]) / 1000;

    const endTime =
      parseInt(timecodeMatch[5]) * 3600 +
      parseInt(timecodeMatch[6]) * 60 +
      parseInt(timecodeMatch[7]) +
      parseInt(timecodeMatch[8]) / 1000;

    const text = lines.slice(2).join("\n");

    segments.push({ index, startTime, endTime, text });
  }

  return segments;
}

// Improved word timing algorithm - weight by character length
function parseWordsWithTiming(segment: SubtitleSegment): TimedWord[] {
  const words = segment.text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  
  const duration = segment.endTime - segment.startTime;
  
  // Weight words by length (longer words get more time)
  const totalChars = words.reduce((sum, w) => sum + w.length, 0);
  let currentTime = segment.startTime;
  
  return words.map((word) => {
    const wordRatio = totalChars > 0 ? word.length / totalChars : 1 / words.length;
    const wordDuration = duration * wordRatio;
    const result = {
      word,
      startTime: currentTime,
      endTime: currentTime + wordDuration,
    };
    currentTime += wordDuration;
    return result;
  });
}

// Format time for display
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function VideoPreviewPlayer({ 
  videoUrl, 
  srtContent, 
  originalSrtContent,
  subtitleStyle = DEFAULT_STYLE,
  className 
}: VideoPreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSubtitle, setCurrentSubtitle] = useState<SubtitleSegment | null>(null);
  const [currentOriginalSubtitle, setCurrentOriginalSubtitle] = useState<SubtitleSegment | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
  const [originalSubtitles, setOriginalSubtitles] = useState<SubtitleSegment[]>([]);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Reset states when URL changes
  useEffect(() => {
    setIsVideoReady(false);
    setVideoError(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [videoUrl]);

  // Check video ready state on mount/URL change (handles cached videos)
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      // If video is already loaded (e.g., from cache)
      if (video.readyState >= 3) {
        setIsVideoReady(true);
        setDuration(video.duration);
      }
    }
  }, [videoUrl]);

  // Parse subtitles when SRT content changes
  useEffect(() => {
    if (srtContent) {
      const parsed = parseSRT(srtContent);
      setSubtitles(parsed);
    }
  }, [srtContent]);

  // Parse original subtitles when provided
  useEffect(() => {
    if (originalSrtContent) {
      const parsed = parseSRT(originalSrtContent);
      setOriginalSubtitles(parsed);
    }
  }, [originalSrtContent]);

  // Update current subtitle based on video time
  useEffect(() => {
    const activeSubtitle = subtitles.find(
      (sub) => currentTime >= sub.startTime && currentTime <= sub.endTime
    );
    setCurrentSubtitle(activeSubtitle || null);

    // Find matching original subtitle
    if (subtitleStyle.show_original && originalSubtitles.length > 0) {
      const activeOriginal = originalSubtitles.find(
        (sub) => currentTime >= sub.startTime && currentTime <= sub.endTime
      );
      setCurrentOriginalSubtitle(activeOriginal || null);
    }
  }, [currentTime, subtitles, originalSubtitles, subtitleStyle.show_original]);

  // Handle video time update (standard ~4Hz)
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  // RAF-based high-frequency time tracking for smooth word highlighting
  useEffect(() => {
    if (!subtitleStyle.word_highlight_enabled || !isPlaying) return;
    
    let animationId: number;
    const updateTime = () => {
      if (videoRef.current && !videoRef.current.paused) {
        setCurrentTime(videoRef.current.currentTime);
      }
      animationId = requestAnimationFrame(updateTime);
    };
    animationId = requestAnimationFrame(updateTime);
    
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, subtitleStyle.word_highlight_enabled]);

  // Handle video loaded
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsVideoReady(true);
      setVideoError(null);
    }
  }, []);

  // Handle video error
  const handleVideoError = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    console.error("Video error:", e);
    setVideoError("Video ကို load လုပ်၍ မရပါ");
    setIsVideoReady(false);
  }, []);

  // Handle video can play
  const handleCanPlay = useCallback(() => {
    setIsVideoReady(true);
    setVideoError(null);
  }, []);

  // Play/Pause toggle with robust error handling
  const togglePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      console.error("Video ref not available");
      return;
    }

    // Ensure video source is loaded
    if (!video.src || video.src === "") {
      console.error("No video source");
      setVideoError("Video source မရှိပါ");
      return;
    }

    try {
      if (video.paused || video.ended) {
        // Reset if ended
        if (video.ended) {
          video.currentTime = 0;
        }
        await video.play();
      } else {
        video.pause();
      }
    } catch (error) {
      console.error("Video play error:", error);
      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          setVideoError("Autoplay ခွင့်မပြုထားပါ။ Play button ကိုနှိပ်ပါ။");
        } else if (error.name === "NotSupportedError") {
          setVideoError("Video format ကို support မလုပ်ပါ");
        } else {
          setVideoError("Video play လုပ်၍ မရပါ");
        }
      }
    }
  }, []); // Remove isPlaying dependency - use video.paused instead

  // Mute toggle
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // Seek video
  const handleSeek = useCallback((value: number[]) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  }, []);

  // Skip forward/backward
  const skip = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(
        0,
        Math.min(duration, videoRef.current.currentTime + seconds)
      );
    }
  }, [duration]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    }
  }, []);

  // Auto-hide controls
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isPlaying && showControls) {
      timeout = setTimeout(() => setShowControls(false), 3000);
    }
    return () => clearTimeout(timeout);
  }, [isPlaying, showControls]);

  // Get subtitle container styles using X/Y positioning
  const getSubtitleContainerStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {
      position: "absolute",
      display: "flex",
      flexDirection: "column",
      alignItems: subtitleStyle.text_alignment === "left" ? "flex-start" : 
                  subtitleStyle.text_alignment === "right" ? "flex-end" : "center",
      padding: "0 16px",
      left: `${subtitleStyle.position_x}%`,
      top: `${subtitleStyle.position_y}%`,
      transform: "translate(-50%, -50%)",
      maxWidth: "90%",
      pointerEvents: "none",
    };

    return style;
  };

  // Get subtitle text styles
  const getSubtitleTextStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {
      fontFamily: subtitleStyle.font_family,
      fontSize: `${subtitleStyle.font_size}px`,
      fontWeight: subtitleStyle.font_weight === "bold" ? "bold" : "normal",
      color: subtitleStyle.text_color,
      backgroundColor: subtitleStyle.background_color,
      padding: `8px ${subtitleStyle.horizontal_padding}px`,
      borderRadius: "8px",
      textAlign: subtitleStyle.text_alignment || "center",
      maxWidth: "100%",
    };

    if (subtitleStyle.outline_width > 0) {
      style.textShadow = `
        -${subtitleStyle.outline_width}px -${subtitleStyle.outline_width}px 0 ${subtitleStyle.outline_color},
        ${subtitleStyle.outline_width}px -${subtitleStyle.outline_width}px 0 ${subtitleStyle.outline_color},
        -${subtitleStyle.outline_width}px ${subtitleStyle.outline_width}px 0 ${subtitleStyle.outline_color},
        ${subtitleStyle.outline_width}px ${subtitleStyle.outline_width}px 0 ${subtitleStyle.outline_color}
      `;
    }

    if (subtitleStyle.shadow_enabled) {
      style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    }

    return style;
  };

  // Get original subtitle text styles
  const getOriginalSubtitleStyle = (): React.CSSProperties => {
    return {
      fontFamily: subtitleStyle.font_family,
      fontSize: `${subtitleStyle.original_font_size}px`,
      fontWeight: "normal",
      color: subtitleStyle.original_text_color,
      backgroundColor: `rgba(0,0,0,${subtitleStyle.original_opacity})`,
      padding: `6px ${subtitleStyle.horizontal_padding}px`,
      borderRadius: "6px",
      textAlign: subtitleStyle.text_alignment || "center",
      opacity: subtitleStyle.original_opacity,
      maxWidth: "100%",
    };
  };

  // Render subtitle with enhanced word highlighting (TikTok/CapCut style)
  const renderSubtitleText = () => {
    if (!currentSubtitle) return null;

    if (!subtitleStyle.word_highlight_enabled) {
      return <span>{currentSubtitle.text}</span>;
    }

    // Word-by-word highlighting with improved timing and effects
    const timedWords = parseWordsWithTiming(currentSubtitle);

    return (
      <>
        {timedWords.map((tw, i) => {
          const isActive = currentTime >= tw.startTime && currentTime < tw.endTime;
          const isPast = currentTime >= tw.endTime;

          return (
            <span
              key={i}
              style={{
                color: isActive 
                  ? subtitleStyle.word_highlight_color 
                  : isPast 
                    ? subtitleStyle.word_highlight_color 
                    : subtitleStyle.text_color,
                transform: isActive ? "scale(1.1)" : "scale(1)",
                textShadow: isActive 
                  ? `0 0 10px ${subtitleStyle.word_highlight_color}, 0 0 20px ${subtitleStyle.word_highlight_color}40` 
                  : "none",
                transition: "all 0.15s ease-out",
                fontWeight: isActive ? "bold" : subtitleStyle.font_weight === "bold" ? "bold" : "normal",
                display: "inline-block",
              }}
            >
              {tw.word}
              {i < timedWords.length - 1 ? " " : ""}
            </span>
          );
        })}
      </>
    );
  };

  // Get animation props based on style
  const getAnimationProps = () => {
    switch (subtitleStyle.animation_type) {
      case "slide":
        return {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: -20 },
        };
      case "none":
        return {
          initial: { opacity: 1 },
          animate: { opacity: 1 },
          exit: { opacity: 1 },
        };
      case "fade":
      default:
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
        };
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative rounded-xl overflow-hidden bg-black group",
        className
      )}
      onMouseMove={() => setShowControls(true)}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-contain cursor-pointer"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={handleCanPlay}
        onCanPlay={handleCanPlay}
        onCanPlayThrough={handleCanPlay}
        onError={handleVideoError}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onClick={togglePlay}
        playsInline
        preload="auto"
        crossOrigin="anonymous"
      />

      {/* Loading/Error State */}
      {!isVideoReady && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
        </div>
      )}

      {videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center text-white p-4">
            <p className="text-red-400 mb-2">{videoError}</p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setVideoError(null);
                if (videoRef.current) {
                  videoRef.current.load();
                }
              }}
            >
              ပြန်ကြိုးစားပါ
            </Button>
          </div>
        </div>
      )}

      {/* Subtitle Overlay with X/Y positioning */}
      {(currentSubtitle || (subtitleStyle.show_original && currentOriginalSubtitle)) && (
        <motion.div
          key={currentSubtitle?.index || currentOriginalSubtitle?.index}
          {...getAnimationProps()}
          style={getSubtitleContainerStyle()}
        >
          {/* Original subtitle (if enabled and position is top) */}
          {subtitleStyle.show_original && currentOriginalSubtitle && subtitleStyle.original_position === "top" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={getOriginalSubtitleStyle()}
              className="mb-2"
            >
              <p className="leading-relaxed">{currentOriginalSubtitle.text}</p>
            </motion.div>
          )}

          {/* Translated subtitle */}
          {currentSubtitle && (
            <div style={getSubtitleTextStyle()}>
              <p className="leading-relaxed">
                {renderSubtitleText()}
              </p>
            </div>
          )}

          {/* Original subtitle (if enabled and position is bottom) */}
          {subtitleStyle.show_original && currentOriginalSubtitle && subtitleStyle.original_position === "bottom" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={getOriginalSubtitleStyle()}
              className="mt-2"
            >
              <p className="leading-relaxed">{currentOriginalSubtitle.text}</p>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Controls Overlay */}
      <motion.div
        initial={false}
        animate={{ opacity: showControls ? 1 : 0 }}
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 transition-opacity",
          !showControls && "pointer-events-none"
        )}
      >
        {/* Center Play Button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Button
            size="lg"
            variant="ghost"
            onClick={togglePlay}
            className="h-16 w-16 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white"
          >
            {isPlaying ? (
              <Pause className="h-8 w-8" />
            ) : (
              <Play className="h-8 w-8 ml-1" />
            )}
          </Button>
        </div>

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
          {/* Progress Bar */}
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            className="w-full cursor-pointer"
          />

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={togglePlay}
                className="h-8 w-8 text-white hover:bg-white/20"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>

              <Button
                size="icon"
                variant="ghost"
                onClick={() => skip(-10)}
                className="h-8 w-8 text-white hover:bg-white/20"
              >
                <SkipBack className="h-4 w-4" />
              </Button>

              <Button
                size="icon"
                variant="ghost"
                onClick={() => skip(10)}
                className="h-8 w-8 text-white hover:bg-white/20"
              >
                <SkipForward className="h-4 w-4" />
              </Button>

              <Button
                size="icon"
                variant="ghost"
                onClick={toggleMute}
                className="h-8 w-8 text-white hover:bg-white/20"
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>

              <span className="text-white text-sm font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleFullscreen}
                className="h-8 w-8 text-white hover:bg-white/20"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
