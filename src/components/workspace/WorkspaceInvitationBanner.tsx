import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePendingInvitations } from "@/hooks/usePendingInvitations";
import { toast } from "sonner";
import { Check, X, Users, Loader2 } from "lucide-react";

export function WorkspaceInvitationBanner() {
  const { invitations, loading, respondToInvitation } = usePendingInvitations();
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  if (loading || invitations.length === 0) {
    return null;
  }

  const handleRespond = async (workspaceId: string, accept: boolean) => {
    setRespondingTo(workspaceId);
    
    const result = await respondToInvitation(workspaceId, accept);
    
    if (result.success) {
      toast.success(accept ? "Invitation accepted!" : "Invitation declined");
    } else {
      toast.error(result.error || "Failed to respond to invitation");
    }
    
    setRespondingTo(null);
  };

  return (
    <div className="space-y-3">
      {invitations.map((invitation) => (
        <Card 
          key={invitation.id} 
          className="border-primary/30 bg-primary/5 backdrop-blur-sm"
        >
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-foreground">
                      {invitation.workspace_name}
                    </h4>
                    <Badge variant="secondary" className="text-xs">
                      Pending Invitation
                    </Badge>
                  </div>
                  {invitation.inviter_name && (
                    <p className="text-sm text-muted-foreground">
                      Invited by {invitation.inviter_name}
                    </p>
                  )}
                  {invitation.workspace_description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {invitation.workspace_description}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRespond(invitation.workspace_id, false)}
                  disabled={respondingTo === invitation.workspace_id}
                  className="gap-1.5"
                >
                  {respondingTo === invitation.workspace_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                  Decline
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleRespond(invitation.workspace_id, true)}
                  disabled={respondingTo === invitation.workspace_id}
                  className="gap-1.5"
                >
                  {respondingTo === invitation.workspace_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Accept
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
