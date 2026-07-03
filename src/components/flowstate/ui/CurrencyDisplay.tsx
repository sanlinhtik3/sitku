import { memo } from "react";
import { cn } from "@/lib/utils";

interface CurrencyDisplayProps {
  amount: number;
  currency?: string;
  showSign?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const currencySymbols: Record<string, string> = {
  MMK: "Ks",
  USD: "$",
  THB: "฿",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  SGD: "S$",
};

const sizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  xl: "text-3xl sm:text-4xl",
};

export const CurrencyDisplay = memo(({
  amount,
  currency = "MMK",
  showSign = false,
  size = "md",
  className,
}: CurrencyDisplayProps) => {
  const symbol = currencySymbols[currency] || currency;
  const isPositive = amount >= 0;
  const absAmount = Math.abs(amount);
  
  // Format with K/M abbreviation for large numbers
  const formatAmount = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 10000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toLocaleString();
  };

  const sign = showSign ? (isPositive ? "+" : "-") : (amount < 0 ? "-" : "");

  return (
    <span className={cn(
      "font-bold tabular-nums tracking-tight",
      sizeClasses[size],
      className
    )}>
      {sign}{symbol} {formatAmount(absAmount)}
    </span>
  );
});

CurrencyDisplay.displayName = "CurrencyDisplay";

// Multi-currency display component
interface MultiCurrencyDisplayProps {
  amounts: { currency: string; amount: number }[];
  primaryCurrency?: string;
  className?: string;
}

export const MultiCurrencyDisplay = memo(({
  amounts,
  primaryCurrency = "MMK",
  className,
}: MultiCurrencyDisplayProps) => {
  const primary = amounts.find(a => a.currency === primaryCurrency) || amounts[0];
  const secondary = amounts.filter(a => a.currency !== primary?.currency).slice(0, 2);

  if (!primary) return null;

  return (
    <div className={cn("space-y-1", className)}>
      <CurrencyDisplay
        amount={primary.amount}
        currency={primary.currency}
        size="xl"
        showSign
        className={primary.amount >= 0 ? "text-emerald-500" : "text-rose-500"}
      />
      {secondary.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {secondary.map((item, i) => (
            <span key={item.currency} className="flex items-center gap-1">
              {i > 0 && <span className="text-border">•</span>}
              <CurrencyDisplay
                amount={item.amount}
                currency={item.currency}
                size="sm"
                className="text-muted-foreground font-normal"
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
});

MultiCurrencyDisplay.displayName = "MultiCurrencyDisplay";
