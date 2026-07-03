import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, Eye } from "lucide-react";
import * as tus from "tus-js-client";
import { Progress } from "@/components/ui/progress";

interface Section {
  id: string;
  title: string;
  order_index: number;
}

interface LessonUploadFlowProps {
  courseId: string;
  sections: Section[];
  onComplete: () => void;
  onCancel: () => void;
}

export const LessonUploadFlow = ({ courseId, sections, onComplete, onCancel }: LessonUploadFlowProps) => {
  // Stage 1: Upload
  const [stage, setStage] = useState<'upload' | 'details'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedVimeoId, setUploadedVimeoId] = useState<string | null>(null);
  const [upload, setUpload] = useState<tus.Upload | null>(null);
  
  // Stage 2: Details
  const [videoMetadata, setVideoMetadata] = useState<any>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    section_id: sections[0]?.id || '',
    is_locked: false,
    duration_minutes: 0,
    order_index: 0,
    is_published: true,
  });

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('video/')) {
      validateAndSetFile(droppedFile);
    } else {
      toast.error('Please drop a valid video file');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
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
    // Start upload immediately
    startUpload(selectedFile);
  };

  const cleanFilename = (filename: string): string => {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    const cleaned = nameWithoutExt.replace(/[_-]/g, ' ');
    return cleaned.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  const startUpload = async (fileToUpload: File) => {
    setUploading(true);
    setProgress(0);

    try {
      // Get upload link from our edge function
      const { data, error } = await supabase.functions.invoke('vimeo-operations', {
        body: {
          action: 'create-upload',
          fileSize: fileToUpload.size,
          fileName: fileToUpload.name,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to create upload');

      const { uploadLink, vimeoId, suggestedTitle } = data;
      
      // Set the suggested title immediately
      setFormData(prev => ({
        ...prev,
        title: suggestedTitle || cleanFilename(fileToUpload.name),
      }));

      // Create TUS upload using official Vimeo configuration
      const tusUpload = new tus.Upload(fileToUpload, {
        uploadUrl: uploadLink,
        uploadSize: fileToUpload.size,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        metadata: {
          filename: fileToUpload.name,
          filetype: fileToUpload.type,
        },
        headers: {
          'Tus-Resumable': '1.0.0',
          'Accept': 'application/vnd.vimeo.*+json;version=3.4',
        },
        onError: (error) => {
          console.error('TUS Upload failed:', error);
          toast.error('Upload failed: ' + error.message);
          setUploading(false);
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
          setProgress(percentage);
        },
        onSuccess: async () => {
          // Upload completed successfully
          toast.success('Video uploaded! Fetching metadata...');
          setUploadedVimeoId(vimeoId);
          setUploading(false);
          
          // Fetch metadata and transition to details stage
          await fetchMetadata(vimeoId);
          setStage('details');
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

  const fetchMetadata = async (vimeoId: string) => {
    setLoadingMetadata(true);
    try {
      const { data, error } = await supabase.functions.invoke('vimeo-operations', {
        body: {
          action: 'get-metadata',
          vimeoId,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to fetch metadata');

      setVideoMetadata(data);
      setFormData(prev => ({
        ...prev,
        duration_minutes: data.duration || 0,
      }));
    } catch (error) {
      console.error('Error fetching metadata:', error);
      toast.error('Failed to fetch video metadata');
    } finally {
      setLoadingMetadata(false);
    }
  };

  const handleSave = async (isDraft: boolean) => {
    if (!uploadedVimeoId) {
      toast.error('No video uploaded');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('lessons')
        .insert({
          course_id: courseId,
          title: formData.title,
          description: formData.description,
          section_id: formData.section_id,
          is_locked: formData.is_locked,
          duration_minutes: formData.duration_minutes,
          order_index: formData.order_index,
          video_platform: 'vimeo',
          vimeo_url: `https://vimeo.com/${uploadedVimeoId}`,
          thumbnail_url: videoMetadata?.thumbnail,
          is_published: !isDraft,
          slug: formData.title.toLowerCase().replace(/\s+/g, '-'),
        });

      if (error) throw error;

      toast.success(isDraft ? 'Lesson saved as draft!' : 'Lesson published successfully!');
      onComplete();
    } catch (error) {
      console.error('Error saving lesson:', error);
      toast.error('Failed to save lesson');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (uploadedVimeoId) {
      // Delete the uploaded video from Vimeo
      try {
        await supabase.functions.invoke('vimeo-operations', {
          body: {
            action: 'delete',
            vimeoId: uploadedVimeoId,
          },
        });
      } catch (error) {
        console.error('Error deleting video:', error);
      }
    }
    
    if (upload) {
      upload.abort();
    }
    
    onCancel();
  };

  if (stage === 'upload') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Upload Your Video</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Drag and drop your video file or click to browse
          </p>
        </div>

        {!file ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
          >
            <input
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
              id="video-upload-flow"
            />
            <label
              htmlFor="video-upload-flow"
              className="cursor-pointer flex flex-col items-center gap-4"
            >
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <div className="text-base font-medium mb-1">
                  Drop your video here, or click to browse
                </div>
                <div className="text-sm text-muted-foreground">
                  Supports MP4, MOV, AVI and more (Max 5GB)
                </div>
              </div>
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium mb-1">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>

            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Uploading to Vimeo...</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // Stage 2: Details & Preview
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Video Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Video Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMetadata ? (
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : videoMetadata?.isReady ? (
              <div className="aspect-video rounded-lg overflow-hidden">
                <iframe
                  src={`https://player.vimeo.com/video/${uploadedVimeoId}`}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Video is processing...
                </p>
              </div>
            )}
            {videoMetadata?.thumbnail && (
              <img src={videoMetadata.thumbnail} alt="Thumbnail" className="mt-4 rounded-lg w-full" />
            )}
          </CardContent>
        </Card>

        {/* Details Form */}
        <Card>
          <CardHeader>
            <CardTitle>Lesson Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter lesson title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter lesson description"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="section">Section</Label>
              <Select
                value={formData.section_id}
                onValueChange={(value) => setFormData({ ...formData, section_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                value={formData.duration_minutes}
                onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="order">Order</Label>
              <Input
                id="order"
                type="number"
                value={formData.order_index}
                onChange={(e) => setFormData({ ...formData, order_index: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="locked">Premium Only</Label>
              <Switch
                id="locked"
                checked={formData.is_locked}
                onCheckedChange={(checked) => setFormData({ ...formData, is_locked: checked })}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          onClick={() => handleSave(true)}
          disabled={saving || !formData.title}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save as Draft
        </Button>
        <Button
          onClick={() => handleSave(false)}
          disabled={saving || !formData.title}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
          Publish
        </Button>
      </div>
    </div>
  );
};