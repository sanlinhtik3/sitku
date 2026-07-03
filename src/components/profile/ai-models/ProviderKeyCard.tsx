import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Trash2,
  XCircle,
  Zap,
  Brain,
  Globe2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type ProviderId = "gemini" | "claude" | "openrouter";

interface ProviderKeyCardProps {
  provider: ProviderId;
  userId: string;
}

const PROVIDER_META: Record<ProviderId, {
  label: string;
  icon: typeof Zap;
  placeholder: string;
  helpUrl: string;
  helpLabel: string;
  description: string;
  statusHint: string;
  accent: string;
}> = {
  gemini: {
    label: "Google Gemini",
    icon: Zap,
    placeholder: "AIza...",
    helpUrl: "https://aistudio.google.com/apikey",
    helpLabel: "Get Gemini key",
    description: "Recommended for BeeBot's fast agentic workflows and Gemini-first routing.",
    statusHint: "Used for premium Gemini models and personal quota.",
    accent: "border-emerald-500/24 bg-emerald-500/[0.045] text-emerald-300",
  },
  claude: {
    label: "Anthropic Claude",
    icon: Brain,
    placeholder: "sk-ant-...",
    helpUrl: "https://console.anthropic.com/settings/keys",
    helpLabel: "Get Claude key",
    description: "Optional fallback for Claude-specific writing, review, and reasoning tasks.",
    statusHint: "Used only when a Claude route or subsystem asks for it.",
    accent: "border-orange-500/24 bg-orange-500/[0.045] text-orange-300",
  },
  openrouter: {
    label: "OpenRouter",
    icon: Globe2,
    placeholder: "sk-or-v1-...",
    helpUrl: "https://openrouter.ai/keys",
    helpLabel: "Get OpenRouter key",
    description: "Use OpenRouter models for specific BeeBot subsystems and advanced provider routing.",
    statusHint: "Used for OpenRouter model IDs such as openai/gpt-4o or anthropic/claude-sonnet-4.",
    accent: "border-sky-500/24 bg-sky-500/[0.045] text-sky-300",
  },
};

export function ProviderKeyCard({ provider, userId }: ProviderKeyCardProps) {
  const queryClient = useQueryClient();
  const meta = PROVIDER_META[provider];
  const Icon = meta.icon;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);

  const { data: hasKey, isLoading } = useQuery({
    queryKey: ["provider-key-status", userId, provider],
    queryFn: async () => {
      if (provider === "openrouter") {
        const { data } = await supabase.rpc("check_user_api_key_exists", {
          p_user_id: userId,
          p_provider: "openrouter",
        });
        return !!data;
      }
      const rpcName = provider === "gemini"
        ? "check_user_has_gemini_api_key"
        : "check_user_has_anthropic_api_key";
      const { data } = await supabase.rpc(rpcName, { p_user_id: userId });
      return !!data;
    },
    enabled: !!userId,
  });

  useEffect(() => { if (!editing) { setValue(""); setTestResult(null); } }, [editing]);

  const saveMut = useMutation({
    mutationFn: async (key: string) => {
      if (provider === "openrouter") {
        const { error } = await supabase
          .from("user_api_keys")
          .upsert({
            user_id: userId,
            provider: "openrouter",
            api_key_encrypted: key,
            is_active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,provider" });
        if (error) throw error;
        return;
      }
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      if (provider === "gemini") updateData.gemini_api_key = key;
      else updateData.personal_anthropic_key = key;
      const { error } = await supabase
        .from("ai_user_settings")
        .upsert({ user_id: userId, ...updateData }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${meta.label} key saved`);
      queryClient.invalidateQueries({ queryKey: ["provider-key-status", userId, provider] });
      queryClient.invalidateQueries({ queryKey: ["ai-models-tab-settings", userId] });
      setEditing(false);
    },
    onError: (e: any) => toast.error(`Save failed: ${e.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (provider === "openrouter") {
        const { error } = await supabase
          .from("user_api_keys")
          .delete()
          .eq("user_id", userId)
          .eq("provider", "openrouter");
        if (error) throw error;
        return;
      }
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      if (provider === "gemini") updateData.gemini_api_key = null;
      else updateData.personal_anthropic_key = null;
      const { error } = await supabase
        .from("ai_user_settings")
        .update(updateData)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${meta.label} key removed`);
      queryClient.invalidateQueries({ queryKey: ["provider-key-status", userId, provider] });
      queryClient.invalidateQueries({ queryKey: ["ai-models-tab-settings", userId] });
    },
    onError: (e: any) => toast.error(`Delete failed: ${e.message}`),
  });

  const handleTest = async () => {
    if (!value || value.includes("•")) { toast.error("Enter a key first"); return; }
    setTesting(true); setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("verify-api-key", {
        body: {
          provider,
          key: value,
          model: provider === "gemini"
            ? "gemini-3.5-flash"
            : provider === "openrouter"
              ? "openai/gpt-4o-mini"
              : "claude-haiku-4-5-20251001",
        },
      });
      if (error) throw error;
      if (data?.ok) { setTestResult("ok"); toast.success("Key valid"); }
      else { setTestResult("fail"); toast.error(data?.error || "Invalid key"); }
    } catch {
      setTestResult("fail"); toast.error("Network error");
    } finally { setTesting(false); }
  };

  const statusText = isLoading ? "Checking..." : hasKey ? "Connected" : "Not connected";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[26px] border border-white/[0.075] bg-[#090d11]/90 backdrop-blur-xl p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn(
            "h-11 w-11 rounded-[18px] border flex items-center justify-center shrink-0",
            meta.accent,
          )}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-base font-semibold text-foreground truncate">{meta.label}</div>
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
              ) : hasKey ? (
                <Badge className="h-5 rounded-full border-0 bg-emerald-500/15 px-2 text-[10px] text-emerald-300 gap-1 shrink-0">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="h-5 rounded-full border-white/10 bg-white/[0.03] px-2 text-[10px] text-muted-foreground shrink-0">
                  Not set
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground/80">
              {meta.description}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        <div className="rounded-[18px] border border-white/[0.06] bg-white/[0.035] px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Connection status
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">{statusText}</div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {hasKey ? meta.statusHint : "Add a key only if you want BeeBot to use your own provider account."}
          </div>
        </div>
        <a
          href={meta.helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[18px] border border-white/[0.07] bg-white/[0.035] px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          {meta.helpLabel}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>

      {!editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-10 flex-1 rounded-full border-white/10 bg-white/[0.04] px-4 text-xs hover:bg-white/[0.07] sm:flex-none"
            onClick={() => setEditing(true)}
          >
            <Key className="h-3.5 w-3.5 mr-1.5" /> {hasKey ? "Update key" : "Add key"}
          </Button>
          {hasKey && (
            <Button
              size="sm"
              variant="ghost"
              className="h-10 rounded-full px-3 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-4 space-y-3 rounded-[20px] border border-white/[0.06] bg-black/20 p-3">
          <div>
            <div className="text-xs font-semibold text-foreground">Paste personal API key</div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              BeeBot stores this securely and uses it only for this provider route.
            </p>
          </div>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={value}
              onChange={(e) => { setValue(e.target.value); setTestResult(null); }}
              placeholder={meta.placeholder}
              className="h-11 rounded-[16px] border-white/10 bg-white/[0.04] pr-10 text-sm"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-full border-white/10 bg-white/[0.035] px-4 text-xs"
              onClick={handleTest}
              disabled={testing || !value}
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Test
            </Button>
            {testResult === "ok" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-1 text-[11px] text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Valid
              </span>
            )}
            {testResult === "fail" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/12 px-2 py-1 text-[11px] text-destructive">
                <XCircle className="h-3.5 w-3.5" /> Failed
              </span>
            )}
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              className="h-9 rounded-full px-4 text-xs"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-full px-4 text-xs"
              onClick={() => saveMut.mutate(value)}
              disabled={!value || saveMut.isPending}
            >
              {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Save
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
