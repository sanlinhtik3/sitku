import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TaskEditorProps {
  open: boolean;
  onClose: () => void;
  task: any;
  members: any[];
  onUpdated: () => void;
  isSoloMode?: boolean;
}

export function TaskEditor({
  open,
  onClose,
  task,
  members,
  onUpdated,
  isSoloMode = false,
}: TaskEditorProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [points, setPoints] = useState("10");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [category, setCategory] = useState("general");
  const [dueDate, setDueDate] = useState<Date>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (task && open) {
      setTitle(task.title || "");
      setDescription(task.description || "");
      setPoints(String(task.points || 10));
      setAssigneeId(task.assignee_id || "");
      setCategory(task.category || "general");
      setDueDate(task.due_date ? new Date(task.due_date) : undefined);
    }
  }, [task, open]);

  const handleUpdate = async () => {
    if (!title.trim()) {
      toast.error("Task title is required");
      return;
    }

    const pointsNum = parseInt(points);
    if (isNaN(pointsNum) || pointsNum < 1 || pointsNum > 1000) {
      toast.error("Points must be between 1 and 1000");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("workspace_tasks")
        .update({
          title: title.trim(),
          description: description.trim() || null,
          points: pointsNum,
          assignee_id: assigneeId || null,
          due_date: dueDate?.toISOString() || null,
          category: category,
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.id);

      if (error) throw error;

      toast.success("Task updated successfully!");
      onUpdated();
      onClose();
    } catch (error: any) {
      console.error("Error updating task:", error);
      toast.error(error.message || "Failed to update task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-gradient-to-br from-card to-card/95 border-border/50">
        <DialogHeader>
          <DialogTitle className="text-2xl">Edit Task</DialogTitle>
          <DialogDescription>
            Update task details
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Task Title *</Label>
            <Input
              id="edit-title"
              placeholder="e.g., Edit Video, Reply to Comments"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-background/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              placeholder="Task details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="bg-background/50 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-points">Points *</Label>
              <Input
                id="edit-points"
                type="number"
                min="1"
                max="1000"
                placeholder="10"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                className="bg-background/50"
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="editing">Editing</SelectItem>
                  <SelectItem value="writing">Writing</SelectItem>
                  <SelectItem value="design">Design</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isSoloMode && (
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.user_id}>
                      {member.profiles?.full_name || "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Due Date (Optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal bg-background/50",
                    !dueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dueDate ? format(dueDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={setDueDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
