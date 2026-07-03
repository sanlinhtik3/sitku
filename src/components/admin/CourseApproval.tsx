import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Clock, CheckCircle2, XCircle, Loader2, Eye, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface PendingCourse {
  id: string;
  title: string;
  slug: string;
  description: string;
  thumbnail_url: string;
  category: string;
  difficulty: string;
  is_free: boolean;
  price: number;
  approval_status: string;
  rejection_reason: string;
  created_by: string;
  created_at: string;
  creator_name?: string;
  creator_email?: string;
}

export function CourseApproval() {
  const [courses, setCourses] = useState<PendingCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<PendingCourse | null>(null);
  const [reviewMode, setReviewMode] = useState<"approve" | "reject" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");

  useEffect(() => {
    fetchCourses();
  }, [activeTab]);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const { data: coursesData, error } = await supabase
        .from("courses")
        .select("*")
        .eq("approval_status", activeTab)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get creator details
      if (coursesData && coursesData.length > 0) {
        const creatorIds = [...new Set(coursesData.map(c => c.created_by))];
        const { data: { users } } = await supabase.auth.admin.listUsers();
        
        const userMap = new Map<string, { email: string; name: string }>();
        if (users) {
          users.forEach((u: any) => {
            if (u.id && u.email) {
              userMap.set(u.id, {
                email: u.email,
                name: u.user_metadata?.full_name || "Unknown"
              });
            }
          });
        }

        const enrichedCourses = coursesData.map(course => ({
          ...course,
          creator_email: userMap.get(course.created_by)?.email || "Unknown",
          creator_name: userMap.get(course.created_by)?.name || "Unknown Creator",
        }));

        setCourses(enrichedCourses);
      } else {
        setCourses([]);
      }
    } catch (error) {
      console.error("Error fetching courses:", error);
      toast.error("Failed to load courses");
    } finally {
      setLoading(false);
    }
  };

  const handleReview = (course: PendingCourse, mode: "approve" | "reject") => {
    setSelectedCourse(course);
    setReviewMode(mode);
    setRejectionReason("");
  };

  const handleApprove = async () => {
    if (!selectedCourse) return;

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("courses")
        .update({
          approval_status: "approved",
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq("id", selectedCourse.id);

      if (error) throw error;

      toast.success("Course approved successfully!");
      setSelectedCourse(null);
      setReviewMode(null);
      fetchCourses();
    } catch (error) {
      console.error("Error approving course:", error);
      toast.error("Failed to approve course");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedCourse || !rejectionReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase
        .from("courses")
        .update({
          approval_status: "rejected",
          rejection_reason: rejectionReason,
        })
        .eq("id", selectedCourse.id);

      if (error) throw error;

      toast.success("Course rejected");
      setSelectedCourse(null);
      setReviewMode(null);
      setRejectionReason("");
      fetchCourses();
    } catch (error) {
      console.error("Error rejecting course:", error);
      toast.error("Failed to reject course");
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const config = {
      pending: { variant: "outline" as const, icon: Clock, label: "Pending" },
      approved: { variant: "default" as const, icon: CheckCircle2, label: "Approved" },
      rejected: { variant: "destructive" as const, icon: XCircle, label: "Rejected" },
    };

    const statusConfig = config[status as keyof typeof config];
    if (!statusConfig) return null;

    const Icon = statusConfig.icon;
    return (
      <Badge variant={statusConfig.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {statusConfig.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Course Approval</h2>
        <p className="text-muted-foreground">Review and manage course submissions</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4 mt-6">
          {courses.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No {activeTab} courses found
              </CardContent>
            </Card>
          ) : (
            courses.map((course) => (
              <Card key={course.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4 flex-1">
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
                          <CardTitle className="truncate">{course.title}</CardTitle>
                          {getStatusBadge(course.approval_status)}
                        </div>
                        <CardDescription>
                          By {course.creator_name} • {format(new Date(course.created_at), "PPP")}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{course.description}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <Badge variant="outline">{course.difficulty}</Badge>
                    {course.category && <Badge variant="secondary">{course.category}</Badge>}
                    <span className="flex items-center gap-1 text-sm">
                      <DollarSign className="h-4 w-4" />
                      {course.is_free ? "Free" : `$${course.price}`}
                    </span>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      {course.slug}
                    </span>
                  </div>

                  {course.rejection_reason && (
                    <div className="p-3 bg-destructive/10 rounded-md">
                      <p className="text-sm font-medium text-destructive">Rejection Reason:</p>
                      <p className="text-sm text-muted-foreground mt-1">{course.rejection_reason}</p>
                    </div>
                  )}

                  {course.approval_status === "pending" && (
                    <div className="flex gap-2">
                      <Button onClick={() => handleReview(course, "approve")}>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                      <Button 
                        variant="destructive" 
                        onClick={() => handleReview(course, "reject")}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!reviewMode} onOpenChange={() => {
        setReviewMode(null);
        setSelectedCourse(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewMode === "approve" ? "Approve Course" : "Reject Course"}
            </DialogTitle>
            <DialogDescription>
              {reviewMode === "approve" 
                ? "This course will be published and visible to all users."
                : "This course will be sent back to the creator with your feedback."
              }
            </DialogDescription>
          </DialogHeader>

          {selectedCourse && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-1">{selectedCourse.title}</h4>
                <p className="text-sm text-muted-foreground">
                  by {selectedCourse.creator_name}
                </p>
              </div>

              {reviewMode === "reject" && (
                <div className="space-y-2">
                  <Label htmlFor="rejection_reason">Rejection Reason *</Label>
                  <Textarea
                    id="rejection_reason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explain why this course is being rejected..."
                    rows={4}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    This will be visible to the creator
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setReviewMode(null);
                setSelectedCourse(null);
              }} 
              disabled={processing}
            >
              Cancel
            </Button>
            {reviewMode === "approve" ? (
              <Button onClick={handleApprove} disabled={processing}>
                {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Approve Course
              </Button>
            ) : (
              <Button 
                variant="destructive" 
                onClick={handleReject} 
                disabled={processing}
              >
                {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reject Course
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
