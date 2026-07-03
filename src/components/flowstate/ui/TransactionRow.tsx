import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  Laptop,
  TrendingUp,
  Gift,
  Plus,
  Utensils,
  Car,
  ShoppingBag,
  Film,
  Zap,
  Monitor,
  Heart,
  GraduationCap,
  Home,
  MoreHorizontal,
  Trash2,
  Pencil,
  LucideIcon,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useExchangeRates, currencySymbols } from "@/hooks/useExchangeRates";
import type { Transaction } from "@/hooks/useFlowState";

// Icon mapping
const iconMap: Record<string, LucideIcon> = {
  Briefcase,
  Laptop,
  TrendingUp,
  Gift,
  Plus,
  Utensils,
  Car,
  ShoppingBag,
  Film,
  Zap,
  Monitor,
  Heart,
  GraduationCap,
  Home,
  MoreHorizontal,
  Tag: MoreHorizontal,
};

// Get currency symbol helper
const getCurrencySymbol = (currency: string): string => {
  return currencySymbols[currency] || currency;
};

interface TransactionRowProps {
  transaction: Transaction;
  primaryCurrency?: string;
  onDelete?: (id: string) => void;
  onEdit?: (transaction: Transaction) => void;
  isDeleting?: boolean;
  compact?: boolean;
}

export const TransactionRow = memo(({
  transaction,
  primaryCurrency = "USD",
  onDelete,
  onEdit,
  isDeleting = false,
  compact = false,
}: TransactionRowProps) => {
  const Icon = iconMap[transaction.category?.icon || "MoreHorizontal"] || MoreHorizontal;
  const isIncome = transaction.type === "income";
  const categoryColor = transaction.category?.color || "#6B7280";
  
  // Get the transaction's original currency - PRIORITIZE transaction.currency first!
  const originalCurrency = transaction.currency || transaction.account?.currency || "USD";
  const needsConversion = originalCurrency !== primaryCurrency;
  
  // Use exchange rates for conversion
  const { convert, isLoading: ratesLoading } = useExchangeRates(originalCurrency);
  
  // Calculate converted amount
  const convertedAmount = useMemo(() => {
    if (!needsConversion) return null;
    return convert(Number(transaction.amount), originalCurrency, primaryCurrency);
  }, [needsConversion, convert, transaction.amount, originalCurrency, primaryCurrency]);

  return (
    <div className={cn(
      "group flex items-center gap-3 rounded-lg border border-border/30 bg-card/50 backdrop-blur-sm transition-all hover:bg-card/80",
      compact ? "p-2.5" : "p-3"
    )}>
      {/* Category Icon */}
      <div
        className={cn(
          "rounded-xl flex items-center justify-center shrink-0",
          compact ? "h-9 w-9" : "h-10 w-10"
        )}
        style={{ backgroundColor: `${categoryColor}20` }}
      >
        <Icon
          className={cn(compact ? "h-4 w-4" : "h-5 w-5")}
          style={{ color: categoryColor }}
        />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-medium truncate",
          compact ? "text-xs" : "text-sm"
        )}>
          {transaction.description || transaction.category?.name || "Transaction"}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {transaction.category?.name || "Uncategorized"} • {format(new Date(transaction.transaction_date), "MMM d")}
        </p>
      </div>

      {/* Amount - Original Currency + Converted */}
      <div className="text-right shrink-0">
        {/* Original amount in original currency */}
        <p className={cn(
          "font-semibold tabular-nums",
          compact ? "text-sm" : "text-base",
          isIncome ? "text-emerald-500" : "text-rose-500"
        )}>
          {isIncome ? "+" : "-"}{getCurrencySymbol(originalCurrency)} {Number(transaction.amount).toLocaleString()}
        </p>
        
        {/* Converted amount in primary currency (if different) */}
        {needsConversion && convertedAmount !== null && (
          <p className="text-[10px] text-muted-foreground flex items-center justify-end gap-0.5">
            {ratesLoading ? (
              <RefreshCw className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <>≈ {getCurrencySymbol(primaryCurrency)} {convertedAmount.toLocaleString()}</>
            )}
          </p>
        )}
        
        {/* Account name */}
        <p className="text-[10px] text-muted-foreground">
          {transaction.account?.account_name || "Account"}
        </p>
      </div>

      {/* Action buttons (shown on hover) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(transaction);
            }}
          >
            <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(transaction.id);
            }}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
});

TransactionRow.displayName = "TransactionRow";
