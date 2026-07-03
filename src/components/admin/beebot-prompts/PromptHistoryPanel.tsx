import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { IconHistory, IconArrowBackUp } from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import type { PromptHistory, PromptFile } from "./types";

interface PromptHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: PromptFile | null;
  history: PromptHistory[];
  isLoading?: boolean;
  onRestore: (content: string) => void;
}

export function PromptHistoryPanel({ 
  open, 
  onOpenChange, 
  file,
  history,
  isLoading,
  onRestore
}: PromptHistoryPanelProps) {
  if (!file) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <IconHistory className="size-5" />
            Version History
          </SheetTitle>
          <SheetDescription>
            {file.display_name} • Current version: {file.version}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-150px)] mt-4 pr-4">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">
              Loading history...
            </div>
          ) : history.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No previous versions found.
              <p className="text-xs mt-1">History is saved when content changes.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Current Version */}
              <div className="border border-primary/50 bg-primary/5 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-xs">Current</Badge>
                    <span className="text-sm font-medium">v{file.version}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">Now</span>
                </div>
                <pre className="text-xs font-mono text-muted-foreground bg-background/50 p-2 rounded max-h-[100px] overflow-auto">
                  {file.content.slice(0, 300)}...
                </pre>
              </div>

              {/* History */}
              {history.map((h) => (
                <div key={h.id} className="border border-border/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">v{h.version}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(h.changed_at), { addSuffix: true })}
                      </span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => onRestore(h.content)}
                    >
                      <IconArrowBackUp className="size-4 mr-1" />
                      Restore
                    </Button>
                  </div>
                  {h.change_reason && (
                    <p className="text-xs text-muted-foreground mb-2 italic">
                      {h.change_reason}
                    </p>
                  )}
                  <pre className="text-xs font-mono text-muted-foreground bg-muted/30 p-2 rounded max-h-[100px] overflow-auto">
                    {h.content.slice(0, 300)}...
                  </pre>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
