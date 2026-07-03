import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Clock, X, Mail } from "lucide-react";
import { toast } from "sonner";
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

interface PendingInvitationCardProps {
  member: any;
  workspaceId: string;
  onRefresh: () => void;
}

export function PendingInvitationCard({ member, workspaceId, onRefresh }: PendingInvitationCardProps) {
  const [cancelling, setCancelling] = useState(false);

  const handleCancelInvitation = async () => {
    setCancelling(true);
    try {
      const { error } = await supabase
        .from("workspace_members")
        .delete()
        .eq("id", member.id);

      if (error) throw error;

      toast.success("Invitation cancelled");
      onRefresh();
    } catch (error: any) {
      console.error("Error cancelling invitation:", error);
      toast.error(error.message || "Failed to cancel invitation");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Card className="p-4 bg-background/60 backdrop-blur-sm border-yellow-500/30 hover:border-yellow-500/50 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border-2 border-yellow-500/30">
            <AvatarImage src={member.profiles?.avatar_url} />
            <AvatarFallback className="bg-yellow-500/20 text-yellow-500">
              {member.profiles?.full_name?.[0] || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">
                {member.profiles?.full_name || "Unknown User"}
              </span>
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30 text-xs">
                <Clock className="h-3 w-3 mr-1" />
                Pending
              </Badge>
            </div>
            {member.profiles?.email && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Mail className="h-3 w-3" />
                {member.profiles.email}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Invited {format(new Date(member.joined_at), "MMM d, yyyy")}
            </p>
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={cancelling}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to cancel the invitation for {member.profiles?.full_name || "this user"}? 
                They will no longer be able to join this workspace.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep Invitation</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelInvitation}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Cancel Invitation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
}
