import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Users, UserCheck } from "lucide-react";

export const AdminStats = () => {
  const [stats, setStats] = useState({
    totalCourses: 0,
    totalUsers: 0,
    totalEnrollments: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const [coursesRes, usersRes, enrollmentsRes] = await Promise.all([
      supabase.from("courses").select("id", { count: "exact" }),
      supabase.from("profiles").select("id", { count: "exact" }),
      supabase.from("enrollments").select("id", { count: "exact" }),
    ]);

    setStats({
      totalCourses: coursesRes.count || 0,
      totalUsers: usersRes.count || 0,
      totalEnrollments: enrollmentsRes.count || 0,
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Courses</p>
              <p className="text-3xl font-bold">{stats.totalCourses}</p>
            </div>
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Users</p>
              <p className="text-3xl font-bold">{stats.totalUsers}</p>
            </div>
            <div className="h-12 w-12 rounded-lg bg-secondary/10 flex items-center justify-center">
              <Users className="h-6 w-6 text-secondary" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Enrollments</p>
              <p className="text-3xl font-bold">{stats.totalEnrollments}</p>
            </div>
            <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
              <UserCheck className="h-6 w-6 text-success" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
