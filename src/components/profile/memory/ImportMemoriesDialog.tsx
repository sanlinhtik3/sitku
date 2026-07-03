import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Sparkles, CheckCircle2 } from "lucide-react";
import { parseImportText, ParsedImportItem } from "@/hooks/useUserMemories";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (items: ParsedImportItem[]) => Promise<number>;
}

export const ImportMemoriesDialog = ({ open, onOpenChange, onImport }: Props) => {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedImportItem[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleParse = (text: string) => {
    setRaw(text);
    setParsed(parseImportText(text));
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    handleParse(text);
  };

  const handleImport = async () => {
    if (!parsed.length) return;
    setBusy(true);
    try {
      const count = await onImport(parsed);
      toast.success(`Imported ${count} memories. BeeBot is now using them.`);
      setRaw("");
      setParsed([]);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card/80 backdrop-blur-2xl border-border/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4 text-primary" />
            Import Memory
          </DialogTitle>
          <DialogDescription className="text-xs">
            Paste from ChatGPT, Claude, Gemini — or upload a .md / .json file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <input
            ref={fileRef}
            type="file"
            accept=".md,.txt,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full bg-background/30 border-dashed border-border/40 h-20"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-2 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Drop or click to upload</span>
          </Button>

          <Textarea
            value={raw}
            onChange={(e) => handleParse(e.target.value)}
            placeholder="…or paste memory content here"
            rows={6}
            className="resize-none bg-background/40 border-border/30 text-xs font-mono"
          />

          {parsed.length > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/15 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">Detected {parsed.length} memories</span>
              </div>
              <ScrollArea className="max-h-[160px]">
                <ul className="p-2 space-y-1">
                  {parsed.slice(0, 50).map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground px-2 py-1">
                      <Sparkles className="h-3 w-3 mt-0.5 text-primary/60 shrink-0" />
                      <span className="line-clamp-2">{p.content}</span>
                    </li>
                  ))}
                  {parsed.length > 50 && (
                    <li className="text-center text-[10px] text-muted-foreground/50 py-1">
                      +{parsed.length - 50} more…
                    </li>
                  )}
                </ul>
              </ScrollArea>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleImport} disabled={!parsed.length || busy}>
            {busy ? "Importing…" : `Import ${parsed.length || ""} memories`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
