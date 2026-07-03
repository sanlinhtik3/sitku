import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe, Eye, EyeOff, CheckCircle2, XCircle, Loader2, Trash2, ExternalLink, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface TavilyApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function TavilyApiKeyDialog({ open, onOpenChange, userId }: TavilyApiKeyDialogProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const queryClient = useQueryClient();

  // Check if key exists (never fetch actual key)
  const { data: hasKey, isLoading: isCheckingKey } = useQuery({
    queryKey: ["tavily-key-exists", userId],
    queryFn: async () => {
      const { data } = await supabase.rpc("check_user_api_key_exists", {
        p_user_id: userId,
        p_provider: "tavily",
      });
      return !!data;
    },
    enabled: open && !!userId,
  });

  const handleTest = async () => {
    if (!apiKey.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey.trim(),
          query: "test",
          search_depth: "basic",
          max_results: 1,
        }),
      });
      setTestResult(res.ok ? "success" : "error");
    } catch {
      setTestResult("error");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from("user_api_keys").upsert(
        {
          user_id: userId,
          provider: "tavily",
          api_key_encrypted: apiKey.trim(),
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" }
      );
      if (error) throw error;
      toast.success("Tavily API Key သိမ်းပြီးပါပြီ ✓");
      setApiKey("");
      setTestResult(null);
      queryClient.invalidateQueries({ queryKey: ["tavily-key-exists"] });
    } catch (err: any) {
      toast.error(err.message || "Key save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const { error } = await supabase
        .from("user_api_keys")
        .delete()
        .eq("user_id", userId)
        .eq("provider", "tavily");
      if (error) throw error;
      toast.success("Tavily API Key ဖယ်ရှားပြီးပါပြီ");
      queryClient.invalidateQueries({ queryKey: ["tavily-key-exists"] });
    } catch (err: any) {
      toast.error(err.message || "Remove failed");
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border/30">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Globe className="h-5 w-5 text-emerald-400" />
            Web Search API Key
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            BeeBot က internet ကို ရှာဖွေနိုင်ဖို့ Tavily API Key ထည့်ပေးပါ။
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info box */}
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="flex gap-2 text-sm">
              <Info className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-muted-foreground space-y-1">
                <p>Tavily API Key ဖြင့် BeeBot သည် real-time web search လုပ်နိုင်ပါတယ်။</p>
                <p>ရာသီဥတု, crypto စျေးနှုန်း, သတင်းများ စသည်တို့ကို ရှာနိုင်ပါမယ်။</p>
                <a
                  href="https://app.tavily.com/home"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-medium"
                >
                  Free API Key ရယူရန် <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Key status */}
          {hasKey && (
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-emerald-300">Key configured: ••••••••</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                disabled={isRemoving}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2"
              >
                {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}

          {/* Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {hasKey ? "Key အသစ် ပြောင်းရန်" : "Tavily API Key"}
            </label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                placeholder="tvly-xxxxxxxxxxxxxxxxx"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                className="pr-10 bg-background/50 border-border/50"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 text-sm ${testResult === "success" ? "text-emerald-400" : "text-red-400"}`}>
              {testResult === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {testResult === "success" ? "Key valid ✓" : "Key invalid - စစ်ဆေးပြီး ပြန်ထည့်ပါ"}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={!apiKey.trim() || isTesting}
              className="flex-1 border-emerald-500/30 hover:bg-emerald-500/10"
            >
              {isTesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Globe className="h-4 w-4 mr-2" />}
              Test
            </Button>
            <Button
              onClick={handleSave}
              disabled={!apiKey.trim() || isSaving}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Key
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
