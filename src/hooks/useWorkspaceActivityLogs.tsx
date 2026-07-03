import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ActivityLog {
  id: string;
  workspace_id: string;
  user_id: string;
  action: string;
  target_user_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  user_profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
  target_profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

export function useWorkspaceActivityLogs(workspaceId: string | null) {
  return useQuery({
    queryKey: ['workspace-activity-logs', workspaceId],
    queryFn: async (): Promise<ActivityLog[]> => {
      if (!workspaceId) return [];

      const { data: logs, error } = await supabase
        .from('workspace_activity_logs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch user profiles for activity logs
      const userIds = new Set<string>();
      logs?.forEach(log => {
        userIds.add(log.user_id);
        if (log.target_user_id) userIds.add(log.target_user_id);
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', Array.from(userIds));

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      return (logs || []).map(log => ({
        ...log,
        details: log.details as Record<string, unknown> | null,
        user_profile: profileMap.get(log.user_id) || null,
        target_profile: log.target_user_id ? profileMap.get(log.target_user_id) || null : null,
      }));
    },
    enabled: !!workspaceId,
    staleTime: 30000,
  });
}
