import { memo, useState, useEffect } from "react";
import { motion } from "motion/react";
import { Settings, Key, Eye, EyeOff, ExternalLink, Trash2, CheckCircle, Loader2, Info, Cpu, Sparkles, Zap, Brain, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface NeuroBrainSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeyUpdated?: () => void;
  onAutoSyncChanged?: (enabled: boolean) => void;
}

// Gemini Models List (Google Official Model IDs - January 2026)
const GEMINI_MODELS = [
  // Gemini 3 (Latest)
  { id: "gemini-3.5-flash", name: "🚀 Gemini 3.5 Flash", description: "stable + မြန်ဆန်သော agentic model", tier: "flash", isNew: true },
  { id: "gemini-3-flash-preview", name: "🚀 Gemini 3 Flash", description: "အသစ်ဆုံး + အမြန်ဆုံး", tier: "flash", isNew: true },
  { id: "gemini-3.1-pro-preview", name: "🧠 Gemini 3.1 Pro", description: "အသစ်ဆုံး reasoning + token efficient", tier: "pro", isNew: true },
  { id: "gemini-3-pro-image-preview", name: "🎨 Nano Banana Pro", description: "အရည်အသွေးမြင့် Image Generation", tier: "flash", isNew: true },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", description: "stable + high-volume tasks", tier: "flash", isNew: true },
  { id: "gemini-2.5-flash-image", name: "🖼️ Nano Banana", description: "မြန်ဆန်သော Image Generation", tier: "flash", isNew: true },
  // Gemini 2.5 (Stable)
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "ပိုကောင်းသော reasoning", tier: "flash" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", description: "အမြန်ဆုံး + အသက်သာဆုံး", tier: "flash" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Strong reasoning", tier: "pro" },
  // Gemini 2.0 (Legacy)
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "မြန်ဆန်သော (Stable)", tier: "flash" },
];

const getTierIcon = (tier: string) => {
  switch (tier) {
    case "flash": return <Zap className="h-3 w-3" />;
    case "pro": return <Sparkles className="h-3 w-3" />;
    default: return <Cpu className="h-3 w-3" />;
  }
};

const getTierColor = (tier: string) => {
  switch (tier) {
    case "flash": return "text-green-400";
    case "pro": return "text-purple-400";
    default: return "text-muted-foreground";
  }
};

export const NeuroBrainSettingsDialog = memo(({
  open,
  onOpenChange,
  onKeyUpdated,
  onAutoSyncChanged
}: NeuroBrainSettingsDialogProps) => {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-3.5-flash");
  const [showKey, setShowKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [autoSyncLoading, setAutoSyncLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchKeyStatus();
    }
  }, [open]);

  const fetchKeyStatus = async () => {
    try {
      // Use RPC function to check if system key exists (never fetch actual key)
      const { data: hasKey } = await supabase.rpc('check_system_api_key_exists');
      
      // Fetch only the model setting and auto_sync_enabled, NOT the API key
      const { data: settings } = await supabase
        .from('ai_model_settings')
        .select('selected_model, auto_sync_enabled')
        .single();
      
      if (hasKey) {
        setHasExistingKey(true);
        setApiKey('••••••••••••••••••••••••••••••••••••••••');
      } else {
        setHasExistingKey(false);
        setApiKey('');
      }
      
      if (settings?.selected_model) {
        setSelectedModel(settings.selected_model);
      }
      
      // Set auto-sync status (default to true if null)
      setAutoSyncEnabled(settings?.auto_sync_enabled !== false);
    } catch (error) {
      // No existing settings, which is fine
      setHasExistingKey(false);
      setApiKey('');
      setAutoSyncEnabled(true);
    }
  };

  const handleSave = async () => {
    if (!apiKey || apiKey.includes('•')) {
      toast.error("Please enter a valid API key");
      return;
    }

    setLoading(true);
    try {
      // Use RPC to set system API key securely
      const { error } = await supabase.rpc('set_system_api_key', {
        p_api_key: apiKey
      });

      if (error) throw error;

      // Also update selected model
      const { data: settingsData } = await supabase
        .from('ai_model_settings')
        .select('id')
        .single();
      
      if (settingsData?.id) {
        await supabase
          .from('ai_model_settings')
          .update({ selected_model: selectedModel })
          .eq('id', settingsData.id);
      }

      toast.success("✅ System API Key saved successfully!");
      setHasExistingKey(true);
      setApiKey('••••••••••••••••••••••••••••••••••••••••');
      
      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ["system-api-key-status"] });
      queryClient.invalidateQueries({ queryKey: ["ai-model-settings"] });
      
      onKeyUpdated?.();
    } catch (error: any) {
      console.error('Error saving API key:', error);
      toast.error("Failed to save API key: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc('set_system_api_key', {
        p_api_key: null
      });

      if (error) throw error;

      toast.success("System API Key deleted");
      setApiKey('');
      setSelectedModel('gemini-3.5-flash');
      setHasExistingKey(false);
      setTestSuccess(null);
      
      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ["system-api-key-status"] });
      queryClient.invalidateQueries({ queryKey: ["ai-model-settings"] });
      
      onKeyUpdated?.();
    } catch (error: any) {
      console.error('Error deleting API key:', error);
      toast.error("Failed to delete API key");
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!apiKey || apiKey.includes('•')) {
      toast.error("Please enter an API key first");
      return;
    }

    setTesting(true);
    setTestSuccess(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("verify-api-key", {
        body: { provider: "gemini", key: apiKey, model: selectedModel },
      });

      if (invokeError) throw invokeError;

      if (data?.ok) {
        setTestSuccess(true);
        toast.success(`✅ API Key valid!`);
      } else {
        setTestSuccess(false);
        const errorType = data?.errorType;
        const errorMessage = data?.error || "Unknown error";

        if (errorType === "quota") {
          toast.error("🚫 API Quota exceeded", {
            description: "Try Flash models instead of Pro models",
            duration: 6000,
          });
        } else if (errorType === "invalid_key") {
          toast.error("🔑 Invalid API Key");
        } else if (errorType === "rate_limit") {
          toast.error("⏱️ Rate limited", { description: errorMessage });
        } else {
          toast.error(`Test failed: ${errorMessage}`);
        }
      }
    } catch (error) {
      setTestSuccess(false);
      toast.error("Network error - check your connection");
    } finally {
      setTesting(false);
    }
  };

  const handleKeyChange = (value: string) => {
    setApiKey(value);
    setTestSuccess(null);
    if (hasExistingKey && value !== apiKey) {
      setHasExistingKey(false);
    }
  };

  const handleModelChange = async (value: string) => {
    setSelectedModel(value);
    setTestSuccess(null);
    
    if (hasExistingKey) {
      try {
        const { data: settingsData } = await supabase
          .from('ai_model_settings')
          .select('id')
          .single();
        
        if (settingsData?.id) {
          await supabase
            .from('ai_model_settings')
            .update({ selected_model: value })
            .eq('id', settingsData.id);
        }
        
        // Invalidate cache
        queryClient.invalidateQueries({ queryKey: ["ai-model-settings"] });
        
        toast.success(`Model changed`);
      } catch (error) {
        console.error('Error updating model:', error);
      }
    }
  };

  // Handle auto-sync toggle
  const handleAutoSyncToggle = async (enabled: boolean) => {
    setAutoSyncLoading(true);
    try {
      const { data: settingsData } = await supabase
        .from('ai_model_settings')
        .select('id')
        .single();
      
      if (settingsData?.id) {
        const { error } = await supabase
          .from('ai_model_settings')
          .update({ auto_sync_enabled: enabled })
          .eq('id', settingsData.id);
        
        if (error) throw error;
        
        setAutoSyncEnabled(enabled);
        queryClient.invalidateQueries({ queryKey: ["ai-model-settings"] });
        onAutoSyncChanged?.(enabled);
        
        toast.success(enabled ? "Auto-Sync enabled" : "Auto-Sync disabled");
      }
    } catch (error: any) {
      console.error('Error toggling auto-sync:', error);
      toast.error("Failed to update auto-sync setting");
    } finally {
      setAutoSyncLoading(false);
    }
  };

  const selectedModelInfo = GEMINI_MODELS.find(m => m.id === selectedModel);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-primary/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-400" />
            System Gemini API Key
          </DialogTitle>
          <DialogDescription>
            Platform-wide AI features အတွက် System API Key configure လုပ်ပါ
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Benefits Info */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/10"
          >
            <div className="flex gap-2">
              <Info className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">System API Key ဘာအတွက်လဲ?</p>
                <ul className="space-y-0.5">
                  <li>• Knowledge Base embeddings အတွက်</li>
                  <li>• Auto-title generation for global knowledge</li>
                  <li>• BeeBot free tier users အတွက်</li>
                </ul>
              </div>
            </div>
          </motion.div>

          {/* API Key Input */}
          <div className="space-y-2">
            <Label htmlFor="systemApiKey" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Key
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="systemApiKey"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  placeholder="AIza..."
                  className={`pr-10 ${testSuccess === true ? 'border-green-500' : testSuccess === false ? 'border-red-500' : ''}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
            
            {testSuccess === true && (
              <p className="text-xs text-green-500 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                API Key is valid
              </p>
            )}
          </div>

          {/* Model Selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              Gemini Model
            </Label>
            <Select value={selectedModel} onValueChange={handleModelChange}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  <div className="flex items-center gap-2">
                    {selectedModelInfo && (
                      <>
                        <span className={getTierColor(selectedModelInfo.tier)}>
                          {getTierIcon(selectedModelInfo.tier)}
                        </span>
                        <span>{selectedModelInfo.name}</span>
                        {selectedModelInfo.isNew && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-purple-500/20 text-purple-400">NEW</Badge>
                        )}
                      </>
                    )}
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className="text-green-400 flex items-center gap-2">
                    <Zap className="h-3 w-3" />
                    Flash Models (Fast)
                  </SelectLabel>
                  {GEMINI_MODELS.filter(m => m.tier === "flash").map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{model.name}</span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
                
                <SelectSeparator />
                
                <SelectGroup>
                  <SelectLabel className="text-purple-400 flex items-center gap-2">
                    <Sparkles className="h-3 w-3" />
                    Pro Models (Powerful)
                  </SelectLabel>
                  {GEMINI_MODELS.filter(m => m.tier === "pro").map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{model.name}</span>
                            {model.isNew && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-purple-500/20 text-purple-400">NEW</Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{model.description}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Get API Key Link */}
          <Button
            variant="link"
            className="p-0 h-auto text-xs text-purple-400"
            onClick={() => window.open("https://aistudio.google.com/apikey", "_blank")}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Google AI Studio မှ API Key ယူရန်
          </Button>

          <Separator className="my-2" />

          {/* Auto-Sync Toggle Section */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-3"
          >
            <Label className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-cyan-400" />
              Auto-Sync Settings
            </Label>
            
            <div className={`p-3 rounded-lg border transition-colors ${
              autoSyncEnabled 
                ? 'bg-green-500/5 border-green-500/20' 
                : 'bg-amber-500/5 border-amber-500/20'
            }`}>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Auto-Embed Trigger</p>
                  <p className="text-xs text-muted-foreground">
                    Content ပြောင်းရင် embedding queue ထဲ အလိုအလျောက်ထည့်မည်
                  </p>
                </div>
                <Switch
                  checked={autoSyncEnabled}
                  onCheckedChange={handleAutoSyncToggle}
                  disabled={autoSyncLoading}
                  className={autoSyncEnabled ? 'data-[state=checked]:bg-green-500' : ''}
                />
              </div>
              
              {!autoSyncEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-2 pt-2 border-t border-amber-500/20"
                >
                  <p className="text-xs text-amber-400 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Manual sync သာ အလုပ်လုပ်မည်။ "Sync Pending" ခလုတ်ကို သုံးပါ။
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleTest}
              disabled={testing || loading || !apiKey || apiKey.includes('•')}
            >
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              Test
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={loading || !apiKey || apiKey.includes('•')}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Key className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </div>

          {hasExistingKey && (
            <Button
              variant="ghost"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
              disabled={loading}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove API Key
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});

NeuroBrainSettingsDialog.displayName = "NeuroBrainSettingsDialog";
