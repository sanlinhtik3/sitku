import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Eye, Trash2, Users, CheckCircle, Briefcase, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AdminWorkspaceDetailDialog } from "./AdminWorkspaceDetailDialog";

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

export function AdminWorkspaces() {
  const [workspaces, setWorkspaces] = useState<WorkspaceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceData | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    fetchWorkspaces();
    setupRealtimeSubscription();
  }, []);

  const fetchWorkspaces = async () => {
    try {
      setLoading(true);

      // Fetch workspaces with aggregated data
      const { data: workspacesData, error: workspacesError } = await supabase
        .from("workspaces")
        .select(`
          id,
          name,
          description,
          creator_id,
          total_points,
          is_active,
          created_at
        `)
        .order("created_at", { ascending: false });

      if (workspacesError) throw workspacesError;

      // Fetch additional data for each workspace
      const enrichedWorkspaces = await Promise.all(
        (workspacesData || []).map(async (workspace) => {
          // Get owner profile
          const { data: ownerProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", workspace.creator_id)
            .single();

          // Get member count
          const { count: memberCount } = await supabase
            .from("workspace_members")
            .select("*", { count: "exact", head: true })
            .eq("workspace_id", workspace.id);

          // Get completed tasks count
          const { count: completedTasks } = await supabase
            .from("workspace_tasks")
            .select("*", { count: "exact", head: true })
            .eq("workspace_id", workspace.id)
            .eq("status", "completed");

          // Get plan tier from owner's latest credit order
          const { data: creditOrder } = await supabase
            .from("credit_orders")
            .select("credit_plans(name)")
            .eq("user_id", workspace.creator_id)
            .eq("status", "completed")
            .order("approved_at", { ascending: false })
            .limit(1)
            .single();

          return {
            ...workspace,
            owner_id: workspace.creator_id,
            owner_name: ownerProfile?.full_name || "Unknown",
            member_count: memberCount || 0,
            completed_tasks: completedTasks || 0,
            plan_tier: (creditOrder?.credit_plans as any)?.name || "Free",
          };
        })
      );

      setWorkspaces(enrichedWorkspaces);
    } catch (error) {
      console.error("Error fetching workspaces:", error);
      toast.error("Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel("admin-workspaces")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspaces" },
        () => fetchWorkspaces()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    try {
      // Delete in order: completions -> tasks -> members -> workspace
      await supabase.from("task_completions").delete().eq("workspace_id", workspaceId);
      await supabase.from("workspace_tasks").delete().eq("workspace_id", workspaceId);
      await supabase.from("workspace_members").delete().eq("workspace_id", workspaceId);
      
      const { error } = await supabase
        .from("workspaces")
        .delete()
        .eq("id", workspaceId);

      if (error) throw error;

      toast.success("Workspace deleted successfully");
      fetchWorkspaces();
    } catch (error) {
      console.error("Error deleting workspace:", error);
      toast.error("Failed to delete workspace");
    }
  };

  const handleViewDetails = (workspace: WorkspaceData) => {
    setSelectedWorkspace(workspace);
    setDetailDialogOpen(true);
  };

  const filteredWorkspaces = workspaces.filter(
    (w) =>
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.owner_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getPlanBadgeVariant = (plan: string) => {
    switch (plan.toLowerCase()) {
      case "business":
        return "default";
      case "creator":
        return "secondary";
      case "pro":
        return "outline";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            Global Workspace Manager
          </h2>
          <p className="text-muted-foreground">
            Monitor and manage all workspaces across the platform
          </p>
        </div>
        <Button onClick={fetchWorkspaces} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{workspaces.length}</p>
                <p className="text-xs text-muted-foreground">Total Workspaces</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {workspaces.reduce((acc, w) => acc + w.member_count, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Total Members</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {workspaces.reduce((acc, w) => acc + w.completed_tasks, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Tasks Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {workspaces.filter((w) => w.is_active).length}
                </p>
                <p className="text-xs text-muted-foreground">Active Workspaces</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by workspace or owner..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background/50"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="rounded-md border border-border/50">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-center">Members</TableHead>
                    <TableHead className="text-center">Tasks Done</TableHead>
                    <TableHead className="text-center">Plan</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWorkspaces.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No workspaces found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredWorkspaces.map((workspace) => (
                      <TableRow key={workspace.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{workspace.name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {workspace.description || "No description"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{workspace.owner_name}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{workspace.member_count}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-medium text-green-500">{workspace.completed_tasks}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={getPlanBadgeVariant(workspace.plan_tier)}>
                            {workspace.plan_tier}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={workspace.is_active ? "default" : "destructive"}>
                            {workspace.is_active ? "Active" : "Suspended"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetails(workspace)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Workspace</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{workspace.name}"? This will permanently delete all tasks, members, and data associated with this workspace.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteWorkspace(workspace.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <AdminWorkspaceDetailDialog
        workspace={selectedWorkspace}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />
    </div>
  );
}
