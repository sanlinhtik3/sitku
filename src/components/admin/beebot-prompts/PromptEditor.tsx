import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  IconDeviceFloppy, 
  IconTrash, 
  IconHistory,
  IconCode,
  IconEye,
  IconAlertTriangle
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { PromptFile } from "./types";
import { CATEGORY_LABELS } from "./types";

interface PromptEditorProps {
  file: PromptFile | null;
  onSave: (updates: Partial<PromptFile>) => void;
  onDelete: (id: string) => void;
  onShowHistory: () => void;
  onShowPreview: () => void;
  isSaving?: boolean;
}

export function PromptEditor({ 
  file, 
  onSave, 
  onDelete,
  onShowHistory,
  onShowPreview,
  isSaving 
}: PromptEditorProps) {
  const [displayName, setDisplayName] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("custom");
  const [fileType, setFileType] = useState<string>("static");
  const [isActive, setIsActive] = useState(true);
  const [isRequired, setIsRequired] = useState(false);
  const [description, setDescription] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Reset form when file changes
  useEffect(() => {
    if (file) {
      setDisplayName(file.display_name);
      setContent(file.content);
      setCategory(file.category);
      setFileType(file.file_type);
      setIsActive(file.is_active);
      setIsRequired(file.is_required);
      setDescription(file.description || "");
      setHasChanges(false);
    }
  }, [file?.id]);

  const handleContentChange = useCallback((value: string) => {
    setContent(value);
    setHasChanges(true);
  }, []);

  const handleSave = () => {
    if (!file) return;
    onSave({
      display_name: displayName,
      content,
      category: category as PromptFile['category'],
      file_type: fileType as PromptFile['file_type'],
      is_active: isActive,
      is_required: isRequired,
      description: description || null,
    });
    setHasChanges(false);
  };

  // Highlight variables in content
  const highlightedContent = content.replace(
    /\{\{([^}]+)\}\}/g,
    '<span class="text-primary font-medium">{{$1}}</span>'
  );

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <IconCode className="size-12 mx-auto mb-2 opacity-50" />
          <p>Select a prompt file to edit</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/50 bg-card/30">
        <div className="flex items-center gap-3">
          <Input
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); setHasChanges(true); }}
            className="font-semibold bg-transparent border-none px-0 h-auto text-lg focus-visible:ring-0"
            placeholder="Display Name"
          />
          <Badge variant="outline" className={cn("text-xs", CATEGORY_LABELS[category]?.color)}>
            {CATEGORY_LABELS[category]?.icon} {CATEGORY_LABELS[category]?.label}
          </Badge>
          {isRequired && (
            <Badge variant="secondary" className="text-xs text-yellow-500 border-yellow-500/30">
              <IconAlertTriangle className="size-3 mr-1" />
              Required
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onShowHistory}>
            <IconHistory className="size-4 mr-1" />
            History
          </Button>
          <Button variant="ghost" size="sm" onClick={onShowPreview}>
            <IconEye className="size-4 mr-1" />
            Preview
          </Button>
          <Button 
            size="sm" 
            onClick={handleSave} 
            disabled={!hasChanges || isSaving}
          >
            <IconDeviceFloppy className="size-4 mr-1" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
          {!isRequired && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                  <IconTrash className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Prompt File?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete "{file.display_name}". This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => onDelete(file.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Settings Row */}
      <div className="flex items-center gap-4 p-3 border-b border-border/50 bg-muted/30">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Category:</Label>
          <Select value={category} onValueChange={(v) => { setCategory(v); setHasChanges(true); }}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
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
        <div className="flex items-center gap-2">
          <Label className="text-xs">Type:</Label>
          <Select value={fileType} onValueChange={(v) => { setFileType(v); setHasChanges(true); }}>
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="static">Static</SelectItem>
              <SelectItem value="dynamic">Dynamic</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch 
            id="active" 
            checked={isActive} 
            onCheckedChange={(v) => { setIsActive(v); setHasChanges(true); }}
          />
          <Label htmlFor="active" className="text-xs">Active</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch 
            id="required" 
            checked={isRequired} 
            onCheckedChange={(v) => { setIsRequired(v); setHasChanges(true); }}
          />
          <Label htmlFor="required" className="text-xs flex items-center gap-1">
            Required
            {isRequired && <IconAlertTriangle className="size-3 text-yellow-500" />}
          </Label>
        </div>
        <div className="flex-1">
          <Input
            value={description}
            onChange={(e) => { setDescription(e.target.value); setHasChanges(true); }}
            placeholder="Description (optional)"
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 p-3 overflow-hidden">
        <Textarea
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="# Enter your prompt content in Markdown..."
          className="h-full min-h-[400px] font-mono text-sm resize-none bg-background/50"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-2 border-t border-border/50 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>{file.file_name}</span>
          <span>v{file.version}</span>
          <span>{content.length} chars</span>
        </div>
        <div>
          {hasChanges && <span className="text-yellow-500">● Unsaved changes</span>}
        </div>
      </div>
    </div>
  );
}
