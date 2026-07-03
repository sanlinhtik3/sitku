import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCourseRecommendations } from "@/hooks/useCourseRecommendations";
import { Sparkles, TrendingUp, BookOpen, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
export const CourseRecommendations = () => {
  const {
    data: recommendations,
    isLoading,
    error,
    refetch
  } = useCourseRecommendations();
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "medium":
        return "bg-primary/10 text-primary border-primary/20";
      case "low":
        return "bg-muted text-muted-foreground border-border";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };
  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "high":
        return <TrendingUp className="h-3 w-3" />;
      case "medium":
        return <BookOpen className="h-3 w-3" />;
      default:
        return null;
    }
  };
  if (error) {
    return <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Course Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-4">
              Failed to load recommendations
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>;
  }
  return;
};