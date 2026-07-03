import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassmorphicCard } from "@/components/ui/FuturisticElements";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Crown, 
  Zap, 
  Clock, 
  TrendingUp,
  Key,
  ChevronRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { UnifiedCreditProgress } from "@/components/ui/UnifiedCreditProgress";

interface ComprehensiveStatus {
  is_pro: boolean;
  is_admin: boolean;
  plan_type: string;
  expires_at: string | null;
  days_remaining: number | null;
  daily_limit: number;
  uses_today: number;
  remaining_uses: number;
  credit_balance: number;
  pro_credits: number;
  total_credits: number;
  has_personal_key: boolean;
  resets_at: string;
}

interface PlanStatusWidgetProps {
  userId: string;
  compact?: boolean;
}

export const PlanStatusWidget = ({ userId, compact = false }: PlanStatusWidgetProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["user-comprehensive-status", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_comprehensive_status', {
        p_user_id: userId
      });
      
      if (error) {
        console.error("Error fetching status:", error);
        return null;
      }
      
      return data as unknown as ComprehensiveStatus;
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
  });

  // Real-time subscription for changes
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`plan-status:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pro_subscriptions',
          filter: `user_id=eq.${userId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["user-comprehensive-status", userId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_usage',
          filter: `user_id=eq.${userId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["user-comprehensive-status", userId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_credits',
          filter: `user_id=eq.${userId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["user-comprehensive-status", userId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  // Memoize derived values BEFORE any conditional returns (Rules of Hooks)
  const derivedValues = useMemo(() => {
    if (!status) return null;
    
    const isPro = status.is_pro;
    const isAdmin = status.is_admin;
    const isUnlimited = status.daily_limit === -1;
    
    return { isPro, isAdmin, isUnlimited };
  }, [status]);

  if (isLoading || !status || !derivedValues) {
    return (
      <GlassmorphicCard className="animate-pulse p-4">
        <div className="h-24 bg-muted/30 rounded-lg" />
      </GlassmorphicCard>
    );
  }

  const { isPro, isAdmin, isUnlimited } = derivedValues;
  const totalCredits = status.remaining_uses + status.pro_credits + status.credit_balance;

  if (compact) {
    return (
      <div 
        className="cursor-pointer transition-all hover:scale-[1.02]"
        onClick={() => navigate('/ai-content-pricing')}
      >
        <GlassmorphicCard 
          className={cn(
            "p-4",
            isPro && "border-primary/30"
          )}
          glow={isPro}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isPro || isAdmin ? (
                <div className="p-2 rounded-full bg-primary/20">
                  <Crown className="h-5 w-5 text-primary" />
                </div>
              ) : (
                <div className="p-2 rounded-full bg-muted">
                  <Zap className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {isAdmin ? "Admin" : isPro ? "Pro Plan" : "Free Plan"}
                  </span>
                  {isPro && status.days_remaining !== null && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {status.days_remaining}d left
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isUnlimited ? "Unlimited" : `${totalCredits} credits available`}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </GlassmorphicCard>
      </div>
    );
  }

  return (
    <GlassmorphicCard 
      className={cn(
        "p-4 sm:p-6",
        isPro && "border-primary/30"
      )}
      glow={isPro}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {isPro || isAdmin ? (
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10">
              <Crown className="h-6 w-6 text-primary" />
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-muted/50">
              <Zap className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg">
                {isAdmin ? "Admin Access" : isPro ? "Pro Plan" : "Free Plan"}
              </h3>
              {status.has_personal_key && (
                <Badge variant="outline" className="text-[10px] gap-1 px-1.5">
                  <Key className="h-2.5 w-2.5" />
                  API Key
                </Badge>
              )}
            </div>
            {isPro && status.days_remaining !== null && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Expires in {status.days_remaining} days</span>
              </div>
            )}
            {isAdmin && (
              <p className="text-sm text-muted-foreground">Unlimited access</p>
            )}
          </div>
        </div>

        {!isPro && !isAdmin && (
          <Button 
            size="sm" 
            onClick={() => navigate('/ai-content-pricing')}
            className="gap-1.5"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Upgrade
          </Button>
        )}
      </div>

      {/* Unified Credit Progress (Lovable-style) */}
      <UnifiedCreditProgress
        dailyUsed={status.uses_today}
        dailyLimit={status.daily_limit}
        proCredits={status.pro_credits}
        creditBalance={status.credit_balance}
        isAdmin={isAdmin}
        onClick={() => navigate('/buy-credits')}
      />
    </GlassmorphicCard>
  );
};
