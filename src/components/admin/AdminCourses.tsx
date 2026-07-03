import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Eye, ChevronDown, ChevronUp, Search, LayoutGrid, Table, Filter, ArrowUpDown, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { LessonManager } from "@/components/creator/LessonManager";
import { ThumbnailUploader } from "@/components/admin/ThumbnailUploader";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  is_free: boolean;
  price: number;
  thumbnail_url: string;
  instructor_name: string;
  is_published: boolean;
}

export const AdminCourses = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('created_at_desc');
  const [categories, setCategories] = useState<string[]>([]);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [detailsThumbnailUrl, setDetailsThumbnailUrl] = useState('');

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [searchQuery, currentPage, itemsPerPage, categoryFilter, sortBy]);

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("courses")
      .select("category")
      .not("category", "is", null);
    
    if (data) {
      const uniqueCategories = [...new Set(data.map(c => c.category))].filter(Boolean);
      setCategories(uniqueCategories);
    }
  };

  const fetchCourses = async () => {
    setLoading(true);
    const from = currentPage * itemsPerPage;
    const to = from + itemsPerPage - 1;

    let query = supabase
      .from("courses")
      .select("*", { count: 'exact' })
      .range(from, to);

    // Apply search filter
    if (searchQuery) {
      query = query.or(`title.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%,instructor_name.ilike.%${searchQuery}%`);
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
      query = query.eq('category', categoryFilter);
    }

    // Apply sorting
    const [sortField, sortOrder] = sortBy.split('_');
    if (sortField === 'created') {
      query = query.order('created_at', { ascending: sortOrder === 'asc' });
    } else if (sortField === 'title') {
      query = query.order('title', { ascending: sortOrder === 'asc' });
    } else if (sortField === 'price') {
      query = query.order('price', { ascending: sortOrder === 'asc' });
    }

    const { data, error, count } = await query;

    if (!error && data) {
      setCourses(data);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const title = formData.get("title") as string;
    const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

    const courseData = {
      title,
      slug: editingCourse ? editingCourse.slug : slug,
      description: formData.get("description") as string,
      category: formData.get("category") as string,
      difficulty: formData.get("difficulty") as string,
      is_free: formData.get("is_free") === "true",
      price: parseFloat(formData.get("price") as string) || 0,
      thumbnail_url: thumbnailUrl,
      instructor_name: formData.get("instructor_name") as string,
    };

    if (editingCourse) {
      const { error } = await supabase
        .from("courses")
        .update(courseData)
        .eq("id", editingCourse.id);

      if (error) {
        toast.error("Failed to update course");
      } else {
        toast.success("Course updated successfully");
        fetchCourses();
        setDialogOpen(false);
        setEditingCourse(null);
      }
    } else {
      const { error } = await supabase
        .from("courses")
        .insert(courseData);

      if (error) {
        toast.error("Failed to create course");
      } else {
        toast.success("Course created successfully");
        fetchCourses();
        setDialogOpen(false);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this course?")) return;

    const { error } = await supabase
      .from("courses")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete course");
    } else {
      toast.success("Course deleted successfully");
      fetchCourses();
    }
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Courses Management</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingCourse(null);
            setThumbnailUrl('');
          } else if (editingCourse) {
            setThumbnailUrl(editingCourse.thumbnail_url || '');
          }
        }}>
          <DialogTrigger asChild>
            <Button variant="hero">
              <Plus className="h-4 w-4 mr-2" />
              Add Course
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCourse ? "Edit Course" : "Create New Course"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" name="title" defaultValue={editingCourse?.title} required />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea id="description" name="description" defaultValue={editingCourse?.description} required rows={4} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Input id="category" name="category" defaultValue={editingCourse?.category} required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="difficulty">Difficulty *</Label>
                  <select 
                    id="difficulty" 
                    name="difficulty" 
                    defaultValue={(editingCourse as any)?.difficulty || "beginner"}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background"
                    required
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instructor_name">Instructor Name</Label>
                  <Input id="instructor_name" name="instructor_name" defaultValue={editingCourse?.instructor_name} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Course Thumbnail</Label>
                <p className="text-xs text-muted-foreground">16:9 ratio · Max 2MB</p>
                <ThumbnailUploader
                  value={thumbnailUrl}
                  onChange={setThumbnailUrl}
                  bucket="course-thumbnails"
                  maxSizeMB={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="is_free">Free Course</Label>
                  <select 
                    id="is_free" 
                    name="is_free" 
                    defaultValue={editingCourse?.is_free ? "true" : "false"}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background"
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price">Price ($)</Label>
                  <Input 
                    id="price" 
                    name="price" 
                    type="number" 
                    step="0.01" 
                    defaultValue={editingCourse?.price} 
                    min="0"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="submit" variant="hero" className="flex-1">
                  {editingCourse ? "Update" : "Create"} Course
                </Button>
                <Button type="button" variant="ghost-light" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search courses..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(0);
              }}
              className="pl-9"
            />
          </div>

          <Select value={categoryFilter} onValueChange={(value) => {
            setCategoryFilter(value);
            setCurrentPage(0);
          }}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at_desc">Newest First</SelectItem>
              <SelectItem value="created_at_asc">Oldest First</SelectItem>
              <SelectItem value="title_asc">Title A-Z</SelectItem>
              <SelectItem value="title_desc">Title Z-A</SelectItem>
              <SelectItem value="price_asc">Price Low-High</SelectItem>
              <SelectItem value="price_desc">Price High-Low</SelectItem>
            </SelectContent>
          </Select>

          <Select value={itemsPerPage.toString()} onValueChange={(value) => {
            setItemsPerPage(Number(value));
            setCurrentPage(0);
          }}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">6 per page</SelectItem>
              <SelectItem value="12">12 per page</SelectItem>
              <SelectItem value="24">24 per page</SelectItem>
              <SelectItem value="50">50 per page</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-1 border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
            >
              <Table className="h-4 w-4" />
            </Button>
          </div>

          <Badge variant="outline" className="ml-auto">{totalCount} courses</Badge>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-pulse text-primary">Loading courses...</div>
        </div>
      ) : courses.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No courses found. Try adjusting your filters.</p>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4">
          {courses.map((course) => (
            <Collapsible
              key={course.id}
              open={expandedCourse === course.id}
              onOpenChange={(isOpen) => setExpandedCourse(isOpen ? course.id : null)}
            >
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <img 
                      src={course.thumbnail_url || "https://images.unsplash.com/photo-1639322537228-f710d846310a?w=200"} 
                      alt={course.title}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-xl font-semibold mb-1">{course.title}</h3>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{course.category}</Badge>
                            <Badge>{course.is_free ? "Free" : `$${course.price}`}</Badge>
                            <Badge variant={course.is_published ? "default" : "secondary"}>
                              {course.is_published ? "Published" : "Unpublished"}
                            </Badge>
                            {course.instructor_name && (
                              <span className="text-xs text-muted-foreground">by {course.instructor_name}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={course.is_published}
                            onCheckedChange={async (checked) => {
                              const { error } = await supabase
                                .from("courses")
                                .update({ is_published: checked })
                                .eq("id", course.id);

                              if (error) {
                                toast.error("Failed to update publish status");
                              } else {
                                toast.success(checked ? "Course published" : "Course unpublished");
                                fetchCourses();
                              }
                            }}
                            title={course.is_published ? "Unpublish" : "Publish"}
                          />
                          <Button 
                            variant="ghost-light" 
                            size="sm"
                            onClick={() => {
                              setSelectedCourse(course);
                              setDetailsDialogOpen(true);
                            }}
                            title="View Details"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost-light" size="sm" title="Manage Lessons">
                              {expandedCourse === course.id ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <Link to={`/course/${course.slug}`}>
                            <Button variant="ghost-light" size="sm" title="Preview Course">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button 
                            variant="ghost-light" 
                            size="sm"
                            onClick={() => handleDelete(course.id)}
                            title="Delete Course"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-muted-foreground text-sm line-clamp-2">{course.description}</p>
                    </div>
                  </div>
                </CardContent>
                
                <CollapsibleContent>
                  <div className="px-6 pb-6 border-t border-border/50 pt-6">
                    <LessonManager courseId={course.id} />
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 font-semibold">Course</th>
                  <th className="text-left p-4 font-semibold">Category</th>
                  <th className="text-left p-4 font-semibold">Instructor</th>
                  <th className="text-left p-4 font-semibold">Price</th>
                  <th className="text-left p-4 font-semibold">Status</th>
                  <th className="text-right p-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <img 
                          src={course.thumbnail_url || "https://images.unsplash.com/photo-1639322537228-f710d846310a?w=200"} 
                          alt={course.title}
                          className="w-12 h-12 object-cover rounded"
                        />
                        <div>
                          <div className="font-semibold">{course.title}</div>
                          <div className="text-sm text-muted-foreground line-clamp-1">{course.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline">{course.category}</Badge>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {course.instructor_name || '-'}
                    </td>
                    <td className="p-4">
                      <Badge>{course.is_free ? "Free" : `$${course.price}`}</Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={course.is_published}
                          onCheckedChange={async (checked) => {
                            const { error } = await supabase
                              .from("courses")
                              .update({ is_published: checked })
                              .eq("id", course.id);

                            if (error) {
                              toast.error("Failed to update publish status");
                            } else {
                              toast.success(checked ? "Course published" : "Course unpublished");
                              fetchCourses();
                            }
                          }}
                        />
                        <Badge variant={course.is_published ? "default" : "secondary"}>
                          {course.is_published ? "Published" : "Unpublished"}
                        </Badge>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setSelectedCourse(course);
                            setDetailsDialogOpen(true);
                          }}
                          title="View Details"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Link to={`/course/${course.slug}`}>
                          <Button variant="ghost" size="sm" title="Preview Course">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDelete(course.id)}
                          title="Delete Course"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                className={currentPage === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {Array.from({ length: totalPages }, (_, i) => (
              <PaginationItem key={i}>
                <PaginationLink
                  onClick={() => setCurrentPage(i)}
                  isActive={currentPage === i}
                  className="cursor-pointer"
                >
                  {i + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                className={currentPage === totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {/* Course Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={(open) => {
        setDetailsDialogOpen(open);
        if (open && selectedCourse) {
          setDetailsThumbnailUrl(selectedCourse.thumbnail_url || '');
        }
      }}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Course Management
            </DialogTitle>
          </DialogHeader>
          
          {selectedCourse && (
            <Tabs defaultValue="details" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">Course Details</TabsTrigger>
                <TabsTrigger value="lessons">Sections & Lessons</TabsTrigger>
              </TabsList>
              
              <TabsContent value="details" className="flex-1 overflow-y-auto mt-4">
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  
                  const title = formData.get("title") as string;
                  const courseData = {
                    title,
                    description: formData.get("description") as string,
                    category: formData.get("category") as string,
                    difficulty: formData.get("difficulty") as string,
                    is_free: formData.get("is_free") === "true",
                    price: parseFloat(formData.get("price") as string) || 0,
                    thumbnail_url: detailsThumbnailUrl,
                    instructor_name: formData.get("instructor_name") as string,
                  };

                  const { error } = await supabase
                    .from("courses")
                    .update(courseData)
                    .eq("id", selectedCourse.id);

                  if (error) {
                    toast.error("Failed to update course");
                  } else {
                    toast.success("Course updated successfully");
                    fetchCourses();
                    // Update selectedCourse with new data
                    setSelectedCourse({ ...selectedCourse, ...courseData });
                  }
                }} className="space-y-6 px-1">
                  
                  {/* Preview Card */}
                  <Card className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                    <div className="flex items-center gap-4">
                      <img 
                        src={detailsThumbnailUrl || "https://images.unsplash.com/photo-1639322537228-f710d846310a?w=300"} 
                        alt={selectedCourse.title}
                        className="w-24 h-24 object-cover rounded-lg border-2 border-background shadow-lg"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={selectedCourse.is_free ? "secondary" : "default"}>
                            {selectedCourse.is_free ? "Free Course" : `$${selectedCourse.price}`}
                          </Badge>
                          <Badge variant="outline">{selectedCourse.category}</Badge>
                          <Badge variant={selectedCourse.is_published ? "default" : "secondary"}>
                            {selectedCourse.is_published ? "Published" : "Unpublished"}
                          </Badge>
                        </div>
                        <h3 className="text-xl font-semibold mb-1">{selectedCourse.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">{selectedCourse.description}</p>
                      </div>
                      <Link to={`/course/${selectedCourse.slug}`} target="_blank">
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-2" />
                          Preview
                        </Button>
                      </Link>
                    </div>
                  </Card>

                  <Separator />

                  {/* Editable Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="detail-title" className="text-base font-semibold">Course Title *</Label>
                      <Input 
                        id="detail-title" 
                        name="title" 
                        defaultValue={selectedCourse.title} 
                        required 
                        className="text-lg"
                      />
                    </div>
                    
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="detail-description" className="text-base font-semibold">Description *</Label>
                      <Textarea 
                        id="detail-description" 
                        name="description" 
                        defaultValue={selectedCourse.description} 
                        required 
                        rows={5}
                        className="resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="detail-category" className="font-semibold">Category *</Label>
                      <Input id="detail-category" name="category" defaultValue={selectedCourse.category} required />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="detail-difficulty" className="font-semibold">Difficulty Level *</Label>
                      <select 
                        id="detail-difficulty" 
                        name="difficulty" 
                        defaultValue={(selectedCourse as any)?.difficulty || "beginner"}
                        className="w-full px-3 py-2 border border-border rounded-md bg-background"
                        required
                      >
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="detail-instructor" className="font-semibold">Instructor Name</Label>
                      <Input 
                        id="detail-instructor" 
                        name="instructor_name" 
                        defaultValue={selectedCourse.instructor_name}
                        placeholder="e.g., John Doe" 
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="font-semibold">Course Thumbnail</Label>
                      <p className="text-xs text-muted-foreground">16:9 ratio · Max 2MB</p>
                      <ThumbnailUploader
                        value={detailsThumbnailUrl}
                        onChange={setDetailsThumbnailUrl}
                        bucket="course-thumbnails"
                        maxSizeMB={2}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="detail-is-free" className="font-semibold">Course Type *</Label>
                      <select 
                        id="detail-is-free" 
                        name="is_free" 
                        defaultValue={selectedCourse.is_free ? "true" : "false"}
                        className="w-full px-3 py-2 border border-border rounded-md bg-background"
                      >
                        <option value="true">Free Course</option>
                        <option value="false">Paid Course</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="detail-price" className="font-semibold">Price (USD)</Label>
                      <Input 
                        id="detail-price" 
                        name="price" 
                        type="number" 
                        step="0.01" 
                        defaultValue={selectedCourse.price} 
                        min="0"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Publishing Control */}
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="detail-is-published" className="text-base font-semibold">Publish Course</Label>
                        <p className="text-sm text-muted-foreground">
                          Control whether this course is visible to students
                        </p>
                      </div>
                      <Switch
                        id="detail-is-published"
                        checked={selectedCourse.is_published}
                        onCheckedChange={async (checked) => {
                          const { error } = await supabase
                            .from("courses")
                            .update({ is_published: checked })
                            .eq("id", selectedCourse.id);

                          if (error) {
                            toast.error("Failed to update publish status");
                          } else {
                            toast.success(checked ? "Course published" : "Course unpublished");
                            setSelectedCourse({ ...selectedCourse, is_published: checked });
                            fetchCourses();
                          }
                        }}
                      />
                    </div>
                  </Card>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-6 border-t sticky bottom-0 bg-background">
                    <Button type="submit" variant="hero" className="flex-1">
                      <Edit className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        setDetailsDialogOpen(false);
                        setSelectedCourse(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this course? All sections and lessons will be permanently removed.")) {
                          handleDelete(selectedCourse.id);
                          setDetailsDialogOpen(false);
                          setSelectedCourse(null);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Course
                    </Button>
                  </div>
                </form>
              </TabsContent>
              
              <TabsContent value="lessons" className="flex-1 overflow-y-auto mt-4">
                <div className="px-1 pb-4">
                  <LessonManager courseId={selectedCourse.id} />
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
