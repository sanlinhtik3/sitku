import React, { memo, useState, useCallback, useEffect, useRef } from "react";
import { Download, Copy, RefreshCw, Sparkles, ImageOff, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const MAX_RETRIES = 2;

interface GeneratedImageCardProps {
  imageUrl: string;
  description?: string;
  modelUsed?: string;
  prompt?: string;
  aspectRatio?: string;
  onRegenerate?: () => void;
  className?: string;
}

export const GeneratedImageCard = memo(function GeneratedImageCard({
  imageUrl,
  description,
  modelUsed,
  prompt,
  aspectRatio,
  onRegenerate,
  className,
}: GeneratedImageCardProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const [isInView, setIsInView] = useState(false);
  const blobRef = useRef<Blob | null>(null);
  const prevObjectUrlRef = useRef<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver: only fetch when card enters viewport
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px", threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch-to-blob only when in view
  useEffect(() => {
    if (!isInView || !imageUrl) return;

    let cancelled = false;
    setIsLoaded(false);
    setHasError(false);
    setImgSrc(null);

    const fetchUrl = retryCount > 0
      ? `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}_t=${Date.now()}`
      : imageUrl;

    fetch(fetchUrl)
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        if (prevObjectUrlRef.current) URL.revokeObjectURL(prevObjectUrlRef.current);
        const objectUrl = URL.createObjectURL(blob);
        prevObjectUrlRef.current = objectUrl;
        blobRef.current = blob;

        // Probe natural dimensions
        const probe = new Image();
        probe.onload = () => {
          if (!cancelled && probe.naturalWidth && probe.naturalHeight) {
            setNaturalAspect(probe.naturalWidth / probe.naturalHeight);
          }
        };
        probe.src = objectUrl;

        setImgSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      });

    return () => { cancelled = true; };
  }, [imageUrl, retryCount, isInView]);

  // Cleanup ObjectURL on unmount
  useEffect(() => {
    return () => {
      if (prevObjectUrlRef.current) URL.revokeObjectURL(prevObjectUrlRef.current);
    };
  }, []);

  const handleRetry = useCallback(() => {
    if (retryCount >= MAX_RETRIES) return;
    setRetryCount((c) => c + 1);
  }, [retryCount]);

  const handleDownload = async () => {
    try {
      const blob = blobRef.current || await fetch(imageUrl).then((r) => r.blob());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `beebot_image_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Image downloaded!");
    } catch {
      toast.error("Download failed");
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(imageUrl);
    toast.success("Image URL copied!");
  };

  // Dynamic aspect style from detected dimensions
  const aspectStyle: React.CSSProperties = naturalAspect
    ? { aspectRatio: `${naturalAspect}` }
    : { aspectRatio: "16 / 9" }; // default skeleton shape

  if (hasError) {
    const canRetry = retryCount < MAX_RETRIES;
    const showRegenerate = !canRetry && !!onRegenerate;

    return (
      <div ref={cardRef} className={cn(
        "rounded-[var(--glass-radius-card)] border border-destructive/30 bg-destructive/5 p-4 flex flex-col items-center gap-2 max-w-[400px]",
        className
      )}>
        <ImageOff className="h-8 w-8 text-destructive/60" />
        <p className="text-xs text-destructive/80">Image failed to load</p>
        <div className="flex items-center gap-2">
          {canRetry && (
            <button onClick={handleRetry} className="text-xs text-primary hover:underline flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Retry ({retryCount + 1}/{MAX_RETRIES})
            </button>
          )}
          {showRegenerate && (
            <button onClick={onRegenerate} className="text-xs text-primary hover:underline flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Regenerate
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={cardRef} className={cn(
        "rounded-[var(--glass-radius-card)] border border-border/20 bg-card/30 backdrop-blur-sm overflow-hidden max-w-[400px] w-full",
        className
      )}>
        {/* Image container with dynamic aspect ratio */}
        <button
          onClick={() => setIsFullscreen(true)}
          className="relative w-full cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-t-[var(--glass-radius-card)] overflow-hidden"
          style={aspectStyle}
        >
          {!isLoaded && (
            <Skeleton className="absolute inset-0 rounded-none" />
          )}
          {imgSrc && (
            <img
              src={imgSrc}
              alt={description || "AI Generated Image"}
              className={cn(
                "w-full h-full object-contain transition-opacity duration-300",
                isLoaded ? "opacity-100" : "opacity-0"
              )}
              onLoad={() => setIsLoaded(true)}
              onError={() => setHasError(true)}
            />
          )}
        </button>

        {/* Footer */}
        <div className="p-2.5 space-y-2">
          {modelUsed && (
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-primary/70" />
              <span className="text-[10px] font-medium text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-full">
                {modelUsed}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <button onClick={handleDownload} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50">
              <Download className="h-3 w-3" /> Download
            </button>
            <button onClick={handleCopyUrl} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50">
              <Copy className="h-3 w-3" /> Copy URL
            </button>
            {onRegenerate && (
              <button onClick={onRegenerate} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50">
                <RefreshCw className="h-3 w-3" /> Regenerate
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen lightbox */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent aria-describedby={undefined} className="max-w-4xl max-h-[90vh] p-2 bg-black/95 border-white/10">
          <DialogTitle className="sr-only">Full size image preview</DialogTitle>
          {imgSrc && (
            <img
              src={imgSrc}
              alt={description || "AI Generated Image"}
              className="w-full h-full object-contain rounded-glass-control"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
});
