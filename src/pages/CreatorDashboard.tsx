import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCreatorStats } from "@/hooks/useCreatorStats";
import { useCreatorCourses } from "@/hooks/useCreatorCourses";
import { useCreatorPermissions } from "@/hooks/useCreatorPermissions";
import { Navbar } from "@/components/Navbar";
import { CreditBalanceWidget } from "@/components/CreditBalanceWidget";
import { BookOpen, Users, DollarSign, Eye, Plus, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export default function CreatorDashboard() {
  const { stats, loading: statsLoading } = useCreatorStats();
  const { courses, loading: coursesLoading } = useCreatorCourses();
  const { permissions, canCreateCourse, remainingSlots } = useCreatorPermissions();

  const statCards = [
    {
      title: "Total Courses",
      value: stats.totalCourses,
      icon: BookOpen,
      description: "Your created courses",
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-950",
    },
    {
      title: "Total Enrollments",
      value: stats.totalEnrollments,
      icon: Users,
      description: "Active learners",
      color: "text-green-600",
      bgColor: "bg-green-50 dark:bg-green-950",
    },
    {
      title: "Total Revenue",
      value: `$${stats.totalRevenue.toFixed(2)}`,
      icon: DollarSign,
      description: "70% creator share",
      color: "text-amber-600",
      bgColor: "bg-amber-50 dark:bg-amber-950",
    },
    {
      title: "Total Views",
      value: stats.totalViews,
      icon: Eye,
      description: "Course page views",
      color: "text-purple-600",
      bgColor: "bg-purple-50 dark:bg-purple-950",
    },
  ];

  const getPublishBadge = (isPublished: boolean) => {
    return isPublished ? (
      <Badge variant="default" className="gap-1">
        <CheckCircle className="h-3 w-3" />
        Published
      </Badge>
    ) : (
      <Badge variant="outline" className="gap-1">
        <XCircle className="h-3 w-3" />
        Unpublished
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-12">
        <div className="space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Creator Dashboard
              </h1>
              <p className="text-muted-foreground mt-2">
                Manage your courses and track your performance
              </p>
            </div>
            <Link to="/creator/courses/new">
              <Button 
                size="lg" 
                disabled={!canCreateCourse}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Create Course
              </Button>
            </Link>
          </div>

          {/* Permission Status */}
          {permissions && (
            <>
              {permissions.is_suspended && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Your creator account is suspended. {permissions.suspension_reason}
                  </AlertDescription>
                </Alert>
              )}

              {!permissions.can_create_courses && !permissions.is_suspended && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You don't have permission to create courses yet. Please contact an administrator.
                  </AlertDescription>
                </Alert>
              )}

              {permissions.can_create_courses && !permissions.is_suspended && (
                <Alert>
                  <AlertDescription>
                    You can create up to {permissions.max_courses} courses. {remainingSlots} slots remaining.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}

          {/* Credit Balance Widget */}
          <CreditBalanceWidget />

          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))
            ) : (
              statCards.map((stat) => {
                const Icon = stat.icon;
                return (
                  <Card key={stat.title}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardDescription>{stat.title}</CardDescription>
                      <div className={cn("p-2 rounded-lg", stat.bgColor)}>
                        <Icon className={cn("h-4 w-4", stat.color)} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{stat.value}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {stat.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Courses Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Your Courses</CardTitle>
                  <CardDescription>Manage and track your course performance</CardDescription>
                </div>
                <Link to="/creator/courses">
                  <Button variant="outline">View All</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {coursesLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-16 w-24 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : courses.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No courses yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first course to start sharing knowledge
                  </p>
                  <Link to="/creator/courses/new">
                    <Button disabled={!canCreateCourse}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Course
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {courses.slice(0, 5).map((course) => (
                    <div
                      key={course.id}
                      className="flex items-center gap-4 p-4 rounded-lg border hover:bg-accent/50 transition-colors"
                    >
                      {course.thumbnail_url ? (
                        <img
                          src={course.thumbnail_url}
                          alt={course.title}
                          className="h-16 w-24 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="h-16 w-24 bg-muted rounded-lg flex items-center justify-center">
                          <BookOpen className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold truncate">{course.title}</h4>
                          {getPublishBadge(course.is_published)}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {course.enrollment_count} enrolled
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {course.view_count} views
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {course.is_free ? "Free" : `$${course.price}`}
                          </span>
                        </div>
                      </div>
                      <Link to={`/creator/courses/${course.id}/edit`}>
                        <Button variant="outline" size="sm">
                          Manage
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
