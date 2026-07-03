import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Columns, FileEdit, Eye, Save, Clock, AlertTriangle, RotateCcw, X, AlertCircle } from "lucide-react";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { htmlToMarkdown, markdownToHtml } from "@/lib/markdownUtils";
import { GeminiContentViewer } from "@/components/ui/GeminiContentViewer";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { formatDistanceToNow } from "date-fns";

type ViewMode = 'split' | 'editor' | 'preview';

interface ContentEditorDialogProps {
  content: any;
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

export const ContentEditorDialog = ({ content, open, onClose, onSave }: ContentEditorDialogProps) => {
  const [title, setTitle] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [contentText, setContentText] = useState<string>("");
  const [isTemplate, setIsTemplate] = useState<boolean>(false);
  const [tags, setTags] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Memoized data for auto-save - only update when values actually change
  const autoSaveData = useMemo(() => ({
    title,
    topic,
    content: contentText,
    tags,
    isTemplate,
  }), [title, topic, contentText, tags, isTemplate]);

  // Auto-save hook
  const {
    isSaving: isAutoSaving,
    lastSaved,
    hasDraft,
    clearDraft,
    hasUnsavedChanges,
    draftData,
    isReady,
    error: autoSaveError,
  } = useAutoSave({
    contentId: content?.id,
    data: autoSaveData,
    debounceMs: 2000,
    enabled: open && isInitialized,
  });

  // Unsaved changes hook
  const {
    showConfirmDialog,
    handleClose,
    confirmDiscard,
    cancelDiscard,
  } = useUnsavedChanges({
    hasUnsavedChanges: hasUnsavedChanges && isReady,
    enabled: open && isInitialized,
  });

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      // Reset all state when dialog closes
      setIsInitialized(false);
      setShowDraftBanner(false);
      setTitle("");
      setTopic("");
      setContentText("");
      setIsTemplate(false);
      setTags("");
      setPrompt("");
      setViewMode('split');
    }
  }, [open]);

  // Load content when dialog opens
  useEffect(() => {
    if (open && content && !isInitialized) {
      // Load from content first
      setTitle(content.title || "");
      setTopic(content.topic || "");
      const htmlContent = content.content ? markdownToHtml(content.content) : "";
      setContentText(htmlContent);
      setIsTemplate(content.is_template || false);
      setTags(content.tags?.join(", ") || "");
      const savedPrompt = content.metadata?.prompt || content.prompt || "";
      setPrompt(savedPrompt);
      
      // Mark as initialized
      setIsInitialized(true);
    }
  }, [open, content, isInitialized]);

  // Check for draft after auto-save hook is ready
  useEffect(() => {
    if (open && isInitialized && isReady && draftData) {
      // For existing content: match by ID
      // For new content: always show banner if draft exists (session-based key ensures uniqueness)
      const isExistingContent = !!content?.id;
      const isMatchingDraft = isExistingContent 
        ? draftData.id === content.id 
        : true; // New content drafts are already session-unique
      
      if (isMatchingDraft) {
        const draftTime = new Date(draftData.lastSaved).getTime();
        const contentTime = content?.updated_at ? new Date(content.updated_at).getTime() : 0;
        
        // Show banner if draft is newer than saved content
        if (draftTime > contentTime) {
          setShowDraftBanner(true);
        }
      }
    }
  }, [open, isInitialized, isReady, draftData, content?.id, content?.updated_at]);

  // Show auto-save error as toast
  useEffect(() => {
    if (autoSaveError) {
      toast.error(autoSaveError, { id: 'auto-save-error' });
    }
  }, [autoSaveError]);

  const restoreDraft = useCallback(() => {
    if (draftData) {
      setTitle(draftData.title);
      setTopic(draftData.topic);
      setContentText(draftData.content);
      setTags(draftData.tags);
      setIsTemplate(draftData.isTemplate);
      setShowDraftBanner(false);
      toast.success("Draft restored successfully!");
    }
  }, [draftData]);

  const discardDraft = useCallback(() => {
    clearDraft();
    setShowDraftBanner(false);
    toast.info("Draft discarded");
  }, [clearDraft]);

  const handleDialogClose = useCallback(() => {
    handleClose(() => {
      clearDraft();
      onClose();
    });
  }, [handleClose, clearDraft, onClose]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    if (!contentText.trim()) {
      toast.error("Content is required");
      return;
    }

    setIsSaving(true);

    try {
      const tagsArray = tags.split(",").map(t => t.trim()).filter(t => t);
      const markdownContent = htmlToMarkdown(contentText.trim());
      
      const preservedPrompt = prompt || content?.metadata?.prompt || content?.prompt || null;
      const metadataObj = {
        prompt: preservedPrompt,
        ...(content?.metadata?.knowledgeBase && { knowledgeBase: content.metadata.knowledgeBase }),
        ...(content?.metadata?.searchMetadata && { searchMetadata: content.metadata.searchMetadata }),
      };
      const hasMetadata = Object.values(metadataObj).some(v => v !== null && v !== undefined);
      
      const contentData = {
        title: title.trim(),
        topic: topic.trim() || null,
        content: markdownContent,
        is_template: isTemplate,
        is_global: true,
        tags: tagsArray.length > 0 ? tagsArray : null,
        tone: content?.tone || null,
        style: content?.style || null,
        language: content?.language || "burmese",
        metadata: hasMetadata ? metadataObj : null,
      };

      if (content?.id) {
        const { error } = await supabase
          .from("ai_generated_content")
          .update(contentData)
          .eq("id", content.id);

        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        const { error } = await supabase
          .from("ai_generated_content")
          .insert({
            ...contentData,
            user_id: user.id,
          });

        if (error) throw error;
      }

      // Clear draft after successful save
      clearDraft();
      
      toast.success("Content saved to your library & indexed globally ✨");
      onSave();
      onClose();
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error(error.message || "Failed to save content");
    } finally {
      setIsSaving(false);
    }
  };

  // Save status indicator - memoized to prevent unnecessary re-renders
  const SaveStatusIndicator = useMemo(() => {
    if (!isReady) return null;
    
    // Show DB saving status (takes priority)
    if (isSaving) {
      return (
        <Badge variant="outline" className="text-xs gap-1 text-primary animate-pulse">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving to database...
        </Badge>
      );
    }
    
    if (autoSaveError) {
      return (
        <Badge variant="outline" className="text-xs gap-1 text-destructive border-destructive/50">
          <AlertCircle className="h-3 w-3" />
          Save failed
        </Badge>
      );
    }
    
    if (isAutoSaving) {
      return (
        <Badge variant="outline" className="text-xs gap-1 text-muted-foreground animate-pulse">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving draft...
        </Badge>
      );
    }
    
    if (lastSaved) {
      return (
        <Badge variant="outline" className="text-xs gap-1 text-green-600 dark:text-green-400">
          <Save className="h-3 w-3" />
          Draft saved {formatDistanceToNow(lastSaved, { addSuffix: false })} ago
        </Badge>
      );
    }
    
    if (hasUnsavedChanges) {
      return (
        <Badge variant="outline" className="text-xs gap-1 text-amber-600 dark:text-amber-400">
          <Clock className="h-3 w-3" />
          Unsaved changes
        </Badge>
      );
    }

    return null;
  }, [isReady, isSaving, autoSaveError, isAutoSaving, lastSaved, hasUnsavedChanges]);

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleDialogClose()}>
        <DialogContent className="max-w-[95vw] sm:max-w-[90vw] lg:max-w-5xl max-h-[90vh] sm:max-h-[95vh] overflow-hidden p-3 sm:p-6">
          <DialogHeader className="space-y-1 sm:space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base sm:text-lg">{content?.id ? "Edit" : "Add New"} Content</DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  Add metadata and settings for your content
                </DialogDescription>
              </div>
              {SaveStatusIndicator}
            </div>
          </DialogHeader>

          {/* Draft Recovery Banner */}
          {showDraftBanner && draftData && (
            <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                <span className="text-amber-700 dark:text-amber-300">
                  Unsaved draft found from {formatDistanceToNow(new Date(draftData.lastSaved), { addSuffix: true })}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={restoreDraft}
                  className="h-7 text-xs gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={discardDraft}
                  className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                  Discard
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3 sm:space-y-4 overflow-y-auto max-h-[60vh] sm:max-h-[70vh] pr-1 sm:pr-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="title" className="text-xs sm:text-sm">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a title"
                  className="h-9 sm:h-10 text-sm"
                />
              </div>

              <div>
                <Label htmlFor="topic" className="text-xs sm:text-sm">Topic</Label>
                <Input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Technology"
                  className="h-9 sm:h-10 text-sm"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="tags" className="text-xs sm:text-sm">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., social media, facebook"
                className="h-9 sm:h-10 text-sm"
              />
            </div>

            {prompt && (
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm text-muted-foreground">Original Prompt</Label>
                <Textarea 
                  value={prompt}
                  readOnly
                  className="min-h-[60px] text-xs sm:text-sm bg-muted/30 cursor-default resize-none"
                />
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch
                id="template"
                checked={isTemplate}
                onCheckedChange={setIsTemplate}
                className="scale-90 sm:scale-100"
              />
              <Label htmlFor="template" className="text-xs sm:text-sm">Save as template</Label>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 border-b pb-2 sm:pb-3 overflow-x-auto">
              <Button
                type="button"
                variant={viewMode === 'split' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('split')}
                className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap"
              >
                <Columns className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                <span className="hidden sm:inline">Split</span>
              </Button>
              <Button
                type="button"
                variant={viewMode === 'editor' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('editor')}
                className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap"
              >
                <FileEdit className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                <span className="hidden sm:inline">Editor</span>
              </Button>
              <Button
                type="button"
                variant={viewMode === 'preview' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('preview')}
                className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap"
              >
                <Eye className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                <span className="hidden sm:inline">Preview</span>
              </Button>
            </div>

            {viewMode === 'split' && (
              <div className="flex flex-col lg:flex-row gap-3 sm:gap-4">
                <div className="flex-1">
                  <Label className="text-xs sm:text-sm">Content (Rich Text Editor)</Label>
                  <RichTextEditor
                    content={contentText}
                    onChange={setContentText}
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs sm:text-sm">Live Preview</Label>
                  <div className="border rounded-md p-2 sm:p-4 min-h-[200px] sm:min-h-[300px] overflow-auto bg-background">
                    <GeminiContentViewer 
                      content={htmlToMarkdown(contentText)} 
                      type="markdown" 
                    />
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'editor' && (
              <div>
                <Label className="text-xs sm:text-sm">Content (Rich Text Editor)</Label>
                <RichTextEditor
                  content={contentText}
                  onChange={setContentText}
                />
              </div>
            )}

            {viewMode === 'preview' && (
              <div>
                <Label className="text-xs sm:text-sm">Preview</Label>
                <div className="border rounded-md p-2 sm:p-4 min-h-[200px] sm:min-h-[300px] overflow-auto bg-background">
                  <GeminiContentViewer 
                    content={htmlToMarkdown(contentText)} 
                    type="markdown" 
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleDialogClose} className="h-9 sm:h-10 text-sm w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="h-9 sm:h-10 text-sm w-full sm:w-auto">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Content"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={(open) => !open && cancelDiscard()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Unsaved Changes
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them? Your draft will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDiscard}>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
