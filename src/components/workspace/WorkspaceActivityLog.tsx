import { useWorkspaceActivityLogs } from "@/hooks/useWorkspaceActivityLogs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, formatDistanceToNow } from "date-fns";
import { 
  UserPlus, 
  UserMinus, 
  Shield, 
  CheckCircle, 
  Archive, 
  RotateCcw,
  ArrowRightLeft,
  Users,
  Clock
} from "lucide-react";

interface WorkspaceActivityLogProps {
  workspaceId: string;
}

const actionConfig: Record<string, { icon: typeof UserPlus; label: string; color: string }> = {
  member_joined: { icon: UserPlus, label: 'joined the workspace', color: 'text-green-400' },
  member_left: { icon: UserMinus, label: 'left the workspace', color: 'text-amber-400' },
  member_removed: { icon: UserMinus, label: 'was removed', color: 'text-red-400' },
  role_changed: { icon: Shield, label: 'role was changed', color: 'text-blue-400' },
  task_completed: { icon: CheckCircle, label: 'completed a task', color: 'text-green-400' },
  workspace_archived: { icon: Archive, label: 'archived the workspace', color: 'text-amber-400' },
  workspace_restored: { icon: RotateCcw, label: 'restored the workspace', color: 'text-green-400' },
  transfer_initiated: { icon: ArrowRightLeft, label: 'initiated ownership transfer', color: 'text-blue-400' },
  ownership_transferred: { icon: Users, label: 'ownership was transferred', color: 'text-purple-400' },
  invitation_sent: { icon: UserPlus, label: 'sent an invitation', color: 'text-blue-400' },
  invitation_accepted: { icon: UserPlus, label: 'accepted invitation', color: 'text-green-400' },
  invitation_declined: { icon: UserMinus, label: 'declined invitation', color: 'text-red-400' },
};

export function WorkspaceActivityLog({ workspaceId }: WorkspaceActivityLogProps) {
  const { data: logs, isLoading } = useWorkspaceActivityLogs(workspaceId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (!logs?.length) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No activity yet</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
        
        <div className="space-y-4">
          {logs.map((log) => {
            const config = actionConfig[log.action] || {
              icon: Clock,
              label: log.action.replace(/_/g, ' '),
              color: 'text-muted-foreground'
            };
            const Icon = config.icon;

            return (
              <div key={log.id} className="relative flex gap-4 pl-10">
                {/* Timeline dot */}
                <div className={`absolute left-2.5 top-1 w-3 h-3 rounded-full border-2 border-background ${config.color} bg-current`} />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={log.user_profile?.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">
                        {log.user_profile?.full_name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium text-foreground">
                          {log.user_profile?.full_name || 'Unknown user'}
                        </span>
                        <span className="text-muted-foreground mx-1">{config.label}</span>
                        {log.target_profile && (
                          <span className="font-medium text-foreground">
                            {log.target_profile.full_name}
                          </span>
                        )}
                      </p>
                      
                      {log.details && Object.keys(log.details).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {log.details.new_role && `New role: ${log.details.new_role}`}
                          {log.details.task_title && `Task: ${log.details.task_title}`}
                          {log.details.points && ` (+${log.details.points} pts)`}
                        </p>
                      )}
                      
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    
                    <Icon className={`h-4 w-4 flex-shrink-0 ${config.color}`} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
