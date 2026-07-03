import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Save, Bot, Key, Loader2, Link2, Settings, CheckCircle, CheckCircle2, AlertCircle,
  Cpu, Zap, Sparkles, FlaskConical, Play, Users, MessageCircle, ShieldCheck,
  ExternalLink, Eye, EyeOff, Wifi, WifiOff, Shield, RotateCcw, Brain, Radio,
  ArrowRight, Lock, Fingerprint, Globe, Unplug, Info
} from "lucide-react";
import { MaskedInput } from "./MaskedInput";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { AIContentApiKeyDialog } from "@/components/ai-content/AIContentApiKeyDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SecureLinkingSection } from "./SecureLinkingSection";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { BotSettings, ChannelIdentity } from "./types";

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

const getTierIcon = (tier: string) => {
  switch (tier) {
    case "flash": return <Zap className="h-3 w-3" />;
    case "pro": return <Sparkles className="h-3 w-3" />;
    case "experimental": return <FlaskConical className="h-3 w-3" />;
    default: return <Cpu className="h-3 w-3" />;
  }
};

const getTierColor = (tier: string) => {
  switch (tier) {
    case "flash": return "text-amber-500";
    case "pro": return "text-purple-500";
    case "experimental": return "text-cyan-500";
    default: return "text-muted-foreground";
  }
};

interface BotSettingsTabProps {
  bot: BotSettings;
  onSave: (input: Partial<BotSettings>) => Promise<void>;
  isSaving: boolean;
  hasSharedKey: boolean;
  sharedKeyModel: string;
  userId: string;
  onKeyUpdated?: () => void;
  isTokenSet: boolean;
  isWebhookActive: boolean;
  isOwnerLinked: boolean;
  isLevel4: boolean;
  ownerIdentity: ChannelIdentity | null;
  setOwnerIdentity: (identity: ChannelIdentity | null) => void;
  fetchAll: () => Promise<void>;
  onDelete?: () => void;
}

export function BotSettingsTab({ bot, onSave, isSaving, hasSharedKey, sharedKeyModel, userId, onKeyUpdated, isTokenSet, isWebhookActive, isOwnerLinked, isLevel4, ownerIdentity, setOwnerIdentity, fetchAll, onDelete }: BotSettingsTabProps) {
  const [telegramToken, setTelegramToken] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [separateModel, setSeparateModel] = useState("gemini-3.5-flash");
  
  const [useSharedKey, setUseSharedKey] = useState(true);
  const [allowDm, setAllowDm] = useState(false);
  const [triggerWord, setTriggerWord] = useState("ဗျို့မောင်တက်ကြွ");
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ bot_username: string; bot_name: string; bot_id: number; can_join_groups?: boolean; can_read_all_group_messages?: boolean } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isActivatingLink, setIsActivatingLink] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (bot) {
      setTelegramToken(bot.telegram_bot_token || "");
      setGeminiKey(bot.gemini_api_key || "");
      setSeparateModel(bot.gemini_model || "gemini-3.5-flash");
      
      setUseSharedKey(bot.use_shared_key !== false);
      setAllowDm(bot.allow_dm === true);
      setTriggerWord(bot.trigger_word || "ဗျို့မောင်တက်ကြွ");
    }
  }, [bot?.id]);

  const handleTokenChange = (t: string) => { setTelegramToken(t); setVerifyResult(null); setVerifyError(null); };

  const handleVerifyToken = async () => {
    if (!bot?.id) { toast.error("Save settings first"); return; }
    setIsVerifyingToken(true); setVerifyResult(null); setVerifyError(null);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-webhook', { body: { action: 'validate-token', bot_id: bot.id } });
      if (error) throw error;
      if (data?.ok) {
        setVerifyResult({ bot_username: data.bot_username, bot_name: data.bot_name, bot_id: data.bot_id, can_join_groups: data.can_join_groups, can_read_all_group_messages: data.can_read_all_group_messages });
        toast.success(`✅ Bot verified: @${data.bot_username}`);
      } else { setVerifyError(data?.error || 'Verification failed'); toast.error("Token verification failed"); }
    } catch { setVerifyError('Network error'); toast.error("Network error"); }
    finally { setIsVerifyingToken(false); }
  };

  const handleKeyChange = (k: string) => { setGeminiKey(k); setTestSuccess(null); setTestError(null); };

  const handleTestKey = async () => {
    if (!geminiKey.trim()) { toast.error("Enter API key first"); return; }
    setTesting(true); setTestSuccess(null); setTestError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("verify-api-key", {
        body: { provider: "gemini", key: geminiKey, model: separateModel },
      });
      if (invokeError) throw invokeError;
      if (data?.ok) {
        setTestSuccess(true);
        toast.success(`✅ API Key valid!`);
      } else {
        setTestSuccess(false);
        setTestError((data?.error || "Invalid key").substring(0, 60));
        toast.error(data?.error || "API Key test failed");
      }
    } catch { setTestSuccess(false); setTestError("Network error"); toast.error("Network error"); }
    finally { setTesting(false); }
  };

  const handleToggleNeuralLink = async () => {
    if (!bot?.id) return;
    setIsActivatingLink(true);
    try {
      if (isWebhookActive) {
        await supabase.from("bot_settings").update({ is_active: false, webhook_url: null }).eq("id", bot.id);
        toast.success("Neural Link deactivated");
      } else {
        const { data, error } = await supabase.functions.invoke("telegram-webhook", {
          body: { action: "setup-webhook", bot_id: bot.id },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "Webhook setup failed");
        toast.success("Neural Link activated! 🧠⚡");
      }
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle Neural Link");
    } finally {
      setIsActivatingLink(false);
    }
  };

  const handleTestConnection = async () => {
    if (!bot?.id) return;
    setIsTesting(true); setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-webhook', { body: { action: 'validate-token', bot_id: bot.id } });
      if (error) throw error;
      setTestResult(data?.ok ? 'success' : 'fail');
      toast[data?.ok ? 'success' : 'error'](data?.ok ? '✅ Connection healthy!' : '❌ Connection failed');
    } catch {
      setTestResult('fail');
      toast.error('Connection test failed');
    } finally { setIsTesting(false); }
  };

  const handleSave = async () => {
    await onSave({
      id: bot.id,
      telegram_bot_token: telegramToken,
      gemini_api_key: useSharedKey ? undefined : geminiKey,
      gemini_model: useSharedKey ? undefined : separateModel,
      
      use_shared_key: useSharedKey,
      allow_dm: allowDm,
      trigger_word: triggerWord,
    } as any);
  };

  const hasChanges = telegramToken !== (bot.telegram_bot_token || "") ||
    (!useSharedKey && geminiKey !== (bot.gemini_api_key || "")) ||
    useSharedKey !== (bot.use_shared_key !== false) ||
    allowDm !== (bot.allow_dm === true) ||
    triggerWord !== (bot.trigger_word || "ဗျို့မောင်တက်ကြွ");

  const selectedModelInfo = GEMINI_MODELS.find(m => m.id === separateModel);

  // Status score
  const statusScore = [isTokenSet, isWebhookActive, isOwnerLinked].filter(Boolean).length;

  return (
    <div className="space-y-4 sm:space-y-5">

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION: Personal AI Assistant Header                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 pb-1">
        <div className={cn(
          "h-10 w-10 rounded-2xl flex items-center justify-center shadow-lg",
          isLevel4 ? "bg-gradient-to-br from-violet-500 to-purple-600 shadow-violet-500/30" : "bg-gradient-to-br from-slate-600 to-slate-700 shadow-slate-500/20"
        )}>
          <Brain className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold flex items-center gap-2">
            Personal AI Assistant
            {isLevel4 && (
              <Badge className="text-[9px] px-1.5 py-0 h-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white border-0 shadow-sm">
                <Shield className="h-2 w-2 mr-0.5" />Level 4
              </Badge>
            )}
          </h3>
          <p className="text-[10px] text-muted-foreground">BeeBot ကို Telegram DM ကနေ ချိတ်ဆက်သုံးပါ</p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Neural Link Status Dashboard                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Card className={cn(
        "border transition-all overflow-hidden",
        isLevel4 ? "bg-gradient-to-br from-violet-500/10 to-purple-500/5 border-violet-500/30 shadow-[0_0_20px_-5px] shadow-violet-500/20" : "bg-card/50 backdrop-blur-sm border-border/50"
      )}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Radio className={cn("h-4 w-4", isLevel4 ? "text-violet-400" : "text-muted-foreground")} />
              Neural Link Status
            </CardTitle>
            <Badge variant="outline" className={cn(
              "text-[9px] px-2 py-0.5",
              statusScore === 3 ? "bg-green-500/10 text-green-400 border-green-500/20" :
              statusScore >= 1 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
              "bg-muted/30 text-muted-foreground border-border/30"
            )}>
              {statusScore}/3 Active
            </Badge>
          </div>
          <CardDescription className="text-[10px] text-muted-foreground">
            Telegram account connection status & connectivity
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* 3 Status Indicators */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Token", active: isTokenSet, icon: Key, desc: "Bot Token" },
              { label: "Active", active: isWebhookActive, icon: Wifi, desc: "Neural Link" },
              { label: "Verified", active: isOwnerLinked, icon: Fingerprint, desc: "Owner" },
            ].map((item) => (
              <div key={item.label} className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all text-center",
                item.active ? "bg-green-500/5 border-green-500/20" : "bg-muted/20 border-border/20"
              )}>
                <item.icon className={cn("h-3.5 w-3.5", item.active ? "text-green-500" : "text-muted-foreground/50")} />
                <span className={cn("text-[9px] font-medium", item.active ? "text-green-400" : "text-muted-foreground/60")}>{item.desc}</span>
                <div className={cn("h-1.5 w-1.5 rounded-full", item.active ? "bg-green-500 shadow-sm shadow-green-500/50" : "bg-muted-foreground/20")} />
              </div>
            ))}
          </div>

          {/* Connectivity Test */}
          {isTokenSet && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="w-full h-8 text-[10px] gap-1.5 bg-muted/20 hover:bg-muted/40"
            >
              {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> :
               testResult === 'success' ? <CheckCircle className="h-3 w-3 text-green-500" /> :
               testResult === 'fail' ? <AlertCircle className="h-3 w-3 text-red-500" /> :
               <Radio className="h-3 w-3" />}
              {isTesting ? "Testing..." : testResult === 'success' ? "Connection Healthy" : testResult === 'fail' ? "Test Failed — Retry" : "Test Connection"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Bot Token                                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center"><Bot className="h-4 w-4 text-white" /></div>
            Telegram Bot Token
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Get your bot token from <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">@BotFather</a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1"><MaskedInput value={telegramToken} onChange={handleTokenChange} placeholder="Enter your Telegram bot token..." /></div>
            {(() => { const isVerified = !!verifyResult || !!bot?.bot_username; return (
            <Button variant="outline" size="sm" onClick={handleVerifyToken} disabled={isVerifyingToken || !bot?.id || !bot?.telegram_bot_token || isVerified} className={`h-9 px-3 gap-1.5 shrink-0 transition-all ${isVerified ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-400" : "border-violet-500/30 hover:border-violet-500 hover:bg-violet-500/5"}`}>
              {isVerifyingToken ? <><div className="h-3.5 w-3.5 rounded-full bg-gradient-to-r from-violet-500 to-purple-500 animate-pulse" /><span className="text-xs">Verifying</span></> : isVerified ? <><CheckCircle2 className="h-3.5 w-3.5" /><span className="text-xs">Verified</span></> : <><ShieldCheck className="h-3.5 w-3.5" /><span className="text-xs">Verify</span></>}
            </Button>); })()}
          </div>
          {verifyResult && (
            <div className="p-3 rounded-xl bg-card/30 border border-green-500/30 shadow-[0_0_15px_-3px] shadow-green-500/20 animate-fade-in space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center border border-green-500/20"><ShieldCheck className="h-5 w-5 text-green-500" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-sm font-semibold">@{verifyResult.bot_username}</span><Badge className="text-[9px] px-1.5 py-0 h-4 bg-green-500/10 text-green-500 border-green-500/20">Verified</Badge></div>
                  <p className="text-xs text-muted-foreground mt-0.5">{verifyResult.bot_name}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 pl-[52px]">
                {verifyResult.can_read_all_group_messages ? (
                  <Badge className="text-[9px] px-1.5 py-0 h-4 bg-green-500/10 text-green-500 border-green-500/20 gap-1"><EyeOff className="h-2.5 w-2.5" />Privacy Off</Badge>
                ) : (
                  <Badge className="text-[9px] px-1.5 py-0 h-4 bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1"><Eye className="h-2.5 w-2.5" />Privacy On</Badge>
                )}
                {verifyResult.can_join_groups && <Badge className="text-[9px] px-1.5 py-0 h-4 bg-green-500/10 text-green-500 border-green-500/20 gap-1"><Users className="h-2.5 w-2.5" />Groups Active</Badge>}
              </div>
              {!verifyResult.can_read_all_group_messages && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/5 border border-amber-500/20 ml-[52px]">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-500">Privacy Mode ဖွင့်ထားတဲ့အတွက် @BotFather → /setprivacy → Disable</p>
                </div>
              )}
            </div>
          )}
          {verifyError && (
            <div className="p-3 rounded-xl bg-card/30 border border-red-500/30 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20"><AlertCircle className="h-5 w-5 text-red-500" /></div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-red-500">{verifyError}</p>
                  <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline inline-flex items-center gap-1 mt-1"><ExternalLink className="h-2.5 w-2.5" />Get new token</a>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Neural Link Activation                                */}
      {/* ═══════════════════════════════════════════════════════ */}
      {isTokenSet && (
        <Card className={cn(
          "border transition-all",
          isWebhookActive ? "bg-gradient-to-br from-violet-500/10 to-purple-500/5 border-violet-500/30 shadow-[0_0_20px_-5px] shadow-violet-500/20" : "bg-card/50 backdrop-blur-sm border-border/50"
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", isWebhookActive ? "bg-gradient-to-br from-violet-500 to-purple-600" : "bg-muted/50")}>
                {isWebhookActive ? <Wifi className="h-4 w-4 text-white" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
              </div>
              Activate Neural Link
              {isWebhookActive && <Badge className="text-[9px] px-1.5 py-0.5 bg-violet-500/10 text-violet-400 border-violet-500/20">Active</Badge>}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              {isWebhookActive ? "Telegram DM messages → BeeBot's brain → AI response" : "Activate to receive and respond to Telegram DMs via BeeBot"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant={isWebhookActive ? "destructive" : "default"}
              size="sm"
              onClick={handleToggleNeuralLink}
              disabled={isActivatingLink}
              className={cn("w-full gap-1.5", !isWebhookActive && "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500")}
            >
              {isActivatingLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isWebhookActive ? <Unplug className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
              {isWebhookActive ? "Deactivate Neural Link" : "Activate Neural Link"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Identity Handshake — Owner Verification               */}
      {/* ═══════════════════════════════════════════════════════ */}
      {isTokenSet && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <div className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center",
                isOwnerLinked ? "bg-gradient-to-br from-green-500 to-emerald-500" : "bg-gradient-to-br from-amber-500 to-orange-500"
              )}>
                <Fingerprint className="h-4 w-4 text-white" />
              </div>
              Identity Handshake
              {isOwnerLinked && <Badge className="text-[9px] px-1.5 py-0.5 bg-green-500/10 text-green-400 border-green-500/20"><CheckCircle className="h-2.5 w-2.5 mr-0.5" />Verified</Badge>}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Generate a 6-digit code, then send it to your bot in Telegram DM to link your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SecureLinkingSection
              userId={userId}
              isWebhookActive={isWebhookActive}
              isOwnerLinked={isOwnerLinked}
              ownerIdentity={ownerIdentity}
              setOwnerIdentity={setOwnerIdentity}
            />
            {ownerIdentity && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) return;
                    await supabase.from('agent_chat_sessions').update({ processing_lock: null }).eq('user_id', user.id).not('processing_lock', 'is', null);
                    toast.success('All session locks cleared!');
                  } catch { toast.error('Failed to clear locks'); }
                }}
                className="w-full gap-2 border-amber-500/30 text-amber-400 hover:border-amber-500 hover:bg-amber-500/10"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Session Lock
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Level 4 Badge                                         */}
      {/* ═══════════════════════════════════════════════════════ */}
      {isLevel4 && (
        <Card className="bg-gradient-to-br from-violet-500/15 via-purple-500/10 to-fuchsia-500/15 border-violet-500/30 shadow-[0_0_25px_-5px] shadow-violet-500/20">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                  Level 4: Super-Autonomous
                </p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Lock className="h-2.5 w-2.5" />Owner-Only Security
                  <span className="text-border">•</span>
                  Full AI Parity
                  <span className="text-border">•</span>
                  Impenetrable
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* What Neural Link Does                                 */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Collapsible open={showInfo} onOpenChange={setShowInfo}>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/10 transition-colors rounded-t-lg">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center"><Info className="h-4 w-4 text-white" /></div>
                What Neural Link Does
                <ArrowRight className={cn("h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform", showInfo && "rotate-90")} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-2">
              {[
                { icon: Brain, label: "Same Brain", desc: "Telegram DM ကနေ BeeBot ရဲ့ AI brain ကို တိုက်ရိုက်သုံးနိုင်" },
                { icon: Globe, label: "Cross-Platform Memory", desc: "Web app မှာ စကားပြောထားတာတွေကို Telegram ကလည်း မှတ်မိ" },
                { icon: Lock, label: "Owner-Only Security", desc: "Identity Handshake ပြီးမှ owner အဖြစ် အသိအမှတ်ပြု" },
                { icon: Zap, label: "All Tools Available", desc: "FlowState, Content, Workspace tools အကုန်သုံးနိုင်" },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-2.5 p-2 rounded-lg bg-muted/10 border border-border/20">
                  <item.icon className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-medium">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* API Key Configuration                                 */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"><Key className="h-4 w-4 text-white" /></div>
            Gemini API Key
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">Choose API key configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={useSharedKey ? "shared" : "separate"} onValueChange={(v) => setUseSharedKey(v === "shared")} className="space-y-3">
            <div className={cn("relative flex items-start gap-3 p-3 rounded-lg border transition-all", useSharedKey ? 'border-primary/50 bg-primary/5' : 'border-border/50 hover:border-border')}>
              <RadioGroupItem value="shared" id="shared-nl" className="mt-1" />
              <div className="flex-1 space-y-2">
                <Label htmlFor="shared-nl" className="flex items-center gap-2 cursor-pointer">
                  <Link2 className="h-4 w-4 text-primary" /><span className="font-medium">Shared Key</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Recommended</Badge>
                </Label>
                <p className="text-xs text-muted-foreground">AI Content Writer ရဲ့ Key ကိုပဲ သုံးမယ်</p>
                {useSharedKey && (
                  <div className="mt-2 p-2 rounded-md bg-background/50 border border-border/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {hasSharedKey ? <><CheckCircle className="h-4 w-4 text-green-500" /><span className="text-xs text-green-500">Key configured</span></> : <><AlertCircle className="h-4 w-4 text-amber-500" /><span className="text-xs text-amber-500">No key</span></>}
                        {hasSharedKey && <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-2"><Cpu className="h-3 w-3 mr-1" />{sharedKeyModel}</Badge>}
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowApiKeyDialog(true)}><Settings className="h-3 w-3" />{hasSharedKey ? 'Manage' : 'Add'}</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className={cn("relative flex items-start gap-3 p-3 rounded-lg border transition-all", !useSharedKey ? 'border-primary/50 bg-primary/5' : 'border-border/50 hover:border-border')}>
              <RadioGroupItem value="separate" id="separate-nl" className="mt-1" />
              <div className="flex-1 space-y-3">
                <Label htmlFor="separate-nl" className="flex items-center gap-2 cursor-pointer"><Key className="h-4 w-4" /><span className="font-medium">Separate Key</span></Label>
                <p className="text-xs text-muted-foreground">Bot အတွက် သီးသန့် Key</p>
                {!useSharedKey && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><Key className="h-3 w-3" />API Key</Label>
                      <div className="flex gap-2">
                        <div className="flex-1"><MaskedInput value={geminiKey} onChange={handleKeyChange} placeholder="Enter Gemini API key..." /></div>
                        <Button type="button" variant="outline" size="sm" onClick={handleTestKey} disabled={testing || !geminiKey.trim()} className="h-9 px-3 gap-1.5 shrink-0">
                          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}Test
                        </Button>
                      </div>
                      {testSuccess === true && <div className="flex items-center gap-1.5 text-xs text-green-500"><CheckCircle className="h-3.5 w-3.5" />Valid</div>}
                      {testSuccess === false && testError && <div className="flex items-center gap-1.5 text-xs text-red-500"><AlertCircle className="h-3.5 w-3.5" />{testError}</div>}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><Cpu className="h-3 w-3" />Model</Label>
                      <Select value={separateModel} onValueChange={setSeparateModel}>
                        <SelectTrigger className="h-9 bg-background/50">
                          <SelectValue>{selectedModelInfo && <div className="flex items-center gap-2"><span className={getTierColor(selectedModelInfo.tier)}>{getTierIcon(selectedModelInfo.tier)}</span><span>{selectedModelInfo.name}</span></div>}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {GEMINI_MODELS.map(m => (
                            <SelectItem key={m.id} value={m.id}>
                              <div className="flex items-center gap-2"><span className={getTierColor(m.tier)}>{getTierIcon(m.tier)}</span><div><span className="font-medium">{m.name}</span><br/><span className="text-[10px] text-muted-foreground">{m.description}</span></div></div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Get key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google AI Studio</a></p>
                  </div>
                )}
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>


      {/* Chat Settings */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center"><MessageCircle className="h-4 w-4 text-white" /></div>
            Chat Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-background/50 border border-border/50">
            <div className="flex items-center gap-2.5">
              <Users className="h-4 w-4 text-primary" />
              <div>
                <Label htmlFor="allow-dm-nl" className="text-xs font-medium cursor-pointer">Allow DM</Label>
                <p className="text-[10px] text-muted-foreground">{allowDm ? "DM + Group messages" : "Group only, DM blocked"}</p>
              </div>
            </div>
            <Switch id="allow-dm-nl" checked={allowDm} onCheckedChange={setAllowDm} />
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end pt-1 pb-2">
        <Button onClick={handleSave} disabled={isSaving || !hasChanges} className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 gap-2">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Settings
        </Button>
      </div>

      {/* Danger Zone */}
      {onDelete && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-4.5 w-4.5 text-destructive" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-destructive">Delete Bot</p>
                  <p className="text-[10px] text-muted-foreground truncate">Permanently remove "{bot.name}" and all its data</p>
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={onDelete} className="shrink-0 gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AIContentApiKeyDialog open={showApiKeyDialog} onOpenChange={setShowApiKeyDialog} userId={userId} onKeyUpdated={onKeyUpdated} />
    </div>
  );
}
