import { Card } from "@/components/ui/card";
import { TrendingUp, Zap } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { useMemo } from "react";
import { format, isSameWeek } from "date-fns";

interface TeamVelocityCardProps {
  workspace: any;
  completions: any[];
  isSoloMode?: boolean;
  selectedMonth?: Date;
}

export function TeamVelocityCard({ workspace, completions, isSoloMode = false, selectedMonth = new Date() }: TeamVelocityCardProps) {
  const now = new Date();

  // Calculate this week's points (within the selected month's completions)
  const weekPoints = useMemo(() => {
    return completions
      .filter((c) => isSameWeek(new Date(c.completed_at), now, { weekStartsOn: 1 }))
      .reduce((sum, c) => sum + c.points_earned, 0);
  }, [completions, now]);

  // Calculate monthly total from completions (already filtered by month)
  const monthlyTotal = useMemo(() => {
    return completions.reduce((sum, c) => sum + c.points_earned, 0);
  }, [completions]);

  const monthLabel = format(selectedMonth, "MMM yyyy");

  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-card to-card border-primary/30 backdrop-blur-sm">
      {/* Animated Background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary))_0%,transparent_70%)] animate-pulse" />
      </div>

      <div className="relative p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-primary/30 to-primary/50 flex items-center justify-center">
              <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-primary animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                {isSoloMode ? "My Growth" : "Team Velocity"}
              </h3>
              <p className="text-xs text-muted-foreground/70">This Week's Performance</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-green-500">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm font-medium">Live</span>
          </div>
        </div>

        <div className="space-y-2 sm:space-y-3">
          <div>
            <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              <AnimatedCounter end={weekPoints} suffix=" pts" />
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Earned this week
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2 sm:pt-3 border-t border-border/50">
            <div className="flex-1">
              <p className="text-lg sm:text-xl font-semibold text-foreground">
                <AnimatedCounter end={monthlyTotal} />
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{monthLabel} Points</p>
            </div>
            <div className="h-8 sm:h-10 w-px bg-border/50" />
            <div className="flex-1">
              <p className="text-lg sm:text-xl font-semibold text-foreground">
                <AnimatedCounter end={completions.length} />
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Tasks Done</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
