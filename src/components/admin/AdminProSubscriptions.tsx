import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Crown, CheckCircle, XCircle, Clock, Eye, Search, 
  Users, DollarSign, RefreshCw, Ban, RotateCcw, UserPlus, Mail
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ProSubscription {
  id: string;
  user_id: string;
  plan_type: string;
  status: string;
  amount_paid: number;
  duration_days: number;
  starts_at: string | null;
  expires_at: string | null;
  payment_receipt_url: string | null;
  payment_notes: string | null;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  profiles?: {
    full_name: string | null;
    user_id: string;
  };
}

export const AdminProSubscriptions = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSubscription, setSelectedSubscription] = useState<ProSubscription | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [suspensionReason, setSuspensionReason] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDuration, setInviteDuration] = useState("30");
  const [invitePlanType, setInvitePlanType] = useState("pro");
  const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});

  // Fetch subscriptions
  const { data: subscriptions, isLoading } = useQuery({
    queryKey: ["admin-pro-subscriptions"],
    queryFn: async () => {
      const { data: subs, error: subsError } = await supabase
        .from("pro_subscriptions")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (subsError) throw subsError;
      
      const userIds = [...new Set((subs || []).map(s => s.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      
      return (subs || []).map(sub => ({
        ...sub,
        profiles: profileMap.get(sub.user_id) || null,
      })) as ProSubscription[];
    },
  });

  // Fetch user emails for display
  useEffect(() => {
    const fetchEmails = async () => {
      if (!subscriptions?.length) return;
      const userIds = [...new Set(subscriptions.map(s => s.user_id))];
      
      try {
        const { data } = await supabase.functions.invoke("admin-user-lookup", {
          body: { action: "get_bulk_emails", user_id: userIds },
        });
        if (data?.emails) {
          setUserEmails(data.emails);
        }
      } catch (error) {
        console.error("Failed to fetch emails:", error);
      }
    };
    fetchEmails();
  }, [subscriptions]);

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ["admin-pro-stats"],
    queryFn: async () => {
      const [pending, active, suspended, revenue] = await Promise.all([
        supabase.from("pro_subscriptions").select("id", { count: 'exact' }).eq("status", "pending"),
        supabase.from("pro_subscriptions").select("id", { count: 'exact' }).eq("status", "active"),
        supabase.from("pro_subscriptions").select("id", { count: 'exact' }).eq("status", "suspended"),
        supabase.from("pro_subscriptions").select("amount_paid").eq("status", "active"),
      ]);
      
      const totalRevenue = (revenue.data || []).reduce((sum, s) => sum + Number(s.amount_paid), 0);
      
      return {
        pending: pending.count || 0,
        active: active.count || 0,
        suspended: suspended.count || 0,
        revenue: totalRevenue,
      };
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { data, error } = await supabase.rpc('approve_pro_subscription', {
        p_subscription_id: subscriptionId,
        p_admin_id: user?.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Subscription approved! User received 50 bonus credits.`);
      queryClient.invalidateQueries({ queryKey: ["admin-pro-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pro-stats"] });
    },
    onError: (error) => {
      toast.error("Failed to approve subscription");
      console.error(error);
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ subscriptionId, reason }: { subscriptionId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('reject_pro_subscription', {
        p_subscription_id: subscriptionId,
        p_admin_user_id: user?.id,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Subscription rejected");
      queryClient.invalidateQueries({ queryKey: ["admin-pro-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pro-stats"] });
      setRejectDialogOpen(false);
      setSelectedSubscription(null);
      setRejectionReason("");
    },
    onError: (error) => {
      toast.error("Failed to reject subscription");
      console.error(error);
    },
  });

  // Suspend mutation
  const suspendMutation = useMutation({
    mutationFn: async ({ subscriptionId, reason }: { subscriptionId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('suspend_pro_subscription', {
        p_subscription_id: subscriptionId,
        p_admin_user_id: user?.id,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Subscription suspended");
      queryClient.invalidateQueries({ queryKey: ["admin-pro-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pro-stats"] });
      setSuspendDialogOpen(false);
      setSelectedSubscription(null);
      setSuspensionReason("");
    },
    onError: (error) => {
      toast.error("Failed to suspend subscription");
      console.error(error);
    },
  });

  // Unsuspend mutation
  const unsuspendMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { data, error } = await supabase.rpc('unsuspend_pro_subscription', {
        p_subscription_id: subscriptionId,
        p_admin_user_id: user?.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Subscription restored");
      queryClient.invalidateQueries({ queryKey: ["admin-pro-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pro-stats"] });
    },
    onError: (error) => {
      toast.error("Failed to restore subscription");
      console.error(error);
    },
  });

  // Reset to free mutation
  const resetMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await supabase.rpc('reset_user_to_free', {
        p_admin_user_id: user?.id,
        p_target_user_id: targetUserId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("User reset to Free tier");
      queryClient.invalidateQueries({ queryKey: ["admin-pro-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pro-stats"] });
    },
    onError: (error) => {
      toast.error("Failed to reset user");
      console.error(error);
    },
  });

  // Invite by email mutation
  const inviteMutation = useMutation({
    mutationFn: async ({ email, duration, planType }: { email: string; duration: number; planType: string }) => {
      // First lookup user by email
      const { data: userData, error: lookupError } = await supabase.functions.invoke("admin-user-lookup", {
        body: { action: "get_user_by_email", email },
      });
      
      if (lookupError || userData?.error) {
        throw new Error(userData?.error || "User not found");
      }
      
      // Then create subscription with plan type
      const { data, error } = await supabase.rpc('admin_create_pro_subscription', {
        p_admin_user_id: user?.id,
        p_target_user_id: userData.user_id,
        p_duration_days: duration,
        p_notes: `Invited by admin via email: ${email}`,
        p_plan_type: planType,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("User invited to Pro Plan successfully!");
      queryClient.invalidateQueries({ queryKey: ["admin-pro-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pro-stats"] });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteDuration("30");
      setInvitePlanType("pro");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to invite user");
      console.error(error);
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-amber-500 border-amber-500"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'active':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
      case 'expired':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Expired</Badge>;
      case 'suspended':
        return <Badge variant="destructive"><Ban className="h-3 w-3 mr-1" />Suspended</Badge>;
      case 'cancelled':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredSubscriptions = subscriptions?.filter(sub => {
    if (!searchQuery) return true;
    const name = (sub.profiles as any)?.full_name?.toLowerCase() || '';
    const email = userEmails[sub.user_id]?.toLowerCase() || '';
    return name.includes(searchQuery.toLowerCase()) || 
           email.includes(searchQuery.toLowerCase()) || 
           sub.id.includes(searchQuery);
  });

  const pendingSubscriptions = filteredSubscriptions?.filter(s => s.status === 'pending') || [];
  const activeSubscriptions = filteredSubscriptions?.filter(s => s.status === 'active') || [];
  const suspendedSubscriptions = filteredSubscriptions?.filter(s => s.status === 'suspended') || [];
  const allSubscriptions = filteredSubscriptions || [];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats?.pending || 0}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Crown className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats?.active || 0}</div>
                <div className="text-xs text-muted-foreground">Active Pro</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                <Ban className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats?.suspended || 0}</div>
                <div className="text-xs text-muted-foreground">Suspended</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats?.revenue?.toLocaleString() || 0}</div>
                <div className="text-xs text-muted-foreground">Revenue (MMK)</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions Row */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setInviteDialogOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite User to Pro
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending" className="gap-1">
            Pending
            {pendingSubscriptions.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 text-xs">
                {pendingSubscriptions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="suspended">Suspended</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <SubscriptionTable 
            subscriptions={pendingSubscriptions}
            userEmails={userEmails}
            onApprove={(sub) => approveMutation.mutate(sub.id)}
            onReject={(sub) => { setSelectedSubscription(sub); setRejectDialogOpen(true); }}
            onViewReceipt={(url) => setViewReceiptUrl(url)}
            getStatusBadge={getStatusBadge}
            showActions="pending"
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="active">
          <SubscriptionTable 
            subscriptions={activeSubscriptions}
            userEmails={userEmails}
            onSuspend={(sub) => { setSelectedSubscription(sub); setSuspendDialogOpen(true); }}
            onReset={(sub) => resetMutation.mutate(sub.user_id)}
            onViewReceipt={(url) => setViewReceiptUrl(url)}
            getStatusBadge={getStatusBadge}
            showActions="active"
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="suspended">
          <SubscriptionTable 
            subscriptions={suspendedSubscriptions}
            userEmails={userEmails}
            onUnsuspend={(sub) => unsuspendMutation.mutate(sub.id)}
            onViewReceipt={(url) => setViewReceiptUrl(url)}
            getStatusBadge={getStatusBadge}
            showActions="suspended"
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="all">
          <SubscriptionTable 
            subscriptions={allSubscriptions}
            userEmails={userEmails}
            onViewReceipt={(url) => setViewReceiptUrl(url)}
            getStatusBadge={getStatusBadge}
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Subscription</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejection (optional).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => selectedSubscription && rejectMutation.mutate({ subscriptionId: selectedSubscription.id, reason: rejectionReason })}
              disabled={rejectMutation.isPending}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend Subscription</DialogTitle>
            <DialogDescription>
              This will suspend the user's Pro access. They will be notified.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for suspension..."
            value={suspensionReason}
            onChange={(e) => setSuspensionReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => selectedSubscription && suspendMutation.mutate({ subscriptionId: selectedSubscription.id, reason: suspensionReason })}
              disabled={suspendMutation.isPending}
            >
              <Ban className="h-4 w-4 mr-2" />
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User to Pro Plan</DialogTitle>
            <DialogDescription>
              Grant Pro or Pro+ Plan access to a user by their email. They will receive 50 bonus credits.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">User Email</label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Plan Type</label>
              <Select value={invitePlanType} onValueChange={setInvitePlanType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pro">Pro Plan (5 daily + 10 w/API)</SelectItem>
                  <SelectItem value="pro_plus">Pro+ Plan (10 daily, Unlimited w/API)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Duration</label>
              <Select value={inviteDuration} onValueChange={setInviteDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => inviteMutation.mutate({ email: inviteEmail, duration: parseInt(inviteDuration), planType: invitePlanType })}
              disabled={inviteMutation.isPending || !inviteEmail}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Receipt Dialog */}
      <Dialog open={!!viewReceiptUrl} onOpenChange={() => setViewReceiptUrl(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
          </DialogHeader>
          {viewReceiptUrl && (
            <img 
              src={viewReceiptUrl} 
              alt="Payment receipt" 
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface SubscriptionTableProps {
  subscriptions: ProSubscription[];
  userEmails: Record<string, string>;
  onApprove?: (sub: ProSubscription) => void;
  onReject?: (sub: ProSubscription) => void;
  onSuspend?: (sub: ProSubscription) => void;
  onUnsuspend?: (sub: ProSubscription) => void;
  onReset?: (sub: ProSubscription) => void;
  onViewReceipt: (url: string) => void;
  getStatusBadge: (status: string) => React.ReactNode;
  showActions?: "pending" | "active" | "suspended";
  isLoading?: boolean;
}

const SubscriptionTable = ({ 
  subscriptions, 
  userEmails,
  onApprove, 
  onReject,
  onSuspend,
  onUnsuspend,
  onReset,
  onViewReceipt,
  getStatusBadge,
  showActions,
  isLoading
}: SubscriptionTableProps) => {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 space-y-3">
          <div className="h-4 w-3/4 mx-auto rounded bg-muted/30 animate-pulse" />
          <div className="h-4 w-1/2 mx-auto rounded bg-muted/30 animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No subscriptions found
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Receipt</TableHead>
              {showActions && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {subscriptions.map((sub) => (
              <TableRow key={sub.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {((sub.profiles as any)?.full_name || 'U').charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">
                      {(sub.profiles as any)?.full_name || 'Unknown'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    {userEmails[sub.user_id] || 'Loading...'}
                  </div>
                </TableCell>
                <TableCell>{Number(sub.amount_paid).toLocaleString()} MMK</TableCell>
                <TableCell>{sub.duration_days} days</TableCell>
                <TableCell>{getStatusBadge(sub.status)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(sub.created_at), 'MMM dd, yyyy')}
                </TableCell>
                <TableCell>
                  {sub.payment_receipt_url && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => onViewReceipt(sub.payment_receipt_url!)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
                {showActions === "pending" && (
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => onApprove?.(sub)}
                        className="gap-1"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => onReject?.(sub)}
                        className="gap-1"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                )}
                {showActions === "active" && (
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => onSuspend?.(sub)}
                        className="gap-1"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Suspend
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => onReset?.(sub)}
                        className="gap-1 text-destructive"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset
                      </Button>
                    </div>
                  </TableCell>
                )}
                {showActions === "suspended" && (
                  <TableCell>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => onUnsuspend?.(sub)}
                      className="gap-1"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Restore
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
