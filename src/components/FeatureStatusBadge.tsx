import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FeatureStatus } from "@/hooks/useFeatureFlags";
import { Sparkles, Wrench, Clock, AlertTriangle } from "lucide-react";

interface FeatureStatusBadgeProps {
  status: FeatureStatus;
  size?: "sm" | "md";
  className?: string;
}

const statusConfig: Record<FeatureStatus, {
  label: string;
  labelMy: string;
  icon: React.ElementType;
  className: string;
}> = {
  active: {
    label: "Active",
    labelMy: "ပုံမှန်",
    icon: Sparkles,
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  beta: {
    label: "Beta",
    labelMy: "စမ်းသပ်ဆဲ",
    icon: Sparkles,
    className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  },
  maintenance: {
    label: "Maintenance",
    labelMy: "ပြုပြင်နေ",
    icon: Wrench,
    className: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  },
  coming_soon: {
    label: "Coming Soon",
    labelMy: "မကြာမီလာမည်",
    icon: Clock,
    className: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  },
  deprecated: {
    label: "Deprecated",
    labelMy: "ဖယ်ရှားတော့မည်",
    icon: AlertTriangle,
    className: "bg-red-500/10 text-red-500 border-red-500/20",
  },
};

export const FeatureStatusBadge = memo(({ status, size = "sm", className }: FeatureStatusBadgeProps) => {
  const config = statusConfig[status];
  if (!config || status === "active") return null;

  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium border gap-1",
        size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1",
        config.className,
        className
      )}
    >
      <Icon className={cn(size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3")} />
      {config.label}
    </Badge>
  );
});

FeatureStatusBadge.displayName = "FeatureStatusBadge";
