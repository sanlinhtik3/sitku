import { useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface ProPlanStatus {
  isPro: boolean;
  isProPlus: boolean;
  planType: 'free' | 'pro' | 'pro_plus';
  expiresAt: Date | null;
  daysRemaining: number | null;
  dailyLimit: number;
  usesToday: number;
  remainingUses: number;
  hasPersonalKey: boolean;
  resetsAt: string;
  loading: boolean;
  refetch: () => void;
  // Credit fields for unified view
  proCredits: number;
  creditBalance: number;
  totalCredits: number;
  isUnlimited: boolean;
}

interface PlanStatusResponse {
  is_pro: boolean;
  plan_type: string;
  expires_at: string | null;
  days_remaining: number | null;
  daily_limit: number;
  uses_today: number;
  remaining_uses: number;
  has_personal_key: boolean;
  resets_at: string;
  pro_credits?: number;
  credit_balance?: number;
}

export const useProPlan = (): ProPlanStatus => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: planStatus, isLoading, refetch } = useQuery({
    queryKey: ["pro-plan-status", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      try {
        const { data, error } = await supabase.rpc('get_user_plan_status', {
          p_user_id: user.id
        }) as { data: PlanStatusResponse | null; error: any };
        
        if (error) {
          console.warn("Plan status fetch failed, using defaults:", error.message);
          return null; // Return null, let useMemo handle defaults
        }
        
        return data as PlanStatusResponse;
      } catch (err) {
        console.warn("Plan status exception:", err);
        return null;
      }
    },
    enabled: !!user?.id,
    staleTime: 30 * 1000,
  });

  // Real-time subscription for subscription changes
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`pro-plan:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pro_subscriptions',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          refetch();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_usage',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refetch]);

  const status = useMemo((): ProPlanStatus => {
    if (!planStatus) {
      return {
        isPro: false,
        isProPlus: false,
        planType: 'free',
        expiresAt: null,
        daysRemaining: null,
        dailyLimit: 3,
        usesToday: 0,
        remainingUses: 3,
        hasPersonalKey: false,
        resetsAt: '',
        loading: isLoading,
        refetch,
        proCredits: 0,
        creditBalance: 0,
        totalCredits: 3,
        isUnlimited: false,
      };
    }

    const proCredits = planStatus.pro_credits ?? 0;
    const creditBalance = planStatus.credit_balance ?? 0;
    const remainingUses = planStatus.remaining_uses ?? 0;
    const dailyLimit = planStatus.daily_limit ?? 3;
    const isUnlimited = dailyLimit === -1 || remainingUses === -1;
    
    // For unlimited, show infinite symbol conceptually
    const totalCredits = isUnlimited ? -1 : remainingUses + proCredits + creditBalance;
    const planType = planStatus.plan_type as 'free' | 'pro' | 'pro_plus';

    return {
      isPro: planStatus.is_pro || planType === 'pro_plus',
      isProPlus: planType === 'pro_plus',
      planType,
      expiresAt: planStatus.expires_at ? new Date(planStatus.expires_at) : null,
      daysRemaining: planStatus.days_remaining,
      dailyLimit,
      usesToday: planStatus.uses_today,
      remainingUses,
      hasPersonalKey: planStatus.has_personal_key,
      resetsAt: planStatus.resets_at,
      loading: isLoading,
      refetch,
      proCredits,
      creditBalance,
      totalCredits,
      isUnlimited,
    };
  }, [planStatus, isLoading, refetch]);

  return status;
};

// Hook to check and increment usage
export const useCheckUsage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const checkAndIncrementUsage = useCallback(async (
    featureKey: string,
    actionType: string = 'generation'
  ): Promise<{
    success: boolean;
    remainingUses?: number;
    dailyLimit?: number;
    isPro?: boolean;
    error?: string;
    resetsAt?: string;
    usageType?: 'daily_free' | 'pro_credit' | 'credit_balance' | 'admin_unlimited';
  }> => {
    if (!user?.id) {
      return { success: false, error: 'User not authenticated' };
    }
    
    try {
      const { data, error } = await supabase.rpc('check_and_increment_usage', {
        p_user_id: user.id,
        p_feature_key: featureKey,
        p_action_type: actionType
      }) as { 
        data: { 
          success: boolean; 
          remaining_uses?: number; 
          daily_limit?: number; 
          is_pro?: boolean; 
          error?: string; 
          resets_at?: string;
          usage_type?: string;
        } | null; 
        error: any 
      };
      
      if (error) {
        console.error("Error checking usage:", error);
        return { success: false, error: error.message };
      }
      
      if (!data) {
        return { success: false, error: 'No data returned' };
      }
      
      // Invalidate the plan status cache
      queryClient.invalidateQueries({ queryKey: ["pro-plan-status", user.id] });
      
      return {
        success: data.success,
        remainingUses: data.remaining_uses,
        dailyLimit: data.daily_limit,
        isPro: data.is_pro,
        error: data.error,
        resetsAt: data.resets_at,
        usageType: data.usage_type as 'daily_free' | 'pro_credit' | 'credit_balance' | 'admin_unlimited' | undefined,
      };
    } catch (err) {
      console.error("Error in checkAndIncrementUsage:", err);
      return { success: false, error: 'Failed to check usage' };
    }
  }, [user?.id, queryClient]);
  
  return { checkAndIncrementUsage };
};
