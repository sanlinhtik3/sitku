import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  Loader2, Sparkles, Bot, TrendingUp, Wallet, Key, KeyRound,
  Eye, EyeOff, ChevronDown, ChevronUp, Trash2, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type SubsystemKey = "automate" | "consultant" | "flowstate";
export type SubsystemProvider = "google" | "openrouter";

export interface SubsystemDefinition {
  key: SubsystemKey;
  label: string;
  description: string;
  icon: "bot" | "chart" | "wallet";
  defaultProvider: SubsystemProvider;
  defaultModel: string;
}

const ICON_MAP = { bot: Bot, chart: TrendingUp, wallet: Wallet };

const GEMINI_OPTIONS = [
  { id: "gemini-3.5-flash",         label: "Gemini 3.5 Flash",      hint: "stable · agentic default" },
  { id: "gemini-2.5-flash-lite",    label: "Gemini 2.5 Flash Lite", hint: "fastest" },
  { id: "gemini-2.5-flash",         label: "Gemini 2.5 Flash",      hint: "balanced" },
  { id: "gemini-2.5-pro",           label: "Gemini 2.5 Pro",        hint: "strongest" },
  { id: "gemini-3-flash-preview",   label: "Gemini 3 Flash",        hint: "preview" },
  { id: "gemini-3.1-pro-preview",   label: "Gemini 3.1 Pro",        hint: "preview" },
];

const OPENROUTER_OPTIONS = [
  { id: "openai/gpt-4o-mini",                 label: "GPT-4o Mini",              hint: "fast · low cost" },
  { id: "openai/gpt-4o",                      label: "GPT-4o",                   hint: "balanced flagship" },
  { id: "anthropic/claude-sonnet-4",          label: "Claude Sonnet 4",           hint: "reasoning via OpenRouter" },
  { id: "qwen/qwen3.6-plus-preview:free",     label: "Qwen3.6 Plus Preview Free", hint: "free · tool-capable" },
];

const PROVIDER_LABELS: Record<SubsystemProvider, string> = {
  google: "Google Gemini",
  openrouter: "OpenRouter",
};

interface Props {
  userId: string;
  def: SubsystemDefinition;
  hasGeminiKey: boolean;
  hasOpenrouterKey: boolean;
}

function maskKey(k: string) {
  if (!k) return "";
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

export function SubsystemControlCard({ userId, def, hasGeminiKey, hasOpenrouterKey }: Props) {
  const queryClient = useQueryClient();
  const Icon = ICON_MAP[def.icon];

  const { data: override, isLoading } = useQuery({
    queryKey: ["subsystem-override", userId, def.key],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_subsystem_overrides")
        .select("provider, model, enabled, api_key")
        .eq("user_id", userId)
        .eq("subsystem", def.key)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  const isUsingDefault = !override?.enabled;
  const hasOwnKey = !!override?.api_key;
  const storedProvider = (override?.provider as SubsystemProvider | undefined) || def.defaultProvider;

  const [provider, setProvider] = useState<SubsystemProvider>(def.defaultProvider);
  const [model, setModel] = useState<string>(def.defaultModel);
  const [keyInput, setKeyInput] = useState<string>("");
  const [keyExpanded, setKeyExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const nextProvider = override?.enabled ? (override.provider as SubsystemProvider) : def.defaultProvider;
    setProvider(nextProvider);
    if (override?.enabled) setModel(override.model);
    else setModel(def.defaultModel);
    setKeyInput("");
    setDirty(false);
  }, [override, def.defaultModel, def.defaultProvider]);

  const providerOptions = provider === "openrouter" ? OPENROUTER_OPTIONS : GEMINI_OPTIONS;

  const saveMut = useMutation({
    mutationFn: async (payload: { newKey?: string | null; clearKey?: boolean }) => {
      const row: any = {
        user_id: userId,
        subsystem: def.key,
        provider,
        model,
        enabled: true,
      };
      if (payload.clearKey) row.api_key = null;
      else if (payload.newKey !== undefined && payload.newKey !== null && payload.newKey !== "") row.api_key = payload.newKey;
      else if (hasOwnKey && storedProvider === provider) row.api_key = override!.api_key; // preserve only for same provider

      const { error } = await supabase
        .from("ai_subsystem_overrides")
        .upsert(row, { onConflict: "user_id,subsystem" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.clearKey ? "Dedicated key removed" : `${def.label} → ${PROVIDER_LABELS[provider]} · ${model}`);
      queryClient.invalidateQueries({ queryKey: ["subsystem-override", userId, def.key] });
      setDirty(false);
      setKeyInput("");
    },
    onError: (e: any) => toast.error(`Save failed: ${e.message}`),
  });

  const resetMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ai_subsystem_overrides")
        .delete()
        .eq("user_id", userId)
        .eq("subsystem", def.key);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${def.label} reset to system default`);
      queryClient.invalidateQueries({ queryKey: ["subsystem-override", userId, def.key] });
    },
    onError: (e: any) => toast.error(`Reset failed: ${e.message}`),
  });

  const hasMainProviderKey = provider === "openrouter" ? hasOpenrouterKey : hasGeminiKey;
  const keySource = hasOwnKey && storedProvider === provider
    ? "dedicated"
    : hasMainProviderKey
      ? "main"
      : "system";

  const keySourceLabel =
    keySource === "dedicated" ? "Dedicated key" :
    keySource === "main"      ? `Main ${provider === "openrouter" ? "OpenRouter" : "Gemini"} key` :
    provider === "openrouter" ? "Needs OpenRouter key" :
                                "System gateway";

  const keySourceTone =
    keySource === "dedicated" ? "bg-primary/15 text-primary" :
    keySource === "main"      ? "bg-emerald-500/15 text-emerald-400" :
    provider === "openrouter" ? "bg-amber-500/15 text-amber-300" :
                                "bg-muted/50 text-muted-foreground";
  const currentModel = [...GEMINI_OPTIONS, ...OPENROUTER_OPTIONS].find((o) => o.id === model);
  const providerChanged = storedProvider !== provider;
  const needsOpenrouterKey = provider === "openrouter" && !hasOpenrouterKey && !(hasOwnKey && !providerChanged) && !keyInput.trim();

  return (
    <div className={cn(
      "group relative rounded-[26px] border backdrop-blur-xl p-4 transition-all overflow-hidden",
      "bg-[#0a0f14]/88",
      isUsingDefault
        ? "border-white/[0.07] hover:border-white/[0.12]"
        : "border-primary/28 hover:border-primary/45 shadow-[0_0_32px_-12px_hsl(var(--primary)/0.35)]",
    )}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent pointer-events-none" />
      {!isUsingDefault && (
        <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
      )}

      {/* Header */}
      <div className="flex items-start gap-3 relative">
        <div className={cn(
          "h-12 w-12 rounded-[20px] flex items-center justify-center shrink-0 transition border",
          isUsingDefault
            ? "bg-white/[0.04] text-muted-foreground border-white/[0.06]"
            : "bg-primary/15 text-primary border-primary/25",
        )}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-base font-semibold leading-tight">{def.label}</div>
            {isUsingDefault ? (
              <Badge variant="outline" className="h-5 rounded-full text-[10px] border-white/[0.10] text-muted-foreground font-normal">
                Default
              </Badge>
            ) : (
              <Badge className="h-5 rounded-full text-[10px] bg-primary/15 text-primary border-0 font-normal">
                <Sparkles className="h-2.5 w-2.5 mr-1" /> Custom
              </Badge>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground/75 mt-1 leading-relaxed">
            {def.description}
          </p>
        </div>
      </div>

      {/* Current setup */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-[18px] border border-white/[0.06] bg-white/[0.035] px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/65 font-semibold">Provider + model</div>
          <div className="mt-1 text-[11px] font-semibold text-primary">{PROVIDER_LABELS[provider]}</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{currentModel?.label || model}</div>
          <div className="text-[10px] text-muted-foreground/65">{currentModel?.hint || "selected model"}</div>
        </div>
        <div className="rounded-[18px] border border-white/[0.06] bg-white/[0.035] px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/65 font-semibold">Key source</div>
          <div className={cn("mt-1 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium", keySourceTone)}>
            {keySource === "dedicated" ? <KeyRound className="h-3 w-3" /> : <Key className="h-3 w-3" />}
            {keySourceLabel}
          </div>
        </div>
      </div>

      {/* Model picker */}
      <div className="mt-3 rounded-[20px] border border-white/[0.06] bg-black/20 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-primary/12 text-primary border border-primary/20 flex items-center justify-center text-[11px] font-semibold">1</span>
          <div>
            <div className="text-[12px] font-semibold text-foreground">Choose provider and model</div>
            <div className="text-[10px] text-muted-foreground/65">Use Gemini by default, or OpenRouter when this subsystem needs a different model family.</div>
          </div>
        </div>
        <Select
          value={provider}
          onValueChange={(v) => {
            const next = v as SubsystemProvider;
            setProvider(next);
            setModel(next === "openrouter" ? OPENROUTER_OPTIONS[0].id : def.defaultModel);
            setDirty(true);
          }}
        >
          <SelectTrigger className="h-11 text-sm bg-white/[0.04] border-white/[0.08] backdrop-blur-sm rounded-[16px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="google">Google Gemini</SelectItem>
            <SelectItem value="openrouter">OpenRouter</SelectItem>
          </SelectContent>
        </Select>
        <Select value={model} onValueChange={(v) => { setModel(v); setDirty(true); }}>
          <SelectTrigger className="h-11 text-sm bg-white/[0.04] border-white/[0.08] backdrop-blur-sm rounded-[16px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="text-[10px]">{PROVIDER_LABELS[provider]}</SelectLabel>
              {providerOptions.map(o => (
                <SelectItem key={o.id} value={o.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{o.label}</span>
                    <span className="text-[10px] text-muted-foreground">— {o.hint}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* Dedicated key collapsible */}
      <div className="mt-3 rounded-[20px] border border-white/[0.06] bg-black/20 overflow-hidden">
        <button
          type="button"
          onClick={() => setKeyExpanded(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-3 text-[12px] hover:bg-white/[0.04] transition"
        >
          <span className="h-6 w-6 rounded-full bg-white/[0.045] text-muted-foreground border border-white/[0.07] flex items-center justify-center text-[11px] font-semibold">2</span>
          <span className="flex-1 text-left text-foreground/90 font-medium">
            Optional dedicated {provider === "openrouter" ? "OpenRouter" : "Gemini"} key
          </span>
          {hasOwnKey && storedProvider === provider && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {maskKey(override!.api_key as string)}
            </span>
          )}
          {hasOwnKey && storedProvider === provider && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
          {keyExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </button>

        {keyExpanded && (
          <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/[0.06]">
            <p className="text-[10px] text-muted-foreground leading-snug">
              Leave empty to use your main {provider === "openrouter" ? "OpenRouter" : "Gemini"} key. Add one only when this subsystem needs its own quota.
            </p>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={(e) => { setKeyInput(e.target.value); setDirty(true); }}
                placeholder={hasOwnKey && storedProvider === provider ? "Enter new key to replace…" : provider === "openrouter" ? "sk-or-v1-…" : "AIza…"}
                className="h-9 text-xs bg-white/[0.04] border-white/[0.08] rounded-[14px] pr-8 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {needsOpenrouterKey && (
              <p className="text-[10px] text-amber-300/85">
                OpenRouter needs your main OpenRouter key or a dedicated key before saving.
              </p>
            )}
            {hasOwnKey && storedProvider === provider && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                onClick={() => saveMut.mutate({ clearKey: true })}
                disabled={saveMut.isPending}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Remove dedicated key
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3">
        {!isUsingDefault && (
          <Button
            size="sm"
            variant="ghost"
            className="h-9 rounded-full text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
            onClick={() => resetMut.mutate()}
            disabled={resetMut.isPending}
          >
            {resetMut.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Use default
          </Button>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          className="h-10 rounded-full px-4 text-[12px] shadow-[0_0_22px_-6px_hsl(var(--primary)/0.7)]"
          onClick={() => saveMut.mutate({ newKey: keyInput || undefined })}
          disabled={!dirty || needsOpenrouterKey || saveMut.isPending || isLoading}
        >
          {saveMut.isPending
            ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
            : <Sparkles className="h-3 w-3 mr-1" />}
          Save
        </Button>
      </div>
    </div>
  );
}

export const SUBSYSTEM_DEFS: SubsystemDefinition[] = [
  {
    key: "automate",
    label: "BeeBot Automate",
    description: "Heartbeat — scheduled background tasks running on your Brain.",
    icon: "bot",
    defaultProvider: "google",
    defaultModel: "gemini-3.5-flash",
  },
  {
    key: "consultant",
    label: "Agent Consultant",
    description: "Insight synthesis for productivity & content analysis.",
    icon: "chart",
    defaultProvider: "google",
    defaultModel: "gemini-3.5-flash",
  },
  {
    key: "flowstate",
    label: "FlowState CFO",
    description: "Transaction analysis, forecasting, finance chat.",
    icon: "wallet",
    defaultProvider: "google",
    defaultModel: "gemini-3.5-flash",
  },
];
