import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Calendar, Coins, CheckCircle2, Clock, Eye, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { TaskCreator } from "./TaskCreator";
import { TaskEditor } from "./TaskEditor";
import { toast } from "sonner";
import { format, isBefore, startOfDay } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TaskKanbanProps {
  workspace: any;
  tasks: any[];
  members: any[];
  onRefresh: () => void;
  isSoloMode?: boolean;
  selectedMonth?: Date;
}

export function TaskKanban({ workspace, tasks, members, onRefresh, isSoloMode = false, selectedMonth }: TaskKanbanProps) {
  const { user } = useAuth();
  const [showCreator, setShowCreator] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [deletingTask, setDeletingTask] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  // Check user role from workspace object OR from members array as fallback
  const currentUserMember = members.find(m => m.user_id === user?.id);
  const userRole = workspace?.userRole || currentUserMember?.role;
  const isOwnerOrAdmin = userRole === "owner" || userRole === "admin";

  // Helper to check if task is overdue
  const isTaskOverdue = (task: any) => {
    if (!task.due_date || task.status === "completed") return false;
    return isBefore(new Date(task.due_date), startOfDay(new Date()));
  };

  const pendingTasks = tasks.filter((t) => t.status === "pending");
  const inReviewTasks = tasks.filter((t) => t.status === "in_review");
  const completedTasks = tasks.filter((t) => t.status === "completed");

  const handleCompleteTask = async (taskId: string) => {
    try {
      const { data, error } = await supabase.rpc("complete_workspace_task", {
        p_task_id: taskId,
      });

      if (error) throw error;

      const result = data as any;
      if (result?.success) {
        toast.success(`Task completed! +${result.points_earned} points`);
        onRefresh();
      } else {
        toast.error(result?.error || "Failed to complete task");
      }
    } catch (error: any) {
      console.error("Error completing task:", error);
      toast.error(error.message || "Failed to complete task");
    }
  };

  const handleDeleteTask = async () => {
    if (!deletingTask) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("workspace_tasks")
        .delete()
        .eq("id", deletingTask.id);

      if (error) throw error;

      toast.success("Task deleted successfully");
      setDeletingTask(null);
      onRefresh();
    } catch (error: any) {
      console.error("Error deleting task:", error);
      toast.error(error.message || "Failed to delete task");
    } finally {
      setDeleting(false);
    }
  };

  const TaskCard = ({ task }: { task: any }) => {
    const canComplete = task.status !== "completed" && 
      (task.assignee_id === user?.id || isOwnerOrAdmin);
    const canEditOrDelete = isOwnerOrAdmin;

    const getCategoryColor = (cat: string) => {
      const colors: Record<string, string> = {
        editing: "bg-purple-500/20 text-purple-400 border-purple-500/30",
        writing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
        design: "bg-pink-500/20 text-pink-400 border-pink-500/30",
        marketing: "bg-orange-500/20 text-orange-400 border-orange-500/30",
        admin: "bg-gray-500/20 text-gray-400 border-gray-500/30",
        general: "bg-primary/20 text-primary border-primary/30",
      };
      return colors[cat] || colors.general;
    };

    const overdue = isTaskOverdue(task);

    return (
      <Card className={`p-2.5 sm:p-3 bg-background/80 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-all group ${overdue ? 'border-destructive/50 bg-destructive/5' : ''}`}>
        <div className="space-y-2 sm:space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h4 className="font-medium text-sm group-hover:text-primary transition-colors">
                {task.title}
              </h4>
              {overdue && (
                <Badge 
                  variant="outline" 
                  className="mt-1.5 bg-destructive/10 text-destructive border-destructive/30 text-xs"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Overdue
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {canEditOrDelete && task.status !== "completed" && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setEditingTask(task)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                    onClick={() => setDeletingTask(task)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              <Badge
                variant="outline"
                className="bg-primary/10 text-primary border-primary/30"
              >
                <Coins className="h-3 w-3 mr-1" />
                {task.points}
              </Badge>
            </div>
          </div>

          {task.category && task.category !== "general" && (
            <Badge variant="outline" className={`text-xs ${getCategoryColor(task.category)}`}>
              {task.category}
            </Badge>
          )}

          {task.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {task.description}
            </p>
          )}

          <div className="flex items-center justify-between">
          {task.assignee ? (
              <div className="flex items-center gap-1.5">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={task.assignee.avatar_url} />
                  <AvatarFallback className="text-[10px] bg-primary/20">
                    {task.assignee.full_name?.[0] || "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[10px] sm:text-xs text-muted-foreground truncate max-w-[80px]">
                  {task.assignee.full_name}
                </span>
              </div>
            ) : (
              <span className="text-[10px] sm:text-xs text-muted-foreground">Unassigned</span>
            )}

            {task.due_date && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {format(new Date(task.due_date), "MMM d")}
              </div>
            )}
          </div>

          {canComplete && task.status !== "completed" && (
            <Button
              size="sm"
              onClick={() => handleCompleteTask(task.id)}
              className="w-full h-7 sm:h-8 text-xs bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Complete
            </Button>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm sm:text-base font-semibold">Task Board</h3>
        <Button
          onClick={() => setShowCreator(true)}
          size="sm"
          className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        {/* Pending Column */}
        <div className="space-y-2 sm:space-y-2.5">
          <div className="flex items-center gap-2 px-2 py-1 sm:px-2.5 sm:py-1.5 bg-muted/50 rounded-lg">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="font-semibold text-xs sm:text-sm">Pending</h4>
            <Badge variant="secondary" className="ml-auto">
              {pendingTasks.length}
            </Badge>
          </div>
          <div className="space-y-2 sm:space-y-2.5">
            {pendingTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
            {pendingTasks.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-xs sm:text-sm">
                No pending tasks
              </div>
            )}
          </div>
        </div>

        {/* In Review Column */}
        <div className="space-y-2 sm:space-y-2.5">
          <div className="flex items-center gap-2 px-2 py-1 sm:px-2.5 sm:py-1.5 bg-primary/10 rounded-lg">
            <Eye className="h-3.5 w-3.5 text-primary" />
            <h4 className="font-semibold text-xs sm:text-sm">In Review</h4>
            <Badge variant="secondary" className="ml-auto">
              {inReviewTasks.length}
            </Badge>
          </div>
          <div className="space-y-2 sm:space-y-2.5">
            {inReviewTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
            {inReviewTasks.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-xs sm:text-sm">
                No tasks in review
              </div>
            )}
          </div>
        </div>

        {/* Completed Column */}
        <div className="space-y-2 sm:space-y-2.5">
          <div className="flex items-center gap-2 px-2 py-1 sm:px-2.5 sm:py-1.5 bg-green-500/10 rounded-lg">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            <h4 className="font-semibold text-xs sm:text-sm">Completed</h4>
            <Badge variant="secondary" className="ml-auto">
              {completedTasks.length}
            </Badge>
          </div>
          <div className="space-y-2 sm:space-y-2.5">
            {completedTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
            {completedTasks.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-xs sm:text-sm">
                No completed tasks yet
              </div>
            )}
          </div>
        </div>
      </div>

      <TaskCreator
        open={showCreator}
        onClose={() => setShowCreator(false)}
        workspace={workspace}
        members={members}
        onCreated={() => {
          setShowCreator(false);
          onRefresh();
        }}
        isSoloMode={isSoloMode}
      />

      <TaskEditor
        open={!!editingTask}
        onClose={() => setEditingTask(null)}
        task={editingTask}
        members={members}
        onUpdated={onRefresh}
        isSoloMode={isSoloMode}
      />

      <AlertDialog open={!!deletingTask} onOpenChange={() => setDeletingTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingTask?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTask}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete Task"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
