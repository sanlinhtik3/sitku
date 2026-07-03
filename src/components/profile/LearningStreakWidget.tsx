import { BookOpen, Flame, GraduationCap, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface LearningStreakWidgetProps {
  coursesCount: number;
  certificatesCount: number;
  overallProgress: number;
  currentStreak: number;
  longestStreak: number;
  onClick: () => void;
}

export const LearningStreakWidget = ({
  coursesCount,
  certificatesCount,
  overallProgress,
  currentStreak,
  longestStreak,
  onClick
}: LearningStreakWidgetProps) => {
  return (
    <div
      className="relative overflow-hidden cursor-pointer rounded-2xl border border-border/30 bg-card/60 backdrop-blur-xl p-5 transition-all duration-300 hover:border-border/50 hover:shadow-lg"
      onClick={onClick}
    >
      {/* Glow orbs */}
      <div className="absolute -top-16 -left-16 w-32 h-32 bg-primary/8 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-orange-500/8 blur-[80px] rounded-full pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row gap-4">
        {/* Learning section */}
        <div className="flex-1 flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground/70">My Learning</p>
            <p className="text-lg font-bold text-foreground">{coursesCount} Courses</p>
            <div className="flex items-center gap-2 mt-1.5">
              <Progress value={overallProgress} className="h-1.5 flex-1" />
              <span className="text-[10px] text-muted-foreground/70 shrink-0">{overallProgress}%</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <GraduationCap className="h-3 w-3 text-green-500" />
              <span className="text-[10px] text-muted-foreground">{certificatesCount} Completed</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px bg-border/30 self-stretch" />
        <div className="sm:hidden h-px bg-border/30" />

        {/* Streak section */}
        <div className="flex items-start gap-3 sm:min-w-[140px]">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/20 flex items-center justify-center shrink-0">
            <Flame className="h-5 w-5 text-orange-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground/70">Streak</p>
            <p className="text-lg font-bold text-foreground">{currentStreak} <span className="text-xs font-normal text-muted-foreground">days</span></p>
            <div className="flex items-center gap-1.5 mt-1">
              <TrendingUp className="h-3 w-3 text-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground">Best: {longestStreak} days</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
