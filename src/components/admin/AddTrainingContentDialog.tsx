import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Database, Sparkles, Save, X } from "lucide-react";
import { motion } from "motion/react";
import TurndownService from "turndown";

interface AddTrainingContentDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

export const AddTrainingContentDialog = ({
  open,
  onClose,
  onSave,
}: AddTrainingContentDialogProps) => {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [tone, setTone] = useState("general");
  const [style, setStyle] = useState("informative");
  const [language, setLanguage] = useState("burmese");
  const [category, setCategory] = useState("general");
  const [tags, setTags] = useState("");
  const [qualityScore, setQualityScore] = useState([75]);
  const [isTemplate, setIsTemplate] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!content.trim()) {
      toast.error("Content is required");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }

      // Convert HTML to Markdown
      const markdownContent = turndownService.turndown(content);

      const { error } = await supabase.from("ai_generated_content").insert({
        title: title.trim(),
        topic: topic.trim() || null,
        content: markdownContent,
        tone,
        style,
        language,
        category,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : null,
        quality_score: qualityScore[0],
        is_template: isTemplate,
        is_global: true,
        source_type: "manual",
        user_id: user.id,
      });

      if (error) throw error;

      toast.success("Training data added to Knowledge Base");
      resetForm();
      onSave();
      onClose();
    } catch (error: any) {
      console.error("Error saving training data:", error);
      toast.error("Failed to save training data");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setTopic("");
    setContent("");
    setTone("general");
    setStyle("informative");
    setLanguage("burmese");
    setCategory("general");
    setTags("");
    setQualityScore([75]);
    setIsTemplate(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto border-primary/20 bg-background/95 backdrop-blur-md">
        <DialogHeader className="pb-4 border-b border-primary/20">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 10px hsl(var(--primary) / 0.3)",
                  "0 0 20px hsl(var(--primary) / 0.5)",
                  "0 0 10px hsl(var(--primary) / 0.3)",
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="p-2 rounded-lg bg-primary/10 border border-primary/30"
            >
              <Database className="h-5 w-5 text-primary" />
            </motion.div>
            <div>
              <DialogTitle className="text-xl flex items-center gap-2">
                Add Training Data
                <Badge variant="outline" className="text-xs border-primary/30">
                  <Sparkles className="h-3 w-3 mr-1" />
                  KB
                </Badge>
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Add custom content to train the AI writer
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Title & Topic Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-medium">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Content title..."
                className="border-primary/20 focus:border-primary/40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic" className="text-sm font-medium">
                Topic
              </Label>
              <Input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Content topic..."
                className="border-primary/20 focus:border-primary/40"
              />
            </div>
          </div>

          {/* Tone & Style Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Tone <span className="text-destructive">*</span>
              </Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="border-primary/20 focus:border-primary/40 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border-primary/20">
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Style <span className="text-destructive">*</span>
              </Label>
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger className="border-primary/20 focus:border-primary/40 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border-primary/20">
                  <SelectItem value="storytelling">Storytelling</SelectItem>
                  <SelectItem value="informative">Informative</SelectItem>
                  <SelectItem value="educational">Educational</SelectItem>
                  <SelectItem value="persuasive">Persuasive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Language <span className="text-destructive">*</span>
              </Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="border-primary/20 focus:border-primary/40 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border-primary/20">
                  <SelectItem value="burmese">Burmese</SelectItem>
                  <SelectItem value="english">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Category <span className="text-destructive">*</span>
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="border-primary/20 focus:border-primary/40 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border-primary/20">
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="crypto">Crypto</SelectItem>
                  <SelectItem value="tech">Tech</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="health">Health</SelectItem>
                  <SelectItem value="education">Education</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags" className="text-sm font-medium">
              Tags <span className="text-muted-foreground text-xs">(comma-separated)</span>
            </Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="bitcoin, trading, analysis..."
              className="border-primary/20 focus:border-primary/40"
            />
          </div>

          {/* Quality Score & Template */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Quality Score</Label>
                <Badge variant="outline" className="text-xs">
                  {qualityScore[0]}/100
                </Badge>
              </div>
              <Slider
                value={qualityScore}
                onValueChange={setQualityScore}
                max={100}
                min={0}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Higher score = higher priority in AI training
              </p>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border border-primary/20 bg-primary/5">
              <div>
                <Label className="text-sm font-medium">Save as Template</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Mark as reusable content template
                </p>
              </div>
              <Switch checked={isTemplate} onCheckedChange={setIsTemplate} />
            </div>
          </div>

          {/* Rich Text Editor */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Content <span className="text-destructive">*</span>
            </Label>
            <RichTextEditor content={content} onChange={setContent} />
          </div>
        </div>

        <DialogFooter className="pt-4 border-t border-primary/20 gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="border-primary/20"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save to KB"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
