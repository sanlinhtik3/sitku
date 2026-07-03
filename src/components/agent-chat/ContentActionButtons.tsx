import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Bookmark, CheckCircle, RefreshCw, Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ContentActionButtonsProps {
  content: string;
  contentId?: string;
  isFallback?: boolean;
  onSave?: () => Promise<void>;
  onRegenerate?: () => void;
}

export function ContentActionButtons({ 
  content, 
  contentId,
  isFallback = false,
  onSave, 
  onRegenerate 
}: ContentActionButtonsProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(!!contentId);

  const handleSave = async () => {
    if (!onSave || saved) return;
    
    setIsSaving(true);
    try {
      await onSave();
      setSaved(true);
      toast.success("My AI Content ထဲမှာ သိမ်းဆည်းပြီးပါပြီ ✓");
    } catch (error) {
      toast.error("သိမ်းဆည်းရာတွင် အမှားဖြစ်ပါတယ်");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    toast.success("Copied to clipboard");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2 mt-3"
    >
      {/* Fallback Notice */}
      {isFallback && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Basic mode - Advanced features temporarily unavailable</span>
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {onSave && (
          <Button
            size="sm"
            variant={saved ? "secondary" : "outline"}
            onClick={handleSave}
            disabled={isSaving || saved}
            className={cn(
              "gap-1.5 text-xs h-8 transition-all",
              saved && "bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/20"
            )}
          >
            {saved ? (
              <>
                <CheckCircle className="h-3.5 w-3.5" />
                Saved
              </>
            ) : isSaving ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Bookmark className="h-3.5 w-3.5" />
                Save to Library
              </>
            )}
          </Button>
        )}
        
        {onRegenerate && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRegenerate}
            className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </Button>
        )}
        
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCopy}
          className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
    </motion.div>
  );
}
