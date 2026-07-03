import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Upload, X, Image as ImageIcon, Loader2, RefreshCw } from 'lucide-react';

interface ThumbnailUploaderProps {
  value: string;
  onChange: (url: string) => void;
  onDelete?: (url: string) => void;
  bucket?: string;
  maxSizeMB?: number;
}

export const ThumbnailUploader = ({
  value,
  onChange,
  onDelete,
  bucket = 'post-thumbnails',
  maxSizeMB = 2,
}: ThumbnailUploaderProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  const validateFile = (file: File): string | null => {
    if (!allowedTypes.includes(file.type)) {
      return 'Invalid file type. Only JPG, PNG, WebP, and GIF are allowed.';
    }
    if (file.size > maxSizeBytes) {
      return `File size exceeds ${maxSizeMB}MB limit.`;
    }
    return null;
  };

  const uploadFile = async (file: File) => {
    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 100);

      const { data, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      clearInterval(progressInterval);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      setUploadProgress(100);
      onChange(publicUrl);
      toast.success('Thumbnail uploaded successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload thumbnail');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDelete = async () => {
    if (!value) return;

    try {
      // Extract file path from URL
      const url = new URL(value);
      const pathParts = url.pathname.split('/');
      const bucketIndex = pathParts.indexOf(bucket);
      if (bucketIndex !== -1) {
        const filePath = pathParts.slice(bucketIndex + 1).join('/');
        
        const { error } = await supabase.storage
          .from(bucket)
          .remove([filePath]);

        if (error) throw error;
      }

      onDelete?.(value);
      onChange('');
      toast.success('Thumbnail deleted');
    } catch (err: any) {
      // Even if storage delete fails, clear the URL
      onChange('');
      toast.success('Thumbnail removed');
    }
  };

  const handleReplace = () => {
    fileInputRef.current?.click();
  };

  // Has image view
  if (value) {
    return (
      <div className="space-y-2">
        <div className="relative group rounded-xl overflow-hidden border border-border/60 bg-muted/30 aspect-video">
          <img
            src={value}
            alt="Thumbnail preview"
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/placeholder.svg';
            }}
          />
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleReplace}
              disabled={isUploading}
              className="bg-background/80 hover:bg-background"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Change
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={isUploading}
            >
              <X className="h-4 w-4 mr-1.5" />
              Delete
            </Button>
          </div>
          {/* Upload progress overlay */}
          {isUploading && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
              <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="text-xs text-white">{uploadProgress}%</span>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    );
  }

  // Empty state - dropzone
  return (
    <div className="space-y-2">
      <div
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 p-6 aspect-video",
          "border-2 border-dashed rounded-xl cursor-pointer transition-all",
          "bg-muted/20 hover:bg-muted/40 hover:border-primary/40",
          isDragging && "border-primary bg-primary/10 scale-[1.02]",
          isUploading && "pointer-events-none opacity-70"
        )}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground">Uploading... {uploadProgress}%</span>
          </>
        ) : (
          <>
            <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              {isDragging ? (
                <Upload className="h-6 w-6 text-primary" />
              ) : (
                <ImageIcon className="h-6 w-6 text-primary" />
              )}
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {isDragging ? 'Drop image here' : 'Drag & drop image'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                or click to browse · Max {maxSizeMB}MB
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              JPG, PNG, WebP, GIF
            </p>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};
