import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCreatorPermissions } from "@/hooks/useCreatorPermissions";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Loader2, AlertCircle } from "lucide-react";
import { LessonManager } from "@/components/creator/LessonManager";
import { ThumbnailUploader } from "@/components/admin/ThumbnailUploader";

export default function CourseEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canCreateCourse, loading: permissionsLoading } = useCreatorPermissions();
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "programming",
    difficulty: "beginner",
    is_free: true,
    price: 0,
    thumbnail_url: "",
    is_published: false,
  });

  const isEditMode = !!id;

  useEffect(() => {
    if (id) {
      fetchCourse();
    }
  }, [id]);

  const fetchCourse = async () => {
    if (!id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .eq("id", id)
        .eq("created_by", user?.id)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          title: data.title,
          description: data.description || "",
          category: data.category || "programming",
          difficulty: data.difficulty || "beginner",
          is_free: data.is_free,
          price: data.price || 0,
          thumbnail_url: data.thumbnail_url || "",
          is_published: data.is_published || false,
        });
      }
    } catch (error: any) {
      console.error("Error fetching course:", error);
      toast({
        title: "Error",
        description: "Failed to load course details",
        variant: "destructive",
      });
      navigate("/creator");
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast({
        title: "Error",
        description: "Course title is required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const slug = generateSlug(formData.title);
      
      if (isEditMode) {
        // Update existing course
        const { error } = await supabase
          .from("courses")
          .update({
            ...formData,
            slug,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("created_by", user?.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Course updated successfully.",
        });
        
        setActiveTab("curriculum");
      } else {
        // Create new course
        const { data, error } = await supabase
          .from("courses")
          .insert({
            ...formData,
            slug,
            created_by: user?.id,
          })
          .select()
          .single();

        if (error) throw error;

        toast({
          title: "Success",
          description: "Course created successfully! Now add lessons to your course.",
        });
        
        navigate(`/creator/courses/${data.id}/edit`);
      }
    } catch (error: any) {
      console.error("Error saving course:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save course",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (permissionsLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 pt-24 pb-12">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (!isEditMode && !canCreateCourse) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 pt-24 pb-12">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You don't have permission to create courses. Please contact an administrator.
            </AlertDescription>
          </Alert>
          <Button onClick={() => navigate("/creator")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/creator")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold">
                  {isEditMode ? "Edit Course" : "Create New Course"}
                </h1>
                <p className="text-muted-foreground">
                  {isEditMode
                    ? "Update your course details and manage curriculum"
                    : "Fill in the details to create your course"}
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Course Details</TabsTrigger>
              <TabsTrigger value="curriculum" disabled={!isEditMode}>
                Curriculum {!isEditMode && "(Save course first)"}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                    <CardDescription>
                      Provide the essential details about your course
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Course Title *</Label>
                      <Input
                        id="title"
                        placeholder="e.g., Complete Web Development Bootcamp"
                        value={formData.title}
                        onChange={(e) =>
                          setFormData({ ...formData, title: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Describe what students will learn in this course..."
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({ ...formData, description: e.target.value })
                        }
                        rows={5}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Course Thumbnail</Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Recommended: 16:9 ratio (1280×720 or 1920×1080) · Max 2MB
                      </p>
                      <ThumbnailUploader
                        value={formData.thumbnail_url}
                        onChange={(url) => setFormData({ ...formData, thumbnail_url: url })}
                        bucket="course-thumbnails"
                        maxSizeMB={2}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="category">Category</Label>
                        <Select
                          value={formData.category}
                          onValueChange={(value) =>
                            setFormData({ ...formData, category: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="programming">Programming</SelectItem>
                            <SelectItem value="design">Design</SelectItem>
                            <SelectItem value="business">Business</SelectItem>
                            <SelectItem value="marketing">Marketing</SelectItem>
                            <SelectItem value="photography">Photography</SelectItem>
                            <SelectItem value="music">Music</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="difficulty">Difficulty Level</Label>
                        <Select
                          value={formData.difficulty}
                          onValueChange={(value) =>
                            setFormData({ ...formData, difficulty: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="beginner">Beginner</SelectItem>
                            <SelectItem value="intermediate">Intermediate</SelectItem>
                            <SelectItem value="advanced">Advanced</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Pricing</CardTitle>
                    <CardDescription>
                      Set the price for your course
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="is_free">Free Course</Label>
                        <p className="text-sm text-muted-foreground">
                          Make this course free for all students
                        </p>
                      </div>
                      <Switch
                        id="is_free"
                        checked={formData.is_free}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, is_free: checked, price: checked ? 0 : formData.price })
                        }
                      />
                    </div>

                    {!formData.is_free && (
                      <div className="space-y-2">
                        <Label htmlFor="price">Price (USD)</Label>
                        <Input
                          id="price"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="49.99"
                          value={formData.price}
                          onChange={(e) =>
                            setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          You'll receive 70% of the course price
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Publishing</CardTitle>
                    <CardDescription>
                      Control who can see and enroll in your course
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="is_published">Publish Course</Label>
                        <p className="text-sm text-muted-foreground">
                          When published, students can view and enroll in this course
                        </p>
                      </div>
                      <Switch
                        id="is_published"
                        checked={formData.is_published}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, is_published: checked })
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/creator")}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        {isEditMode ? "Save Changes" : "Create Course"}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="curriculum">
              {isEditMode && <LessonManager courseId={id} />}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
