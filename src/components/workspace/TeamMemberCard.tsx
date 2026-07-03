import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Crown, 
  Shield, 
  User, 
  MoreVertical, 
  UserMinus, 
  ArrowUpCircle,
  ArrowDownCircle,
  LogOut,
  Loader2,
  Star
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { WorkspacePermissions } from "@/hooks/useWorkspacePermissions";

interface TeamMemberCardProps {
  member: {
    id: string;
    user_id: string;
    role: string;
    personal_score: number;
    status: string;
    profiles?: {
      full_name: string | null;
      avatar_url: string | null;
      email: string | null;
    };
  };
  workspaceId: string;
  permissions: WorkspacePermissions;
  onRefresh: () => void;
}

export function TeamMemberCard({ member, workspaceId, permissions, onRefresh }: TeamMemberCardProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  const isCurrentUser = user?.id === member.user_id;
  const isPending = member.status === "pending";
  
  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case "admin":
        return <Shield className="h-4 w-4 text-blue-500" />;
      default:
        return <User className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default";
      case "admin":
        return "secondary";
      default:
        return "outline";
    }
  };

  const handleChangeRole = async (newRole: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("change_member_role", {
        p_workspace_id: workspaceId,
        p_target_user_id: member.user_id,
        p_new_role: newRole,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || "Failed to change role");
      }

      toast.success(`Role changed to ${newRole}`);
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || "Failed to change role");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("remove_workspace_member", {
        p_workspace_id: workspaceId,
        p_target_user_id: member.user_id,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || "Failed to remove member");
      }

      toast.success("Member removed successfully");
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || "Failed to remove member");
    } finally {
      setLoading(false);
      setShowRemoveDialog(false);
    }
  };

  const handleLeaveWorkspace = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("leave_workspace", {
        p_workspace_id: workspaceId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || "Failed to leave workspace");
      }

      toast.success("You have left the workspace");
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || "Failed to leave workspace");
    } finally {
      setLoading(false);
      setShowLeaveDialog(false);
    }
  };

  const canManageThisMember = () => {
    if (member.role === "owner") return false;
    if (isCurrentUser) return false;
    if (permissions.role === "owner") return true;
    if (permissions.role === "admin" && member.role === "member") return true;
    return false;
  };

  const showActions = canManageThisMember() || (isCurrentUser && permissions.canLeave);

  return (
    <>
      <Card className={`transition-all ${isPending ? "opacity-60 border-dashed" : ""}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={member.profiles?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {member.profiles?.full_name?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">
                    {member.profiles?.full_name || "Unknown User"}
                    {isCurrentUser && (
                      <span className="text-muted-foreground text-sm ml-1">(you)</span>
                    )}
                  </span>
                  <Badge variant={getRoleBadgeVariant(member.role)} className="gap-1 shrink-0">
                    {getRoleIcon(member.role)}
                    <span className="capitalize">{member.role}</span>
                  </Badge>
                  {isPending && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      Pending
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Star className="h-3.5 w-3.5 text-yellow-500" />
                  <span>{member.personal_score || 0} points</span>
                </div>
              </div>
            </div>

            {showActions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0" disabled={loading}>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MoreVertical className="h-4 w-4" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {/* Role change options - only for owner */}
                  {permissions.canChangeRoles && member.role !== "owner" && (
                    <>
                      {member.role === "member" && (
                        <DropdownMenuItem onClick={() => handleChangeRole("admin")}>
                          <ArrowUpCircle className="h-4 w-4 mr-2 text-blue-500" />
                          Promote to Admin
                        </DropdownMenuItem>
                      )}
                      {member.role === "admin" && (
                        <DropdownMenuItem onClick={() => handleChangeRole("member")}>
                          <ArrowDownCircle className="h-4 w-4 mr-2 text-orange-500" />
                          Demote to Member
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  
                  {/* Remove member option */}
                  {canManageThisMember() && (
                    <DropdownMenuItem 
                      onClick={() => setShowRemoveDialog(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <UserMinus className="h-4 w-4 mr-2" />
                      Remove Member
                    </DropdownMenuItem>
                  )}
                  
                  {/* Leave workspace option */}
                  {isCurrentUser && permissions.canLeave && (
                    <DropdownMenuItem 
                      onClick={() => setShowLeaveDialog(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Leave Workspace
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Remove Member Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {member.profiles?.full_name || "this member"} from the workspace? 
              They will lose access to all workspace tasks and data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave Workspace Dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Workspace</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave this workspace? You will lose access to all tasks and data. 
              You'll need a new invitation to rejoin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveWorkspace}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Leave Workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
