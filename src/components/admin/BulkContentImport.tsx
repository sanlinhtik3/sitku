import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BulkContentImportProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export const BulkContentImport = ({ open, onClose, onComplete }: BulkContentImportProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });
  const [category, setCategory] = useState("uncategorized");
  const [language, setLanguage] = useState("burmese");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(file => 
        file.type === "text/plain" || 
        file.type === "text/markdown" || 
        file.name.endsWith(".md") ||
        file.name.endsWith(".txt")
      );
      setFiles(selectedFiles);
    }
  };

  const extractTitle = (content: string): string => {
    // Try to find first heading
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) return headingMatch[1].trim();

    // Try first line if it's short
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.length < 100 && firstLine.length > 0) {
      return firstLine.replace(/^#+\s*/, '').trim();
    }

    // Generate from first 50 chars
    return content.substring(0, 50).trim() + '...';
  };

  const extractTags = (content: string): string[] => {
    // Extract hashtags or keywords
    const hashtags = content.match(/#[\w]+/g) || [];
    return hashtags.map(tag => tag.substring(1)).slice(0, 5);
  };

  const handleImport = async () => {
    if (files.length === 0) {
      toast.error("Please select files to import");
      return;
    }

    setImporting(true);
    setProgress(0);
    setResults({ success: 0, failed: 0 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("You must be logged in");
      setImporting(false);
      return;
    }

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const content = await file.text();
        const title = extractTitle(content);
        const tags = extractTags(content);

        const { error } = await supabase
          .from("ai_generated_content")
          .insert({
            user_id: user.id,
            title,
            content,
            category,
            language,
            tags: tags.length > 0 ? tags : null,
            is_template: false,
          });

        if (error) throw error;
        successCount++;
      } catch (error) {
        console.error(`Failed to import ${file.name}:`, error);
        failedCount++;
      }

      setProgress(((i + 1) / files.length) * 100);
      setResults({ success: successCount, failed: failedCount });
    }

    setImporting(false);
    toast.success(`Imported ${successCount} files successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`);
    
    if (successCount > 0) {
      onComplete();
      setTimeout(() => {
        onClose();
        setFiles([]);
        setResults({ success: 0, failed: 0 });
        setProgress(0);
      }, 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Bulk Content Import
          </DialogTitle>
          <DialogDescription>
            Upload multiple markdown (.md) or text (.txt) files to quickly build your knowledge base
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Default Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uncategorized">Uncategorized</SelectItem>
                  <SelectItem value="blog">Blog</SelectItem>
                  <SelectItem value="social">Social Media</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="product">Product</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="burmese">Burmese</SelectItem>
                  <SelectItem value="english">English</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Input
              type="file"
              multiple
              accept=".md,.txt,text/markdown,text/plain"
              onChange={handleFileChange}
              className="hidden"
              id="bulk-upload"
              disabled={importing}
            />
            <label htmlFor="bulk-upload" className="cursor-pointer">
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {files.length === 0 ? "Click to select files" : `${files.length} files selected`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Markdown (.md) or Text (.txt) files only
                </p>
              </div>
            </label>
          </div>

          {files.length > 0 && (
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              ))}
            </div>
          )}

          {importing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Importing...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  {results.success} succeeded
                </span>
                {results.failed > 0 && (
                  <span className="flex items-center gap-1 text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    {results.failed} failed
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={importing}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={files.length === 0 || importing}>
              <Upload className="h-4 w-4 mr-2" />
              Import {files.length} {files.length === 1 ? 'File' : 'Files'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
