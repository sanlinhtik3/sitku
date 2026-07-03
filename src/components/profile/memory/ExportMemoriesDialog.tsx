import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Download, FileText, FileJson } from "lucide-react";
import { MemoryFile, exportAllAsMarkdown, exportAllAsJson } from "@/hooks/useUserMemories";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  files: MemoryFile[];
}

export const ExportMemoriesDialog = ({ open, onOpenChange, files }: Props) => {
  const [scope, setScope] = useState<"all" | "core">("all");
  const [format, setFormat] = useState<"md" | "json">("md");

  const handleDownload = () => {
    const targetFiles =
      scope === "core" ? files.filter((f) => f.tag === "core") : files;
    const content =
      format === "md" ? exportAllAsMarkdown(targetFiles) : exportAllAsJson(targetFiles);
    const blob = new Blob([content], {
      type: format === "md" ? "text/markdown" : "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `beebot-memory-${new Date().toISOString().split("T")[0]}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Memory exported");
    onOpenChange(false);
  };

  const total = (scope === "core" ? files.filter((f) => f.tag === "core") : files).reduce(
    (s, f) => s + f.memories.length,
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card/80 backdrop-blur-2xl border-border/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-primary" />
            Export Memory
          </DialogTitle>
          <DialogDescription className="text-xs">
            Take your memory to ChatGPT, Claude, or Gemini.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Scope</Label>
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as any)} className="grid grid-cols-2 gap-2">
              <Label
                htmlFor="scope-all"
                className="flex items-center gap-2 p-3 rounded-xl border border-border/30 bg-background/30 cursor-pointer hover:bg-background/50 transition-colors"
              >
                <RadioGroupItem id="scope-all" value="all" />
                <span className="text-xs font-medium">All memories</span>
              </Label>
              <Label
                htmlFor="scope-core"
                className="flex items-center gap-2 p-3 rounded-xl border border-border/30 bg-background/30 cursor-pointer hover:bg-background/50 transition-colors"
              >
                <RadioGroupItem id="scope-core" value="core" />
                <span className="text-xs font-medium">Core only</span>
              </Label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Format</Label>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as any)} className="grid grid-cols-2 gap-2">
              <Label
                htmlFor="fmt-md"
                className="flex items-center gap-2 p-3 rounded-xl border border-border/30 bg-background/30 cursor-pointer hover:bg-background/50 transition-colors"
              >
                <RadioGroupItem id="fmt-md" value="md" />
                <FileText className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Markdown</span>
              </Label>
              <Label
                htmlFor="fmt-json"
                className="flex items-center gap-2 p-3 rounded-xl border border-border/30 bg-background/30 cursor-pointer hover:bg-background/50 transition-colors"
              >
                <RadioGroupItem id="fmt-json" value="json" />
                <FileJson className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">JSON</span>
              </Label>
            </RadioGroup>
          </div>

          <p className="text-[10px] text-muted-foreground/60 text-center">
            {total} memories · portable to any AI agent
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
