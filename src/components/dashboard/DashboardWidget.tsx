import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardWidgetProps {
  title: string;
  subtitle: string;
  value: string | number;
  icon: LucideIcon;
  gradient: string;
  onClick: () => void;
  delay?: number;
}

export const DashboardWidget = memo(({
  title,
  subtitle,
  value,
  icon: Icon,
  gradient,
  onClick,
  delay = 0,
}: DashboardWidgetProps) => {
  return (
    <div
      className="h-full animate-fade-in transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
      style={{ animationDelay: `${delay * 1000}ms`, animationFillMode: "backwards" }}
    >
      <Card
        className="cursor-pointer transition-all duration-300 border-border/30 bg-card/30 backdrop-blur-xl hover:border-primary/20 hover:shadow-[0_0_30px_hsl(var(--primary)/0.08)] group h-full overflow-hidden relative rounded-2xl"
        onClick={onClick}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] via-transparent to-violet-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />
        <CardContent className="p-2.5 sm:p-4 relative">
          <div className="flex flex-col items-center text-center gap-1.5 sm:gap-3">
            <div className={cn(
              "p-3 sm:p-3.5 rounded-2xl transition-all duration-300 group-hover:scale-110 shadow-lg shrink-0",
              gradient
            )}>
              <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
            </div>
            <div className="w-full min-w-0">
              <p className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">{title}</p>
              <p className="text-lg sm:text-xl font-bold mt-0.5">{value}</p>
              <p className="hidden sm:block text-[10px] text-muted-foreground/80 mt-0.5 truncate">{subtitle}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

DashboardWidget.displayName = "DashboardWidget";
