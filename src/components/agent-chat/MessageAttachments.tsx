import React, { useState } from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Hook to fetch image via blob to bypass COEP
export function useBlobUrl(url: string | null) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const prevRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!url) return;
    let cancelled = false;

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        if (prevRef.current) URL.revokeObjectURL(prevRef.current);
        const objUrl = URL.createObjectURL(blob);
        prevRef.current = objUrl;
        setBlobUrl(objUrl);
      })
      .catch(() => {
        if (!cancelled) setBlobUrl(url);
      });

    return () => { cancelled = true; };
  }, [url]);

  React.useEffect(() => {
    return () => {
      if (prevRef.current) URL.revokeObjectURL(prevRef.current);
    };
  }, []);

  return blobUrl;
}

// Single attachment image with blob proxy
function AttachmentImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const blobUrl = useBlobUrl(src);
  if (!blobUrl) return <div className={cn("w-full h-full animate-pulse bg-muted rounded", className)} />;
  return <img src={blobUrl} alt={alt} className={className} loading="lazy" />;
}

// Component to display image and document attachments in user messages
export function MessageAttachments({ attachments }: { attachments: any[] }) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const selectedBlobUrl = useBlobUrl(selectedImage);

  const imageAttachments = attachments.filter(
    (att) => att.type === "image" && (att.url || att.base64 || att.storage_url),
  );
  
  const fileAttachments = attachments.filter(
    (att) => att.type === "file" || att.mime_type === "application/pdf",
  );

  if (imageAttachments.length === 0 && fileAttachments.length === 0) return null;

  return (
    <>
      {/* PDF/File attachments */}
      {fileAttachments.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {fileAttachments.map((att, idx) => (
            <div
              key={`file-${idx}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-muted/30"
            >
              <FileText className="h-5 w-5 text-red-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-foreground truncate">{att.file_name || 'Document'}</p>
                {att.size_bytes && (
                  <p className="text-[10px] text-muted-foreground">
                    {att.size_bytes < 1024 * 1024 
                      ? `${(att.size_bytes / 1024).toFixed(1)}KB` 
                      : `${(att.size_bytes / (1024 * 1024)).toFixed(1)}MB`}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image attachments */}
      {imageAttachments.length > 0 && (
        <div className={cn("flex flex-wrap gap-1.5", imageAttachments.length === 1 ? "max-w-[200px]" : "max-w-[280px]")}>
          {imageAttachments.map((att, idx) => {
            const imageSrc =
              att.storage_url ||
              att.url ||
              (att.base64 ? `data:${att.mime_type || "image/jpeg"};base64,${att.base64}` : null);

            if (!imageSrc) return null;

            return (
              <button
                key={idx}
                onClick={() => setSelectedImage(imageSrc)}
                className={cn(
                  "relative rounded-lg overflow-hidden border border-white/20 hover:border-white/40 transition-all",
                  "focus:outline-none focus:ring-2 focus:ring-purple-500/50",
                  imageAttachments.length === 1 ? "w-full aspect-video" : "w-16 h-16",
                )}
              >
                <AttachmentImage src={imageSrc} alt={att.file_name || `Image ${idx + 1}`} className="w-full h-full object-cover" />
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-4xl max-h-[90vh] p-2 bg-black/95 border-white/10">
          <DialogTitle className="sr-only">Full size image preview</DialogTitle>
          {selectedBlobUrl && (
            <img src={selectedBlobUrl} alt="Full size" className="w-full h-full object-contain rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
