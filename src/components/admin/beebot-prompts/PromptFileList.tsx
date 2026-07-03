import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  IconPlus, 
  IconSearch, 
  IconGripVertical,
  IconFile,
  IconLock,
  IconEye,
  IconEyeOff
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { PromptFile } from "./types";
import { CATEGORY_LABELS } from "./types";
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

interface PromptFileListProps {
  files: PromptFile[];
  selectedId: string | null;
  onSelect: (file: PromptFile) => void;
  onCreateNew: () => void;
  onReorder?: (items: { id: string; order_index: number }[]) => void;
  isLoading?: boolean;
}

interface SortablePromptItemProps {
  file: PromptFile;
  selectedId: string | null;
  onSelect: (file: PromptFile) => void;
}

function SortablePromptItem({ file, selectedId, onSelect }: SortablePromptItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors",
        selectedId === file.id 
          ? "bg-primary/10 text-primary" 
          : "hover:bg-muted/50",
        isDragging && "shadow-lg bg-card border border-border"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <IconGripVertical className="size-3 text-muted-foreground/50 hover:text-muted-foreground" />
      </div>
      <button
        onClick={() => onSelect(file)}
        className="flex-1 flex items-center gap-2 min-w-0"
      >
        <IconFile className="size-4 shrink-0" />
        <span className="flex-1 truncate">{file.display_name}</span>
        <div className="flex items-center gap-1">
          {file.is_required && (
            <IconLock className="size-3 text-yellow-500" />
          )}
          {file.is_active ? (
            <IconEye className="size-3 text-green-500" />
          ) : (
            <IconEyeOff className="size-3 text-muted-foreground" />
          )}
        </div>
      </button>
    </div>
  );
}

export function PromptFileList({ 
  files, 
  selectedId, 
  onSelect, 
  onCreateNew,
  onReorder,
  isLoading 
}: PromptFileListProps) {
  const [search, setSearch] = useState("");

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

  const filteredFiles = files.filter(f => 
    f.file_name.toLowerCase().includes(search.toLowerCase()) ||
    f.display_name.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const groupedFiles = filteredFiles.reduce((acc, file) => {
    const cat = file.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(file);
    return acc;
  }, {} as Record<string, PromptFile[]>);

  const categoryOrder = ['core', 'security', 'features', 'user', 'examples', 'custom'];

  const handleDragEnd = (event: DragEndEvent, categoryFiles: PromptFile[]) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id || !onReorder) return;

    const oldIndex = categoryFiles.findIndex(f => f.id === active.id);
    const newIndex = categoryFiles.findIndex(f => f.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedCategory = arrayMove(categoryFiles, oldIndex, newIndex);
    
    // Calculate new order indices for the reordered items
    const updates = reorderedCategory.map((file, index) => ({
      id: file.id,
      order_index: index * 10,
    }));

    onReorder(updates);
  };

  return (
    <div className="flex flex-col h-full border-r border-border/50 bg-card/30">
      {/* Header */}
      <div className="p-3 border-b border-border/50 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Prompt Files</h3>
          <Button size="sm" variant="ghost" onClick={onCreateNew}>
            <IconPlus className="size-4" />
          </Button>
        </div>
        <div className="relative">
          <IconSearch className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* File List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {isLoading ? (
            <div className="py-8 space-y-3 px-4">
              <div className="h-4 w-3/4 rounded bg-muted/30 animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-muted/30 animate-pulse" />
            </div>
          ) : (
            categoryOrder.map(category => {
              const categoryFiles = groupedFiles[category];
              if (!categoryFiles?.length) return null;
              
              const catInfo = CATEGORY_LABELS[category];
              
              return (
                <div key={category}>
                  <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                    <span>{catInfo.icon}</span>
                    <span>{catInfo.label}</span>
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">
                      {categoryFiles.length}
                    </Badge>
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => handleDragEnd(e, categoryFiles)}
                  >
                    <SortableContext
                      items={categoryFiles.map(f => f.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-0.5">
                        {categoryFiles.map(file => (
                          <SortablePromptItem
                            key={file.id}
                            file={file}
                            selectedId={selectedId}
                            onSelect={onSelect}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Stats */}
      <div className="p-2 border-t border-border/50 text-xs text-muted-foreground">
        {files.length} files • {files.filter(f => f.is_active).length} active
      </div>
    </div>
  );
}
