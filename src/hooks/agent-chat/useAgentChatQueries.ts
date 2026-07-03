import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAgentChatQueries(userId: string, open: boolean, defaultModel: string) {
  const { data: isAdmin } = useQuery({
    queryKey: ["user-is-admin", userId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
        if (error) throw error;
        return data?.some(r => r.role === "admin") || false;
      } catch {
        return false;
      }
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 10,
    retry: 2,
  });

  const { data: aiSettings } = useQuery({
    queryKey: ["user-ai-settings", userId],
    queryFn: async () => {
      // Run all checks in parallel with individual error safety
      const results = await Promise.allSettled([
        supabase.rpc('check_user_has_gemini_api_key', { p_user_id: userId }),
        supabase
          .from("ai_user_settings")
          .select("gemini_model, disabled_connectors, personal_anthropic_key, notion_workspace_name")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase.rpc('check_user_api_key_exists', { p_user_id: userId, p_provider: 'tavily' }),
        supabase
          .from("bot_settings")
          .select("id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .not("telegram_bot_token", "is", null)
          .limit(1),
        supabase.rpc('check_user_api_key_exists', { p_user_id: userId, p_provider: 'openrouter' }),
        supabase.rpc('check_user_api_key_exists', { p_user_id: userId, p_provider: 'xai' }),
        supabase.from("facebook_pages").select("id").eq("user_id", userId).eq("is_active", true).limit(1),
        supabase.rpc('check_user_api_key_exists', { p_user_id: userId, p_provider: 'n8n_mcp' }),
      ]);

      const safe = <T,>(r: PromiseSettledResult<{ data: T }>, fallback: T): T =>
        r.status === "fulfilled" ? (r.value.data ?? fallback) : fallback;

      const settingsRow = safe(results[1] as PromiseSettledResult<{ data: { gemini_model: string | null; disabled_connectors: string[] | null; personal_anthropic_key: string | null; notion_workspace_name: string | null } | null }>, null);
      const hasGeminiKey = !!safe(results[0], false);
      const hasOpenrouterKey = !!safe(results[4], false);
      const hasXaiKey = !!safe(results[5], false);
      const hasAnthropicKey = !!settingsRow?.personal_anthropic_key;
      return {
        hasPersonalKey: hasGeminiKey || hasAnthropicKey || hasOpenrouterKey || hasXaiKey,
        model: settingsRow?.gemini_model || defaultModel || "gemini-3.5-flash",
        hasTavilyKey: !!safe(results[2], false),
        hasTelegramLink: ((safe(results[3], []) as any[])?.length ?? 0) > 0,
        hasOpenrouterKey,
        hasXaiKey,
        hasFacebookPages: ((safe(results[6], []) as any[])?.length ?? 0) > 0,
        hasN8nConfig: !!safe(results[7], false),
        hasNotionKey: !!settingsRow?.notion_workspace_name,
        notionWorkspaceName: settingsRow?.notion_workspace_name || null,
        disabledConnectors: (settingsRow?.disabled_connectors as string[]) || [],
        hasAnthropicKey,
      };
    },
    enabled: open && !!userId,
    staleTime: 1000 * 60 * 1,
    retry: 1,
  });

  const { data: systemAISettings } = useQuery({
    queryKey: ["system-ai-settings-status"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("ai_model_settings")
          .select("enable_free_tier, allow_personal_api_key, enable_google_provider, enable_anthropic_provider, enabled_gemini_models, bypass_iu_for_personal_key")
          .maybeSingle();
        if (error) throw error;
        return {
          enableFreeTier: data?.enable_free_tier !== false,
          allowPersonalKey: data?.allow_personal_api_key !== false,
          enableGoogleProvider: data?.enable_google_provider !== false,
          enableAnthropicProvider: data?.enable_anthropic_provider === true,
          enabledGeminiModels: (data?.enabled_gemini_models as string[] | null) || undefined,
          bypassIUForPersonalKey: data?.bypass_iu_for_personal_key === true,
        };
      } catch {
        return {
          enableFreeTier: true,
          allowPersonalKey: true,
          enableGoogleProvider: true,
          enableAnthropicProvider: false,
          enabledGeminiModels: undefined,
          bypassIUForPersonalKey: false,
        };
      }
    },
    enabled: open,
    staleTime: 1000 * 30,
    retry: 2,
  });

  return { isAdmin: isAdmin || false, aiSettings, systemAISettings };
}
