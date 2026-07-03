import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, TrendingUp, TrendingDown, Loader2 } from "lucide-react";

interface FlowStateWidgetProps {
  userId: string;
  onClick: () => void;
  delay?: number;
  net?: number;
  isLoading?: boolean;
}

export const FlowStateWidget = memo(({ userId, onClick, delay = 0, net = 0, isLoading = false }: FlowStateWidgetProps) => {
  const isPositive = net >= 0;

  const formatAmount = (amount: number) => {
    const absAmount = Math.abs(amount);
    if (absAmount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (absAmount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
    return amount.toLocaleString();
  };

  return (
    <div
      className="h-full animate-fade-in transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
      style={{ animationDelay: `${delay * 1000}ms`, animationFillMode: "backwards" }}
    >
      <Card
        className="cursor-pointer transition-all duration-300 border-border/30 bg-card/30 backdrop-blur-xl hover:border-primary/20 hover:shadow-[0_0_30px_hsl(var(--primary)/0.08)] group h-full relative overflow-hidden rounded-2xl"
        onClick={onClick}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.03] via-transparent to-blue-500/[0.03] opacity-0 group-hover:opacity-100 transition-opacity" />
        <CardContent className="p-2.5 sm:p-4 relative">
          <div className="flex flex-col items-center text-center gap-1.5 sm:gap-3">
            <div className="p-3 sm:p-3.5 rounded-2xl transition-transform group-hover:scale-110 shrink-0 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
              <Wallet className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
            </div>
            <div className="w-full">
              <p className="text-[11px] sm:text-xs font-medium text-muted-foreground">FlowState</p>
              {isLoading ? (
                <div className="flex justify-center py-1">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1 mt-0.5">
                  {isPositive ? (
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                  )}
                  <p className={`text-lg sm:text-xl font-bold ${isPositive ? "text-emerald-500" : "text-rose-500"}`}>
                    {isPositive ? "+" : ""}{formatAmount(net)}
                  </p>
                </div>
              )}
              <p className="hidden sm:block text-[10px] text-muted-foreground/80 mt-0.5">This month's net</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

FlowStateWidget.displayName = "FlowStateWidget";
