import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (input: { content: string; category: string; confidence: number }) => Promise<void>;
}

const CATEGORIES = [
  { value: "preference", label: "Preference" },
  { value: "fact", label: "Fact" },
  { value: "work", label: "Work" },
  { value: "relationship", label: "Relationship" },
  { value: "opinion", label: "Opinion" },
  { value: "life_event", label: "Life Event" },
];

export const AddMemoryDialog = ({ open, onOpenChange, onSubmit }: Props) => {
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("preference");
  const [confidence, setConfidence] = useState(0.8);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ content: content.trim(), category, confidence });
      toast.success("Memory saved to memory.md");
      setContent("");
      setConfidence(0.8);
      setCategory("preference");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card/80 backdrop-blur-2xl border-border/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Add Memory
          </DialogTitle>
          <DialogDescription className="text-xs">
            BeeBot will recall this in every future conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Memory</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. I prefer responses in Burmese, concise and direct."
              rows={4}
              className="resize-none bg-background/40 border-border/30"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-background/40 border-border/30 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="text-xs">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Importance · {(confidence * 100).toFixed(0)}%
              </Label>
              <div className="pt-3">
                <Slider
                  value={[confidence]}
                  min={0.3}
                  max={1}
                  step={0.05}
                  onValueChange={([v]) => setConfidence(v)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!content.trim() || busy}>
            {busy ? "Saving…" : "Save Memory"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
