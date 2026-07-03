import { useState } from "react";
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload, X, Pause, Play } from "lucide-react";

interface VimeoUploaderProps {
  onUploadComplete: (vimeoId: string) => void;
  onCancel: () => void;
}

export const VimeoUploader = ({ onUploadComplete, onCancel }: VimeoUploaderProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [upload, setUpload] = useState<tus.Upload | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.type.startsWith('video/')) {
        toast.error('Please select a valid video file');
        return;
      }
      
      // Validate file size (max 5GB)
      const maxSize = 5 * 1024 * 1024 * 1024; // 5GB
      if (selectedFile.size > maxSize) {
        toast.error('File size must be less than 5GB');
        return;
      }
      
      setFile(selectedFile);
    }
  };

  const startUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      // Get upload link from our edge function
      const { data, error } = await supabase.functions.invoke('vimeo-operations', {
        body: {
          action: 'create-upload',
          fileSize: file.size,
          fileName: file.name,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to create upload');

      const { uploadLink, vimeoId } = data;

      // Create TUS upload
      const tusUpload = new tus.Upload(file, {
        uploadUrl: uploadLink,
        uploadSize: file.size,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        metadata: {
          filename: file.name,
          filetype: file.type,
        },
        headers: {
          'Tus-Resumable': '1.0.0',
          'Accept': 'application/vnd.vimeo.*+json;version=3.4',
        },
        onError: (error) => {
          console.error('TUS Upload failed:', {
            error: error.message,
            uploadUrl: uploadLink,
            fileSize: file.size,
            fileName: file.name,
          });
          toast.error('Upload failed: ' + error.message);
          setUploading(false);
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
          setProgress(percentage);
        },
        onSuccess: () => {
          console.log('Upload completed successfully');
          toast.success('Video uploaded successfully! Processing may take a few minutes.');
          setUploading(false);
          onUploadComplete(vimeoId);
        },
      });

      setUpload(tusUpload);
      tusUpload.start();
    } catch (error) {
      console.error('Error starting upload:', error);
      toast.error('Failed to start upload');
      setUploading(false);
    }
  };

  const handlePauseResume = () => {
    if (!upload) return;

    if (paused) {
      upload.start();
      setPaused(false);
      toast.info('Upload resumed');
    } else {
      upload.abort();
      setPaused(true);
      toast.info('Upload paused');
    }
  };

  const handleCancel = () => {
    if (upload) {
      upload.abort();
    }
    setFile(null);
    setUploading(false);
    setProgress(0);
    setPaused(false);
    onCancel();
  };

  return (
    <div className="space-y-4">
      {!file ? (
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <input
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
            id="video-upload"
          />
          <label
            htmlFor="video-upload"
            className="cursor-pointer flex flex-col items-center gap-2"
          >
            <Upload className="h-12 w-12 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              Click to select a video file
              <br />
              <span className="text-xs">Max size: 5GB</span>
            </div>
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
            {!uploading && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setFile(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Uploading...</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          <div className="flex gap-2">
            {!uploading ? (
              <>
                <Button onClick={startUpload} className="flex-1">
                  <Upload className="mr-2 h-4 w-4" />
                  Start Upload
                </Button>
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handlePauseResume}
                  className="flex-1"
                >
                  {paused ? (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="mr-2 h-4 w-4" />
                      Pause
                    </>
                  )}
                </Button>
                <Button variant="destructive" onClick={handleCancel}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
