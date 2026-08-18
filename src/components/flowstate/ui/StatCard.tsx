import { memo } from "react";
import { LucideIcon, TrendingUp, TrendingDown } from "@/components/flowstate/solarIcons";
import { cn } from "@/lib/utils";
import { MultiCurrencyValue } from "@/hooks/useFlowState";
import { FuiLabel, FuiMetric, FuiPanel } from "@/design-system/fui";

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
  previousValue?: number;
  previousLabel?: string;
  context?: string;
  increaseIsPositive?: boolean;
}

const colorMap = {
  green: {
    icon: "text-[var(--bb-positive)]",
    value: "text-[var(--bb-text-1)]",
  },
  red: {
    icon: "text-[var(--bb-negative)]",
    value: "text-[var(--bb-negative)]",
  },
  blue: {
    icon: "text-[var(--bb-info)]",
    value: "text-[var(--bb-text-1)]",
  },
  purple: {
    icon: "text-[var(--bb-accent)]",
    value: "text-[var(--bb-text-1)]",
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
  previousValue,
  previousLabel,
  context,
  increaseIsPositive = true,
}: StatCardProps) => {
  const colors = colorMap[color];
  const isPositiveChange = percentageChange !== undefined && percentageChange > 0;
  const isNegativeChange = percentageChange !== undefined && percentageChange < 0;
  const hasNoChange = percentageChange === 0;
  const isFavorable = hasNoChange || (isPositiveChange ? increaseIsPositive : !increaseIsPositive);
  const showDelta = showTrend && percentageChange !== undefined && percentageChange !== 0;

  const [primary, secondary1, secondary2] = getCurrencyOrder(primaryCurrency);

  return (
    <FuiPanel
      tone="secondary"
      className={cn(
        "flowstate-glass flowstate-stat relative overflow-hidden",
        compact ? "p-[14px]" : "p-4"
      )}
    >
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <FuiLabel className={cn(
            "flowstate-eyebrow truncate",
            compact ? "text-[10px]" : "text-xs"
          )}>
            {title}
          </FuiLabel>
          
          {/* Multi-currency display - dynamic based on primaryCurrency */}
          {multiValues ? (
            <div className="mt-0.5">
              {/* Primary currency */}
              <div className="flowstate-stat-value-row">
                <FuiMetric className={cn(
                  "font-bold truncate",
                  colors.value,
                  compact ? "text-[19px] sm:text-[23px]" : "text-xl sm:text-2xl"
                )}>
                  {formatMultiValue(multiValues[primary], primary)}
                </FuiMetric>
                {showDelta && (
                  <span className={cn("flowstate-stat-delta", isFavorable ? "is-positive" : "is-negative")} aria-label={`${percentageChange > 0 ? "increased" : "decreased"} ${Math.abs(percentageChange).toFixed(1)} percent versus last month`}>
                    {isPositiveChange ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
                    {percentageChange > 0 ? "+" : "−"}{Math.abs(percentageChange).toFixed(1)}%
                  </span>
                )}
              </div>
              {/* Secondary currencies */}
              <p className={cn(
                "flowstate-stat-subline text-muted-foreground truncate",
                compact ? "text-[9px]" : "text-xs"
              )} title={context}>
                {formatMultiValue(multiValues[secondary1], secondary1)} · {formatMultiValue(multiValues[secondary2], secondary2)}
                {previousValue !== undefined && previousLabel ? ` · ${previousLabel} ${formatMultiValue(previousValue, primary)}` : ""}
                {context ? ` · ${context}` : ""}
              </p>
            </div>
          ) : (
            <FuiMetric className={cn(
              "font-bold truncate mt-0.5",
              colors.value,
              compact ? "text-base" : "text-xl sm:text-2xl"
            )}>
              {formatMultiValue(value, primaryCurrency as "THB" | "USD" | "MMK")}
            </FuiMetric>
          )}
          
        </div>

        <div className={cn(
          "flowstate-stat-icon flex items-center justify-center shrink-0",
          colors.icon,
          compact ? "h-8 w-8" : "h-10 w-10"
        )}>
          <Icon className={cn(compact ? "h-4 w-4" : "h-5 w-5")} />
        </div>
      </div>
    </FuiPanel>
  );
});

StatCard.displayName = "StatCard";
