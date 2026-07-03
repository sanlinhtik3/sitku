import { Card, CardContent } from "@/components/ui/card";
import { Flame } from "lucide-react";

interface StreakWidgetProps {
  currentStreak: number;
  longestStreak: number;
  onClick: () => void;
}

export const StreakWidget = ({
  currentStreak,
  longestStreak,
  onClick
}: StreakWidgetProps) => {
  return (
    <Card 
      className="cursor-pointer hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/20"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
            <Flame className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Current Streak</p>
            <p className="text-xl font-bold text-foreground">{currentStreak} days</p>
            <p className="text-xs text-muted-foreground">Best: {longestStreak} days</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
