import { useState, useEffect } from "react";
import { motion } from "motion/react";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import {
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Zap,
  Cpu,
  ExternalLink,
  AlertCircle,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useSRTSettings, GEMINI_MODELS } from "@/hooks/useSRTSettings";
import { cn } from "@/lib/utils";

interface SRTSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SRTSettingsDialog({ open, onOpenChange }: SRTSettingsDialogProps) {
  const {
    globalSettings,
    userSettings,
    isLoading,
    saveSettings,
    deleteApiKey,
    testApiKey,
    getAIMode,
  } = useSRTSettings();

  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-3.5-flash");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Sync with user settings when loaded
  useEffect(() => {
    if (userSettings) {
      // Show masked key if exists, never show actual key
      setApiKey(userSettings.gemini_api_key === 'EXISTS' ? '••••••••••••••••••••••••••••••••••••••••' : "");
      setSelectedModel(userSettings.gemini_model || "gemini-3.5-flash");
    }
  }, [userSettings]);

  const handleTestApiKey = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, error: "API Key ထည့်ပါ" });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const result = await testApiKey(apiKey);
    setTestResult(result);
    setIsTesting(false);
  };

  const handleSave = () => {
    saveSettings.mutate({
      gemini_api_key: apiKey.trim() || undefined,
      gemini_model: selectedModel,
    });
    onOpenChange(false);
  };

  const handleDeleteApiKey = () => {
    deleteApiKey.mutate();
    setApiKey("");
    setTestResult(null);
  };

  const aiMode = getAIMode();
  const hasExistingKey = !!userSettings?.gemini_api_key;

  const flashModels = GEMINI_MODELS.filter((m) => m.tier === "flash");
  const proModels = GEMINI_MODELS.filter((m) => m.tier === "pro");
  const experimentalModels = GEMINI_MODELS.filter((m) => m.tier === "experimental");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Cpu className="h-4 w-4 text-white" />
            </div>
            Easy SRT AI Settings
          </DialogTitle>
          <DialogDescription>
            ကိုယ်ပိုင် Gemini API Key သုံး၍ ပိုမြန်စွာ ဘာသာပြန်ပါ
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            {/* Benefits Info */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2 text-amber-500 mb-2">
                <Zap className="h-4 w-4" />
                <span className="font-medium text-sm">ကိုယ်ပိုင် API Key အကျိုးကျေးဇူးများ</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• ပိုမြန်သော Processing (Rate limit မရှိ)</li>
                <li>• Pro models အပါအဝင် Model အားလုံး ရနိုင်</li>
                <li>• သင့်ရဲ့ Google Cloud billing သို့တိုက်ရိုက် charge</li>
              </ul>
            </div>

            {/* API Key Input */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Key className="h-4 w-4 text-amber-500" />
                Gemini API Key
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder="AIza..."
                    className="pr-10 bg-card/50 border-border/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  onClick={handleTestApiKey}
                  disabled={isTesting || !apiKey.trim()}
                  className="shrink-0"
                >
                  {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
                </Button>
              </div>

              {/* Test Result */}
              {testResult && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    testResult.success ? "text-green-500" : "text-destructive"
                  )}
                >
                  {testResult.success ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      API Key is valid ✓
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      {testResult.error}
                    </>
                  )}
                </motion.div>
              )}

              {/* Get API Key Link */}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-amber-500 hover:underline"
              >
                Google AI Studio မှ API Key ရယူရန်
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Model Selector */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-amber-500" />
                Gemini Model
              </Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="bg-card/50 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel className="flex items-center gap-2">
                      <span>⚡</span> Flash Models (မြန်ဆန်)
                    </SelectLabel>
                    {flashModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <span className="flex items-center gap-2">
                          <span>{model.icon}</span>
                          <span>{model.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({model.nameNative})
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="flex items-center gap-2">
                      <span>🌟</span> Pro Models (အားကောင်း)
                    </SelectLabel>
                    {proModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <span className="flex items-center gap-2">
                          <span>{model.icon}</span>
                          <span>{model.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({model.nameNative})
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="flex items-center gap-2">
                      <span>🧪</span> Experimental
                    </SelectLabel>
                    {experimentalModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <span className="flex items-center gap-2">
                          <span>{model.icon}</span>
                          <span>{model.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({model.nameNative})
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {/* Gateway Status */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium flex items-center gap-2">
                  {globalSettings?.allow_gateway_access ? (
                    <Wifi className="h-4 w-4 text-green-500" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  App Gateway Status
                </span>
                <Badge
                  variant={globalSettings?.allow_gateway_access ? "default" : "secondary"}
                  className={cn(
                    "text-[10px]",
                    globalSettings?.allow_gateway_access
                      ? "bg-green-500/20 text-green-500"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {globalSettings?.allow_gateway_access ? "Available" : "Disabled"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {globalSettings?.allow_gateway_access
                  ? `Gateway ဖွင့်ထားပါသည် (${globalSettings.gateway_model})`
                  : "Gateway ပိတ်ထားပါသည်။ ကိုယ်ပိုင် API Key ထည့်၍ အသုံးပြုပါ။"}
              </p>
            </div>

            {/* Current Mode */}
            <div className="p-3 rounded-lg bg-card/50 border border-border/50">
              <p className="text-sm text-center">{aiMode.message}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              {hasExistingKey && (
                <Button
                  variant="outline"
                  onClick={handleDeleteApiKey}
                  disabled={deleteApiKey.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Key
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={saveSettings.isPending}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
              >
                {saveSettings.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Save & Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
