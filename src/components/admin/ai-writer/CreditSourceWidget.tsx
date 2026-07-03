import { memo, useMemo } from "react";
import { Key, Sparkles, Crown, Gift } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreditSourceWidgetProps {
  usePersonalKey: boolean;
  balance: number;
  creditCost: number;
  isAdmin?: boolean;
  isSystemGranted?: boolean;
  systemGrantedRemaining?: number;
}

export const CreditSourceWidget = memo(({ 
  usePersonalKey, 
  balance, 
  creditCost,
  isAdmin = false,
  isSystemGranted = false,
  systemGrantedRemaining = 0,
}: CreditSourceWidgetProps) => {
  const display = useMemo(() => {
    if (usePersonalKey) return { label: "Personal Key", icon: Key, color: "text-emerald-500", dot: "bg-emerald-500" };
    if (isAdmin) return { label: "Unlimited", icon: Crown, color: "text-purple-500", dot: "bg-purple-500" };
    if (isSystemGranted && systemGrantedRemaining > 0) {
      const fmt = (n: number) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : n.toString();
      return { label: `${fmt(systemGrantedRemaining)} Free`, icon: Gift, color: "text-emerald-500", dot: "bg-emerald-500" };
    }
    return { label: `${balance}`, icon: Sparkles, color: "text-amber-500", dot: "bg-amber-500" };
  }, [usePersonalKey, isAdmin, isSystemGranted, systemGrantedRemaining, balance]);

  const Icon = display.icon;
  const isFree = usePersonalKey || isAdmin || (isSystemGranted && systemGrantedRemaining > 0);

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/30 border border-border/20">
      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", display.dot)} />
      <Icon className={cn("h-3 w-3", display.color)} />
      <span className={cn("text-[11px] font-medium", display.color)}>{display.label}</span>
      {!isFree && creditCost > 0 && (
        <span className="text-[9px] text-muted-foreground">{creditCost}/gen</span>
      )}
    </div>
  );
});

CreditSourceWidget.displayName = "CreditSourceWidget";
