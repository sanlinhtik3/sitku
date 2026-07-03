import { memo, ReactNode, useCallback, useState } from "react";
import { useProPlan, useCheckUsage } from "@/hooks/useProPlan";
import { DailyLimitReachedDialog } from "@/components/DailyLimitReachedDialog";

interface FeatureAccessGuardProps {
  feature: 'beebot' | 'ai_content' | 'flowstate' | 'easy_srt' | 'workspace';
  featureName?: string;
  children: ReactNode;
  /** Called when action is allowed - use for triggering the actual action */
  onAllowed?: () => void;
  /** Called when limit is reached */
  onLimitReached?: () => void;
  /** If true, renders children only (use checkAndExecute for imperative checks) */
  renderOnly?: boolean;
}

/**
 * A guard component that checks daily usage limits before allowing feature access.
 * 
 * Usage:
 * 1. Wrap feature trigger with this component
 * 2. Call checkAndExecute() before performing actions that consume usage
 */
export const FeatureAccessGuard = memo(({
  feature,
  featureName,
  children,
  onAllowed,
  onLimitReached,
  renderOnly = false,
}: FeatureAccessGuardProps) => {
  const { remainingUses, resetsAt } = useProPlan();
  const [showLimitDialog, setShowLimitDialog] = useState(false);

  const handleLimitReached = useCallback(() => {
    setShowLimitDialog(true);
    onLimitReached?.();
  }, [onLimitReached]);

  // For render-only mode, just show children
  if (renderOnly) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <DailyLimitReachedDialog
        open={showLimitDialog}
        onOpenChange={setShowLimitDialog}
        featureName={featureName || feature}
        resetsAt={resetsAt}
      />
    </>
  );
});

FeatureAccessGuard.displayName = "FeatureAccessGuard";

/**
 * Hook for imperative usage checks before executing actions
 */
export function useFeatureAccess(feature: string, featureName?: string) {
  const { remainingUses, dailyLimit, isPro, resetsAt } = useProPlan();
  const { checkAndIncrementUsage } = useCheckUsage();
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const [lastUsageType, setLastUsageType] = useState<'daily_free' | 'pro_credit' | 'credit_balance' | 'admin_unlimited' | null>(null);

  const checkAccess = useCallback(async (
    actionType: string = 'generation'
  ): Promise<{ allowed: boolean; error?: string; usageType?: string }> => {
    // Quick check first (optimistic)
    if (remainingUses <= 0) {
      setShowLimitDialog(true);
      return { 
        allowed: false, 
        error: 'daily_limit_reached' 
      };
    }

    // Server-side check and increment
    const result = await checkAndIncrementUsage(feature, actionType);
    
    if (!result.success) {
      if (result.error === 'daily_limit_reached' || result.remainingUses === 0) {
        setShowLimitDialog(true);
      }
      return { 
        allowed: false, 
        error: result.error 
      };
    }

    // Track which credit type was used
    if (result.usageType) {
      setLastUsageType(result.usageType);
    }

    return { 
      allowed: true,
      usageType: result.usageType,
    };
  }, [feature, remainingUses, checkAndIncrementUsage]);

  const LimitDialog = useCallback(() => (
    <DailyLimitReachedDialog
      open={showLimitDialog}
      onOpenChange={setShowLimitDialog}
      featureName={featureName || feature}
      resetsAt={resetsAt}
    />
  ), [showLimitDialog, featureName, feature, resetsAt]);

  return {
    checkAccess,
    canAccess: remainingUses > 0,
    remainingUses,
    dailyLimit,
    isPro,
    LimitDialog,
    showLimitDialog,
    setShowLimitDialog,
    lastUsageType,
  };
}
