import { Navbar } from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy, Lock, Award, TrendingUp } from "lucide-react";
import { useAchievements } from "@/hooks/useAchievements";
import { Skeleton } from "@/components/ui/skeleton";

const Achievements = () => {
  const { achievements, earnedAchievements, lockedAchievements, loading } = useAchievements();

  const progressPercentage = achievements.length > 0 
    ? (earnedAchievements.length / achievements.length) * 100 
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="h-8 w-8 text-primary" />
              <h1 className="text-3xl lg:text-4xl font-bold">
                My <span className="text-primary">Achievements</span>
              </h1>
            </div>
            <p className="text-muted-foreground">
              Track your progress and unlock new badges
            </p>
          </div>

          {loading ? (
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-8 w-48 mb-4" />
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Progress Overview */}
              <Card className="mb-8">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">
                        {earnedAchievements.length} / {achievements.length}
                      </h2>
                      <p className="text-sm text-muted-foreground">Achievements Unlocked</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <span className="text-2xl font-bold text-primary">
                        {progressPercentage.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <Progress value={progressPercentage} className="h-3" />
                </CardContent>
              </Card>

              {/* Earned Achievements */}
              {earnedAchievements.length > 0 && (
                <div className="mb-12">
                  <div className="flex items-center gap-2 mb-6">
                    <Award className="h-6 w-6 text-primary" />
                    <h2 className="text-2xl font-bold">Earned</h2>
                    <Badge variant="outline">{earnedAchievements.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {earnedAchievements.map((achievement) => (
                      <Card
                        key={achievement.id}
                        className="overflow-hidden border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent hover:shadow-lg transition-all"
                      >
                        <CardContent className="p-6 text-center">
                          <div className="text-6xl mb-4">{achievement.icon}</div>
                          <h3 className="font-bold text-lg mb-2">{achievement.name}</h3>
                          <p className="text-sm text-muted-foreground mb-3">
                            {achievement.description}
                          </p>
                          {achievement.earned_at && (
                            <Badge variant="secondary" className="gap-1">
                              <Award className="h-3 w-3" />
                              Earned {new Date(achievement.earned_at).toLocaleDateString()}
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Locked Achievements */}
              {lockedAchievements.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <Lock className="h-6 w-6 text-muted-foreground" />
                    <h2 className="text-2xl font-bold">Locked</h2>
                    <Badge variant="outline">{lockedAchievements.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {lockedAchievements.map((achievement) => (
                      <Card
                        key={achievement.id}
                        className="overflow-hidden opacity-60 hover:opacity-80 transition-opacity"
                      >
                        <CardContent className="p-6 text-center">
                          <div className="text-6xl mb-4 grayscale">{achievement.icon}</div>
                          <h3 className="font-bold text-lg mb-2">{achievement.name}</h3>
                          <p className="text-sm text-muted-foreground mb-3">
                            {achievement.description}
                          </p>
                          <Badge variant="outline" className="gap-1">
                            <Lock className="h-3 w-3" />
                            Locked
                          </Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {achievements.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">No achievements yet</h3>
                    <p className="text-muted-foreground">
                      Complete lessons and courses to start earning achievements!
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Achievements;
