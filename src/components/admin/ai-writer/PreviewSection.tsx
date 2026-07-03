import { memo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Save, BookOpen, Sparkles } from "lucide-react";
import { MarkdownContent } from "@/components/lesson/MarkdownContent";

interface PreviewSectionProps {
  loading: boolean;
  generatedContent: string;
  onCopy: () => void;
  onDownload: () => void;
  onSave: () => void;
}

export const PreviewSection = memo(({ 
  loading,
  generatedContent, 
  onCopy, 
  onDownload, 
  onSave 
}: PreviewSectionProps) => {
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (previewRef.current && generatedContent) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight;
    }
  }, [generatedContent]);

  return (
    <div className="bg-card/10 backdrop-blur-sm rounded-2xl border border-border/20 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/20">
        <h3 className="text-sm font-medium text-foreground/80">Preview</h3>
      </div>

      {/* Content */}
      <div 
        ref={previewRef}
        className="min-h-[200px] max-h-[400px] sm:max-h-[450px] lg:max-h-[500px] overflow-y-auto scroll-smooth px-4 py-4"
        role="region"
        aria-label="Generated content preview"
        aria-live="polite"
      >
        {loading && !generatedContent && (
          <div className="flex items-center gap-2 text-muted-foreground" role="status" aria-label="AI is generating content">
            <div className="flex gap-1" aria-hidden="true">
              <span className="w-2 h-2 bg-primary rounded-full animate-[pulse_1.4s_ease-in-out_infinite]" />
              <span className="w-2 h-2 bg-primary rounded-full animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
              <span className="w-2 h-2 bg-primary rounded-full animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
            </div>
            <span className="text-sm">AI is writing...</span>
          </div>
        )}
        {generatedContent ? (
          <div className="max-w-full overflow-hidden break-words">
            <MarkdownContent content={generatedContent} />
            {loading && (
              <div className="flex items-center gap-2 mt-4 text-muted-foreground" role="status" aria-hidden="true">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-primary rounded-full animate-[pulse_1.4s_ease-in-out_infinite]" />
                  <span className="w-2 h-2 bg-primary rounded-full animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                  <span className="w-2 h-2 bg-primary rounded-full animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2 mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-border/20">
              <Button 
                onClick={onCopy} 
                variant="outline" 
                size="sm" 
                className="flex-1 h-9 text-xs rounded-xl border-border/30 hover:bg-primary/10 hover:border-primary/40 transition-all"
                aria-label="Copy content to clipboard"
              >
                <Copy className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Copy
              </Button>
              <Button 
                onClick={onDownload} 
                variant="outline" 
                size="sm" 
                className="flex-1 h-9 text-xs rounded-xl border-border/30 hover:bg-primary/10 hover:border-primary/40 transition-all"
                aria-label="Download content as markdown file"
              >
                <Save className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Download
              </Button>
              <Button 
                onClick={onSave} 
                size="sm" 
                className="flex-1 h-9 text-xs rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-300"
                aria-label="Save content to library"
              >
                <BookOpen className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Save to Library
              </Button>
            </div>
          </div>
        ) : !loading ? (
          <div className="text-center py-12">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-500/20 via-indigo-500/20 to-purple-600/20 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="h-8 w-8 text-primary/40" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground/60">Your generated content will appear here</p>
            <p className="text-[10px] text-muted-foreground/40 mt-1">Write a prompt and click Generate</p>
          </div>
        ) : null}
      </div>
    </div>
  );
});

PreviewSection.displayName = "PreviewSection";
