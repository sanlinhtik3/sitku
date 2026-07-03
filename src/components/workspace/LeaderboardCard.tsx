import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Medal, Award } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { useMemo } from "react";
import { format } from "date-fns";

interface LeaderboardCardProps {
  members: any[];
  completions?: any[];
  selectedMonth?: Date;
}

export function LeaderboardCard({ members, completions = [], selectedMonth = new Date() }: LeaderboardCardProps) {
  // Calculate monthly points per member from completions
  const rankedMembers = useMemo(() => {
    const pointsMap = new Map<string, number>();
    completions.forEach(c => {
      const current = pointsMap.get(c.completed_by) || 0;
      pointsMap.set(c.completed_by, current + c.points_earned);
    });

    return [...members]
      .filter(m => m.status === "accepted" || !m.status)
      .map(m => ({
        ...m,
        monthlyScore: pointsMap.get(m.user_id) || 0
      }))
      .sort((a, b) => b.monthlyScore - a.monthlyScore)
      .slice(0, 3);
  }, [members, completions]);

  const getMedalIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 1:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 2:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return null;
    }
  };

  const monthLabel = format(selectedMonth, "MMMM yyyy");

  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-card via-card to-primary/5 border-border/50 backdrop-blur-sm">
      {/* Animated Background */}
      <div className="absolute top-0 right-0 w-40 h-40 opacity-10">
        <Trophy className="w-full h-full text-primary animate-pulse" />
      </div>

      <div className="relative p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-2 sm:mb-3">
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-primary/30 to-primary/50 flex items-center justify-center">
            <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-medium text-muted-foreground">Top Performers</h3>
            <p className="text-[10px] sm:text-xs text-muted-foreground/70">{monthLabel} Leaders</p>
          </div>
        </div>

        <div className="space-y-1.5 sm:space-y-2">
          {rankedMembers.length > 0 ? (
            rankedMembers.map((member, index) => (
              <div
                key={member.id}
                className="flex items-center gap-2 p-2 sm:p-2.5 rounded-lg bg-background/50 border border-border/50 hover:border-primary/30 transition-all"
              >
                <div className="flex items-center justify-center w-6 sm:w-7">
                  {getMedalIcon(index)}
                </div>
                <Avatar className="h-7 w-7 sm:h-8 sm:w-8 border-2 border-primary/20">
                  <AvatarImage src={member.profiles?.avatar_url} />
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">
                    {member.profiles?.full_name?.[0] || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">
                    {member.profiles?.full_name || "Unknown"}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    {member.role === "owner" ? "Owner" : "Member"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm sm:text-base font-bold text-primary">
                    <AnimatedCounter end={member.monthlyScore} />
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">pts</p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No points earned this month
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
