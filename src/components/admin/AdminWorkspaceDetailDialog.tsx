import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, CheckCircle, Clock, Trophy, ListTodo, LayoutDashboard } from "lucide-react";
import { format } from "date-fns";

interface WorkspaceData {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  total_points: number;
  is_active: boolean;
  created_at: string;
  owner_name: string | null;
  member_count: number;
  completed_tasks: number;
  plan_tier: string;
}

interface AdminWorkspaceDetailDialogProps {
  workspace: WorkspaceData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminWorkspaceDetailDialog({
  workspace,
  open,
  onOpenChange,
}: AdminWorkspaceDetailDialogProps) {
  const [members, setMembers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (workspace && open) {
      fetchWorkspaceDetails();
    }
  }, [workspace, open]);

  const fetchWorkspaceDetails = async () => {
    if (!workspace) return;

    try {
      setLoading(true);

      // Fetch members
      const { data: membersData } = await supabase
        .from("workspace_members")
        .select(`
          *,
          profiles:user_id (full_name, avatar_url)
        `)
        .eq("workspace_id", workspace.id)
        .order("personal_score", { ascending: false });

      setMembers(membersData || []);

      // Fetch recent tasks
      const { data: tasksData } = await supabase
        .from("workspace_tasks")
        .select(`
          *,
          assignee:assignee_id (full_name)
        `)
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(20);

      setTasks(tasksData || []);
    } catch (error) {
      console.error("Error fetching workspace details:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!workspace) return null;

  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress").length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0 bg-background/95 backdrop-blur-md border-primary/20">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
              <LayoutDashboard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <span className="text-xl">{workspace.name}</span>
              <p className="text-sm font-normal text-muted-foreground">
                Read-only workspace overview
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-100px)]">
          <div className="p-6 space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardContent className="p-4 text-center">
                  <Trophy className="h-6 w-6 mx-auto mb-2 text-amber-500" />
                  <p className="text-2xl font-bold">{workspace.total_points}</p>
                  <p className="text-xs text-muted-foreground">Total Points</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardContent className="p-4 text-center">
                  <Users className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                  <p className="text-2xl font-bold">{members.length}</p>
                  <p className="text-xs text-muted-foreground">Members</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardContent className="p-4 text-center">
                  <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-500" />
                  <p className="text-2xl font-bold">{completedTasks}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardContent className="p-4 text-center">
                  <Clock className="h-6 w-6 mx-auto mb-2 text-orange-500" />
                  <p className="text-2xl font-bold">{pendingTasks + inProgressTasks}</p>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="members" className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-2 bg-card/50">
                <TabsTrigger value="members" className="gap-2">
                  <Users className="h-4 w-4" />
                  Members
                </TabsTrigger>
                <TabsTrigger value="tasks" className="gap-2">
                  <ListTodo className="h-4 w-4" />
                  Recent Tasks
                </TabsTrigger>
              </TabsList>

              <TabsContent value="members" className="mt-4">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin h-6 w-6 border-4 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : (
                  <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {members.map((member, index) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-background/50"
                          >
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <span className="absolute -top-1 -left-1 text-xs font-bold text-primary">
                                  #{index + 1}
                                </span>
                                <Avatar className="h-10 w-10">
                                  <AvatarFallback className="bg-primary/20 text-primary">
                                    {member.profiles?.full_name?.charAt(0) || "?"}
                                  </AvatarFallback>
                                </Avatar>
                              </div>
                              <div>
                                <p className="font-medium">
                                  {member.profiles?.full_name || "Unknown"}
                                </p>
                                <Badge variant="outline" className="text-xs capitalize">
                                  {member.role}
                                </Badge>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-primary">
                                {member.personal_score || 0}
                              </p>
                              <p className="text-xs text-muted-foreground">points</p>
                            </div>
                          </div>
                        ))}
                        {members.length === 0 && (
                          <p className="text-center text-muted-foreground py-4">
                            No members found
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="tasks" className="mt-4">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin h-6 w-6 border-4 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : (
                  <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {tasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-background/50"
                          >
                            <div className="flex-1">
                              <p className="font-medium">{task.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge
                                  variant={
                                    task.status === "completed"
                                      ? "default"
                                      : task.status === "in_progress"
                                      ? "secondary"
                                      : "outline"
                                  }
                                  className="text-xs capitalize"
                                >
                                  {task.status.replace("_", " ")}
                                </Badge>
                                {task.category && (
                                  <Badge variant="outline" className="text-xs">
                                    {task.category}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-primary">{task.points} pts</p>
                              <p className="text-xs text-muted-foreground">
                                {task.assignee?.full_name || "Unassigned"}
                              </p>
                            </div>
                          </div>
                        ))}
                        {tasks.length === 0 && (
                          <p className="text-center text-muted-foreground py-4">
                            No tasks found
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>

            {/* Workspace Info */}
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Workspace Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Owner</span>
                  <span>{workspace.owner_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <Badge variant="outline">{workspace.plan_tier}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{format(new Date(workspace.created_at), "MMM d, yyyy")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={workspace.is_active ? "default" : "destructive"}>
                    {workspace.is_active ? "Active" : "Suspended"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
