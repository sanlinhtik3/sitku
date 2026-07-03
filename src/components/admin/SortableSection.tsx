import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Edit,
  Trash2,
  Plus,
  Video,
  GripVertical,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableLesson } from "./SortableLesson";

interface Lesson {
  id: string;
  title: string;
  description?: string;
  youtube_url?: string;
  vimeo_url?: string;
  video_platform?: 'youtube' | 'vimeo';
  lesson_type?: 'video' | 'text';
  text_content?: string;
  is_locked: boolean;
  is_private?: boolean;
  is_published?: boolean;
  duration_minutes?: number;
  order_index: number;
  course_id: string;
  section_id?: string;
}

interface Section {
  id: string;
  title: string;
  description?: string;
  order_index: number;
  course_id: string;
  lessons: Lesson[];
}

interface SortableSectionProps {
  section: Section;
  sectionIndex: number;
  totalSections: number;
  openSections: Record<string, boolean>;
  setOpenSections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  handleMoveSection: (id: string, direction: "up" | "down") => void;
  handleDeleteSection: (id: string) => void;
  setEditingSection: (section: Section | null) => void;
  setIsSectionDialogOpen: (open: boolean) => void;
  setEditingLesson: (lesson: Lesson | null) => void;
  setVideoPlatform: (platform: 'youtube' | 'vimeo') => void;
  setUploadMode: (mode: 'embed' | 'upload') => void;
  setFormData: (data: any) => void;
  setIsPublished: (published: boolean) => void;
  setIsPrivate: (isPrivate: boolean) => void;
  setIsLocked: (locked: boolean) => void;
  setIsDialogOpen: (open: boolean) => void;
  setLessonType: (type: 'video' | 'text') => void;
  setTextContent: (content: string) => void;
  handleDelete: (lessonId: string) => void;
  handleMoveLesson: (lessonId: string, direction: "up" | "down") => void;
  handleLessonDragEnd: (sectionId: string) => (event: DragEndEvent) => void;
  handleLessonDragStart: (event: DragStartEvent) => void;
  activeId: string | null;
}

export function SortableSection({
  section,
  sectionIndex,
  totalSections,
  openSections,
  setOpenSections,
  handleMoveSection,
  handleDeleteSection,
  setEditingSection,
  setIsSectionDialogOpen,
  setEditingLesson,
  setVideoPlatform,
  setUploadMode,
  setFormData,
  setIsPublished,
  setIsPrivate,
  setIsLocked,
  setIsDialogOpen,
  setLessonType,
  setTextContent,
  handleDelete,
  handleMoveLesson,
  handleLessonDragEnd,
  handleLessonDragStart,
  activeId,
}: SortableSectionProps) {
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="overflow-hidden border-l-4 border-l-primary/30 hover:border-l-primary transition-colors"
    >
      <Collapsible
        open={openSections[section.id]}
        onOpenChange={(open) =>
          setOpenSections((prev) => ({ ...prev, [section.id]: open }))
        }
      >
        <div className="bg-muted/30 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>

              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex-1 justify-start gap-3 hover:bg-background/50 h-auto py-2 px-3"
                >
                  <div className="p-1.5 bg-primary/10 rounded-md">
                    <FolderOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <h3 className="text-base font-semibold truncate">{section.title}</h3>
                    {section.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {section.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {section.lessons.length} {section.lessons.length === 1 ? 'lesson' : 'lessons'}
                      </Badge>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform flex-shrink-0 ${
                      openSections[section.id] ? "rotate-180" : ""
                    }`}
                  />
                </Button>
              </CollapsibleTrigger>
            </div>

            <div className="flex gap-1 items-center flex-shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  setEditingSection(section);
                  setIsSectionDialogOpen(true);
                }}
                title="Edit section"
              >
                <Edit className="h-3.5 w-3.5" />
              </Button>

              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => handleDeleteSection(section.id)}
                title="Delete section"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <CollapsibleContent className="p-4 space-y-2 bg-background">
          {section.lessons.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <Video className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No lessons in this section</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  setEditingLesson(null);
                  setLessonType('video');
                  setTextContent('');
                  setVideoPlatform("youtube");
                  setUploadMode("embed");
                  setFormData({ section_id: section.id });
                  setIsPublished(true);
                  setIsPrivate(false);
                  setIsLocked(false);
                  setIsDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-2" />
                Add First Lesson
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleLessonDragStart}
              onDragEnd={handleLessonDragEnd(section.id)}
            >
              <SortableContext
                items={section.lessons.map((l) => l.id)}
                strategy={verticalListSortingStrategy}
              >
                {section.lessons.map((lesson, lessonIndex) => (
                  <SortableLesson
                    key={lesson.id}
                    lesson={lesson}
                    onEdit={(lesson) => {
                      setEditingLesson(lesson);
                      setLessonType(lesson.lesson_type || 'video');
                      setTextContent(lesson.text_content || '');
                      setVideoPlatform(lesson.video_platform || "youtube");
                      setUploadMode("embed");
                      setFormData({
                        duration_minutes: lesson.duration_minutes,
                      });
                      setIsPublished(lesson.is_published ?? true);
                      setIsPrivate(lesson.is_private ?? false);
                      setIsLocked(lesson.is_locked ?? false);
                      setIsDialogOpen(true);
                    }}
                    onDelete={handleDelete}
                    onMoveUp={() => handleMoveLesson(lesson.id, "up")}
                    onMoveDown={() => handleMoveLesson(lesson.id, "down")}
                    isFirst={sectionIndex === 0 && lessonIndex === 0}
                    isLast={
                      sectionIndex === totalSections - 1 &&
                      lessonIndex === section.lessons.length - 1
                    }
                    activeId={activeId}
                  />
                ))}
              </SortableContext>
              <DragOverlay>
                {activeId && section.lessons.find((l) => l.id === activeId) ? (
                  <Card className="opacity-50 p-4">
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">
                        {section.lessons.find((l) => l.id === activeId)?.title}
                      </span>
                    </div>
                  </Card>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
