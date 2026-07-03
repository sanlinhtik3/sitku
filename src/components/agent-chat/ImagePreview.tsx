import { X, FileImage, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ImageAttachment {
  id: string;
  file: File;
  preview: string;
  uploading?: boolean;
}

interface ImagePreviewProps {
  images: ImageAttachment[];
  onRemove: (id: string) => void;
  disabled?: boolean;
}

function isPdf(file: File) {
  return file.type === 'application/pdf';
}

export function ImagePreview({ images, onRemove, disabled }: ImagePreviewProps) {
  if (images.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-2 bg-card/30 backdrop-blur-sm rounded-xl border border-white/[0.06]">
      {images.map((img) => (
        <div
          key={img.id}
          className={cn(
            "relative group overflow-hidden border border-white/[0.06]",
            "bg-gradient-to-br from-muted/50 to-muted/30",
            img.uploading && "opacity-50",
            isPdf(img.file) ? "rounded-xl px-3 py-2 flex items-center gap-2 h-14" : "w-16 h-16 rounded-xl"
          )}
        >
          {isPdf(img.file) ? (
            <>
              <FileText className="h-6 w-6 text-red-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-foreground truncate max-w-[120px]">{img.file.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatFileSize(img.file.size)}</p>
              </div>
            </>
          ) : (
            <>
              <img src={img.preview} alt="Preview" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                <div className="flex items-center gap-1">
                  <FileImage className="h-2.5 w-2.5 text-white/80" />
                  <span className="text-[8px] text-white/80 truncate">{formatFileSize(img.file.size)}</span>
                </div>
              </div>
            </>
          )}
          
          {img.uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          )}
          
          {!disabled && !img.uploading && (
            <Button
              variant="destructive"
              size="icon"
              className={cn(
                "absolute -top-1 -right-1 h-5 w-5 rounded-full",
                "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity",
                "shadow-lg"
              )}
              onClick={() => onRemove(img.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
