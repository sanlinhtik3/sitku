import { cn } from "@/lib/utils";

interface FuturisticBackgroundProps {
  children: React.ReactNode;
  className?: string;
  showGrid?: boolean;
  variant?: "default" | "subtle" | "intense";
}

export const FuturisticBackground = ({ 
  children, 
  className,
  showGrid = true,
  variant = "default" 
}: FuturisticBackgroundProps) => {
  const gridOpacity = {
    default: "opacity-10",
    subtle: "opacity-5",
    intense: "opacity-20"
  };

  return (
    <div className={cn(
      "min-h-screen bg-gradient-to-br from-background via-background/95 to-primary/5 relative",
      className
    )}>
      {/* Animated Background Grid */}
      {showGrid && (
        <div className={cn("fixed inset-0 pointer-events-none", gridOpacity[variant])}>
          <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--primary))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--primary))_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
        </div>
      )}
      
      {/* Glow Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full blur-[100px] opacity-30" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-[100px] opacity-20" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};
