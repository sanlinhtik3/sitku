import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Download, FileText, FileType, Lightbulb, MessageSquareText, Copy, Check } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportAsMarkdown, exportAsPDF, exportAsWord } from "@/lib/exportUtils";
import { toast } from "sonner";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { calculateContentMetrics } from "@/lib/contentMetrics";
import { AIContentSuggestions } from "./content-library/AIContentSuggestions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeminiContentViewer } from "@/components/ui/GeminiContentViewer";

interface ContentViewDialogProps {
  content: any;
  open: boolean;
  onClose: () => void;
}

export const ContentViewDialog = ({ content, open, onClose }: ContentViewDialogProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleCopyContent = async () => {
    try {
      await navigator.clipboard.writeText(content.content);
      setIsCopied(true);
      toast.success('Content copied to clipboard');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy content');
    }
  };

  if (!content) return null;

  const handleExport = async (format: 'markdown' | 'pdf' | 'word') => {
    setIsExporting(true);
    try {
      const filename = content.title.trim() || 'content';

      switch (format) {
        case 'markdown':
          exportAsMarkdown(content.content, filename);
          toast.success('Exported as Markdown');
          break;
        case 'pdf':
          if (contentRef.current) {
            await exportAsPDF(contentRef.current, filename);
            toast.success('Exported as PDF');
          }
          break;
        case 'word':
          await exportAsWord(content.content, content.title, filename);
          toast.success('Exported as Word document');
          break;
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export content');
    } finally {
      setIsExporting(false);
    }
  };

  const metrics = calculateContentMetrics(content.content, content.title);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-3 sm:p-4 md:p-6">
        <DialogHeader className="space-y-2 sm:space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex-1 min-w-0 pr-8 sm:pr-0">
              <DialogTitle className="text-lg sm:text-xl md:text-2xl font-bold text-foreground leading-tight">
                {content.title}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
                {content.topic && <Badge variant="secondary" className="text-xs">{content.topic}</Badge>}
                {content.tone && <Badge variant="outline" className="text-xs">{content.tone}</Badge>}
                {content.style && <Badge variant="outline" className="text-xs">{content.style}</Badge>}
                <Badge variant="default" className="text-xs">SEO: {metrics.seoScore}</Badge>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={isExporting} className="w-full sm:w-auto mt-2 sm:mt-0 shrink-0">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('markdown')}>
                  <FileText className="h-4 w-4 mr-2" />
                  Markdown (.md)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('pdf')}>
                  <FileType className="h-4 w-4 mr-2" />
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('word')}>
                  <FileType className="h-4 w-4 mr-2" />
                  Word (.docx)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogHeader>
        
        <Tabs defaultValue="content" className="w-full mt-2 sm:mt-4">
          <TabsList className={`grid w-full h-9 sm:h-10 ${content.metadata?.prompt ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="content" className="text-xs sm:text-sm">Content</TabsTrigger>
            {content.metadata?.prompt && (
              <TabsTrigger value="prompt" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <MessageSquareText className="h-3 w-3 sm:h-4 sm:w-4" />
                Prompt
              </TabsTrigger>
            )}
            <TabsTrigger value="suggestions" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
              <Lightbulb className="h-3 w-3 sm:h-4 sm:w-4" />
              AI Suggestions
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="content" className="mt-2 sm:mt-4">
            <div className="flex justify-end mb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyContent}
                className="gap-2"
              >
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {isCopied ? 'Copied!' : 'Copy Content'}
              </Button>
            </div>
            <ScrollArea className="h-[50vh] sm:h-[55vh] md:h-[60vh] pr-2 sm:pr-4">
              <GeminiContentViewer 
                ref={contentRef}
                content={content.content} 
                type="markdown" 
              />
            </ScrollArea>
          </TabsContent>
          
          {content.metadata?.prompt && (
            <TabsContent value="prompt" className="mt-2 sm:mt-4">
              <ScrollArea className="h-[50vh] sm:h-[55vh] md:h-[60vh] pr-2 sm:pr-4">
                <div className="p-4 sm:p-6 bg-muted/30 rounded-lg border border-border">
                  <h3 className="text-sm sm:text-base font-semibold text-foreground mb-3">Original Prompt</h3>
                  <p className="text-sm sm:text-base text-foreground/90 whitespace-pre-wrap leading-relaxed">{content.metadata.prompt}</p>
                </div>
              </ScrollArea>
            </TabsContent>
          )}
          
          <TabsContent value="suggestions" className="mt-2 sm:mt-4">
            <ScrollArea className="h-[50vh] sm:h-[55vh] md:h-[60vh] pr-2 sm:pr-4">
              <AIContentSuggestions content={content.content} title={content.title} />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
