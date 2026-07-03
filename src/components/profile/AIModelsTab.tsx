import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Brain, Cog, Cpu, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { HELPER_ROUTES } from "@/lib/beebot/model-routing-info";
import { ProviderKeyCard } from "./ai-models/ProviderKeyCard";
import { SubsystemControlCard, SUBSYSTEM_DEFS } from "./ai-models/SubsystemControlCard";

export function AIModelsTab() {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const { data: settings } = useQuery({
    queryKey: ["ai-models-tab-settings", userId],
    queryFn: async () => {
      if (!userId) return null;
      const [meta, gem, claude, openrouter] = await Promise.all([
        supabase.from("ai_user_settings").select("gemini_model").eq("user_id", userId).maybeSingle(),
        supabase.rpc("check_user_has_gemini_api_key", { p_user_id: userId }),
        supabase.rpc("check_user_has_anthropic_api_key", { p_user_id: userId }),
        supabase.rpc("check_user_api_key_exists", { p_user_id: userId, p_provider: "openrouter" }),
      ]);
      return {
        brainModel: meta.data?.gemini_model || "gemini-3.5-flash",
        hasGeminiKey: !!gem.data,
        hasClaudeKey: !!claude.data,
        hasOpenrouterKey: !!openrouter.data,
      };
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const brainModel = settings?.brainModel || "gemini-3.5-flash";
  const hasGeminiKey = !!settings?.hasGeminiKey;
  const hasClaudeKey = !!settings?.hasClaudeKey;
  const hasOpenrouterKey = !!settings?.hasOpenrouterKey;

  if (!userId) return null;

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" />
          AI Models · Control Center
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Choose which AI model powers each part of BeeBot. Add personal API keys to use your own provider access.
        </p>
      </div>

      {/* Brain banner */}
      <div className={cn(
        "rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card/40 to-card/40",
        "backdrop-blur-xl p-4",
      )}>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-2xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
            <Brain className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-primary/80 font-semibold">
              Brain · Live Chat
            </div>
            <div className="text-sm font-mono font-semibold text-foreground mt-0.5 truncate">
              {brainModel}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Powers every chat message. Change it from the <span className="text-foreground/80">Brain menu</span> in the chat composer.
            </p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {hasGeminiKey && (
                <Badge className="text-[10px] h-4 px-1.5 border-0 bg-emerald-500/15 text-emerald-400">
                  Gemini key
                </Badge>
              )}
              {hasClaudeKey && (
                <Badge className="text-[10px] h-4 px-1.5 border-0 bg-orange-500/15 text-orange-400">
                  Claude key
                </Badge>
              )}
              {!hasGeminiKey && !hasClaudeKey && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border/40 text-muted-foreground">
                  Using system gateway
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Personal AI Connections */}
      <div>
        <div className="rounded-[24px] border border-white/[0.07] bg-white/[0.035] backdrop-blur-xl p-3 mb-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-[16px] bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">
                Personal AI Connections
              </div>
              <p className="text-xs text-muted-foreground/75 mt-1 leading-relaxed">
                Add your own provider keys when you want BeeBot to use your personal quota. If you skip this, BeeBot keeps using the system gateway.
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <ProviderKeyCard provider="gemini" userId={userId} />
          <ProviderKeyCard provider="openrouter" userId={userId} />
          <ProviderKeyCard provider="claude" userId={userId} />
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 px-1">
          Personal keys let BeeBot route to provider-specific premium models without using the app gateway.
        </p>
      </div>

      {/* Subsystem control */}
      <div>
        <div className="rounded-[24px] border border-white/[0.07] bg-white/[0.035] backdrop-blur-xl p-3 mb-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-[16px] bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
              <Cpu className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">
                Subsystem Control
              </div>
              <p className="text-xs text-muted-foreground/75 mt-1 leading-relaxed">
                Choose the model for each BeeBot job. Keep defaults for simple setup, or save a dedicated setup for one job.
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {SUBSYSTEM_DEFS.map(def => (
            <SubsystemControlCard
              key={def.key}
              def={def}
              userId={userId}
              hasGeminiKey={hasGeminiKey}
              hasOpenrouterKey={hasOpenrouterKey}
            />
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 px-1">
          Each subsystem can run on its own provider + model. "Use default" reverts to system-managed.
        </p>
      </div>

      {/* Background helpers (read-only) */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
          Background Helpers · System-managed
        </div>
        <div className="rounded-2xl border border-border/30 bg-card/40 backdrop-blur-xl overflow-hidden">
          <div className="divide-y divide-border/20">
            {HELPER_ROUTES.map(h => (
              <div key={h.task} className="flex items-center gap-3 px-3.5 py-2.5 text-xs">
                <Cog className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-foreground font-medium truncate">{h.task}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{h.reason}</div>
                </div>
                <span className="text-[11px] font-mono text-foreground/80 bg-muted/40 rounded px-1.5 py-0.5 shrink-0">
                  {h.model}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 px-1">
          Helpers run on tiny Gemini models so your main Brain stays fast and untouched.
        </p>
      </div>
    </div>
  );
}
