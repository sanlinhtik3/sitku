import { Badge } from "@/components/ui/badge";
import { Lock, Unlock } from "lucide-react";

interface WorkspaceLimitIndicatorProps {
  current: number;
  max: number;
  label?: string;
}

export function WorkspaceLimitIndicator({ current, max, label = "Workspaces" }: WorkspaceLimitIndicatorProps) {
  const isUnlimited = max === -1;
  const isAtLimit = !isUnlimited && current >= max;
  const percentage = isUnlimited ? 0 : (current / max) * 100;

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant="outline"
        className={`${
          isAtLimit
            ? "bg-destructive/10 text-destructive border-destructive/30"
            : "bg-primary/10 text-primary border-primary/30"
        }`}
      >
        {isAtLimit ? (
          <Lock className="h-3 w-3 mr-1" />
        ) : (
          <Unlock className="h-3 w-3 mr-1" />
        )}
        {label}: {current}/{isUnlimited ? "∞" : max}
      </Badge>
      
      {!isUnlimited && (
        <div className="hidden sm:flex h-1.5 w-16 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              percentage >= 100 ? "bg-destructive" : percentage >= 75 ? "bg-yellow-500" : "bg-primary"
            }`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
