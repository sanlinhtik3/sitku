import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Archive, RotateCcw, Trash2, Clock } from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ArchivedWorkspace {
  id: string;
  name: string;
  description: string | null;
  archived_at: string;
  total_points: number;
}

export function ArchivedWorkspaces() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: archivedWorkspaces, isLoading } = useQuery({
    queryKey: ['archived-workspaces', user?.id],
    queryFn: async (): Promise<ArchivedWorkspace[]> => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('workspaces')
        .select('id, name, description, archived_at, total_points')
        .eq('creator_id', user.id)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const restoreMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const { data, error } = await supabase.rpc('restore_workspace', {
        p_workspace_id: workspaceId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success('Workspace restored');
      queryClient.invalidateQueries({ queryKey: ['archived-workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: (error) => {
      toast.error('Failed to restore', { description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const { error } = await supabase
        .from('workspaces')
        .delete()
        .eq('id', workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Workspace permanently deleted');
      queryClient.invalidateQueries({ queryKey: ['archived-workspaces'] });
    },
    onError: (error) => {
      toast.error('Failed to delete', { description: error.message });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (!archivedWorkspaces?.length) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Archive className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No archived workspaces</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {archivedWorkspaces.map((workspace) => (
        <Card key={workspace.id} className="bg-muted/30 border-dashed">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Archive className="h-4 w-4 text-muted-foreground" />
                  {workspace.name}
                </CardTitle>
                <CardDescription className="mt-1">
                  {workspace.description || 'No description'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {format(new Date(workspace.archived_at), 'MMM d, yyyy')}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {workspace.total_points} total points
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => restoreMutation.mutate(workspace.id)}
                  disabled={restoreMutation.isPending}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Restore
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Permanently?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete "{workspace.name}" and all its data. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(workspace.id)}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Delete Permanently
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
