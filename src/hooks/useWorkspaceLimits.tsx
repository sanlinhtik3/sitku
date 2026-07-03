import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface WorkspaceLimits {
  canCreateWorkspace: boolean;
  currentWorkspaces: number;
  maxWorkspaces: number;
  planName: string;
}

interface MemberLimits {
  canAddMember: boolean;
  currentMembers: number;
  maxMembers: number;
  planName: string;
}

export function useWorkspaceLimits() {
  const { user } = useAuth();
  const [workspaceLimits, setWorkspaceLimits] = useState<WorkspaceLimits | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchWorkspaceLimits();
    }
  }, [user]);

  const fetchWorkspaceLimits = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc("can_create_workspace", {
        p_user_id: user.id,
      });

      if (error) throw error;

      const result = data as any;
      setWorkspaceLimits({
        canCreateWorkspace: result.allowed,
        currentWorkspaces: result.current_count,
        maxWorkspaces: result.max_count,
        planName: result.plan_name,
      });
    } catch (error) {
      console.error("Error fetching workspace limits:", error);
      // Default to free tier on error
      setWorkspaceLimits({
        canCreateWorkspace: true,
        currentWorkspaces: 0,
        maxWorkspaces: 1,
        planName: "Free",
      });
    } finally {
      setLoading(false);
    }
  };

  const refetch = () => {
    setLoading(true);
    fetchWorkspaceLimits();
  };

  return { workspaceLimits, loading, refetch };
}

export function useMemberLimits(workspaceId: string | undefined) {
  const [memberLimits, setMemberLimits] = useState<MemberLimits | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (workspaceId) {
      fetchMemberLimits();
    }
  }, [workspaceId]);

  const fetchMemberLimits = async () => {
    if (!workspaceId) return;

    try {
      const { data, error } = await supabase.rpc("can_add_workspace_member", {
        p_workspace_id: workspaceId,
      });

      if (error) throw error;

      const result = data as any;
      setMemberLimits({
        canAddMember: result.allowed,
        currentMembers: result.current_count,
        maxMembers: result.max_count,
        planName: result.plan_name,
      });
    } catch (error) {
      console.error("Error fetching member limits:", error);
      // Default to free tier on error
      setMemberLimits({
        canAddMember: false,
        currentMembers: 0,
        maxMembers: 0,
        planName: "Free",
      });
    } finally {
      setLoading(false);
    }
  };

  const refetch = () => {
    setLoading(true);
    fetchMemberLimits();
  };

  return { memberLimits, loading, refetch };
}
