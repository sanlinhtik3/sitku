import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface AchievementsWidgetProps {
  earnedCount: number;
  totalCount: number;
  onClick: () => void;
}

export const AchievementsWidget = ({
  earnedCount,
  totalCount,
  onClick
}: AchievementsWidgetProps) => {
  const percentage = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

  return (
    <Card 
      className="cursor-pointer hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-yellow-500/10 to-amber-500/10 border-yellow-500/20"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-yellow-500 to-amber-500 flex items-center justify-center">
            <Trophy className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Achievements</p>
            <p className="text-xl font-bold text-foreground">{earnedCount}/{totalCount}</p>
            <Progress value={percentage} className="h-1.5 mt-1" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
