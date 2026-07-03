import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Loader2, FolderPlus, Video, Lock, Unlock, GripVertical, FileText, Eye, EyeOff, Clock, Star, Globe } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { htmlToMarkdown } from "@/lib/markdownUtils";
import { useAuth } from "@/hooks/useAuth";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Section {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
}

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  section_id: string | null;
  order_index: number;
  duration_minutes: number | null;
  video_platform: string;
  youtube_url: string | null;
  mux_playback_id?: string | null;
  mux_asset_id?: string | null;
  is_premium: boolean;
  is_published: boolean;
  is_locked: boolean;
  is_private: boolean;
  lesson_type: string;
  text_content: string | null;
}

interface LessonManagerProps {
  courseId: string;
}

export function LessonManager({ courseId }: LessonManagerProps) {
  const { user } = useAuth();
  const [sections, setSections] = useState<Section[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [lessonDialogOpen, setLessonDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [courseTitle, setCourseTitle] = useState<string>("");

  const [sectionForm, setSectionForm] = useState({
    title: "",
    description: "",
  });

  const [lessonForm, setLessonForm] = useState({
    title: "",
    description: "",
    section_id: "",
    duration_minutes: 0,
    video_platform: "youtube",
    youtube_url: "",
    is_premium: false,
    is_published: true,
    is_locked: false,
    is_private: false,
    lesson_type: "video" as "video" | "text",
    text_content: "",
  });
  

  useEffect(() => {
    fetchData();
  }, [courseId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sectionsResult, lessonsResult, courseResult] = await Promise.all([
        supabase
          .from("lesson_sections")
          .select("*")
          .eq("course_id", courseId)
          .order("order_index"),
        supabase
          .from("lessons")
          .select("*")
          .eq("course_id", courseId)
          .order("order_index"),
        supabase
          .from("courses")
          .select("title")
          .eq("id", courseId)
          .single(),
      ]);

      if (sectionsResult.error) throw sectionsResult.error;
      if (lessonsResult.error) throw lessonsResult.error;

      setSections(sectionsResult.data || []);
      setLessons(lessonsResult.data || []);
      if (courseResult.data) {
        setCourseTitle(courseResult.data.title);
      }
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load curriculum data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSection = async () => {
    if (!sectionForm.title.trim()) {
      toast({
        title: "Error",
        description: "Section title is required",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingSection) {
        const { error } = await supabase
          .from("lesson_sections")
          .update({
            title: sectionForm.title,
            description: sectionForm.description,
          })
          .eq("id", editingSection.id);

        if (error) throw error;
        toast({ title: "Success", description: "Section updated successfully" });
      } else {
        const { error } = await supabase
          .from("lesson_sections")
          .insert({
            course_id: courseId,
            title: sectionForm.title,
            description: sectionForm.description,
            order_index: sections.length,
          });

        if (error) throw error;
        toast({ title: "Success", description: "Section created successfully" });
      }

      setSectionDialogOpen(false);
      setSectionForm({ title: "", description: "" });
      setEditingSection(null);
      fetchData();
    } catch (error: any) {
      console.error("Error saving section:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save section",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    try {
      const { error } = await supabase
        .from("lesson_sections")
        .delete()
        .eq("id", sectionId);

      if (error) throw error;
      toast({ title: "Success", description: "Section deleted successfully" });
      fetchData();
    } catch (error: any) {
      console.error("Error deleting section:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete section",
        variant: "destructive",
      });
    }
  };

  const handleSaveLesson = async () => {
    if (!lessonForm.title.trim()) {
      toast({
        title: "Error",
        description: "Lesson title is required",
        variant: "destructive",
      });
      return;
    }

    // Validate text content for text lessons
    if (lessonForm.lesson_type === "text" && !lessonForm.text_content.trim()) {
      toast({
        title: "Error",
        description: "Text content is required for text lessons",
        variant: "destructive",
      });
      return;
    }

    const slug = lessonForm.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");

    try {
      let newLessonId: string | null = null;

      if (editingLesson) {
        const { error } = await supabase
          .from("lessons")
          .update({
            title: lessonForm.title,
            slug,
            description: lessonForm.description,
            section_id: lessonForm.section_id || null,
            duration_minutes: lessonForm.duration_minutes,
            video_platform: lessonForm.lesson_type === "video" ? lessonForm.video_platform : null,
            youtube_url: lessonForm.lesson_type === "video" && lessonForm.video_platform === "youtube" ? lessonForm.youtube_url : null,
            is_premium: lessonForm.is_premium,
            is_published: lessonForm.is_published,
            is_locked: lessonForm.is_locked,
            is_private: lessonForm.is_private,
            lesson_type: lessonForm.lesson_type,
            text_content: lessonForm.lesson_type === "text" ? lessonForm.text_content : null,
          })
          .eq("id", editingLesson.id);

        if (error) throw error;
        newLessonId = editingLesson.id;
        toast({ title: "Success", description: "Lesson updated successfully" });
      } else {
        const sectionLessons = lessons.filter(l => l.section_id === (lessonForm.section_id || null));
        
        const { data, error } = await supabase
          .from("lessons")
          .insert({
            course_id: courseId,
            title: lessonForm.title,
            slug,
            description: lessonForm.description,
            section_id: lessonForm.section_id || null,
            order_index: sectionLessons.length,
            duration_minutes: lessonForm.duration_minutes,
            video_platform: lessonForm.lesson_type === "video" ? lessonForm.video_platform : null,
            youtube_url: lessonForm.lesson_type === "video" && lessonForm.video_platform === "youtube" ? lessonForm.youtube_url : null,
            is_premium: lessonForm.is_premium,
            is_published: lessonForm.is_published,
            is_locked: lessonForm.is_locked,
            is_private: lessonForm.is_private,
            lesson_type: lessonForm.lesson_type,
            text_content: lessonForm.lesson_type === "text" ? lessonForm.text_content : null,
          })
          .select("id")
          .single();

        if (error) throw error;
        newLessonId = data?.id || null;
        toast({ title: "Success", description: "Lesson created successfully" });
      }

      // Auto-ingest text lessons to Knowledge Hub
      if (lessonForm.lesson_type === "text" && lessonForm.text_content && user && newLessonId) {
        try {
          const markdownContent = htmlToMarkdown(lessonForm.text_content);
          await supabase.from("ai_generated_content").insert({
            user_id: user.id,
            title: lessonForm.title,
            content: markdownContent,
            category: "course_content",
            source_type: "lesson",
            is_global: true,
            is_template: false,
            metadata: {
              course_id: courseId,
              lesson_id: newLessonId,
              course_title: courseTitle,
              source: "text_lesson",
            },
            tags: ["course", "lesson", courseTitle?.toLowerCase()].filter(Boolean),
          });
          console.log("Text lesson auto-ingested to Knowledge Hub");
        } catch (ingestError) {
          console.error("Failed to auto-ingest to Knowledge Hub:", ingestError);
          // Don't fail the lesson save if ingestion fails
        }
      }

      setLessonDialogOpen(false);
      setLessonForm({
        title: "",
        description: "",
        section_id: "",
        duration_minutes: 0,
        video_platform: "youtube",
        youtube_url: "",
        is_premium: false,
        is_published: true,
        is_locked: false,
        is_private: false,
        lesson_type: "video",
        text_content: "",
      });
      setEditingLesson(null);
      fetchData();
    } catch (error: any) {
      console.error("Error saving lesson:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save lesson",
        variant: "destructive",
      });
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    try {
      const { error } = await supabase
        .from("lessons")
        .delete()
        .eq("id", lessonId);

      if (error) throw error;
      toast({ title: "Success", description: "Lesson deleted successfully" });
      fetchData();
    } catch (error: any) {
      console.error("Error deleting lesson:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete lesson",
        variant: "destructive",
      });
    }
  };

  const openEditSection = (section: Section) => {
    setEditingSection(section);
    setSectionForm({
      title: section.title,
      description: section.description || "",
    });
    setSectionDialogOpen(true);
  };

  const openEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setLessonForm({
      title: lesson.title,
      description: lesson.description || "",
      section_id: lesson.section_id || "",
      duration_minutes: lesson.duration_minutes || 0,
      video_platform: lesson.video_platform || "youtube",
      youtube_url: lesson.youtube_url || "",
      is_premium: lesson.is_premium,
      is_published: lesson.is_published,
      is_locked: lesson.is_locked || false,
      is_private: lesson.is_private || false,
      lesson_type: (lesson.lesson_type as "video" | "text") || "video",
      text_content: lesson.text_content || "",
    });
    setLessonDialogOpen(true);
  };

  const openNewLesson = (sectionId?: string) => {
    setSelectedSectionId(sectionId || "");
    setLessonForm({
      ...lessonForm,
      section_id: sectionId || "",
    });
    setLessonDialogOpen(true);
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleSectionDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);

    const reorderedSections = arrayMove(sections, oldIndex, newIndex).map((section, index) => ({
      ...section,
      order_index: index,
    }));

    setSections(reorderedSections);

    try {
      const updates = reorderedSections.map((section) =>
        supabase
          .from("lesson_sections")
          .update({ order_index: section.order_index })
          .eq("id", section.id)
      );

      await Promise.all(updates);

      toast({
        title: "Success",
        description: "Section order updated",
      });
    } catch (error: any) {
      console.error("Error reordering sections:", error);
      toast({
        title: "Error",
        description: "Failed to update section order",
        variant: "destructive",
      });
      fetchData();
    }
  };

  const handleLessonDragEnd = async (event: DragEndEvent, sectionId: string | null) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const sectionLessons = lessons.filter((l) => l.section_id === sectionId);
    const oldIndex = sectionLessons.findIndex((l) => l.id === active.id);
    const newIndex = sectionLessons.findIndex((l) => l.id === over.id);

    const reorderedLessons = arrayMove(sectionLessons, oldIndex, newIndex).map((lesson, index) => ({
      ...lesson,
      order_index: index,
    }));

    const updatedLessons = lessons.map((lesson) => {
      const reordered = reorderedLessons.find((rl) => rl.id === lesson.id);
      return reordered || lesson;
    });

    setLessons(updatedLessons);

    try {
      const updates = reorderedLessons.map((lesson) =>
        supabase
          .from("lessons")
          .update({ order_index: lesson.order_index })
          .eq("id", lesson.id)
      );

      await Promise.all(updates);

      toast({
        title: "Success",
        description: "Lesson order updated",
      });
    } catch (error: any) {
      console.error("Error reordering lessons:", error);
      toast({
        title: "Error",
        description: "Failed to update lesson order",
        variant: "destructive",
      });
      fetchData();
    }
  };

  // Sortable Section Component
  const SortableSection = ({ section }: { section: Section }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: section.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const sectionLessons = lessons.filter((l) => l.section_id === section.id);

    return (
      <AccordionItem
        key={section.id}
        value={section.id}
        className="border rounded-lg"
        ref={setNodeRef}
        style={style}
      >
        <AccordionTrigger className="px-4 hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing hover:bg-accent rounded p-1"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="font-semibold">{section.title}</span>
              <Badge variant="secondary">{sectionLessons.length} lessons</Badge>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditSection(section);
                }}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Section?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete the section and all its lessons. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDeleteSection(section.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          {section.description && (
            <p className="text-sm text-muted-foreground mb-4">
              {section.description}
            </p>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => handleLessonDragEnd(event, section.id)}
          >
            <SortableContext
              items={sectionLessons.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {sectionLessons.map((lesson) => (
                  <SortableLesson key={lesson.id} lesson={lesson} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </AccordionContent>
      </AccordionItem>
    );
  };

  // Sortable Lesson Component
  const SortableLesson = ({ lesson }: { lesson: Lesson }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: lesson.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center justify-between p-3 rounded-lg border bg-card"
      >
        <div className="flex items-center gap-3">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing hover:bg-accent rounded p-1"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          {lesson.lesson_type === "text" ? (
            <FileText className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Video className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{lesson.title}</span>
              {/* Published/Draft Status */}
              {!lesson.is_published ? (
                <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-600/50">
                  <Clock className="h-3 w-3" />
                  Draft
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-green-600 border-green-600/50">
                  <Eye className="h-3 w-3" />
                  Published
                </Badge>
              )}
              {/* Visibility Status */}
              {lesson.is_private ? (
                <Badge variant="destructive" className="gap-1">
                  <EyeOff className="h-3 w-3" />
                  Private
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-blue-600 border-blue-600/50">
                  <Globe className="h-3 w-3" />
                  Public
                </Badge>
              )}
              {/* Premium/Free Status */}
              {lesson.is_locked ? (
                <Badge className="gap-1 bg-gradient-to-r from-yellow-500 to-orange-500 text-white border-0">
                  <Star className="h-3 w-3" />
                  Premium
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-green-600 border-green-600/50">
                  <Unlock className="h-3 w-3" />
                  Free
                </Badge>
              )}
            </div>
            {lesson.duration_minutes && (
              <p className="text-xs text-muted-foreground mt-1">
                {lesson.duration_minutes} min
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openEditLesson(lesson)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Lesson?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDeleteLesson(lesson.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Course Curriculum</CardTitle>
              <CardDescription>
                Organize your course content into sections and lessons
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Dialog open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" onClick={() => setEditingSection(null)}>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    Add Section
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingSection ? "Edit Section" : "Create New Section"}
                    </DialogTitle>
                    <DialogDescription>
                      Sections help organize your lessons into logical groups
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="section-title">Section Title *</Label>
                      <Input
                        id="section-title"
                        placeholder="e.g., Introduction to React"
                        value={sectionForm.title}
                        onChange={(e) =>
                          setSectionForm({ ...sectionForm, title: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="section-desc">Description</Label>
                      <Textarea
                        id="section-desc"
                        placeholder="Brief description of this section..."
                        value={sectionForm.description}
                        onChange={(e) =>
                          setSectionForm({ ...sectionForm, description: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSectionDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveSection}>
                      {editingSection ? "Update" : "Create"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button onClick={() => openNewLesson()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Lesson
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sections.length === 0 && lessons.length === 0 ? (
            <div className="text-center py-12">
              <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No curriculum yet</h3>
              <p className="text-muted-foreground mb-4">
                Start by creating sections and adding lessons to your course
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Sections with drag-and-drop */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleSectionDragEnd}
              >
                <SortableContext
                  items={sections.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <Accordion type="multiple" className="space-y-4">
                    {sections.map((section) => (
                      <SortableSection key={section.id} section={section} />
                    ))}
                  </Accordion>
                </SortableContext>
              </DndContext>

              {/* Lessons without section */}
              {lessons.filter((l) => !l.section_id).length > 0 && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-4">Ungrouped Lessons</h3>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => handleLessonDragEnd(event, null)}
                  >
                    <SortableContext
                      items={lessons.filter((l) => !l.section_id).map((l) => l.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {lessons
                          .filter((l) => !l.section_id)
                          .map((lesson) => (
                            <SortableLesson key={lesson.id} lesson={lesson} />
                          ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lesson Dialog */}
      <Dialog open={lessonDialogOpen} onOpenChange={setLessonDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingLesson ? "Edit Lesson" : "Create New Lesson"}
            </DialogTitle>
            <DialogDescription>
              Add video content and configure lesson settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lesson-title">Lesson Title *</Label>
              <Input
                id="lesson-title"
                placeholder="e.g., Introduction to Components"
                value={lessonForm.title}
                onChange={(e) =>
                  setLessonForm({ ...lessonForm, title: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lesson-section">Section (Optional)</Label>
              <Select
                value={lessonForm.section_id || "none"}
                onValueChange={(value) =>
                  setLessonForm({ ...lessonForm, section_id: value === "none" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No section (ungrouped)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No section (ungrouped)</SelectItem>
                  {sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lesson-desc">Description</Label>
              <Textarea
                id="lesson-desc"
                placeholder="Brief description of the lesson..."
                value={lessonForm.description}
                onChange={(e) =>
                  setLessonForm({ ...lessonForm, description: e.target.value })
                }
              />
            </div>

            {/* Lesson Type Toggle */}
            <div className="space-y-2">
              <Label>Lesson Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={lessonForm.lesson_type === "video" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLessonForm({ ...lessonForm, lesson_type: "video" })}
                  className="flex-1"
                >
                  <Video className="mr-2 h-4 w-4" />
                  Video
                </Button>
                <Button
                  type="button"
                  variant={lessonForm.lesson_type === "text" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLessonForm({ ...lessonForm, lesson_type: "text" })}
                  className="flex-1"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Text
                </Button>
              </div>
            </div>

            {/* Video Content Section */}
            {lessonForm.lesson_type === "video" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="video-platform">Video Platform</Label>
                  <Select
                    value={lessonForm.video_platform}
                    onValueChange={(value) =>
                      setLessonForm({ ...lessonForm, video_platform: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="youtube">YouTube</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {lessonForm.video_platform === "youtube" && (
                  <div className="space-y-2">
                    <Label htmlFor="youtube-url">YouTube URL</Label>
                    <Input
                      id="youtube-url"
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={lessonForm.youtube_url}
                      onChange={(e) =>
                        setLessonForm({ ...lessonForm, youtube_url: e.target.value })
                      }
                    />
                  </div>
                )}


                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min="0"
                    placeholder="15"
                    value={lessonForm.duration_minutes}
                    onChange={(e) =>
                      setLessonForm({
                        ...lessonForm,
                        duration_minutes: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </>
            )}

            {/* Text Content Section */}
            {lessonForm.lesson_type === "text" && (
              <div className="space-y-2">
                <Label>Lesson Content</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Write your lesson content using the rich text editor below. Text lessons are automatically indexed in the Knowledge Hub.
                </p>
                <RichTextEditor
                  content={lessonForm.text_content}
                  onChange={(content) => setLessonForm({ ...lessonForm, text_content: content })}
                />
              </div>
            )}

            {/* Lesson Settings Section */}
            <div className="space-y-4 border-t pt-4">
              <h4 className="font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Lesson Settings
              </h4>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="is-published" className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-green-600" />
                    Published
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Make lesson visible to students
                  </p>
                </div>
                <Switch
                  id="is-published"
                  checked={lessonForm.is_published}
                  onCheckedChange={(checked) =>
                    setLessonForm({ ...lessonForm, is_published: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="is-private" className="flex items-center gap-2">
                    <EyeOff className="h-4 w-4 text-red-600" />
                    Private (Admin Only)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Only administrators can view this lesson
                  </p>
                </div>
                <Switch
                  id="is-private"
                  checked={lessonForm.is_private}
                  onCheckedChange={(checked) =>
                    setLessonForm({ ...lessonForm, is_private: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="is-locked" className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-orange-500" />
                    Premium Content (Requires Enrollment)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Users must enroll in course to access this lesson
                  </p>
                </div>
                <Switch
                  id="is-locked"
                  checked={lessonForm.is_locked}
                  onCheckedChange={(checked) =>
                    setLessonForm({ ...lessonForm, is_locked: checked })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setLessonDialogOpen(false);
                setEditingLesson(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveLesson}>
              {editingLesson ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
