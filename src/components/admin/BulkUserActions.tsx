import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Ban, Bell, ShieldOff } from "lucide-react";

interface BulkUserActionsProps {
  selectedUserIds: string[];
  onActionComplete: () => void;
}

export const BulkUserActions = ({
  selectedUserIds,
  onActionComplete,
}: BulkUserActionsProps) => {
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [showUnbanDialog, setShowUnbanDialog] = useState(false);
  const [showNotificationDialog, setShowNotificationDialog] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleBanUsers = async () => {
    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("profiles")
        .update({
          is_banned: true,
          banned_at: new Date().toISOString(),
          banned_by: user.id,
        })
        .in("user_id", selectedUserIds);

      if (error) throw error;

      // Send notification to each banned user
      const notifications = selectedUserIds.map((userId) => ({
        user_id: userId,
        type: "account_banned",
        title: "Account Suspended",
        message: "Your account has been suspended by an administrator.",
      }));

      await supabase.from("notifications").insert(notifications);

      toast.success(`Successfully banned ${selectedUserIds.length} user(s)`);
      setShowBanDialog(false);
      onActionComplete();
    } catch (error) {
      console.error("Error banning users:", error);
      toast.error("Failed to ban users");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnbanUsers = async () => {
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_banned: false,
          banned_at: null,
          banned_by: null,
        })
        .in("user_id", selectedUserIds);

      if (error) throw error;

      // Send notification to each unbanned user
      const notifications = selectedUserIds.map((userId) => ({
        user_id: userId,
        type: "account_unbanned",
        title: "Account Restored",
        message: "Your account has been restored by an administrator.",
      }));

      await supabase.from("notifications").insert(notifications);

      toast.success(`Successfully unbanned ${selectedUserIds.length} user(s)`);
      setShowUnbanDialog(false);
      onActionComplete();
    } catch (error) {
      console.error("Error unbanning users:", error);
      toast.error("Failed to unban users");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendNotification = async () => {
    if (!notificationTitle || !notificationMessage) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsProcessing(true);
    try {
      const notifications = selectedUserIds.map((userId) => ({
        user_id: userId,
        type: "admin_message",
        title: notificationTitle,
        message: notificationMessage,
      }));

      const { error } = await supabase.from("notifications").insert(notifications);
      if (error) throw error;

      toast.success(`Notification sent to ${selectedUserIds.length} user(s)`);
      setShowNotificationDialog(false);
      setNotificationTitle("");
      setNotificationMessage("");
      onActionComplete();
    } catch (error) {
      console.error("Error sending notifications:", error);
      toast.error("Failed to send notifications");
    } finally {
      setIsProcessing(false);
    }
  };

  if (selectedUserIds.length === 0) return null;

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border rounded-lg shadow-lg p-4 flex items-center gap-4">
        <span className="text-sm font-medium">
          {selectedUserIds.length} user(s) selected
        </span>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowBanDialog(true)}
          >
            <Ban className="h-4 w-4 mr-2" />
            Ban
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUnbanDialog(true)}
          >
            <ShieldOff className="h-4 w-4 mr-2" />
            Unban
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowNotificationDialog(true)}
          >
            <Bell className="h-4 w-4 mr-2" />
            Notify
          </Button>
        </div>
      </div>

      <Dialog open={showBanDialog} onOpenChange={setShowBanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban Users</DialogTitle>
            <DialogDescription>
              Are you sure you want to ban {selectedUserIds.length} user(s)? They will no
              longer be able to access the platform.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBanDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBanUsers}
              disabled={isProcessing}
            >
              {isProcessing ? "Banning..." : "Ban Users"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUnbanDialog} onOpenChange={setShowUnbanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unban Users</DialogTitle>
            <DialogDescription>
              Are you sure you want to unban {selectedUserIds.length} user(s)? They will
              regain access to the platform.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnbanDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUnbanUsers} disabled={isProcessing}>
              {isProcessing ? "Unbanning..." : "Unban Users"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNotificationDialog} onOpenChange={setShowNotificationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Notification</DialogTitle>
            <DialogDescription>
              Send a notification to {selectedUserIds.length} selected user(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={notificationTitle}
                onChange={(e) => setNotificationTitle(e.target.value)}
                placeholder="Notification title"
              />
            </div>
            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                value={notificationMessage}
                onChange={(e) => setNotificationMessage(e.target.value)}
                placeholder="Notification message"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNotificationDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSendNotification} disabled={isProcessing}>
              {isProcessing ? "Sending..." : "Send Notification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
