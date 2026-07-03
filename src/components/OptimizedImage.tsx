import { useState, useRef, useEffect, memo } from "react";
import { cn } from "@/lib/utils";
import { ImageOff } from "lucide-react";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  loading?: "lazy" | "eager";
  priority?: boolean;
  placeholder?: "blur" | "empty";
  blurDataURL?: string;
  onLoadComplete?: () => void;
}

const OptimizedImageComponent = ({
  src,
  alt,
  className,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  loading = "lazy",
  priority = false,
  placeholder = "empty",
  blurDataURL,
  onLoadComplete,
}: OptimizedImageProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef<HTMLImageElement>(null);

  // IntersectionObserver for lazy loading
  useEffect(() => {
    if (priority || loading === "eager") {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: "50px 0px", // Start loading 50px before entering viewport
        threshold: 0.01,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [priority, loading]);

  // Generate srcset for responsive images
  const generateSrcSet = (url: string) => {
    if (!url) return undefined;
    
    // Only generate for known image CDNs that support query params
    if (url.includes('unsplash.com') || url.includes('cloudinary.com') || url.includes('imgix.net')) {
      return `${url}?w=320 320w, ${url}?w=640 640w, ${url}?w=1024 1024w, ${url}?w=1920 1920w`;
    }
    
    return undefined;
  };

  const handleLoad = () => {
    setIsLoading(false);
    onLoadComplete?.();
  };

  const handleError = () => {
    setIsLoading(false);
    setError(true);
  };

  if (error) {
    return (
      <div className={cn("bg-muted/50 flex items-center justify-center", className)}>
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <ImageOff className="h-6 w-6 opacity-50" />
          <span className="text-xs">No preview</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={imgRef} className={cn("relative overflow-hidden", className)}>
      {/* Blur placeholder */}
      {placeholder === "blur" && blurDataURL && isLoading && (
        <img
          src={blurDataURL}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover filter blur-lg scale-110"
        />
      )}
      
      {/* Loading skeleton */}
      {isLoading && placeholder === "empty" && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}

      {/* Main image */}
      {isInView && (
        <img
          src={src}
          srcSet={generateSrcSet(src)}
          sizes={sizes}
          alt={alt}
          loading={priority ? "eager" : loading}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          referrerPolicy="no-referrer"
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            isLoading ? "opacity-0" : "opacity-100"
          )}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const OptimizedImage = memo(OptimizedImageComponent);
