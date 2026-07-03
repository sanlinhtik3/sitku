import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface SourcesPillProps {
  sourceCount: number;
  onClick: () => void;
  isActive?: boolean;
  toolColors?: string[];
}

export function SourcesPill({ sourceCount, onClick, isActive = false, toolColors = [] }: SourcesPillProps) {
  if (sourceCount <= 0) return null;

  // Take up to 3 colors for the dot cluster
  const dots = toolColors.slice(0, 3);

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full transition-all duration-200",
        "text-xs font-medium",
        "bg-card/40 backdrop-blur-sm border border-border/20",
        "hover:bg-card/60 hover:border-border/40",
        "focus:outline-none focus:ring-1 focus:ring-primary/30",
        isActive && "bg-primary/10 border-primary/30 text-primary"
      )}
    >
      {/* Tool color dots */}
      <div className="flex items-center -space-x-0.5">
        {dots.length > 0 ? dots.map((color, i) => (
          <div key={i} className={cn("h-3 w-3 rounded-full opacity-70", color.replace("text-", "bg-"))} />
        )) : (
          <div className="h-3 w-3 rounded-full bg-primary/70 flex items-center justify-center">
            <Zap className="h-2 w-2 text-white" />
          </div>
        )}
      </div>

      <span className="text-muted-foreground">
        {sourceCount} tool{sourceCount !== 1 ? "s" : ""}
      </span>
    </button>
  );
}
