import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PendingInvitation {
  id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_description: string | null;
  inviter_name: string | null;
  invited_at: string;
}

export function usePendingInvitations() {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvitations = useCallback(async () => {
    if (!user) {
      setInvitations([]);
      setLoading(false);
      return;
    }

    try {
      // Get pending invitations with workspace and inviter info
      const { data: memberships, error } = await supabase
        .from("workspace_members")
        .select(`
          id,
          workspace_id,
          invited_by,
          joined_at
        `)
        .eq("user_id", user.id)
        .eq("status", "pending");

      if (error) throw error;

      if (!memberships || memberships.length === 0) {
        setInvitations([]);
        setLoading(false);
        return;
      }

      // Fetch workspace details
      const workspaceIds = memberships.map((m) => m.workspace_id);
      const { data: workspaces } = await supabase
        .from("workspaces")
        .select("id, name, description")
        .in("id", workspaceIds);

      // Fetch inviter profiles
      const inviterIds = memberships.map((m) => m.invited_by).filter(Boolean);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", inviterIds);

      // Build invitation objects
      const invitationList: PendingInvitation[] = memberships.map((membership) => {
        const workspace = workspaces?.find((w) => w.id === membership.workspace_id);
        const inviter = profiles?.find((p) => p.user_id === membership.invited_by);

        return {
          id: membership.id,
          workspace_id: membership.workspace_id,
          workspace_name: workspace?.name || "Unknown Workspace",
          workspace_description: workspace?.description || null,
          inviter_name: inviter?.full_name || null,
          invited_at: membership.joined_at || new Date().toISOString(),
        };
      });

      setInvitations(invitationList);
    } catch (error) {
      console.error("Error fetching pending invitations:", error);
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  // Real-time subscription for new invitations
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("pending-invitations")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_members",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchInvitations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchInvitations]);

  const respondToInvitation = async (workspaceId: string, accept: boolean) => {
    try {
      const { data, error } = await supabase.rpc("respond_to_workspace_invitation", {
        p_workspace_id: workspaceId,
        p_accept: accept,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; action?: string };
      
      if (!result.success) {
        throw new Error(result.error || "Failed to respond to invitation");
      }

      // Optimistically update local state
      setInvitations((prev) => prev.filter((inv) => inv.workspace_id !== workspaceId));

      return { success: true, action: result.action };
    } catch (error: any) {
      console.error("Error responding to invitation:", error);
      return { success: false, error: error.message };
    }
  };

  return { invitations, loading, refetch: fetchInvitations, respondToInvitation };
}
