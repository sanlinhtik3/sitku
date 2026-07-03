import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpRight, FileText, UserPlus, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

interface CourseStatus {
  label: string;
  count: number;
  progress: number;
  color: string;
}

interface Activity {
  id: string;
  user: string;
  avatar?: string;
  action: string;
  time: string;
  type: "enrollment" | "post" | "completion";
  timestamp: string;
}

export const RecentActivityPanel = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [timeFilter, setTimeFilter] = useState("today");
  const [courseStatuses, setCourseStatuses] = useState<CourseStatus[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''}`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hour${Math.floor(diffMins / 60) > 1 ? 's' : ''}`;
    return `${Math.floor(diffMins / 1440)} day${Math.floor(diffMins / 1440) > 1 ? 's' : ''}`;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch course statuses
      const { data: courses } = await supabase.from("courses").select("id");
      const { data: lessonsData } = await supabase
        .from("lessons")
        .select("course_id")
        .not("course_id", "is", null);
      
      const uniqueCoursesWithLessons = new Set(lessonsData?.map(l => l.course_id) || []);
      const totalCourses = courses?.length || 0;
      const published = uniqueCoursesWithLessons.size;
      const draft = totalCourses - published;

      setCourseStatuses([
        { 
          label: "Published", 
          count: published, 
          progress: totalCourses > 0 ? (published / totalCourses) * 100 : 0, 
          color: "text-success" 
        },
        { 
          label: "Draft", 
          count: draft, 
          progress: totalCourses > 0 ? (draft / totalCourses) * 100 : 0, 
          color: "text-muted-foreground" 
        },
      ]);

      // Fetch recent activities
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id, created_at, status, user_id, course_id")
        .order("created_at", { ascending: false })
        .limit(3);

      const { data: completions } = await supabase
        .from("user_lesson_progress")
        .select("id, completed_at, user_id, lesson_id")
        .eq("completed", true)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(3);

      const { data: posts } = await supabase
        .from("posts")
        .select("id, created_at, title, author_id")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(3);

      // Fetch related data
      const allUserIds = [
        ...(enrollments?.map(e => e.user_id) || []),
        ...(completions?.map(c => c.user_id) || []),
        ...(posts?.map(p => p.author_id) || []).filter(Boolean),
      ];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", allUserIds);

      const { data: coursesData } = await supabase
        .from("courses")
        .select("id, title")
        .in("id", enrollments?.map(e => e.course_id) || []);

      const { data: lessonsDataForActivities } = await supabase
        .from("lessons")
        .select("id, title")
        .in("id", completions?.map(c => c.lesson_id) || []);

      const profilesMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      const coursesMap = new Map(coursesData?.map(c => [c.id, c]) || []);
      const lessonsMap = new Map(lessonsDataForActivities?.map(l => [l.id, l]) || []);

      const combinedActivities: Activity[] = [
        ...(enrollments?.map(e => {
          const profile = profilesMap.get(e.user_id);
          const course = coursesMap.get(e.course_id);
          return {
            id: e.id,
            user: profile?.full_name || "Unknown User",
            avatar: profile?.avatar_url,
            action: `enrolled in ${course?.title || "a course"}`,
            time: formatTimeAgo(e.created_at),
            type: "enrollment" as const,
            timestamp: e.created_at,
          };
        }) || []),
        ...(completions?.map(c => {
          const profile = profilesMap.get(c.user_id);
          const lesson = lessonsMap.get(c.lesson_id);
          return {
            id: c.id,
            user: profile?.full_name || "Unknown User",
            avatar: profile?.avatar_url,
            action: `completed ${lesson?.title || "a lesson"}`,
            time: formatTimeAgo(c.completed_at!),
            type: "completion" as const,
            timestamp: c.completed_at!,
          };
        }) || []),
        ...(posts?.map(p => {
          const profile = p.author_id ? profilesMap.get(p.author_id) : null;
          return {
            id: p.id,
            user: profile?.full_name || "Admin",
            avatar: profile?.avatar_url,
            action: `published "${p.title}"`,
            time: formatTimeAgo(p.created_at),
            type: "post" as const,
            timestamp: p.created_at,
          };
        }) || []),
      ]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5);

      setActivities(combinedActivities);
    } catch (error) {
      console.error("Error fetching activity data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (type: Activity["type"]) => {
    switch (type) {
      case "enrollment":
        return <UserPlus className="h-4 w-4 text-primary" />;
      case "post":
        return <FileText className="h-4 w-4 text-secondary" />;
      case "completion":
        return <CheckCircle2 className="h-4 w-4 text-success" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6 h-full flex flex-col">
        <Skeleton className="h-[240px]" />
        <Skeleton className="h-[320px]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 h-full flex flex-col">
      {/* Course Status Card */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3 sm:pb-4 px-4 sm:px-6">
          <CardTitle className="text-base sm:text-lg font-semibold">Course Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6">
          {courseStatuses.map((status) => (
            <div key={status.label} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{status.label}</span>
                <span className={`text-sm font-bold ${status.color}`}>{status.count}</span>
              </div>
              <Progress value={status.progress} className="h-2.5 sm:h-2" />
            </div>
          ))}
          <Button 
            variant="outline" 
            className="w-full mt-4 h-11 sm:h-10 active:scale-95 transition-transform"
            onClick={() => navigate("/admin#courses")}
          >
            Manage Courses
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Recent Activity Card */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm flex-1">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-3 sm:pb-4 px-4 sm:px-6">
          <CardTitle className="text-base sm:text-lg font-semibold">Recent Activity</CardTitle>
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-full sm:w-[100px] h-11 sm:h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6">
          {activities.slice(0, isMobile ? 3 : 4).map((activity) => (
            <div key={activity.id} className="flex items-start gap-3 group cursor-pointer hover:bg-muted/50 active:bg-muted p-3 sm:p-2 rounded-lg transition-colors min-h-[48px] sm:min-h-0">
              <Avatar className="h-10 w-10 sm:h-9 sm:w-9">
                <AvatarImage src={activity.avatar} />
                <AvatarFallback>{activity.user.split(' ').map(n => n[0]).join('')}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{activity.user}</span>
                  {" "}
                  <span className="text-muted-foreground">{activity.action}</span>
                </p>
                <div className="flex items-center gap-2 mt-1.5 sm:mt-1">
                  {getActivityIcon(activity.type)}
                  <span className="text-xs text-muted-foreground">{activity.time}</span>
                </div>
              </div>
            </div>
          ))}
          <Button 
            variant="ghost" 
            className="w-full text-sm sm:text-xs h-11 sm:h-auto active:scale-95 transition-transform" 
            size="sm"
          >
            View All Activity
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
