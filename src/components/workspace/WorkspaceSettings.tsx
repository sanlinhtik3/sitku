import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Settings, Trash2, Save, LogOut, Loader2, Shield, Archive, ArrowRightLeft, Activity } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useWorkspacePermissions } from "@/hooks/useWorkspacePermissions";
import { WorkspaceActivityLog } from "./WorkspaceActivityLog";
import { OwnershipTransferDialog } from "./OwnershipTransferDialog";
import { ArchivedWorkspaces } from "./ArchivedWorkspaces";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface Member {
  user_id: string;
  role: string;
  profile?: {
    full_name: string | null;
    avatar_url: string | null;
    email: string | null;
  };
}

interface WorkspaceSettingsProps {
  workspace: any;
  members?: Member[];
  onUpdate: () => void;
}

export function WorkspaceSettings({ workspace, members = [], onUpdate }: WorkspaceSettingsProps) {
  const [name, setName] = useState(workspace?.name || "");
  const [description, setDescription] = useState(workspace?.description || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showArchivedWorkspaces, setShowArchivedWorkspaces] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const { permissions, loading: permissionsLoading } = useWorkspacePermissions(workspace?.id);

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('archive_workspace', {
        p_workspace_id: workspace.id,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success('Workspace archived');
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['archived-workspaces'] });
      navigate('/team-workspace');
    },
    onError: (error) => {
      toast.error('Failed to archive', { description: error.message });
    },
  });

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Workspace name is required");
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from("workspaces")
        .update({ name, description })
        .eq("id", workspace.id);

      if (error) throw error;

      toast.success("Workspace updated successfully");
      onUpdate();
    } catch (error) {
      console.error("Error updating workspace:", error);
      toast.error("Failed to update workspace");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);

      // Delete in order: completions -> tasks -> members -> workspace
      await supabase.from("task_completions").delete().eq("workspace_id", workspace.id);
      await supabase.from("workspace_tasks").delete().eq("workspace_id", workspace.id);
      await supabase.from("workspace_members").delete().eq("workspace_id", workspace.id);

      const { error } = await supabase
        .from("workspaces")
        .delete()
        .eq("id", workspace.id);

      if (error) throw error;

      toast.success("Workspace deleted successfully");
      navigate("/dashboard");
    } catch (error) {
      console.error("Error deleting workspace:", error);
      toast.error("Failed to delete workspace");
    } finally {
      setDeleting(false);
    }
  };

  const handleLeaveWorkspace = async () => {
    setLeaving(true);
    try {
      const { data, error } = await supabase.rpc("leave_workspace", {
        p_workspace_id: workspace.id,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || "Failed to leave workspace");
      }

      toast.success("You have left the workspace");
      navigate("/team-workspace");
    } catch (error: any) {
      toast.error(error.message || "Failed to leave workspace");
    } finally {
      setLeaving(false);
      setShowLeaveDialog(false);
    }
  };

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Workspace Info Card */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Workspace Settings
          </CardTitle>
          <CardDescription>
            {permissions.canEditSettings 
              ? "Manage your workspace name and description"
              : "View workspace information"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Workspace Name</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter workspace name"
              disabled={!permissions.canEditSettings}
              className="bg-background/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-description">Description</Label>
            <Textarea
              id="workspace-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter workspace description (optional)"
              disabled={!permissions.canEditSettings}
              className="bg-background/50 min-h-[100px]"
            />
          </div>
          {permissions.canEditSettings && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Role Info Card */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Your Role
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
              permissions.role === "owner" ? "bg-yellow-500/20 text-yellow-500" :
              permissions.role === "admin" ? "bg-blue-500/20 text-blue-500" :
              "bg-muted text-muted-foreground"
            }`}>
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium capitalize">{permissions.role || "Member"}</p>
              <p className="text-sm text-muted-foreground">
                {permissions.role === "owner" && "Full control over workspace"}
                {permissions.role === "admin" && "Can manage tasks and members"}
                {permissions.role === "member" && "Can complete assigned tasks"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leave Workspace - for non-owners */}
      {permissions.canLeave && (
        <Card className="bg-orange-500/5 backdrop-blur-sm border-orange-500/20">
          <CardHeader>
            <CardTitle className="text-orange-500 flex items-center gap-2">
              <LogOut className="h-5 w-5" />
              Leave Workspace
            </CardTitle>
            <CardDescription>
              Leave this workspace. You'll lose access to all tasks and data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="border-orange-500/50 text-orange-500 hover:bg-orange-500/10">
                  <LogOut className="h-4 w-4 mr-2" />
                  Leave Workspace
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave Workspace</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to leave "{workspace?.name}"? You'll lose access to all tasks and data. You'll need a new invitation to rejoin.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLeaveWorkspace}
                    disabled={leaving}
                    className="bg-orange-500 text-white hover:bg-orange-600"
                  >
                    {leaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Leave Workspace
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      {/* Activity Log - for owner/admin */}
      {(permissions.role === 'owner' || permissions.role === 'admin') && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Activity Log
                </CardTitle>
                <CardDescription>
                  Track all member actions in this workspace
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowActivityLog(!showActivityLog)}
              >
                {showActivityLog ? 'Hide' : 'View'}
              </Button>
            </div>
          </CardHeader>
          {showActivityLog && (
            <CardContent>
              <WorkspaceActivityLog workspaceId={workspace.id} />
            </CardContent>
          )}
        </Card>
      )}

      {/* Ownership Transfer - only for owner */}
      {permissions.canDeleteWorkspace && members.some(m => m.role === 'admin') && (
        <Card className="bg-amber-500/5 backdrop-blur-sm border-amber-500/20">
          <CardHeader>
            <CardTitle className="text-amber-500 flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Transfer Ownership
            </CardTitle>
            <CardDescription>
              Transfer workspace ownership to an admin member
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
              onClick={() => setShowTransferDialog(true)}
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Transfer Ownership
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Archive Workspace - only for owner */}
      {permissions.canDeleteWorkspace && (
        <Card className="bg-muted/30 backdrop-blur-sm border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Archive className="h-5 w-5 text-muted-foreground" />
                  Archive Options
                </CardTitle>
                <CardDescription>
                  Archive workspace to preserve data without deleting
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowArchivedWorkspaces(!showArchivedWorkspaces)}
              >
                {showArchivedWorkspaces ? 'Hide Archived' : 'View Archived'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {showArchivedWorkspaces && (
              <div className="mb-4">
                <ArchivedWorkspaces />
              </div>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={archiveMutation.isPending}
                  className="border-muted-foreground/30"
                >
                  <Archive className="h-4 w-4 mr-2" />
                  {archiveMutation.isPending ? 'Archiving...' : 'Archive This Workspace'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive Workspace</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will archive "{workspace?.name}". The workspace and all its data will be preserved but hidden. You can restore it anytime.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => archiveMutation.mutate()}>
                    Archive Workspace
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone - only for owner */}
      {permissions.canDeleteWorkspace && (
        <Card className="bg-destructive/5 backdrop-blur-sm border-destructive/20">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Permanently delete this workspace and all its data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {deleting ? "Deleting..." : "Delete Workspace"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Workspace</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{workspace?.name}"? This action cannot be undone and will permanently delete all tasks, members, and data associated with this workspace.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete Permanently
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      {/* Ownership Transfer Dialog */}
      <OwnershipTransferDialog
        open={showTransferDialog}
        onOpenChange={setShowTransferDialog}
        workspaceId={workspace?.id}
        workspaceName={workspace?.name || ''}
        members={members}
      />
    </div>
  );
}
