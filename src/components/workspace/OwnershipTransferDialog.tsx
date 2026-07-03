import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowRightLeft, Crown, Shield, AlertTriangle } from "lucide-react";

interface Member {
  user_id: string;
  role: string;
  profile?: {
    full_name: string | null;
    avatar_url: string | null;
    email: string | null;
  };
}

interface OwnershipTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceName: string;
  members: Member[];
}

export function OwnershipTransferDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceName,
  members,
}: OwnershipTransferDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [step, setStep] = useState<'select' | 'confirm'>('select');
  const queryClient = useQueryClient();

  const adminMembers = members.filter(m => m.role === 'admin');
  const selectedMember = members.find(m => m.user_id === selectedUserId);

  const transferMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('initiate_ownership_transfer', {
        p_workspace_id: workspaceId,
        p_to_user_id: selectedUserId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success('Transfer request sent', {
        description: `Waiting for ${selectedMember?.profile?.full_name} to accept`,
      });
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      onOpenChange(false);
      setStep('select');
      setSelectedUserId('');
    },
    onError: (error) => {
      toast.error('Failed to initiate transfer', {
        description: error.message,
      });
    },
  });

  const handleClose = () => {
    onOpenChange(false);
    setStep('select');
    setSelectedUserId('');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Transfer Ownership
          </DialogTitle>
          <DialogDescription>
            {step === 'select' 
              ? 'Select an admin to transfer workspace ownership to'
              : 'Confirm the ownership transfer'
            }
          </DialogDescription>
        </DialogHeader>

        {step === 'select' ? (
          <>
            {adminMembers.length === 0 ? (
              <div className="py-6 text-center">
                <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No admin members available. Promote a member to admin first.
                </p>
              </div>
            ) : (
              <RadioGroup value={selectedUserId} onValueChange={setSelectedUserId}>
                <div className="space-y-2">
                  {adminMembers.map((member) => (
                    <div
                      key={member.user_id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedUserId === member.user_id 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedUserId(member.user_id)}
                    >
                      <RadioGroupItem value={member.user_id} id={member.user_id} />
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.profile?.avatar_url || undefined} />
                        <AvatarFallback>
                          {member.profile?.full_name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <Label htmlFor={member.user_id} className="font-medium cursor-pointer">
                          {member.profile?.full_name || 'Unknown'}
                        </Label>
                        <p className="text-xs text-muted-foreground truncate">
                          {member.profile?.email}
                        </p>
                      </div>
                      <Shield className="h-4 w-4 text-blue-400" />
                    </div>
                  ))}
                </div>
              </RadioGroup>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button 
                onClick={() => setStep('confirm')} 
                disabled={!selectedUserId}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="py-4">
              <div className="flex items-center justify-center gap-4 mb-6">
                <div className="text-center">
                  <Crown className="h-8 w-8 mx-auto text-amber-400 mb-1" />
                  <p className="text-xs text-muted-foreground">You</p>
                </div>
                <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
                <div className="text-center">
                  <Avatar className="h-10 w-10 mx-auto mb-1">
                    <AvatarImage src={selectedMember?.profile?.avatar_url || undefined} />
                    <AvatarFallback>
                      {selectedMember?.profile?.full_name?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-xs text-muted-foreground">
                    {selectedMember?.profile?.full_name}
                  </p>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-500">Important</p>
                    <ul className="text-muted-foreground mt-1 space-y-1">
                      <li>• {selectedMember?.profile?.full_name} will become the new owner</li>
                      <li>• You will be demoted to admin</li>
                      <li>• They must accept the transfer request</li>
                      <li>• This action can be reversed by the new owner</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select')}>Back</Button>
              <Button 
                onClick={() => transferMutation.mutate()}
                disabled={transferMutation.isPending}
                className="bg-amber-500 hover:bg-amber-600"
              >
                {transferMutation.isPending ? 'Sending...' : 'Send Transfer Request'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
