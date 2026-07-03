import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconUpload, IconFile } from "@tabler/icons-react";
import { CATEGORY_LABELS } from "./types";
import type { PromptFile } from "./types";

interface PromptUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Partial<PromptFile>) => void;
  isSubmitting?: boolean;
}

export function PromptUploadDialog({ 
  open, 
  onOpenChange, 
  onSubmit,
  isSubmitting 
}: PromptUploadDialogProps) {
  const [fileName, setFileName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("custom");
  const [fileType, setFileType] = useState<string>("static");
  const [description, setDescription] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.md')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setContent(text);
        setFileName(file.name);
        setDisplayName(file.name.replace('.md', ''));
      };
      reader.readAsText(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.md')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setContent(text);
        setFileName(file.name);
        setDisplayName(file.name.replace('.md', ''));
      };
      reader.readAsText(file);
    }
  };

  const handleSubmit = () => {
    if (!fileName || !content) return;
    
    onSubmit({
      file_name: fileName.endsWith('.md') ? fileName : `${fileName}.md`,
      display_name: displayName || fileName.replace('.md', ''),
      content,
      category: category as PromptFile['category'],
      file_type: fileType as PromptFile['file_type'],
      description: description || null,
    });

    // Reset form
    setFileName("");
    setDisplayName("");
    setContent("");
    setCategory("custom");
    setFileType("static");
    setDescription("");
  };

  const resetForm = () => {
    setFileName("");
    setDisplayName("");
    setContent("");
    setCategory("custom");
    setFileType("static");
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create / Upload Prompt File</DialogTitle>
          <DialogDescription>
            Create a new prompt file or upload an existing .md file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
              ${dragActive ? 'border-primary bg-primary/5' : 'border-border'}
            `}
          >
            <input
              type="file"
              accept=".md"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <IconUpload className="size-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag & drop a .md file or click to browse
            </p>
            {fileName && (
              <div className="mt-2 flex items-center justify-center gap-2 text-sm text-primary">
                <IconFile className="size-4" />
                {fileName}
              </div>
            )}
          </div>

          {/* Manual Input */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>File Name</Label>
              <Input
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="CUSTOM_PROMPT.md"
              />
            </div>
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Custom Prompt"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      {val.icon} {val.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={fileType} onValueChange={setFileType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="static">Static</SelectItem>
                  <SelectItem value="dynamic">Dynamic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this prompt file"
            />
          </div>

          <div className="space-y-2">
            <Label>Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Enter your prompt content in Markdown..."
              className="min-h-[200px] font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!fileName || !content || isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create File"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
