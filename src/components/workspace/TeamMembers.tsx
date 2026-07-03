import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus, Lock, Hash, Clock } from "lucide-react";
import { toast } from "sonner";
import { useMemberLimits } from "@/hooks/useWorkspaceLimits";
import { useWorkspacePermissions } from "@/hooks/useWorkspacePermissions";
import { UpgradePlanDialog } from "./UpgradePlanDialog";
import { WorkspaceLimitIndicator } from "./WorkspaceLimitIndicator";
import { TeamMemberCard } from "./TeamMemberCard";
import { PendingInvitationCard } from "./PendingInvitationCard";

interface TeamMembersProps {
  workspace: any;
  members: any[];
  onRefresh: () => void;
}

export function TeamMembers({ workspace, members, onRefresh }: TeamMembersProps) {
  const { user } = useAuth();
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const { memberLimits, refetch: refetchLimits } = useMemberLimits(workspace?.id);
  const { permissions } = useWorkspacePermissions(workspace?.id);

  // Separate accepted members and pending invitations
  const acceptedMembers = members.filter(m => m.status === "accepted" || !m.status);
  const pendingInvitations = members.filter(m => m.status === "pending");

  const handleInvite = async () => {
    // Check member limits before inviting
    if (memberLimits && !memberLimits.canAddMember) {
      setShowUpgradeDialog(true);
      return;
    }

    if (!inviteEmail.trim()) {
      toast.error("Please enter an email or invite code");
      return;
    }

    setLoading(true);
    try {
      // Call edge function to lookup user by email or invite code
      const { data, error } = await supabase.functions.invoke('lookup-user-for-invite', {
        body: { searchTerm: inviteEmail.trim() }
      });

      if (error) {
        console.error('Lookup error:', error);
        toast.error("Failed to lookup user. Please try again.");
        return;
      }

      if (!data?.profile) {
        toast.error("User not found. They need to sign up first.");
        return;
      }

      // Check if already a member - use database query for accurate check
      const { data: existingMember } = await supabase
        .from("workspace_members")
        .select("id, status")
        .eq("workspace_id", workspace.id)
        .eq("user_id", data.profile.user_id)
        .maybeSingle();

      if (existingMember) {
        if (existingMember.status === "pending") {
          toast.error("This user already has a pending invitation");
        } else {
          toast.error("This user is already a member of this workspace");
        }
        return;
      }

      // Check if trying to add self
      if (data.profile.user_id === user?.id) {
        toast.error("You cannot invite yourself");
        return;
      }

      // Add member with pending status
      const { error: insertError } = await supabase.from("workspace_members").insert({
        workspace_id: workspace.id,
        user_id: data.profile.user_id,
        role: "member",
        invited_by: user?.id,
        status: "pending",
      });

      if (insertError) throw insertError;

      // Create notification for the invited user
      await supabase.from("notifications").insert({
        user_id: data.profile.user_id,
        type: "workspace_invitation",
        title: "Workspace Invitation",
        message: `You've been invited to join "${workspace.name}"`,
        related_id: workspace.id,
      });

      toast.success(`Invitation sent to ${data.profile.full_name || 'user'}!`);
      setInviteEmail("");
      onRefresh();
      refetchLimits();
    } catch (error: any) {
      console.error("Error inviting member:", error);
      toast.error(error.message || "Failed to invite member");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Invite Section - only for owner and admin */}
      {permissions.canInviteMembers && (
        <Card className="p-6 bg-gradient-to-br from-card to-primary/5 border-border/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Invite Team Member
            </h3>
            {memberLimits && (
              <WorkspaceLimitIndicator
                current={memberLimits.currentMembers}
                max={memberLimits.maxMembers}
                label="Members"
              />
            )}
          </div>
          
          {memberLimits && !memberLimits.canAddMember ? (
            <Card
              onClick={() => setShowUpgradeDialog(true)}
              className="flex items-center justify-center gap-3 p-4 cursor-pointer opacity-70 hover:opacity-90 transition-opacity bg-muted/50 border-dashed border-2 border-muted-foreground/30"
            >
              <Lock className="h-5 w-5 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">Member Limit Reached</p>
                <p className="text-xs text-muted-foreground/70">Upgrade to invite more team members</p>
              </div>
            </Card>
          ) : (
            <>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Enter email or invite code (e.g. ABC12DEF)"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                    className="pl-10 bg-background/50"
                  />
                </div>
                <Button
                  onClick={handleInvite}
                  disabled={loading}
                  className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                >
                  {loading ? "Sending..." : "Send Invite"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Ask team members for their invite code from their profile, or use their email address
              </p>
            </>
          )}
        </Card>
      )}

      {/* Pending Invitations Section - visible to owners and admins */}
      {pendingInvitations.length > 0 && (permissions.role === "owner" || permissions.role === "admin") && (
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2 text-yellow-500">
            <Clock className="h-5 w-5" />
            Pending Invitations ({pendingInvitations.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingInvitations.map((member) => (
              <PendingInvitationCard
                key={member.id}
                member={member}
                workspaceId={workspace.id}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        </div>
      )}

      {/* Members List */}
      <div className="space-y-3">
        <h3 className="font-semibold">Team Members ({acceptedMembers.length})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {acceptedMembers.map((member) => (
            <TeamMemberCard
              key={member.id}
              member={member}
              workspaceId={workspace.id}
              permissions={permissions}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      </div>

      {acceptedMembers.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No team members yet. Invite your first member!
        </div>
      )}

      {acceptedMembers.length === 1 && permissions.canInviteMembers && (
        <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <div className="text-center">
            <UserPlus className="h-12 w-12 text-primary mx-auto mb-4 opacity-70" />
            <h3 className="font-semibold mb-2">Ready to Scale?</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              You're currently in solo mode. Invite a team member above to unlock team features like leaderboards and collaborative task management.
            </p>
          </div>
        </Card>
      )}

      {/* Upgrade Plan Dialog */}
      <UpgradePlanDialog
        open={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        feature="members"
        currentPlan={memberLimits?.planName}
      />
    </div>
  );
}
