import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Lock, Award } from "lucide-react";
import { useAchievements } from "@/hooks/useAchievements";
import { Skeleton } from "@/components/ui/skeleton";

export const AchievementsBadges = () => {
  const { achievements, earnedAchievements, lockedAchievements, loading } = useAchievements();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Achievements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (achievements.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Achievements
          </CardTitle>
          <Badge variant="outline">
            {earnedAchievements.length} / {achievements.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {earnedAchievements.map((achievement) => (
            <div
              key={achievement.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20"
            >
              <div className="text-2xl">{achievement.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-sm">{achievement.name}</h4>
                  <Award className="h-4 w-4 text-primary flex-shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground">{achievement.description}</p>
                {achievement.earned_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Earned {new Date(achievement.earned_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          ))}
          
          {lockedAchievements.slice(0, 3).map((achievement) => (
            <div
              key={achievement.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 opacity-60"
            >
              <div className="text-2xl grayscale">{achievement.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-sm">{achievement.name}</h4>
                  <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground">{achievement.description}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
