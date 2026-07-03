import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface WorkspaceCreatorProps {
  open: boolean;
  onClose: () => void;
  onCreated: (workspace: any) => void;
}

export function WorkspaceCreator({
  open,
  onClose,
  onCreated,
}: WorkspaceCreatorProps) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Workspace name is required");
      return;
    }

    if (name.length < 3 || name.length > 100) {
      toast.error("Workspace name must be between 3 and 100 characters");
      return;
    }

    setLoading(true);
    try {
      // Create workspace
      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          creator_id: user?.id,
        })
        .select()
        .single();

      if (workspaceError) throw workspaceError;

      // Add creator as owner member
      const { error: memberError } = await supabase
        .from("workspace_members")
        .insert({
          workspace_id: workspace.id,
          user_id: user?.id,
          role: "owner",
          invited_by: user?.id,
        });

      if (memberError) throw memberError;

      onCreated(workspace);
      setName("");
      setDescription("");
    } catch (error: any) {
      console.error("Error creating workspace:", error);
      toast.error(error.message || "Failed to create workspace");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-gradient-to-br from-card to-card/95 border-border/50">
        <DialogHeader>
          <DialogTitle className="text-2xl">Create New Workspace</DialogTitle>
          <DialogDescription>
            Set up a new team workspace to manage tasks and track performance
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Workspace Name *</Label>
            <Input
              id="name"
              placeholder="e.g., YouTube Team, Marketing Squad"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="bg-background/50"
            />
            <p className="text-xs text-muted-foreground">
              3-100 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="What is this workspace for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="bg-background/50 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            {loading ? "Creating..." : "Create Workspace"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
