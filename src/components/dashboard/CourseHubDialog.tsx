import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCourseProgress } from "@/hooks/useCourseProgress";
import { useCertificates } from "@/hooks/useCertificates";
import { useLearningStreak } from "@/hooks/useLearningStreak";
import { useAchievements } from "@/hooks/useAchievements";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  BookOpen, 
  TrendingUp, 
  Award, 
  Flame, 
  Trophy, 
  Sparkles,
  GraduationCap,
  ExternalLink,
  Share2,
  Lock,
  Calendar
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CourseRecommendations } from "@/components/profile/CourseRecommendations";
import { StreakCalendar } from "@/components/profile/StreakCalendar";

interface CourseHubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

type TabType = "courses" | "progress" | "certificates" | "streak" | "achievements" | "recommendations";

const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: "courses", label: "My Courses", icon: <BookOpen className="h-4 w-4" /> },
  { id: "progress", label: "Progress", icon: <TrendingUp className="h-4 w-4" /> },
  { id: "certificates", label: "Certificates", icon: <Award className="h-4 w-4" /> },
  { id: "streak", label: "Streak", icon: <Flame className="h-4 w-4" /> },
  { id: "achievements", label: "Achievements", icon: <Trophy className="h-4 w-4" /> },
  { id: "recommendations", label: "For You", icon: <Sparkles className="h-4 w-4" /> },
];

export const CourseHubDialog = ({ open, onOpenChange, userId }: CourseHubDialogProps) => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("courses");
  
  const { data: courseProgress = [] } = useCourseProgress(userId);
  const { certificates } = useCertificates();
  const { currentStreak, longestStreak, lastActivityDate } = useLearningStreak();
  const { achievements, earnedAchievements, lockedAchievements } = useAchievements();

  const totalLessons = courseProgress.reduce((sum, course) => sum + course.total_lessons, 0);
  const completedLessons = courseProgress.reduce((sum, course) => sum + course.completed_lessons, 0);
  const overallProgress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const handleViewCourse = (courseId: string) => {
    navigate(`/courses/${courseId}`);
    onOpenChange(false);
  };

  const handleContinueLearning = (courseId: string) => {
    navigate(`/learn?course=${courseId}`);
    onOpenChange(false);
  };

  const handleViewCertificate = (certificateId: string) => {
    navigate(`/certificate/${certificateId}`);
    onOpenChange(false);
  };

  const handleShareCertificate = (certificateId: string) => {
    const url = `${window.location.origin}/certificate/${certificateId}`;
    navigator.clipboard.writeText(url);
    toast.success("Certificate link copied to clipboard!");
  };

  // Courses Section
  const CoursesSection = () => (
    <div className="space-y-4">
      {courseProgress.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No courses enrolled yet.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Start your learning journey by enrolling in a course!
          </p>
          <Button className="mt-4" onClick={() => { navigate("/courses"); onOpenChange(false); }}>
            Browse Courses
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {courseProgress.map((course) => (
            <Card key={course.course_id} className="border-border/50 bg-card/50 backdrop-blur hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <img
                    src={course.course_thumbnail || "/placeholder.svg"}
                    alt={course.course_title}
                    className="w-20 h-20 object-cover rounded-lg shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <h3 className="text-sm font-semibold truncate">{course.course_title}</h3>
                    <div className="flex items-center gap-2">
                      <Progress value={course.progress_percentage} className="flex-1 h-2" />
                      <span className="text-xs text-primary font-medium">{course.progress_percentage}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {course.completed_lessons} of {course.total_lessons} lessons
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleViewCourse(course.course_id)}>
                        View
                      </Button>
                      <Button size="sm" className="text-xs h-7" onClick={() => handleContinueLearning(course.course_id)}>
                        Continue
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // Progress Section
  const ProgressSection = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="h-4 w-4 text-primary" />
              <p className="text-xs text-muted-foreground">Courses</p>
            </div>
            <p className="text-2xl font-bold">{courseProgress.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <p className="text-xs text-muted-foreground">Lessons</p>
            </div>
            <p className="text-2xl font-bold">{totalLessons}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <GraduationCap className="h-4 w-4 text-green-500" />
              <p className="text-xs text-muted-foreground">Done</p>
            </div>
            <p className="text-2xl font-bold">{completedLessons}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Overall Progress</h3>
            <span className="text-2xl font-bold text-primary">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-3" />
          <p className="text-xs text-muted-foreground mt-2">
            {completedLessons} of {totalLessons} lessons completed
          </p>
        </CardContent>
      </Card>

      {courseProgress.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Course Breakdown</h4>
          {courseProgress.map((course) => (
            <Card key={course.course_id} className="border-border/50 bg-card/50">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <img src={course.course_thumbnail || "/placeholder.svg"} alt="" className="w-12 h-12 object-cover rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{course.course_title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={course.progress_percentage} className="flex-1 h-1.5" />
                      <span className="text-xs text-muted-foreground">{course.progress_percentage}%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // Certificates Section
  const CertificatesSection = () => (
    <div className="space-y-4">
      {certificates.length === 0 ? (
        <div className="text-center py-12">
          <Award className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No certificates earned yet.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Complete a course to earn your first certificate!
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Certificates</p>
                <p className="text-2xl font-bold">{certificates.length}</p>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Most Recent</p>
                <p className="text-sm font-semibold">
                  {format(new Date(certificates[0]?.issued_at), "MMM d, yyyy")}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            {certificates.map((cert) => (
              <Card key={cert.id} className="border-border/50 bg-card/50 hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold">{cert.certificate_data.course_title}</h3>
                      {cert.certificate_data.instructor_name && (
                        <p className="text-xs text-muted-foreground">
                          Instructor: {cert.certificate_data.instructor_name}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Issued: {format(new Date(cert.issued_at), "MMMM d, yyyy")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => handleViewCertificate(cert.id)}>
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => handleShareCertificate(cert.id)}>
                        <Share2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );

  // Streak Section
  const StreakSection = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-orange-500/20 bg-orange-500/10">
          <CardContent className="p-4 text-center">
            <Flame className="h-5 w-5 text-orange-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{currentStreak}</p>
            <p className="text-xs text-muted-foreground">Current</p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/10">
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold">{longestStreak}</p>
            <p className="text-xs text-muted-foreground">Longest</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4 text-center">
            <Calendar className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-sm font-semibold">
              {lastActivityDate ? format(new Date(lastActivityDate), "MMM d") : "N/A"}
            </p>
            <p className="text-xs text-muted-foreground">Last Active</p>
          </CardContent>
        </Card>
      </div>

      <StreakCalendar userId={userId} />

      <Card className="border-border/50 bg-card/50">
        <CardContent className="p-4">
          <h4 className="text-sm font-medium mb-3">Milestones</h4>
          <div className="grid grid-cols-4 gap-2">
            {[
              { days: 7, emoji: "🔥", label: "Week", achieved: longestStreak >= 7 },
              { days: 30, emoji: "🏆", label: "Month", achieved: longestStreak >= 30 },
              { days: 100, emoji: "💎", label: "100 Days", achieved: longestStreak >= 100 },
              { days: 365, emoji: "👑", label: "Year", achieved: longestStreak >= 365 },
            ].map((m) => (
              <div
                key={m.days}
                className={cn(
                  "p-2 rounded-lg border text-center",
                  m.achieved ? "bg-primary/10 border-primary" : "bg-muted/50 border-border opacity-50"
                )}
              >
                <div className="text-xl">{m.emoji}</div>
                <div className="text-xs font-medium">{m.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Achievements Section
  const AchievementsSection = () => (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Card className="flex-1 border-primary/20 bg-primary/10">
          <CardContent className="p-4 text-center">
            <Trophy className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold">{earnedAchievements.length}</p>
            <p className="text-xs text-muted-foreground">Earned</p>
          </CardContent>
        </Card>
        <Card className="flex-1 border-border/50 bg-card/50">
          <CardContent className="p-4 text-center">
            <Lock className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold">{lockedAchievements.length}</p>
            <p className="text-xs text-muted-foreground">Locked</p>
          </CardContent>
        </Card>
      </div>

      {earnedAchievements.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Earned Achievements</h4>
          {earnedAchievements.map((achievement) => (
            <Card key={achievement.id} className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{achievement.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold truncate">{achievement.name}</h3>
                      <Badge variant="secondary" className="bg-primary/10 text-primary text-xs shrink-0">Earned</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{achievement.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {lockedAchievements.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Locked Achievements</h4>
          {lockedAchievements.slice(0, 4).map((achievement) => (
            <Card key={achievement.id} className="border-border/50 bg-card/30 opacity-60">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl grayscale">{achievement.icon}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium truncate">{achievement.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {achievement.requirement_type === "lessons_completed" && `Complete ${achievement.requirement_value} lessons`}
                      {achievement.requirement_type === "courses_completed" && `Complete ${achievement.requirement_value} courses`}
                      {achievement.requirement_type === "streak_days" && `${achievement.requirement_value}-day streak`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // Recommendations Section
  const RecommendationsSection = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Recommended for You</h3>
      </div>
      <CourseRecommendations />
    </div>
  );

  // Render active section
  const renderContent = () => {
    switch (activeTab) {
      case "courses": return <CoursesSection />;
      case "progress": return <ProgressSection />;
      case "certificates": return <CertificatesSection />;
      case "streak": return <StreakSection />;
      case "achievements": return <AchievementsSection />;
      case "recommendations": return <RecommendationsSection />;
      default: return <CoursesSection />;
    }
  };

  // Desktop Content with Sidebar
  const DesktopContent = () => (
    <div className="flex gap-6 min-h-[400px]">
      <div className="w-44 shrink-0 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
              activeTab === item.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
      <Separator orientation="vertical" className="h-auto" />
      <div className="flex-1 min-w-0">
        <ScrollArea className="h-[60vh] md:h-[450px] lg:h-[500px] pr-4">
          {renderContent()}
        </ScrollArea>
      </div>
    </div>
  );

  // Mobile Content with Horizontal Tabs
  const MobileContent = () => (
    <div className="flex flex-col h-full">
      <div className="shrink-0 overflow-x-auto scrollbar-hide pb-3 -mx-1 px-1">
        <div className="flex gap-2 min-w-max">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all shrink-0",
                activeTab === item.id
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-muted/50 text-muted-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {renderContent()}
      </div>
    </div>
  );

  // Mobile: Bottom Drawer
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh] flex flex-col">
          <DrawerHeader className="text-left pb-2 shrink-0">
            <DrawerTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Learning Hub
            </DrawerTitle>
            <DrawerDescription>
              Your courses, progress & achievements
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 min-h-0 px-4 pb-6 overflow-hidden">
            <MobileContent />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: Dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] sm:max-w-[90vw] md:max-w-3xl lg:max-w-4xl xl:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Learning Hub
          </DialogTitle>
          <DialogDescription>
            Manage your courses, track progress, and view achievements
          </DialogDescription>
        </DialogHeader>
        <DesktopContent />
      </DialogContent>
    </Dialog>
  );
};
