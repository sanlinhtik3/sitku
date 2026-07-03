import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getModelDisplayName } from "@/lib/ai-models";

// ═══════════════════════════════════════════════════════════════════════════
// ZoeCrypto "Apex" Intelligence Status Hook
// Real-time tracking of user's IU, tier, and model access
// ═══════════════════════════════════════════════════════════════════════════

export interface IntelligenceStatus {
  // Tier Identity
  tierKey: string;
  tierDisplay: string;
  tierDisplayMM: string;
  tierIcon: string;
  tierGradient: string;
  
  // IU Status
  dailyIULimit: number;
  dailyIUUsed: number;
  dailyIURemaining: number;
  iuBonus: number;
  iuBalance: number;
  
  // Priority & Model
  priorityLevel: number;
  priorityLabel: string;
  defaultModel: string;
  allowedGeminiModels: string[];
  allowedClaudeModels: string[];
  contextLimit: number;
  preferredModel: string | null;
  preferredProvider: string | null;
  
  // Status Flags
  isUnlimited: boolean;
  isAdmin: boolean;
  hasPersonalKey: boolean;
  
  // Timing
  resetsAt: string;
  
  // Analytics
  tokensProcessedToday: number;
  modelUsedToday: string | null;
}

export interface SystemAPIKeyStatus {
  hasGoogleKey: boolean;
  hasAnthropicKey: boolean;
  defaultGeminiModel: string;
  defaultClaudeModel: string;
  enableGoogleProvider: boolean;
  enableAnthropicProvider: boolean;
  allowPersonalApiKey: boolean;
  enabledGeminiModels: string[];
}

// Type for the raw RPC response
interface RawIntelligenceStatus {
  tier_key?: string;
  tier_display?: string;
  tier_display_mm?: string;
  tier_icon?: string;
  tier_gradient?: string;
  daily_iu_limit?: number;
  daily_iu_used?: number;
  daily_iu_remaining?: number;
  iu_bonus?: number;
  iu_balance?: number;
  priority_level?: number;
  priority_label?: string;
  default_model?: string;
  allowed_gemini_models?: string[];
  allowed_claude_models?: string[];
  context_limit?: number;
  preferred_model?: string;
  preferred_provider?: string;
  is_unlimited?: boolean;
  is_admin?: boolean;
  has_personal_key?: boolean;
  resets_at?: string;
  tokens_processed_today?: number;
  model_used_today?: string;
}

interface RawAPIKeyStatus {
  has_google_key?: boolean;
  has_anthropic_key?: boolean;
  default_gemini_model?: string;
  default_claude_model?: string;
  enable_google_provider?: boolean;
  enable_anthropic_provider?: boolean;
  allow_personal_api_key?: boolean;
  enabled_gemini_models?: string[];
}

export const useIntelligenceStatus = (userId?: string) => {
  const queryClient = useQueryClient();

  // Fetch user intelligence status
  const { data: status, isLoading, refetch, error } = useQuery({
    queryKey: ["intelligence-status", userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await supabase.rpc('get_user_intelligence_status', {
        p_user_id: userId
      });
      
      if (error) throw error;
      if (!data) return null;
      
      // Cast to our known type
      const rawData = data as unknown as RawIntelligenceStatus;
      
      // Transform snake_case to camelCase
      return {
        tierKey: rawData.tier_key || 'explorer',
        tierDisplay: rawData.tier_display || 'Explorer',
        tierDisplayMM: rawData.tier_display_mm || 'စူးစမ်းသူ',
        tierIcon: rawData.tier_icon || 'sparkles',
        tierGradient: rawData.tier_gradient || 'from-slate-500 to-slate-400',
        dailyIULimit: rawData.daily_iu_limit ?? 10,
        dailyIUUsed: rawData.daily_iu_used ?? 0,
        dailyIURemaining: rawData.daily_iu_remaining ?? 10,
        iuBonus: rawData.iu_bonus ?? 0,
        iuBalance: rawData.iu_balance ?? 0,
        priorityLevel: rawData.priority_level ?? 0,
        priorityLabel: rawData.priority_label || 'Standard',
        defaultModel: rawData.default_model || 'gemini-3.5-flash',
        allowedGeminiModels: rawData.allowed_gemini_models || ['gemini-3.5-flash'],
        allowedClaudeModels: rawData.allowed_claude_models || [],
        contextLimit: rawData.context_limit ?? 50000,
        preferredModel: rawData.preferred_model || null,
        preferredProvider: rawData.preferred_provider || null,
        isUnlimited: rawData.is_unlimited ?? false,
        isAdmin: rawData.is_admin ?? false,
        hasPersonalKey: rawData.has_personal_key ?? false,
        resetsAt: rawData.resets_at || new Date().toISOString(),
        tokensProcessedToday: rawData.tokens_processed_today ?? 0,
        modelUsedToday: rawData.model_used_today || null,
      } as IntelligenceStatus;
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds
    // PERF: No refetchInterval — Realtime subscription handles updates
  });

  // Fetch system API key status
  const { data: apiKeyStatus } = useQuery({
    queryKey: ["system-api-keys-status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('check_system_api_keys_status');
      
      if (error) throw error;
      if (!data) return null;
      
      // Cast to our known type
      const rawData = data as unknown as RawAPIKeyStatus;
      
      return {
        hasGoogleKey: rawData.has_google_key ?? false,
        hasAnthropicKey: rawData.has_anthropic_key ?? false,
        defaultGeminiModel: rawData.default_gemini_model || 'gemini-3.5-flash',
        defaultClaudeModel: rawData.default_claude_model || 'claude-4-5-sonnet',
        enableGoogleProvider: rawData.enable_google_provider ?? true,
        enableAnthropicProvider: rawData.enable_anthropic_provider ?? false,
        allowPersonalApiKey: rawData.allow_personal_api_key ?? false,
        enabledGeminiModels: rawData.enabled_gemini_models || ['gemini-3.5-flash','gemini-3.1-flash-lite','gemini-2.5-flash-lite','gemini-2.5-flash','gemini-2.5-pro','gemini-3-flash-preview','gemini-3.1-pro-preview'],
      } as SystemAPIKeyStatus;
    },
    staleTime: 30 * 1000, // 30 seconds
    // PERF: No refetchInterval — Realtime subscription handles updates
  });

  // Set user preferred model mutation
  const setPreferredModel = useMutation({
    mutationFn: async ({ modelId, provider }: { modelId: string; provider?: string }) => {
      // Store in localStorage for immediate access in edge function calls
      localStorage.setItem('apex_preferred_model', modelId);
      if (provider) {
        localStorage.setItem('apex_preferred_provider', provider);
      }
      
      const { data, error } = await supabase.rpc('set_user_preferred_model', {
        p_model_id: modelId,
        p_provider: provider,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intelligence-status"] });
      toast.success("AI Model ပြောင်းလဲပြီးပါပြီ။");
    },
    onError: () => {
      toast.error("Model ပြောင်းလဲ၍ မရပါ။");
    },
  });

  // Enforces Admin Model Allowlist (Skipped for Personal Key users)
  // Personal Key users have full model freedom and bypass admin restrictions entirely.
  const hasEnforcedAdminModel = useRef(false);
  useEffect(() => {
    if (!apiKeyStatus?.enabledGeminiModels || !status?.preferredModel || !userId) return;
    
    // Personal key users bypass all admin model restrictions
    if (status.hasPersonalKey) {
      hasEnforcedAdminModel.current = false;
      return;
    }
    
    const preferredModel = status.preferredModel;
    if (!preferredModel.startsWith('gemini')) return;
    
    const isModelEnabled = apiKeyStatus.enabledGeminiModels.includes(preferredModel);
    if (!isModelEnabled && !hasEnforcedAdminModel.current) {
      hasEnforcedAdminModel.current = true;
      const firstAvailable = apiKeyStatus.enabledGeminiModels[0];
      if (firstAvailable) {
        setPreferredModel.mutate({ modelId: firstAvailable, provider: 'google' });
        toast.info(`Admin က ${getModelDisplayName(preferredModel)} ကို disable လုပ်လိုက်ပါပြီ။ ${getModelDisplayName(firstAvailable)} သို့ ပြောင်းလိုက်ပါပြီ။`);
      }
    } else if (isModelEnabled) {
      hasEnforcedAdminModel.current = false;
    }
  }, [apiKeyStatus?.enabledGeminiModels, status?.preferredModel, status?.hasPersonalKey, userId]);

  // Real-time subscription for usage updates
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`intelligence:${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'daily_usage',
        filter: `user_id=eq.${userId}`
      }, () => refetch())
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_credits',
        filter: `user_id=eq.${userId}`
      }, () => refetch())
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [userId, refetch]);

  // Helper functions
  const canUseModel = (modelId: string): boolean => {
    if (!status) return false;
    if (modelId.startsWith('claude')) {
      return status.allowedClaudeModels.includes(modelId);
    }
    return status.allowedGeminiModels.includes(modelId);
  };

  const getTotalIURemaining = (): number => {
    if (!status) return 0;
    if (status.isUnlimited) return -1;
    return status.dailyIURemaining + status.iuBonus + status.iuBalance;
  };

  const getTierLevel = (): number => {
    if (!status) return 0;
    switch (status.tierKey) {
      case 'admin': return 3;
      case 'alpha': return 2;
      case 'analyst': return 1;
      default: return 0;
    }
  };

  return {
    // Status data
    ...status,
    apiKeyStatus,
    
    // Loading state
    isLoading,
    error,
    
    // Actions
    refetch,
    setPreferredModel: setPreferredModel.mutate,
    isSettingModel: setPreferredModel.isPending,
    
    // Helpers
    canUseModel,
    getTotalIURemaining,
    getTierLevel,
  };
};
