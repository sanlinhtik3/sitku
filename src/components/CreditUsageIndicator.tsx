import { memo } from "react";
import { Zap, Crown, Sparkles, Infinity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type UsageType = 'daily_free' | 'pro_credit' | 'credit_balance' | 'admin_unlimited';

interface CreditUsageIndicatorProps {
  usageType: UsageType;
  remaining?: number;
  compact?: boolean;
  className?: string;
}

const USAGE_CONFIG: Record<UsageType, {
  label: string;
  labelMy: string;
  icon: typeof Zap;
  colorClass: string;
  bgClass: string;
  borderClass: string;
}> = {
  daily_free: {
    label: "Daily Credit",
    labelMy: "နေ့စဉ် Credit",
    icon: Zap,
    colorClass: "text-amber-500",
    bgClass: "bg-amber-500/10",
    borderClass: "border-amber-500/30",
  },
  pro_credit: {
    label: "Pro Credit",
    labelMy: "Pro Credit",
    icon: Crown,
    colorClass: "text-primary",
    bgClass: "bg-primary/10",
    borderClass: "border-primary/30",
  },
  credit_balance: {
    label: "Credit Balance",
    labelMy: "Credit လက်ကျန်",
    icon: Sparkles,
    colorClass: "text-emerald-500",
    bgClass: "bg-emerald-500/10",
    borderClass: "border-emerald-500/30",
  },
  admin_unlimited: {
    label: "Admin Access",
    labelMy: "Admin Access",
    icon: Infinity,
    colorClass: "text-purple-500",
    bgClass: "bg-purple-500/10",
    borderClass: "border-purple-500/30",
  },
};

export const CreditUsageIndicator = memo(({
  usageType,
  remaining,
  compact = false,
  className,
}: CreditUsageIndicatorProps) => {
  const config = USAGE_CONFIG[usageType];
  const Icon = config.icon;

  if (compact) {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "gap-1 text-[10px] font-medium",
          config.bgClass,
          config.borderClass,
          config.colorClass,
          className
        )}
      >
        <Icon className="h-2.5 w-2.5" />
        {config.label}
      </Badge>
    );
  }

  return (
    <div 
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg border",
        config.bgClass,
        config.borderClass,
        className
      )}
    >
      <Icon className={cn("h-4 w-4", config.colorClass)} />
      <span className={cn("text-sm font-medium", config.colorClass)}>
        {config.label}
      </span>
      {remaining !== undefined && usageType !== 'admin_unlimited' && (
        <span className="text-xs text-muted-foreground">
          • {remaining} remaining
        </span>
      )}
    </div>
  );
});

CreditUsageIndicator.displayName = "CreditUsageIndicator";

// Helper function to get credit type label
export const getCreditTypeLabel = (usageType: UsageType | string | undefined): string => {
  if (!usageType) return 'Credit';
  const config = USAGE_CONFIG[usageType as UsageType];
  return config?.label || 'Credit';
};

// Helper function to determine which credit type will be used next
export const getActiveUsageType = (
  dailyRemaining: number,
  proCredits: number,
  creditBalance: number,
  isAdmin: boolean
): UsageType => {
  if (isAdmin) return 'admin_unlimited';
  if (dailyRemaining > 0) return 'daily_free';
  if (proCredits > 0) return 'pro_credit';
  if (creditBalance > 0) return 'credit_balance';
  return 'daily_free'; // fallback
};
