import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreatorCourses } from "@/hooks/useCreatorCourses";
import { useCreatorPermissions } from "@/hooks/useCreatorPermissions";
import { Navbar } from "@/components/Navbar";
import { BookOpen, Users, Eye, DollarSign, Plus, CheckCircle, XCircle, Edit } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function CreatorCourses() {
  const { courses, loading } = useCreatorCourses();
  const { canCreateCourse } = useCreatorPermissions();
  const [activeTab, setActiveTab] = useState("all");

  const filteredCourses = courses.filter(course => {
    if (activeTab === "all") return true;
    if (activeTab === "published") return course.is_published;
    if (activeTab === "unpublished") return !course.is_published;
    return true;
  });

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
              <h1 className="text-4xl font-bold tracking-tight">Your Courses</h1>
              <p className="text-muted-foreground mt-2">
                Create and manage your educational content
              </p>
            </div>
            <Link to="/creator/courses/new">
              <Button size="lg" disabled={!canCreateCourse} className="gap-2">
                <Plus className="h-4 w-4" />
                Create New Course
              </Button>
            </Link>
          </div>

          {/* Courses List */}
          <Card>
            <CardHeader>
              <CardTitle>All Courses</CardTitle>
              <CardDescription>
                Manage your courses and their published status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-6">
                  <TabsTrigger value="all">All ({courses.length})</TabsTrigger>
                  <TabsTrigger value="published">
                    Published ({courses.filter(c => c.is_published).length})
                  </TabsTrigger>
                  <TabsTrigger value="unpublished">
                    Unpublished ({courses.filter(c => !c.is_published).length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab}>
                  {loading ? (
                    <div className="space-y-4">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i}>
                          <CardContent className="p-6">
                            <div className="flex items-center gap-4">
                              <Skeleton className="h-24 w-32 rounded-lg" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-5 w-64" />
                                <Skeleton className="h-4 w-96" />
                                <Skeleton className="h-4 w-48" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : filteredCourses.length === 0 ? (
                    <div className="text-center py-12">
                      <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No courses found</h3>
                      <p className="text-muted-foreground mb-4">
                        {activeTab === "all" 
                          ? "Create your first course to start sharing knowledge"
                          : `No ${activeTab} courses at the moment`
                        }
                      </p>
                      {activeTab === "all" && (
                        <Link to="/creator/courses/new">
                          <Button disabled={!canCreateCourse}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Your First Course
                          </Button>
                        </Link>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredCourses.map((course) => (
                        <Card key={course.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-6">
                            <div className="flex flex-col md:flex-row gap-6">
                              {/* Thumbnail */}
                              {course.thumbnail_url ? (
                                <img
                                  src={course.thumbnail_url}
                                  alt={course.title}
                                  className="h-24 w-32 object-cover rounded-lg"
                                />
                              ) : (
                                <div className="h-24 w-32 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                                  <BookOpen className="h-8 w-8 text-muted-foreground" />
                                </div>
                              )}

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-4 mb-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h3 className="text-lg font-semibold">{course.title}</h3>
                                      {getPublishBadge(course.is_published)}
                                    </div>
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                      {course.description}
                                    </p>
                                  </div>
                                  <Link to={`/creator/courses/${course.id}/edit`}>
                                    <Button variant="outline" size="sm" className="gap-2">
                                      <Edit className="h-4 w-4" />
                                      Edit
                                    </Button>
                                  </Link>
                                </div>

                                {/* Stats */}
                                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-3">
                                  <span className="flex items-center gap-1">
                                    <Users className="h-4 w-4" />
                                    {course.enrollment_count} enrolled
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Eye className="h-4 w-4" />
                                    {course.view_count} views
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <DollarSign className="h-4 w-4" />
                                    {course.is_free ? "Free" : `$${course.price}`}
                                  </span>
                                  <Badge variant="outline">{course.difficulty}</Badge>
                                  {course.category && <Badge variant="secondary">{course.category}</Badge>}
                                </div>

                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
