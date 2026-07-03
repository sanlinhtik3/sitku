import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLoginHistory } from "@/hooks/useLoginHistory";
import { useCourseProgress } from "@/hooks/useCourseProgress";
import { DeviceSessionCard } from "./DeviceSessionCard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { 
  User, 
  BookOpen, 
  CreditCard, 
  Shield, 
  Crown, 
  Calendar, 
  Mail,
  Clock,
  Ban,
  ShieldCheck,
  Save,
  MapPin,
  Monitor,
  Coins,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Check,
  X
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  is_banned: boolean;
  banned_at: string | null;
  banned_by: string | null;
}

interface AdminUserDetailDialogProps {
  user: UserProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserUpdate: () => void;
}

interface UserEmail {
  email: string;
  email_confirmed_at: string | null;
}

export function AdminUserDetailDialog({ 
  user, 
  open, 
  onOpenChange,
  onUserUpdate 
}: AdminUserDetailDialogProps) {
  const { user: currentUser } = useAuth();
  const [editedName, setEditedName] = useState("");
  const [saving, setSaving] = useState(false);
  const [userRole, setUserRole] = useState<string>("learner");
  const [premiumStatus, setPremiumStatus] = useState<{
    isPremium: boolean;
    expiresAt: string | null;
    daysRemaining: number | null;
  }>({ isPremium: false, expiresAt: null, daysRemaining: null });
  
  const queryClient = useQueryClient();

  // Fetch user email using edge function
  const { data: userEmailData, isLoading: emailLoading, error: emailError } = useQuery({
    queryKey: ['user-email-admin', user?.user_id],
    queryFn: async () => {
      if (!user) return null;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('get-admin-user-details', {
        body: { user_id: user.user_id }
      });

      if (error) throw error;
      return data as UserEmail;
    },
    enabled: !!user
  });

  // Fetch 2FA status
  const { data: user2FAStatus } = useQuery({
    queryKey: ['user-2fa', user?.user_id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('user_2fa')
        .select('is_enabled, enabled_at')
        .eq('user_id', user.user_id)
        .maybeSingle();
      return data;
    },
    enabled: !!user
  });

  // Fetch user credits
  const { data: userCredits } = useQuery({
    queryKey: ['user-credits-admin', user?.user_id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('user_credits')
        .select('balance, total_earned, total_spent, trial_credits_used')
        .eq('user_id', user.user_id)
        .maybeSingle();
      return data;
    },
    enabled: !!user
  });

  // Fetch credit transactions
  const { data: creditTransactions = [] } = useQuery({
    queryKey: ['credit-transactions-admin', user?.user_id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', user.user_id)
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!user
  });

  // Fetch credit orders
  const { data: creditOrders = [] } = useQuery({
    queryKey: ['credit-orders-admin', user?.user_id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('credit_orders')
        .select('*, credit_plans(name, credits)')
        .eq('user_id', user.user_id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user
  });

  // Fetch AI content stats
  const { data: aiContentStats } = useQuery({
    queryKey: ['ai-content-admin', user?.user_id],
    queryFn: async () => {
      if (!user) return { content: [], totalCount: 0 };
      const { data, count } = await supabase
        .from('ai_generated_content')
        .select('*', { count: 'exact' })
        .eq('user_id', user.user_id)
        .order('created_at', { ascending: false })
        .limit(10);
      return { content: data || [], totalCount: count || 0 };
    },
    enabled: !!user
  });

  const { data: loginHistory } = useLoginHistory(userEmailData?.email || undefined);
  const { data: courseProgress } = useCourseProgress(user?.user_id);

  // Fetch user sessions
  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['user-sessions', user?.user_id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', user.user_id)
        .order('last_activity', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  // Fetch enrollment transactions
  const { data: enrollmentTransactions = [] } = useQuery({
    queryKey: ['enrollment-transactions', user?.user_id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('enrollments')
        .select('*, courses(title, thumbnail_url)')
        .eq('user_id', user.user_id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user
  });

  const logoutSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data: { user: currentAuthUser } } = await supabase.auth.getUser();
      if (!currentAuthUser) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('admin_logout_user_session', {
        p_session_id: sessionId,
        p_admin_user_id: currentAuthUser.id
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Session ended successfully');
      queryClient.invalidateQueries({ queryKey: ['user-sessions', user?.user_id] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to end session');
    }
  });

  const activeSessions = sessions.filter(s => s.is_active);
  const activeSessionsCount = activeSessions.length;

  useEffect(() => {
    if (user) {
      setEditedName(user.full_name || "");
      fetchUserRole();
      fetchPremiumStatus();
    }
  }, [user]);

  const fetchUserRole = async () => {
    if (!user) return;

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.user_id)
      .single();

    if (data) {
      setUserRole(data.role);
    }
  };

  const fetchPremiumStatus = async () => {
    if (!user) return;

    const { data } = await supabase
      .from("enrollments")
      .select("access_expires_at")
      .eq("user_id", user.user_id)
      .eq("status", "approved")
      .eq("is_expired", false)
      .order("access_expires_at", { ascending: false })
      .limit(1);

    if (data && data.length > 0 && data[0].access_expires_at) {
      const expiresAt = data[0].access_expires_at;
      const daysRemaining = differenceInDays(new Date(expiresAt), new Date());
      
      setPremiumStatus({
        isPremium: true,
        expiresAt,
        daysRemaining: Math.max(0, daysRemaining)
      });
    } else {
      setPremiumStatus({ isPremium: false, expiresAt: null, daysRemaining: null });
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: editedName })
      .eq("user_id", user.user_id);

    if (error) {
      toast.error("Failed to update profile");
    } else {
      toast.success("Profile updated successfully");
      onUserUpdate();
    }
    setSaving(false);
  };

  const handleBanUser = async () => {
    if (!user || !currentUser) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        is_banned: true,
        banned_at: new Date().toISOString(),
        banned_by: currentUser.id
      })
      .eq("user_id", user.user_id);

    if (error) {
      toast.error("Failed to ban user");
      return;
    }

    await supabase
      .from("notifications")
      .insert({
        user_id: user.user_id,
        type: "ban",
        title: "Account Banned",
        message: "Your account has been banned by an administrator."
      });

    toast.success("User has been banned");
    onUserUpdate();
    onOpenChange(false);
  };

  const handleUnbanUser = async () => {
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        is_banned: false,
        banned_at: null,
        banned_by: null
      })
      .eq("user_id", user.user_id);

    if (error) {
      toast.error("Failed to unban user");
      return;
    }

    await supabase
      .from("notifications")
      .insert({
        user_id: user.user_id,
        type: "unban",
        title: "Account Unbanned",
        message: "Your account has been unbanned. You can now access all features."
      });

    toast.success("User has been unbanned");
    onUserUpdate();
    onOpenChange(false);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.avatar_url || undefined} />
              <AvatarFallback className="text-xl">
                {user.full_name?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <DialogTitle className="text-2xl">{user.full_name || "No Name"}</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={userRole === "admin" ? "default" : "outline"}>
                  {userRole === "admin" ? "Admin" : "Learner"}
                </Badge>
                {premiumStatus.isPremium ? (
                  <Badge className="bg-gradient-to-r from-yellow-500 to-amber-500">
                    <Crown className="h-3 w-3 mr-1" />
                    Premium
                  </Badge>
                ) : (
                  <Badge variant="secondary">Free</Badge>
                )}
                {user.is_banned && (
                  <Badge variant="destructive">Banned</Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="profile">
              <User className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="sessions">
              <Monitor className="h-4 w-4 mr-2" />
              Sessions
              {activeSessionsCount > 0 && (
                <Badge className="ml-2" variant="secondary">{activeSessionsCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="courses">
              <BookOpen className="h-4 w-4 mr-2" />
              Courses
            </TabsTrigger>
            <TabsTrigger value="credits">
              <Coins className="h-4 w-4 mr-2" />
              Credits
            </TabsTrigger>
            <TabsTrigger value="transactions">
              <CreditCard className="h-4 w-4 mr-2" />
              Enrollments
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="h-4 w-4 mr-2" />
              Security
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[calc(90vh-250px)] mt-4">
            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-4">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">Full Name</Label>
                      <Input
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        placeholder="Enter full name"
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Email</Label>
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {emailLoading ? <span className="inline-block h-3 w-24 rounded bg-muted/30 animate-pulse align-middle" /> : 
                           emailError ? "Error loading email" :
                           userEmailData?.email || "No email found"}
                        </span>
                        {userEmailData?.email_confirmed_at ? (
                          <Badge variant="outline" className="ml-auto bg-green-500/10 text-green-600 border-green-500/20">
                            <Check className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        ) : userEmailData?.email ? (
                          <Badge variant="destructive" className="ml-auto">
                            <X className="h-3 w-3 mr-1" />
                            Not Verified
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">User ID</Label>
                      <p className="text-sm font-mono p-2 bg-muted/50 rounded-md">{user.user_id.substring(0, 24)}...</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Joined Date</Label>
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{format(new Date(user.created_at), "PPP")}</span>
                      </div>
                    </div>
                  </div>

                  {premiumStatus.isPremium && premiumStatus.expiresAt && (
                    <div className="p-4 bg-gradient-to-r from-yellow-500/10 to-amber-500/10 rounded-lg border border-yellow-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Crown className="h-5 w-5 text-yellow-500" />
                        <h3 className="font-semibold">Premium Access</h3>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Expires on: {format(new Date(premiumStatus.expiresAt), "PPP")}</span>
                          <span className="font-semibold">{premiumStatus.daysRemaining} days remaining</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Content Summary */}
                  <div className="p-4 bg-muted/50 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-purple-500" />
                          AI Content Generated
                        </h4>
                        <p className="text-2xl font-bold mt-1">{aiContentStats?.totalCount || 0}</p>
                        <p className="text-sm text-muted-foreground">Total content pieces</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Recent activity</p>
                        {aiContentStats?.content && aiContentStats.content.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Last: {format(new Date(aiContentStats.content[0].created_at), "PPP")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button onClick={handleSaveProfile} disabled={saving}>
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Admin Actions */}
              {currentUser?.id !== user.user_id && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-4">Admin Actions</h3>
                    <div className="flex gap-2">
                      {user.is_banned ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline">
                              <ShieldCheck className="h-4 w-4 mr-2" />
                              Unban User
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Unban User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to unban {user.full_name || "this user"}? 
                                They will regain full access to the platform.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={handleUnbanUser}>
                                Unban
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive">
                              <Ban className="h-4 w-4 mr-2" />
                              Ban User
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Ban User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to ban {user.full_name || "this user"}? 
                                This will restrict their access to the platform.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={handleBanUser}>
                                Ban
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Sessions Tab */}
            <TabsContent value="sessions" className="space-y-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="mb-6">
                    <h3 className="font-semibold text-lg">Active Sessions</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {activeSessionsCount} active session{activeSessionsCount !== 1 ? 's' : ''} • {sessions.length} total
                    </p>
                  </div>
                  
                  {sessionsLoading ? (
                    <div className="text-center py-8">
                      <Monitor className="h-12 w-12 mx-auto text-muted-foreground mb-3 animate-pulse" />
                      <p className="text-muted-foreground">Loading sessions...</p>
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="text-center py-8">
                      <Monitor className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">No sessions found</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {sessions.map((session) => (
                        <DeviceSessionCard
                          key={session.id}
                          session={session}
                          onLogout={logoutSessionMutation.mutate}
                          isLoading={logoutSessionMutation.isPending}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Courses Tab */}
            <TabsContent value="courses" className="space-y-4">
              {courseProgress && courseProgress.length > 0 ? (
                courseProgress.map((course) => (
                  <Card key={course.course_id}>
                    <CardContent className="pt-6">
                      <div className="flex gap-4">
                        {course.course_thumbnail && (
                          <img 
                            src={course.course_thumbnail} 
                            alt={course.course_title}
                            className="w-24 h-24 object-cover rounded-lg"
                          />
                        )}
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-2">{course.course_title}</h3>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                {course.completed_lessons} / {course.total_lessons} lessons completed
                              </span>
                              <span className="font-semibold">{course.progress_percentage}%</span>
                            </div>
                            <Progress value={course.progress_percentage} className="h-2" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    No enrolled courses found
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Credits Tab */}
            <TabsContent value="credits" className="space-y-4">
              {/* Credit Balance Card */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Coins className="h-5 w-5 text-yellow-500" />
                    Credit Balance
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/10 rounded-lg border border-blue-500/20">
                      <p className="text-sm text-muted-foreground mb-1">Current Balance</p>
                      <p className="text-3xl font-bold text-blue-600">{userCredits?.balance || 0}</p>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/10 rounded-lg border border-green-500/20">
                      <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        Total Earned
                      </p>
                      <p className="text-3xl font-bold text-green-600">{userCredits?.total_earned || 0}</p>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-red-500/10 to-red-600/10 rounded-lg border border-red-500/20">
                      <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                        <TrendingDown className="h-3 w-3" />
                        Total Spent
                      </p>
                      <p className="text-3xl font-bold text-red-600">{userCredits?.total_spent || 0}</p>
                    </div>
                  </div>
                  {userCredits?.trial_credits_used && (
                    <p className="text-sm text-muted-foreground mt-4 p-2 bg-muted/50 rounded">
                      Trial credits have been used
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Credit Transaction History */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-lg mb-4">Transaction History</h3>
                  {creditTransactions.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Credits</TableHead>
                          <TableHead>Balance After</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {creditTransactions.map((transaction) => (
                          <TableRow key={transaction.id}>
                            <TableCell className="text-sm">
                              {format(new Date(transaction.created_at), "PPp")}
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                transaction.transaction_type === 'purchase' ? 'default' :
                                transaction.transaction_type === 'usage' ? 'secondary' :
                                'outline'
                              }>
                                {transaction.transaction_type}
                              </Badge>
                            </TableCell>
                            <TableCell className={transaction.credits > 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                              {transaction.credits > 0 ? '+' : ''}{transaction.credits}
                            </TableCell>
                            <TableCell className="font-semibold">{transaction.balance_after}</TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                              {transaction.description}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No transactions found</p>
                  )}
                </CardContent>
              </Card>

              {/* Credit Purchase History */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-lg mb-4">Purchase History</h3>
                  {creditOrders.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Credits</TableHead>
                          <TableHead>Amount Paid</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {creditOrders.map((order: any) => (
                          <TableRow key={order.id}>
                            <TableCell className="text-sm">
                              {format(new Date(order.created_at), "PPp")}
                            </TableCell>
                            <TableCell className="font-medium">
                              {order.credit_plans?.name || 'N/A'}
                            </TableCell>
                            <TableCell className="font-semibold">{order.credits_purchased}</TableCell>
                            <TableCell>${order.amount_paid}</TableCell>
                            <TableCell>
                              <Badge variant={
                                order.status === 'completed' ? 'default' :
                                order.status === 'pending' ? 'secondary' :
                                'destructive'
                              }>
                                {order.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No purchase orders found</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Enrollment Transactions Tab */}
            <TabsContent value="transactions">
              {enrollmentTransactions.length > 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold text-lg mb-4">Enrollment History</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Course</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Expires</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {enrollmentTransactions.map((enrollment: any) => (
                          <TableRow key={enrollment.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {enrollment.courses?.thumbnail_url && (
                                  <img 
                                    src={enrollment.courses.thumbnail_url} 
                                    alt={enrollment.courses.title}
                                    className="w-10 h-10 rounded object-cover"
                                  />
                                )}
                                <span className="font-medium">{enrollment.courses?.title || 'N/A'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {format(new Date(enrollment.created_at), "PPp")}
                            </TableCell>
                            <TableCell className="font-semibold">${enrollment.final_price || 0}</TableCell>
                            <TableCell>
                              <Badge variant={
                                enrollment.status === 'approved' ? 'default' :
                                enrollment.status === 'pending' ? 'secondary' :
                                'destructive'
                              }>
                                {enrollment.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {enrollment.access_expires_at ? 
                                format(new Date(enrollment.access_expires_at), "PPP") : 
                                'N/A'
                              }
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    No enrollment transactions found
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-4">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div>
                    <h3 className="font-semibold mb-4">Account Security</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Email Verification</Label>
                        <p className="mt-1">
                          {userEmailData?.email_confirmed_at ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                              <Check className="h-3 w-3 mr-1" />
                              Verified on {format(new Date(userEmailData.email_confirmed_at), "PPP")}
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <X className="h-3 w-3 mr-1" />
                              Not Verified
                            </Badge>
                          )}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Two-Factor Authentication</Label>
                        <p className="mt-1">
                          {user2FAStatus?.is_enabled ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              Enabled on {format(new Date(user2FAStatus.enabled_at), "PPP")}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Not Enabled</Badge>
                          )}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Account Status</Label>
                        <p className="mt-1">
                          {user.is_banned ? (
                            <Badge variant="destructive">Banned</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {user.is_banned && user.banned_at && (
                    <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                      <h4 className="font-semibold text-destructive mb-2">Ban Information</h4>
                      <p className="text-sm">
                        Banned on: {format(new Date(user.banned_at), "PPP 'at' p")}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4">Recent Login History</h3>
                  {loginHistory && loginHistory.length > 0 ? (
                    <div className="space-y-3">
                      {loginHistory.slice(0, 10).map((attempt) => (
                        <div key={attempt.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Monitor className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">
                                {format(new Date(attempt.attempt_time), "PPP 'at' p")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {attempt.ip_address} • {attempt.user_agent?.substring(0, 40)}...
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline">
                            {attempt.attempt_type}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No login history available
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
