import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface WorkspacePermissions {
  isMember: boolean;
  role: string | null;
  canViewWorkspace: boolean;
  canManageTasks: boolean;
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canChangeRoles: boolean;
  canEditSettings: boolean;
  canDeleteWorkspace: boolean;
  canLeave: boolean;
}

const DEFAULT_PERMISSIONS: WorkspacePermissions = {
  isMember: false,
  role: null,
  canViewWorkspace: false,
  canManageTasks: false,
  canInviteMembers: false,
  canRemoveMembers: false,
  canChangeRoles: false,
  canEditSettings: false,
  canDeleteWorkspace: false,
  canLeave: false,
};

export function useWorkspacePermissions(workspaceId: string | undefined) {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<WorkspacePermissions>(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!workspaceId || !user) {
      setPermissions(DEFAULT_PERMISSIONS);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc("get_workspace_permission", {
        p_workspace_id: workspaceId,
        p_user_id: user.id,
      });

      if (error) throw error;

      setPermissions(data as unknown as WorkspacePermissions);
    } catch (error) {
      console.error("Error fetching workspace permissions:", error);
      setPermissions(DEFAULT_PERMISSIONS);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, user]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Subscribe to role changes
  useEffect(() => {
    if (!workspaceId || !user) return;

    const channel = supabase
      .channel(`workspace-permissions-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_members",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          fetchPermissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, user, fetchPermissions]);

  return { permissions, loading, refetch: fetchPermissions };
}
