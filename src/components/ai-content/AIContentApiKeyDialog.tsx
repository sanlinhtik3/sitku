import { memo, useState, useEffect } from "react";
import { motion } from "motion/react";
import { Settings, Key, Eye, EyeOff, ExternalLink, Trash2, CheckCircle, Loader2, Info, Cpu, Sparkles, Zap, Brain, ArrowLeft, Router, Atom } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface AIContentApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onKeyUpdated?: () => void;
  initialTab?: string;
}

type ProviderTab = 'gemini' | 'claude' | 'openrouter' | 'xai';

// Gemini Models
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

// Claude Models
const CLAUDE_MODELS = [
  { id: "claude-sonnet-4-20250514", name: "🧠 Claude Sonnet 4", description: "Best balance of speed + intelligence", tier: "sonnet", isNew: true },
  { id: "claude-opus-4-20250514", name: "👑 Claude Opus 4", description: "Most powerful reasoning", tier: "opus", isNew: true },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", description: "Fast + intelligent (Stable)", tier: "sonnet" },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", description: "အမြန်ဆုံး + အသက်သာဆုံး", tier: "haiku" },
];

// OpenRouter Models
const OPENROUTER_MODELS = [
  { id: "openai/gpt-4o", name: "🌐 GPT-4o", description: "OpenAI's multimodal flagship", tier: "pro", isNew: true },
  { id: "anthropic/claude-sonnet-4", name: "🧠 Claude Sonnet 4", description: "Via OpenRouter routing", tier: "sonnet", isNew: true },
  { id: "meta-llama/llama-4-maverick", name: "🦙 Llama 4 Maverick", description: "Meta's latest open model", tier: "pro", isNew: true },
  { id: "google/gemini-2.5-pro", name: "💎 Gemini 2.5 Pro", description: "Via OpenRouter routing", tier: "pro" },
  { id: "mistralai/mistral-large", name: "🌊 Mistral Large", description: "Mistral's most capable model", tier: "pro" },
  { id: "deepseek/deepseek-r1", name: "🔬 DeepSeek R1", description: "Advanced reasoning model", tier: "flash" },
];

// Grok (xAI) Models
const GROK_MODELS = [
  { id: "grok-3", name: "⚡ Grok 3", description: "xAI's most powerful model", tier: "pro", isNew: true },
  { id: "grok-3-mini", name: "🚀 Grok 3 Mini", description: "Fast + cost-efficient reasoning", tier: "flash", isNew: true },
  { id: "grok-3-fast", name: "💨 Grok 3 Fast", description: "Optimized for speed", tier: "flash" },
];

const getTierIcon = (tier: string) => {
  switch (tier) {
    case "flash": return <Zap className="h-3 w-3" />;
    case "pro": return <Sparkles className="h-3 w-3" />;
    case "sonnet": return <Brain className="h-3 w-3" />;
    case "opus": return <Sparkles className="h-3 w-3" />;
    case "haiku": return <Zap className="h-3 w-3" />;
    default: return <Cpu className="h-3 w-3" />;
  }
};

const getTierColor = (tier: string) => {
  switch (tier) {
    case "flash": return "text-green-400";
    case "pro": return "text-purple-400";
    case "sonnet": return "text-orange-400";
    case "opus": return "text-red-400";
    case "haiku": return "text-cyan-400";
    default: return "text-muted-foreground";
  }
};

const PROVIDER_CONFIG: Record<ProviderTab, {
  label: string;
  icon: React.ReactNode;
  placeholder: string;
  getKeyLink: string;
  getLinkLabel: string;
  info: string;
  benefits: string[];
  dbField?: string;
  isUserApiKeys?: boolean;
}> = {
  gemini: {
    label: "Google Gemini",
    icon: <Zap className="h-3.5 w-3.5" />,
    placeholder: "AIza...",
    getKeyLink: "https://aistudio.google.com/apikey",
    getLinkLabel: "Google AI Studio မှ API Key ယူရန်",
    info: "ဘာကြောင့် Gemini Key သုံးသင့်လဲ?",
    benefits: ["Credits မကုန်တော့ - ကိုယ့် Key ကိုယ်သုံး", "Gemini Pro 3 အပါအဝင် Model အားလုံး သုံးလို့ရ", "ပိုမြန်သော generation speed"],
  },
  claude: {
    label: "Anthropic Claude",
    icon: <Brain className="h-3.5 w-3.5" />,
    placeholder: "sk-ant-...",
    getKeyLink: "https://console.anthropic.com/settings/keys",
    getLinkLabel: "Anthropic Console မှ API Key ယူရန်",
    info: "ဘာကြောင့် Claude Key သုံးသင့်လဲ?",
    benefits: ["Credits မကုန်တော့ - ကိုယ့် Key ကိုယ်သုံး", "Claude Opus 4 အပါအဝင် အကောင်းဆုံး models", "Superior reasoning + code generation"],
  },
  openrouter: {
    label: "OpenRouter",
    icon: <Router className="h-3.5 w-3.5" />,
    placeholder: "sk-or-...",
    getKeyLink: "https://openrouter.ai/keys",
    getLinkLabel: "OpenRouter မှ API Key ယူရန်",
    info: "ဘာကြောင့် OpenRouter သုံးသင့်လဲ?",
    benefits: ["200+ AI models ကို Key တစ်ခုတည်းနဲ့ access", "GPT-4o, Llama, Mistral, DeepSeek စသည်", "Auto-routing ဖြင့် အကောင်းဆုံး model ရွေး"],
    isUserApiKeys: true,
  },
  xai: {
    label: "Grok (xAI)",
    icon: <Atom className="h-3.5 w-3.5" />,
    placeholder: "xai-...",
    getKeyLink: "https://console.x.ai/",
    getLinkLabel: "xAI Console မှ API Key ယူရန်",
    info: "ဘာကြောင့် Grok သုံးသင့်လဲ?",
    benefits: ["Real-time knowledge + web access", "Grok 3 - xAI ၏ အစွမ်းထက်ဆုံး model", "Fast reasoning + humor-aware responses"],
    isUserApiKeys: true,
  },
};

export const AIContentApiKeyDialog = memo(({
  open,
  onOpenChange,
  userId,
  onKeyUpdated,
  initialTab,
}: AIContentApiKeyDialogProps) => {
  const queryClient = useQueryClient();
  const [activeProvider, setActiveProvider] = useState<ProviderTab>('gemini');

  // Gemini state
  const [geminiKey, setGeminiKey] = useState("");
  const [selectedGeminiModel, setSelectedGeminiModel] = useState("gemini-3.5-flash");
  const [hasExistingGeminiKey, setHasExistingGeminiKey] = useState(false);

  // Claude state
  const [claudeKey, setClaudeKey] = useState("");
  const [selectedClaudeModel, setSelectedClaudeModel] = useState("claude-sonnet-4-20250514");
  const [hasExistingClaudeKey, setHasExistingClaudeKey] = useState(false);

  // OpenRouter state
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [selectedOpenrouterModel, setSelectedOpenrouterModel] = useState("openai/gpt-4o");
  const [hasExistingOpenrouterKey, setHasExistingOpenrouterKey] = useState(false);

  // Grok state
  const [xaiKey, setXaiKey] = useState("");
  const [selectedXaiModel, setSelectedXaiModel] = useState("grok-3");
  const [hasExistingXaiKey, setHasExistingXaiKey] = useState(false);

  // Shared state
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);

  useEffect(() => {
    if (open && userId) {
      fetchKeyStatus();
      if (initialTab && ['gemini', 'claude', 'openrouter', 'xai'].includes(initialTab)) {
        setActiveProvider(initialTab as ProviderTab);
      }
    }
  }, [open, userId, initialTab]);

  // Reset test state when switching providers
  useEffect(() => {
    setTestSuccess(null);
    setShowKey(false);
  }, [activeProvider]);

  const fetchKeyStatus = async () => {
    try {
      const [geminiResult, claudeResult, settingsResult, openrouterResult, xaiResult] = await Promise.all([
        supabase.rpc('check_user_has_gemini_api_key', { p_user_id: userId }),
        supabase.rpc('check_user_has_anthropic_api_key', { p_user_id: userId }),
        supabase.from('ai_user_settings').select('gemini_model').eq('user_id', userId).single(),
        supabase.rpc('check_user_api_key_exists', { p_user_id: userId, p_provider: 'openrouter' }),
        supabase.rpc('check_user_api_key_exists', { p_user_id: userId, p_provider: 'xai' }),
      ]);

      setHasExistingGeminiKey(!!geminiResult.data);
      setGeminiKey(geminiResult.data ? '••••••••••••••••••••••••••••••••••••••••' : '');

      setHasExistingClaudeKey(!!claudeResult.data);
      setClaudeKey(claudeResult.data ? '••••••••••••••••••••••••••••••••••••••••' : '');

      setHasExistingOpenrouterKey(!!openrouterResult.data);
      setOpenrouterKey(openrouterResult.data ? '••••••••••••••••••••••••••••••••••••••••' : '');

      setHasExistingXaiKey(!!xaiResult.data);
      setXaiKey(xaiResult.data ? '••••••••••••••••••••••••••••••••••••••••' : '');

      if (settingsResult.data?.gemini_model) {
        const model = settingsResult.data.gemini_model;
        if (model.startsWith('claude-')) {
          setSelectedClaudeModel(model);
        } else {
          setSelectedGeminiModel(model);
        }
      }
    } catch (error) {
      setHasExistingGeminiKey(false);
      setGeminiKey('');
      setHasExistingClaudeKey(false);
      setClaudeKey('');
      setHasExistingOpenrouterKey(false);
      setOpenrouterKey('');
      setHasExistingXaiKey(false);
      setXaiKey('');
    }
  };

  const getKeyState = () => {
    switch (activeProvider) {
      case 'gemini': return { key: geminiKey, setKey: setGeminiKey, hasKey: hasExistingGeminiKey, setHasKey: setHasExistingGeminiKey, model: selectedGeminiModel, models: GEMINI_MODELS };
      case 'claude': return { key: claudeKey, setKey: setClaudeKey, hasKey: hasExistingClaudeKey, setHasKey: setHasExistingClaudeKey, model: selectedClaudeModel, models: CLAUDE_MODELS };
      case 'openrouter': return { key: openrouterKey, setKey: setOpenrouterKey, hasKey: hasExistingOpenrouterKey, setHasKey: setHasExistingOpenrouterKey, model: selectedOpenrouterModel, models: OPENROUTER_MODELS };
      case 'xai': return { key: xaiKey, setKey: setXaiKey, hasKey: hasExistingXaiKey, setHasKey: setHasExistingXaiKey, model: selectedXaiModel, models: GROK_MODELS };
    }
  };

  const ks = getKeyState();
  const providerCfg = PROVIDER_CONFIG[activeProvider];

  const handleSave = async () => {
    if (!ks.key || ks.key.includes('•')) {
      toast.error("Please enter a valid API key");
      return;
    }

    setLoading(true);
    try {
      if (activeProvider === 'openrouter' || activeProvider === 'xai') {
        // Save to user_api_keys table
        const { data: existing } = await supabase
          .from('user_api_keys')
          .select('id')
          .eq('user_id', userId)
          .eq('provider', activeProvider)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('user_api_keys')
            .update({ api_key_encrypted: ks.key, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('user_api_keys')
            .insert({ user_id: userId, provider: activeProvider, api_key_encrypted: ks.key });
          if (error) throw error;
        }
      } else {
        // Gemini/Claude save to ai_user_settings
        const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
        if (activeProvider === 'gemini') {
          updateData.gemini_api_key = ks.key;
          updateData.gemini_model = selectedGeminiModel;
        } else {
          updateData.personal_anthropic_key = ks.key;
        }
        const { error } = await supabase
          .from('ai_user_settings')
          .upsert({ user_id: userId, ...updateData }, { onConflict: 'user_id' });
        if (error) throw error;
      }

      toast.success(`✅ ${providerCfg.label} API Key saved!`);
      ks.setHasKey(true);

      queryClient.invalidateQueries({ queryKey: ["user-ai-settings"] });
      queryClient.invalidateQueries({ queryKey: ["ai-usage-analytics"] });
      onKeyUpdated?.();
    } catch (error: any) {
      toast.error("Failed to save: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      if (activeProvider === 'openrouter' || activeProvider === 'xai') {
        const { error } = await supabase
          .from('user_api_keys')
          .delete()
          .eq('user_id', userId)
          .eq('provider', activeProvider);
        if (error) throw error;
      } else {
        const updateData: Record<string, any> = {};
        if (activeProvider === 'gemini') {
          updateData.gemini_api_key = null;
          updateData.gemini_model = 'gemini-3.5-flash';
        } else {
          updateData.personal_anthropic_key = null;
        }
        const { error } = await supabase
          .from('ai_user_settings')
          .update(updateData)
          .eq('user_id', userId);
        if (error) throw error;
      }

      toast.success(`${providerCfg.label} API Key deleted`);
      ks.setKey('');
      ks.setHasKey(false);
      setTestSuccess(null);

      queryClient.invalidateQueries({ queryKey: ["user-ai-settings"] });
      queryClient.invalidateQueries({ queryKey: ["ai-usage-analytics"] });
      onKeyUpdated?.();
    } catch (error: any) {
      toast.error("Failed to delete API key");
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!ks.key || ks.key.includes('•')) {
      toast.error("Please enter an API key first");
      return;
    }

    setTesting(true);
    setTestSuccess(null);

    try {
      const modelByProvider: Record<string, string> = {
        gemini: selectedGeminiModel,
        claude: selectedClaudeModel,
        openrouter: selectedOpenrouterModel,
        xai: selectedXaiModel,
      };

      const { data, error: invokeError } = await supabase.functions.invoke("verify-api-key", {
        body: {
          provider: activeProvider,
          key: ks.key,
          model: modelByProvider[activeProvider],
        },
      });

      if (invokeError) throw invokeError;

      if (data?.ok) {
        setTestSuccess(true);
        toast.success(`✅ ${providerCfg.label} API Key valid!`);
      } else {
        setTestSuccess(false);
        toast.error(data?.error || `Invalid ${providerCfg.label} API Key`);
      }
    } catch (error) {
      setTestSuccess(false);
      toast.error("Network error - check your connection");
    } finally {
      setTesting(false);
    }
  };

  const handleKeyChange = (value: string) => {
    setTestSuccess(null);
    ks.setKey(value);
    if (ks.hasKey) ks.setHasKey(false);
  };

  const handleModelChange = async (value: string) => {
    setTestSuccess(null);
    switch (activeProvider) {
      case 'gemini':
        setSelectedGeminiModel(value);
        if (hasExistingGeminiKey) {
          try {
            await supabase.from('ai_user_settings').update({ gemini_model: value }).eq('user_id', userId);
            queryClient.invalidateQueries({ queryKey: ["user-ai-settings"] });
            toast.success("Model changed");
          } catch {}
        }
        break;
      case 'claude': setSelectedClaudeModel(value); break;
      case 'openrouter': setSelectedOpenrouterModel(value); break;
      case 'xai': setSelectedXaiModel(value); break;
    }
  };

  const selectedModelInfo = ks.models.find(m => m.id === ks.model);

  const renderModelSelector = () => {
    const models = ks.models;
    const tiers = [...new Set(models.map(m => m.tier))];

    const tierLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
      flash: { label: "Fast Models", color: "text-green-400", icon: <Zap className="h-3 w-3" /> },
      pro: { label: "Pro Models", color: "text-purple-400", icon: <Sparkles className="h-3 w-3" /> },
      sonnet: { label: "Sonnet Models", color: "text-orange-400", icon: <Brain className="h-3 w-3" /> },
      opus: { label: "Opus Models", color: "text-red-400", icon: <Sparkles className="h-3 w-3" /> },
      haiku: { label: "Haiku Models", color: "text-cyan-400", icon: <Zap className="h-3 w-3" /> },
    };

    return (
      <Select value={ks.model} onValueChange={handleModelChange}>
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
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-primary/20 text-primary">NEW</Badge>
                  )}
                </>
              )}
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {tiers.map((tier, idx) => {
            const tierInfo = tierLabels[tier] || { label: tier, color: "text-muted-foreground", icon: <Cpu className="h-3 w-3" /> };
            return (
              <div key={tier}>
                {idx > 0 && <SelectSeparator />}
                <SelectGroup>
                  <SelectLabel className={`${tierInfo.color} flex items-center gap-2`}>
                    {tierInfo.icon} {tierInfo.label}
                  </SelectLabel>
                  {models.filter(m => m.tier === tier).map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{model.name}</span>
                          {model.isNew && <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-primary/20 text-primary">NEW</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </div>
            );
          })}
        </SelectContent>
      </Select>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-primary/20">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Personal AI API Keys
          </DialogTitle>
          <DialogDescription>
            သင့်ကိုယ်ပိုင် API Key သုံးပြီး AI Content generate လုပ်ပါ (FREE - no credits)
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeProvider} onValueChange={(v) => setActiveProvider(v as ProviderTab)}>
          {/* Note: OpenRouter & xAI tabs hidden — only Gemini + Claude exposed for AI Content Writer.
              Power users still configure OR/xAI via the BeeBot key flow that writes to user_api_keys. */}
          <TabsList className="w-full grid grid-cols-2 h-auto">
            {(['gemini', 'claude'] as ProviderTab[]).map(p => {
              const cfg = PROVIDER_CONFIG[p];
              const hasKey = p === 'gemini' ? hasExistingGeminiKey : hasExistingClaudeKey;
              return (
                <TabsTrigger key={p} value={p} className="gap-1 text-xs px-2 py-2">
                  {cfg.icon}
                  <span className="hidden sm:inline">{cfg.label.split(' ')[0]}</span>
                  <span className="sm:hidden">{cfg.label.split(' ')[0].slice(0, 3)}</span>
                  {hasKey && <span className="h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Shared content for all tabs */}
          <div className="space-y-4 mt-4 px-1 sm:px-2">
            {/* Benefits Info */}
            <motion.div
              key={activeProvider}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-lg bg-primary/5 border border-primary/10"
            >
              <div className="flex gap-2">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">{providerCfg.info}</p>
                  <ul className="space-y-0.5">
                    {providerCfg.benefits.map((b, i) => (
                      <li key={i}>• {b}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>

            {/* API Key Input */}
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                API Key
              </Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showKey ? "text" : "password"}
                  value={ks.key}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  placeholder={providerCfg.placeholder}
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
              {testSuccess === true && (
                <p className="text-xs text-green-500 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> API Key is valid
                </p>
              )}
            </div>

            {/* Model Selector */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                {providerCfg.label} Model
              </Label>
              {renderModelSelector()}
            </div>

            {/* Get API Key Link */}
            <Button
              variant="link"
              className="p-0 h-auto text-xs text-primary"
              onClick={() => window.open(providerCfg.getKeyLink, "_blank")}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              {providerCfg.getLinkLabel}
            </Button>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleTest}
                disabled={testing || loading || !ks.key || ks.key.includes('•')}
              >
                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                Test
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={loading || !ks.key || ks.key.includes('•')}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Key className="mr-2 h-4 w-4" />}
                Save
              </Button>
            </div>

            {ks.hasKey && (
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
});

AIContentApiKeyDialog.displayName = "AIContentApiKeyDialog";
