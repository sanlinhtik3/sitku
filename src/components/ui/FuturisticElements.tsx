import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface GlassmorphicCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  hover?: boolean;
}

export const GlassmorphicCard = ({ 
  children, 
  className,
  glow = false,
  hover = true
}: GlassmorphicCardProps) => {
  return (
    <div className={cn(
      "bg-card/20 backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden",
      glow && "shadow-[0_0_30px_hsl(var(--primary)/0.1)]",
      hover && "hover:border-white/[0.1] hover:shadow-lg transition-all duration-300",
      className
    )}>
      {children}
    </div>
  );
};

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

export const PageHeader = ({ icon: Icon, title, subtitle, actions }: PageHeaderProps) => {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-card/40 backdrop-blur-xl border border-border/30 flex items-center justify-center shadow-[0_0_20px_hsl(var(--primary)/0.1)] shrink-0">
          <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl lg:text-2xl font-bold bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent truncate">
            {title}
          </h1>
          <p className="text-[10px] sm:text-xs text-muted-foreground/70 truncate">
            {subtitle}
          </p>
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};

interface StatBadgeProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  variant?: "default" | "success" | "warning" | "danger";
  pulse?: boolean;
}

export const StatBadge = ({ 
  label, 
  value, 
  icon: Icon, 
  variant = "default",
  pulse = false 
}: StatBadgeProps) => {
  const variantStyles = {
    default: "bg-primary/10 border-primary/20 text-primary",
    success: "bg-green-500/10 border-green-500/20 text-green-500",
    warning: "bg-amber-500/10 border-amber-500/20 text-amber-500",
    danger: "bg-red-500/10 border-red-500/20 text-red-500"
  };

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-xl",
      variantStyles[variant]
    )}>
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
        </span>
      )}
      <span className="text-xs font-medium">{label}</span>
      <span className="text-xs font-bold">{value}</span>
    </div>
  );
};
