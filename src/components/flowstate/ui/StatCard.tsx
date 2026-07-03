import { memo } from "react";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { MultiCurrencyValue } from "@/hooks/useFlowState";

interface StatCardProps {
  title: string;
  value: number;
  currency?: string;
  icon: LucideIcon;
  color: "green" | "red" | "blue" | "purple";
  percentageChange?: number;
  showTrend?: boolean;
  compact?: boolean;
  multiValues?: MultiCurrencyValue;
  primaryCurrency?: string;
}

const colorMap = {
  green: {
    bg: "from-emerald-500/20 to-emerald-600/10",
    border: "border-emerald-500/30",
    icon: "bg-emerald-500/20 text-emerald-500",
    value: "text-emerald-500",
    glow: "shadow-emerald-500/10",
  },
  red: {
    bg: "from-rose-500/20 to-rose-600/10",
    border: "border-rose-500/30",
    icon: "bg-rose-500/20 text-rose-500",
    value: "text-rose-500",
    glow: "shadow-rose-500/10",
  },
  blue: {
    bg: "from-blue-500/20 to-blue-600/10",
    border: "border-blue-500/30",
    icon: "bg-blue-500/20 text-blue-500",
    value: "text-blue-500",
    glow: "shadow-blue-500/10",
  },
  purple: {
    bg: "from-purple-500/20 to-purple-600/10",
    border: "border-purple-500/30",
    icon: "bg-purple-500/20 text-purple-500",
    value: "text-purple-500",
    glow: "shadow-purple-500/10",
  },
};

// Format multi-currency value
const formatMultiValue = (value: number, type: "THB" | "USD" | "MMK") => {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  
  if (type === "THB") {
    if (absValue >= 1000000) return `฿${sign}${(absValue / 1000000).toFixed(1)}M`;
    if (absValue >= 1000) return `฿${sign}${(absValue / 1000).toFixed(0)}K`;
    return `฿${sign}${absValue.toLocaleString()}`;
  }
  
  if (type === "USD") {
    if (absValue >= 1000000) return `$${sign}${(absValue / 1000000).toFixed(2)}M`;
    if (absValue >= 1000) return `$${sign}${(absValue / 1000).toFixed(1)}K`;
    return `$${sign}${absValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  
  // MMK
  if (absValue >= 1000000) return `${sign}${(absValue / 1000000).toFixed(1)}M Ks`;
  if (absValue >= 1000) return `${sign}${(absValue / 1000).toFixed(0)}K Ks`;
  return `${sign}${absValue.toLocaleString()} Ks`;
};

// Get currency display order based on primaryCurrency
const getCurrencyOrder = (primaryCurrency: string): ["THB" | "USD" | "MMK", "THB" | "USD" | "MMK", "THB" | "USD" | "MMK"] => {
  switch (primaryCurrency) {
    case "USD": return ["USD", "THB", "MMK"];
    case "MMK": return ["MMK", "THB", "USD"];
    case "THB":
    default: return ["THB", "USD", "MMK"];
  }
};

export const StatCard = memo(({
  title,
  value,
  currency = "Ks",
  icon: Icon,
  color,
  percentageChange,
  showTrend = true,
  compact = false,
  multiValues,
  primaryCurrency = "THB",
}: StatCardProps) => {
  const colors = colorMap[color];
  const isPositiveChange = percentageChange !== undefined && percentageChange > 0;
  const isNegativeChange = percentageChange !== undefined && percentageChange < 0;
  const hasNoChange = percentageChange === 0;

  const [primary, secondary1, secondary2] = getCurrencyOrder(primaryCurrency);

  return (
    <div
      className={cn(
        "relative rounded-xl border backdrop-blur-xl overflow-hidden transition-all hover:scale-[1.02]",
        `bg-gradient-to-br ${colors.bg}`,
        colors.border,
        `shadow-lg ${colors.glow}`,
        compact ? "p-3" : "p-4"
      )}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-white blur-2xl" />
      </div>

      <div className="relative flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-muted-foreground font-medium truncate",
            compact ? "text-[10px]" : "text-xs"
          )}>
            {title}
          </p>
          
          {/* Multi-currency display - dynamic based on primaryCurrency */}
          {multiValues ? (
            <div className="mt-0.5">
              {/* Primary currency */}
              <p className={cn(
                "font-bold truncate",
                colors.value,
                compact ? "text-base" : "text-xl sm:text-2xl"
              )}>
                {formatMultiValue(multiValues[primary], primary)}
              </p>
              {/* Secondary currencies */}
              <p className={cn(
                "text-muted-foreground truncate",
                compact ? "text-[9px]" : "text-xs"
              )}>
                {formatMultiValue(multiValues[secondary1], secondary1)} • {formatMultiValue(multiValues[secondary2], secondary2)}
              </p>
            </div>
          ) : (
            <p className={cn(
              "font-bold truncate mt-0.5",
              colors.value,
              compact ? "text-base" : "text-xl sm:text-2xl"
            )}>
              {formatMultiValue(value, primaryCurrency as "THB" | "USD" | "MMK")}
            </p>
          )}
          
          {showTrend && percentageChange !== undefined && (
            <div className="flex items-center gap-1 mt-1">
              {isPositiveChange && (
                <TrendingUp className={cn("text-emerald-500", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
              )}
              {isNegativeChange && (
                <TrendingDown className={cn("text-rose-500", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
              )}
              {hasNoChange && (
                <Minus className={cn("text-muted-foreground", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
              )}
              <span className={cn(
                "font-medium",
                compact ? "text-[10px]" : "text-xs",
                isPositiveChange ? "text-emerald-500" : isNegativeChange ? "text-rose-500" : "text-muted-foreground"
              )}>
                {Math.abs(percentageChange).toFixed(1)}% vs last month
              </span>
            </div>
          )}
        </div>

        <div className={cn(
          "rounded-xl flex items-center justify-center shrink-0",
          colors.icon,
          compact ? "h-8 w-8" : "h-10 w-10"
        )}>
          <Icon className={cn(compact ? "h-4 w-4" : "h-5 w-5")} />
        </div>
      </div>
    </div>
  );
});

StatCard.displayName = "StatCard";
