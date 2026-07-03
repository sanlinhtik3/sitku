import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, GraduationCap } from "lucide-react";

interface LearningWidgetProps {
  coursesCount: number;
  certificatesCount: number;
  overallProgress: number;
  onClick: () => void;
}

export const LearningWidget = ({ 
  coursesCount, 
  certificatesCount, 
  overallProgress,
  onClick 
}: LearningWidgetProps) => {
  return (
    <Card 
      className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] bg-gradient-to-br from-card to-card/80 border-primary/20"
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-lg relative">
            <BookOpen className="h-6 w-6 text-primary" />
            <GraduationCap className="h-3 w-3 text-green-600 dark:text-green-400 absolute -top-1 -right-1" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">My Learning</p>
            <p className="text-2xl font-bold">{coursesCount} Courses</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span>🎓 {certificatesCount} Completed</span>
              <span>•</span>
              <span>📊 {overallProgress}% Progress</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
