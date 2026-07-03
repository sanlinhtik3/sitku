import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Crown, Check, X } from "lucide-react";

interface TransferRequest {
  id: string;
  workspace_id: string;
  from_user_id: string;
  to_user_id: string;
  status: string;
  created_at: string;
  workspace?: {
    name: string;
  };
  from_profile?: {
    full_name: string | null;
  };
}

export function TransferRequestBanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: pendingTransfers } = useQuery({
    queryKey: ['pending-transfers', user?.id],
    queryFn: async (): Promise<TransferRequest[]> => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('workspace_transfers')
        .select('*')
        .eq('to_user_id', user.id)
        .eq('status', 'pending');

      if (error) throw error;

      // Fetch workspace and profile info
      const workspaceIds = data.map(t => t.workspace_id);
      const fromUserIds = data.map(t => t.from_user_id);

      const [{ data: workspaces }, { data: profiles }] = await Promise.all([
        supabase.from('workspaces').select('id, name').in('id', workspaceIds),
        supabase.from('profiles').select('user_id, full_name').in('user_id', fromUserIds),
      ]);

      const workspaceMap = new Map(workspaces?.map(w => [w.id, w]) || []);
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      return data.map(t => ({
        ...t,
        workspace: workspaceMap.get(t.workspace_id),
        from_profile: profileMap.get(t.from_user_id),
      }));
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const respondMutation = useMutation({
    mutationFn: async ({ transferId, accept }: { transferId: string; accept: boolean }) => {
      const { data, error } = await supabase.rpc('respond_to_ownership_transfer', {
        p_transfer_id: transferId,
        p_accept: accept,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; action?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      toast.success(result.action === 'accepted' ? 'Ownership accepted!' : 'Transfer declined');
      queryClient.invalidateQueries({ queryKey: ['pending-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
    },
    onError: (error) => {
      toast.error('Failed to respond', { description: error.message });
    },
  });

  if (!pendingTransfers?.length) return null;

  return (
    <div className="space-y-2 mb-4">
      {pendingTransfers.map((transfer) => (
        <div
          key={transfer.id}
          className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30"
        >
          <Crown className="h-5 w-5 text-amber-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              Ownership Transfer Request
            </p>
            <p className="text-xs text-muted-foreground">
              {transfer.from_profile?.full_name || 'Someone'} wants to transfer ownership of "{transfer.workspace?.name}" to you
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => respondMutation.mutate({ transferId: transfer.id, accept: false })}
              disabled={respondMutation.isPending}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              onClick={() => respondMutation.mutate({ transferId: transfer.id, accept: true })}
              disabled={respondMutation.isPending}
              className="bg-amber-500 hover:bg-amber-600"
            >
              <Check className="h-4 w-4 mr-1" />
              Accept
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
