import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { 
  IconCpu, 
  IconKey, 
  IconSparkles, 
  IconGift, 
  IconBolt,
  IconEye,
  IconEyeOff,
  IconDeviceFloppy,
  IconX,
  IconUsers,
  IconBrain,
} from "@tabler/icons-react";
import { Loader2, Zap, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { logAdminAction } from "@/lib/auditLog";

// ═══ APEX DUAL-CORE AI MODELS ═══
const GEMINI_MODELS = [
  { id: "gemini-3.5-flash", name: "🚀 Gemini 3.5 Flash", description: "stable + မြန်ဆန်သော agentic model", tier: "flash", isNew: true },
  { id: "gemini-3-flash-preview", name: "🚀 Gemini 3 Flash", description: "အသစ်ဆုံး + အမြန်ဆုံး", tier: "flash", isNew: true },
  { id: "gemini-3.1-pro-preview", name: "🧠 Gemini 3.1 Pro", description: "အသစ်ဆုံး reasoning + token efficient", tier: "pro", isNew: true },
  { id: "gemini-3-pro-image-preview", name: "🎨 Nano Banana Pro", description: "အရည်အသွေးမြင့် Image Generation", tier: "flash", isNew: true },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", description: "stable + high-volume tasks", tier: "flash", isNew: true },
  { id: "gemini-2.5-flash-image", name: "🖼️ Nano Banana", description: "မြန်ဆန်သော Image Generation", tier: "flash", isNew: true },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "ပိုကောင်းသော reasoning", tier: "flash" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", description: "အမြန်ဆုံး + အသက်သာဆုံး", tier: "flash" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Strong reasoning", tier: "pro" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "မြန်ဆန်သော (Stable)", tier: "flash" },
];

const CLAUDE_MODELS = [
  { id: "claude-4-5-sonnet", name: "✨ Claude 4.5 Sonnet", description: "ဖန်တီးနိုင်စွမ်းမြင့်", tier: "pro" },
  { id: "claude-4-6-opus", name: "👑 Claude 4.6 Opus", description: "The God Model", tier: "opus", isNew: true },
];

const DEFAULT_TOKEN_BUDGET = 1000000;

interface GlobalSettings {
  id: string;
  selected_model: string;
  allow_personal_api_key: boolean | null;
  allow_gateway_fallback_content: boolean | null;
  require_personal_key: boolean | null;
  enable_free_tier: boolean | null;
  default_gemini_model: string | null;
  default_claude_model: string | null;
  enable_google_provider: boolean | null;
  enable_anthropic_provider: boolean | null;
  enabled_gemini_models: string[] | null;
  bypass_iu_for_personal_key: boolean | null;
  updated_at: string | null;
  updated_by: string | null;
}

interface GlobalSettingsEditorProps {
  grantedUsersCount: number;
}

interface TestResult {
  success: boolean;
  message?: string;
  model?: string;
  error?: string;
}

export function GlobalSettingsEditor({ grantedUsersCount }: GlobalSettingsEditorProps) {
  const queryClient = useQueryClient();
  
  // State for editable fields
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [defaultGeminiModel, setDefaultGeminiModel] = useState("gemini-3.5-flash");
  const [defaultClaudeModel, setDefaultClaudeModel] = useState("claude-4-5-sonnet");
  const [defaultBudget, setDefaultBudget] = useState(DEFAULT_TOKEN_BUDGET);
  const [enableFreeTier, setEnableFreeTier] = useState(true);
  const [enableGoogleProvider, setEnableGoogleProvider] = useState(true);
  const [enableAnthropicProvider, setEnableAnthropicProvider] = useState(false);
  const [allowPersonalKeys, setAllowPersonalKeys] = useState(false);
  const [bypassIUForPersonalKey, setBypassIUForPersonalKey] = useState(true);
  const [enabledGeminiModels, setEnabledGeminiModels] = useState<string[]>(
    GEMINI_MODELS.map(m => m.id)
  );
  const [isDirty, setIsDirty] = useState(false);
  
  // Test API Key state
  const [isTestingGoogleKey, setIsTestingGoogleKey] = useState(false);
  const [isTestingClaudeKey, setIsTestingClaudeKey] = useState(false);
  const [googleTestResult, setGoogleTestResult] = useState<TestResult | null>(null);
  const [claudeTestResult, setClaudeTestResult] = useState<TestResult | null>(null);

  // Fetch current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ["ai-global-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_model_settings")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      
      // Create default if not exists
      if (!data) {
        const { data: newSettings, error: createError } = await supabase
          .from("ai_model_settings")
          .insert({
            selected_model: 'gemini-3.5-flash',
            allow_personal_api_key: true,
            allow_gateway_fallback_content: true,
            require_personal_key: false,
            enable_free_tier: true,
            default_gemini_model: 'gemini-3.5-flash',
            default_claude_model: 'claude-4-5-sonnet',
          })
          .select()
          .single();
        
        if (createError) throw createError;
        return newSettings as GlobalSettings;
      }
      
      return data as GlobalSettings;
    },
  });

  // Check if system has API keys stored via secure RPC
  const { data: apiKeyStatus, refetch: refetchKeyStatus } = useQuery({
    queryKey: ["admin-api-keys-status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('check_system_api_keys_status');
      if (error) throw error;
      return data as { has_google_key: boolean; has_anthropic_key: boolean; default_gemini_model?: string; default_claude_model?: string; enable_google_provider?: boolean; enable_anthropic_provider?: boolean; allow_personal_api_key?: boolean };
    },
    retry: 3,
    retryDelay: 1000,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Update settings when loaded
  useEffect(() => {
    if (settings) {
      setDefaultGeminiModel(settings.default_gemini_model || settings.selected_model || "gemini-3.5-flash");
      setDefaultClaudeModel(settings.default_claude_model || "claude-4-5-sonnet");
      setEnableFreeTier(settings.enable_free_tier !== false);
      setEnableGoogleProvider(settings.enable_google_provider !== false);
      setEnableAnthropicProvider(settings.enable_anthropic_provider === true);
      setAllowPersonalKeys(settings.allow_personal_api_key === true);
      setBypassIUForPersonalKey(settings.bypass_iu_for_personal_key === true);
      if (settings.enabled_gemini_models) {
        setEnabledGeminiModels(settings.enabled_gemini_models);
      }
    }
  }, [settings]);

  // Test Google API Key function
  const testGoogleKey = async () => {
    if (!googleApiKey) return;
    
    setIsTestingGoogleKey(true);
    setGoogleTestResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('test-gemini-api-key', {
        body: { api_key: googleApiKey }
      });
      
      if (error) throw error;
      
      setGoogleTestResult(data as TestResult);
    } catch (err) {
      setGoogleTestResult({ 
        success: false, 
        error: err instanceof Error ? err.message : "Test failed"
      });
    } finally {
      setIsTestingGoogleKey(false);
    }
  };

  // Test Claude API Key function
  const testClaudeKey = async () => {
    if (!anthropicApiKey) return;
    
    setIsTestingClaudeKey(true);
    setClaudeTestResult(null);
    
    try {
      // Simple validation - check if key starts with correct prefix
      if (!anthropicApiKey.startsWith('sk-ant-')) {
        setClaudeTestResult({ 
          success: false, 
          error: "Invalid key format. Claude keys start with 'sk-ant-'"
        });
        return;
      }
      
      // For now, just validate format since we don't have a test endpoint
      setClaudeTestResult({ 
        success: true, 
        message: "Key format valid",
        model: "claude-4-5-sonnet"
      });
    } catch (err) {
      setClaudeTestResult({ 
        success: false, 
        error: err instanceof Error ? err.message : "Test failed"
      });
    } finally {
      setIsTestingClaudeKey(false);
    }
  };

  // Save dual API keys mutation
  const saveKeysMutation = useMutation({
    mutationFn: async ({ googleKey, anthropicKey }: { googleKey?: string; anthropicKey?: string }) => {
      const { error } = await supabase.rpc('set_system_api_keys', {
        p_google_key: googleKey || null,
        p_anthropic_key: anthropicKey || null,
      });
      if (error) throw error;
      
      await logAdminAction("update_system_api_keys", "ai_model_settings", null, {
        google_key_updated: !!googleKey,
        anthropic_key_updated: !!anthropicKey,
      });
    },
    onSuccess: () => {
      refetchKeyStatus();
      queryClient.invalidateQueries({ queryKey: ["system-api-keys-status"] });
      queryClient.invalidateQueries({ queryKey: ["admin-api-keys-status"] });
      setGoogleApiKey("");
      setAnthropicApiKey("");
      setGoogleTestResult(null);
      setClaudeTestResult(null);
      setIsDirty(false);
      toast({ title: "✅ API Keys updated securely" });
    },
    onError: (error) => {
      toast({ title: "Error saving API keys", description: error.message, variant: "destructive" });
    },
  });

  // Remove Google key mutation (explicit removal)
  const removeGoogleKeyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_system_api_keys', {
        p_google_key: '',
        p_anthropic_key: null,
      });
      if (error) throw error;
      await logAdminAction("remove_system_api_key", "ai_model_settings", null, { google_key_removed: true });
    },
    onSuccess: () => {
      refetchKeyStatus();
      queryClient.invalidateQueries({ queryKey: ["system-api-keys-status"] });
      queryClient.invalidateQueries({ queryKey: ["admin-api-keys-status"] });
      setGoogleApiKey("");
      setGoogleTestResult(null);
      toast({ title: "🗑️ Google API Key removed", variant: "destructive" });
    },
    onError: (error) => {
      toast({ title: "Error removing key", description: error.message, variant: "destructive" });
    },
  });

  // Remove Anthropic key mutation (explicit removal)
  const removeAnthropicKeyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_system_api_keys', {
        p_google_key: null,
        p_anthropic_key: '',
      });
      if (error) throw error;
      await logAdminAction("remove_system_api_key", "ai_model_settings", null, { anthropic_key_removed: true });
    },
    onSuccess: () => {
      refetchKeyStatus();
      queryClient.invalidateQueries({ queryKey: ["system-api-keys-status"] });
      queryClient.invalidateQueries({ queryKey: ["admin-api-keys-status"] });
      setAnthropicApiKey("");
      setClaudeTestResult(null);
      toast({ title: "🗑️ Anthropic API Key removed", variant: "destructive" });
    },
    onError: (error) => {
      toast({ title: "Error removing key", description: error.message, variant: "destructive" });
    },
  });

  // Save other settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!settings?.id) throw new Error("No settings found");

      const updates: Record<string, unknown> = {
        selected_model: defaultGeminiModel,
        default_gemini_model: defaultGeminiModel,
        default_claude_model: defaultClaudeModel,
        enable_free_tier: enableFreeTier,
        enable_google_provider: enableGoogleProvider,
        enable_anthropic_provider: enableAnthropicProvider,
        allow_personal_api_key: allowPersonalKeys,
        bypass_iu_for_personal_key: bypassIUForPersonalKey,
        enabled_gemini_models: enabledGeminiModels,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("ai_model_settings")
        .update(updates)
        .eq("id", settings.id);

      if (error) throw error;

      // Log admin action
      await logAdminAction("update_global_ai_settings", "ai_model_settings", settings.id, {
        default_gemini_model: defaultGeminiModel,
        default_claude_model: defaultClaudeModel,
        enable_free_tier: enableFreeTier,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-global-settings"] });
      queryClient.invalidateQueries({ queryKey: ["ai-model-settings"] });
      queryClient.invalidateQueries({ queryKey: ["system-api-keys-status"] });
      queryClient.invalidateQueries({ queryKey: ["admin-api-keys-status"] });
      setIsDirty(false);
      toast({ title: "✅ Global settings saved successfully" });
    },
    onError: (error) => {
      toast({ title: "Error saving settings", description: error.message, variant: "destructive" });
    },
  });

  const formatTokens = (num: number) => {
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const hasGoogleKey = apiKeyStatus?.has_google_key ?? false;
  const hasAnthropicKey = apiKeyStatus?.has_anthropic_key ?? false;

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconCpu className="h-5 w-5 text-primary" />
              APEX Dual-Core AI Settings
            </CardTitle>
            <CardDescription>
              Gemini + Claude dual-engine configuration for the Apex Intelligence System
            </CardDescription>
          </div>
          {isDirty && (
            <Button 
              onClick={() => saveSettingsMutation.mutate()}
              disabled={saveSettingsMutation.isPending}
              className="gap-2"
            >
              {saveSettingsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <IconDeviceFloppy className="h-4 w-4" />
              )}
              Save Settings
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Free Tier Toggle */}
        <div className="p-4 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <IconUsers className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <Label className="text-sm font-medium flex items-center gap-2">
                  Enable Free Tier for All Users
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">APEX</Badge>
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  All users can use AI within daily IU limits (no manual grant required)
                </p>
              </div>
            </div>
            <Switch
              checked={enableFreeTier}
              onCheckedChange={(checked) => {
                setEnableFreeTier(checked);
                setIsDirty(true);
              }}
            />
          </div>
          {enableFreeTier && (
            <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-500/10 rounded-md px-3 py-2">
              <Zap className="h-3.5 w-3.5" />
              <span>All users can now access AI features automatically within their tier limits!</span>
            </div>
          )}
        </div>

        {/* IU Bypass for Personal Key Users */}
        <div className="p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <IconKey className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <Label className="text-sm font-medium flex items-center gap-2">
                  Bypass IU for Personal Key Users
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">RPM</Badge>
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Personal API Key သုံးတဲ့ users တွေ IU ကိုမတွက်ပါ — ကိုယ့် API quota ကိုသာ သုံးပါ
                </p>
              </div>
            </div>
            <Switch
              checked={bypassIUForPersonalKey}
              onCheckedChange={(checked) => {
                setBypassIUForPersonalKey(checked);
                setIsDirty(true);
              }}
            />
          </div>
          {bypassIUForPersonalKey && (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-md px-3 py-2">
              <IconKey className="h-3.5 w-3.5" />
              <span>Personal key users can use BeeBot without IU limits — only their API rate limits apply.</span>
            </div>
          )}
        </div>

        <div className="p-4 rounded-lg bg-background/50 border border-blue-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded bg-blue-500/20">
                <IconSparkles className="h-4 w-4 text-blue-500" />
              </div>
              <Label className="text-sm font-medium">Google Gemini API Key</Label>
              <Badge variant={hasGoogleKey ? "default" : "destructive"} className={hasGoogleKey ? "bg-blue-500" : ""}>
                {hasGoogleKey ? "✅ Configured" : "⚠️ Not Set"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Enable</Label>
              <Switch
                checked={enableGoogleProvider}
                onCheckedChange={(checked) => {
                  setEnableGoogleProvider(checked);
                  setIsDirty(true);
                }}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showGoogleKey ? "text" : "password"}
                value={googleApiKey}
                onChange={(e) => {
                  setGoogleApiKey(e.target.value);
                  setGoogleTestResult(null);
                }}
                placeholder={hasGoogleKey ? "••••••••••••••••••••" : "Enter Gemini API Key..."}
                className="pr-10"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowGoogleKey(!showGoogleKey)}
              >
                {showGoogleKey ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
              </Button>
            </div>
            {googleApiKey && (
              <>
                <Button variant="outline" onClick={testGoogleKey} disabled={isTestingGoogleKey} className="gap-2">
                  {isTestingGoogleKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  Test
                </Button>
                <Button 
                  onClick={() => saveKeysMutation.mutate({ googleKey: googleApiKey })}
                  disabled={saveKeysMutation.isPending}
                  className="gap-2"
                >
                  {saveKeysMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <IconDeviceFloppy className="h-4 w-4" />}
                  Save
                </Button>
              </>
            )}
            {hasGoogleKey && !googleApiKey && (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => removeGoogleKeyMutation.mutate()}
                disabled={removeGoogleKeyMutation.isPending}
              >
                {removeGoogleKeyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <IconX className="h-4 w-4" />}
              </Button>
            )}
          </div>
          
          {googleTestResult && (
            <div className={`flex items-center gap-2 p-2.5 rounded-lg text-sm ${
              googleTestResult.success 
                ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20" 
                : "bg-destructive/10 text-destructive border border-destructive/20"
            }`}>
              {googleTestResult.success ? (
                <><CheckCircle2 className="h-4 w-4 flex-shrink-0" /><span>✅ Valid! Model: {googleTestResult.model}</span></>
              ) : (
                <><XCircle className="h-4 w-4 flex-shrink-0" /><span>❌ {googleTestResult.error}</span></>
              )}
            </div>
          )}

          {/* ═══ GEMINI MODEL ACCESS CONTROL ═══ */}
          {enableGoogleProvider && hasGoogleKey && (
            <div className="mt-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 space-y-3">
              <div className="flex items-center gap-2">
                <IconCpu className="h-4 w-4 text-blue-400" />
                <Label className="text-sm font-medium">Gemini Model Access Control</Label>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">PER-MODEL</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                User တွေက သုံးခွင့်ရမယ့် Gemini model တွေကို ရွေးချယ်ပါ။ အနည်းဆုံး model ၁ ခု enable ထားရပါမည်။
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {GEMINI_MODELS.map((model) => {
                  const isEnabled = enabledGeminiModels.includes(model.id);
                  const isLastEnabled = isEnabled && enabledGeminiModels.length === 1;
                  return (
                    <div 
                      key={model.id}
                      className={cn(
                        "flex items-center justify-between p-2.5 rounded-lg border transition-colors",
                        isEnabled 
                          ? "bg-blue-500/10 border-blue-500/30" 
                          : "bg-muted/30 border-border/30 opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <IconSparkles className={cn("h-3.5 w-3.5 shrink-0", isEnabled ? "text-blue-400" : "text-muted-foreground")} />
                        <div className="min-w-0">
                          <span className="text-xs font-medium truncate block">{model.name}</span>
                          <span className="text-[10px] text-muted-foreground truncate block">{model.description}</span>
                        </div>
                        {model.isNew && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">NEW</Badge>
                        )}
                      </div>
                      <Switch
                        checked={isEnabled}
                        disabled={isLastEnabled}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEnabledGeminiModels(prev => [...prev, model.id]);
                          } else {
                            setEnabledGeminiModels(prev => prev.filter(id => id !== model.id));
                          }
                          setIsDirty(true);
                        }}
                        className="shrink-0 ml-2"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ═══ ANTHROPIC CLAUDE API KEY SECTION ═══ */}
        <div className="p-4 rounded-lg bg-background/50 border border-amber-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded bg-amber-500/20">
                <IconBrain className="h-4 w-4 text-amber-500" />
              </div>
              <Label className="text-sm font-medium">Anthropic Claude API Key</Label>
              <Badge variant={hasAnthropicKey ? "default" : "secondary"} className={hasAnthropicKey ? "bg-amber-500" : ""}>
                {hasAnthropicKey ? "✅ Configured" : "Optional"}
              </Badge>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Alpha+ Only</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Enable</Label>
              <Switch
                checked={enableAnthropicProvider}
                onCheckedChange={(checked) => {
                  setEnableAnthropicProvider(checked);
                  setIsDirty(true);
                }}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showAnthropicKey ? "text" : "password"}
                value={anthropicApiKey}
                onChange={(e) => {
                  setAnthropicApiKey(e.target.value);
                  setClaudeTestResult(null);
                }}
                placeholder={hasAnthropicKey ? "••••••••••••••••••••" : "sk-ant-... (Optional for Alpha tier)"}
                className="pr-10"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowAnthropicKey(!showAnthropicKey)}
              >
                {showAnthropicKey ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
              </Button>
            </div>
            {anthropicApiKey && (
              <>
                <Button variant="outline" onClick={testClaudeKey} disabled={isTestingClaudeKey} className="gap-2">
                  {isTestingClaudeKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  Test
                </Button>
                <Button 
                  onClick={() => saveKeysMutation.mutate({ anthropicKey: anthropicApiKey })}
                  disabled={saveKeysMutation.isPending}
                  className="gap-2"
                >
                  {saveKeysMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <IconDeviceFloppy className="h-4 w-4" />}
                  Save
                </Button>
              </>
            )}
            {hasAnthropicKey && !anthropicApiKey && (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => removeAnthropicKeyMutation.mutate()}
                disabled={removeAnthropicKeyMutation.isPending}
              >
                {removeAnthropicKeyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <IconX className="h-4 w-4" />}
              </Button>
            )}
          </div>
          
          {claudeTestResult && (
            <div className={`flex items-center gap-2 p-2.5 rounded-lg text-sm ${
              claudeTestResult.success 
                ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20" 
                : "bg-destructive/10 text-destructive border border-destructive/20"
            }`}>
              {claudeTestResult.success ? (
                <><CheckCircle2 className="h-4 w-4 flex-shrink-0" /><span>✅ Valid! Format correct for Claude</span></>
              ) : (
                <><XCircle className="h-4 w-4 flex-shrink-0" /><span>❌ {claudeTestResult.error}</span></>
              )}
            </div>
          )}
          
          <p className="text-xs text-muted-foreground">
            ℹ️ Claude access is for Alpha tier and above. Enables "The God Model" (Claude 4.6 Opus).
          </p>
        </div>

        {/* ═══ ALLOW PERSONAL KEYS TOGGLE ═══ */}
        <div className="p-4 rounded-lg bg-background/50 border border-purple-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <IconKey className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <Label className="text-sm font-medium flex items-center gap-2">
                  Allow Personal API Keys
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">HYBRID</Badge>
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Users can add their own keys but remain bound by their tier's IU limits
                </p>
              </div>
            </div>
            <Switch
              checked={allowPersonalKeys}
              onCheckedChange={(checked) => {
                setAllowPersonalKeys(checked);
                setIsDirty(true);
              }}
            />
          </div>
          {allowPersonalKeys && (
            <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 bg-purple-500/10 rounded-md px-3 py-2">
              <IconKey className="h-3.5 w-3.5" />
              <span>Users can use personal keys. IU limits still enforced regardless of key source.</span>
            </div>
          )}
        </div>

        {/* Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Default Gemini Model */}
          <div className="p-4 rounded-lg bg-background/50 border border-border/50 space-y-3">
            <div className="flex items-center gap-2">
              <IconSparkles className="h-4 w-4 text-blue-500" />
              <Label className="text-sm font-medium">Default Gemini</Label>
            </div>
            <Select 
              value={defaultGeminiModel} 
              onValueChange={(value) => {
                setDefaultGeminiModel(value);
                setIsDirty(true);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className="text-green-400 flex items-center gap-2">
                    <IconBolt className="h-3 w-3" />Flash (Fast)
                  </SelectLabel>
                  {GEMINI_MODELS.filter(m => m.tier === "flash").map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex items-center gap-2">
                        <span>{model.name}</span>
                        {model.isNew && <Badge variant="secondary" className="text-[10px] px-1 py-0">NEW</Badge>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel className="text-purple-400 flex items-center gap-2">
                    <IconSparkles className="h-3 w-3" />Pro (Powerful)
                  </SelectLabel>
                  {GEMINI_MODELS.filter(m => m.tier === "pro").map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex items-center gap-2">
                        <span>{model.name}</span>
                        {model.isNew && <Badge variant="secondary" className="text-[10px] px-1 py-0">NEW</Badge>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          
          {/* Default Claude Model */}
          <div className="p-4 rounded-lg bg-background/50 border border-border/50 space-y-3">
            <div className="flex items-center gap-2">
              <IconBrain className="h-4 w-4 text-amber-500" />
              <Label className="text-sm font-medium">Default Claude</Label>
            </div>
            <Select 
              value={defaultClaudeModel} 
              onValueChange={(value) => {
                setDefaultClaudeModel(value);
                setIsDirty(true);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {CLAUDE_MODELS.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex items-center gap-2">
                      <span>{model.name}</span>
                      {model.isNew && <Badge variant="secondary" className="text-[10px] px-1 py-0">NEW</Badge>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Alpha+ tiers</p>
          </div>
          
          {/* Provider Status */}
          <div className="p-4 rounded-lg bg-background/50 border border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <IconBolt className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Provider Status</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Google Gemini</span>
                <Badge variant={hasGoogleKey && enableGoogleProvider ? "default" : "outline"} className={hasGoogleKey && enableGoogleProvider ? "bg-blue-500" : ""}>
                  {!enableGoogleProvider ? "Disabled" : hasGoogleKey ? "Active" : "Not Set"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Anthropic Claude</span>
                <Badge variant={hasAnthropicKey && enableAnthropicProvider ? "default" : "outline"} className={hasAnthropicKey && enableAnthropicProvider ? "bg-amber-500" : ""}>
                  {!enableAnthropicProvider ? "Disabled" : hasAnthropicKey ? "Active" : "Not Set"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Personal Keys</span>
                <Badge variant={allowPersonalKeys ? "default" : "outline"} className={allowPersonalKeys ? "bg-purple-500" : ""}>
                  {allowPersonalKeys ? "Allowed" : "Disabled"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t border-border/50">
                <span className="text-muted-foreground">Free Tier Users</span>
                <span className="font-bold text-primary">{grantedUsersCount}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
