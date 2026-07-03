import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Sparkles, Save } from "lucide-react";
import { toast } from "sonner";

interface SoulEditorProps {
  userId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  currentInstructions?: string | null;
  onSave?: (text: string) => Promise<void>;
  isSaving?: boolean;
}

export function SoulEditor({ userId, open, onOpenChange, currentInstructions, onSave, isSaving: externalSaving }: SoulEditorProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [soulText, setSoulText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? (v: boolean) => onOpenChange?.(v) : setInternalOpen;

  useEffect(() => {
    if (!isOpen) return;
    
    // If currentInstructions provided, use that
    if (currentInstructions !== undefined) {
      setSoulText(currentInstructions || "");
      return;
    }
    
    // Otherwise fetch from DB
    if (!userId) return;
    const loadSoul = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("agent_soul_config")
        .select("soul_text")
        .eq("user_id", userId)
        .single();
        
      if (data) setSoulText(data.soul_text);
      if (error && error.code !== "PGRST116") {
        console.error("Error loading soul:", error);
        toast.error("Failed to load personality config");
      }
      setIsLoading(false);
    };
    loadSoul();
  }, [isOpen, userId, currentInstructions]);

  const saveSoul = async () => {
    if (!soulText.trim()) return toast.error("Personality cannot be empty");
    
    // If external onSave provided, use that
    if (onSave) {
      await onSave(soulText.trim());
      return;
    }
    
    if (!userId) return;
    setIsSaving(true);
    
    const { error } = await supabase
      .from("agent_soul_config")
      .upsert({ user_id: userId, soul_text: soulText.trim(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      
    if (error) {
      toast.error("Failed to update personality");
      console.error(error);
    } else {
      toast.success("Agent personality updated successfully");
      setIsOpen(false);
    }
    setIsSaving(false);
  };

  const saving = externalSaving ?? isSaving;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Edit Agent Personality (SOUL.md Equivalent)
          </DialogTitle>
          <DialogDescription>
            Define how your BeeBot behaves, its tone, and boundaries. This acts as the core system prompt override.
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>
        ) : (
          <div className="flex-1 flex flex-col gap-4 mt-4">
            <Textarea 
              className="flex-1 font-mono text-sm resize-none"
              placeholder="You are BeeBot, my personal assistant..."
              value={soulText}
              onChange={(e) => setSoulText(e.target.value)}
            />
          </div>
        )}
        
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={saveSoul} disabled={isLoading || saving} className="gap-2">
            {saving ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />}
            Save Personality
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
