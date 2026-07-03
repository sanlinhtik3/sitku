import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Gift, Send, Search, History, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

interface User {
  user_id: string;
  full_name: string | null;
  email?: string;
  current_balance?: number;
}

interface TransactionHistory {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  credits: number;
  description: string;
  balance_after: number;
  created_at: string;
}

export const AdminTestingCredits = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isGrantDialogOpen, setIsGrantDialogOpen] = useState(false);
  const [isBulkGrantDialogOpen, setIsBulkGrantDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [credits, setCredits] = useState("");
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("users");

  const { data: users, isLoading } = useQuery({
    queryKey: ["all-users-with-credits"],
    queryFn: async () => {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name");
      
      if (profilesError) throw profilesError;

      const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
      const authUsers = authData?.users || [];
      
      const { data: creditsData, error: creditsError } = await supabase
        .from("user_credits")
        .select("user_id, balance");

      if (creditsError) throw creditsError;

      return profilesData.map(profile => {
        const authUser = authUsers.find(u => u.id === profile.user_id);
        const userCredit = creditsData?.find(c => c.user_id === profile.user_id);
        
        return {
          user_id: profile.user_id,
          full_name: profile.full_name,
          email: authUser?.email,
          current_balance: userCredit?.balance || 0,
        } as User;
      });
    },
  });

  const { data: transactionHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["testing-credit-transactions"],
    queryFn: async () => {
      const { data: transactions, error: transError } = await supabase
        .from("credit_transactions")
        .select("id, user_id, credits, description, balance_after, created_at")
        .eq("transaction_type", "testing")
        .order("created_at", { ascending: false });

      if (transError) throw transError;

      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, full_name");

      const { data: authData } = await supabase.auth.admin.listUsers();
      const authUsers = authData?.users || [];

      return transactions.map(trans => {
        const profile = profilesData?.find(p => p.user_id === trans.user_id);
        const authUser = authUsers.find(u => u.id === trans.user_id);
        
        return {
          id: trans.id,
          user_id: trans.user_id,
          user_name: profile?.full_name || "Unknown User",
          user_email: authUser?.email || "No email",
          credits: trans.credits,
          description: trans.description || "",
          balance_after: trans.balance_after,
          created_at: trans.created_at,
        } as TransactionHistory;
      });
    },
    enabled: activeTab === "history",
  });

  const handleOpenGrantDialog = (user: User) => {
    setSelectedUser(user);
    setIsGrantDialogOpen(true);
    setCredits("");
    setMessage("");
  };

  const handleOpenBulkGrantDialog = () => {
    if (selectedUsers.size === 0) {
      toast.error("Please select at least one user");
      return;
    }
    setIsBulkGrantDialogOpen(true);
    setCredits("");
    setMessage("");
  };

  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const toggleAllUsers = () => {
    if (selectedUsers.size === filteredUsers?.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers?.map(u => u.user_id) || []));
    }
  };

  const giveTestingCreditsMutation = useMutation({
    mutationFn: async ({
      userId,
      credits,
      message,
    }: {
      userId: string;
      credits: number;
      message: string;
    }) => {
      // Get current balance and total_earned
      const { data: currentCredits, error: fetchError } = await supabase
        .from("user_credits")
        .select("balance, total_earned")
        .eq("user_id", userId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      let newBalance: number;
      let newTotalEarned: number;

      if (!currentCredits) {
        // Create new user_credits record if it doesn't exist
        newBalance = credits;
        newTotalEarned = credits;

        const { error: insertError } = await supabase
          .from("user_credits")
          .insert({
            user_id: userId,
            balance: newBalance,
            total_earned: newTotalEarned,
            trial_credits_used: false,
          });

        if (insertError) throw insertError;
      } else {
        // Update existing record
        newBalance = currentCredits.balance + credits;
        newTotalEarned = currentCredits.total_earned + credits;

        const { error: updateError } = await supabase
          .from("user_credits")
          .update({
            balance: newBalance,
            total_earned: newTotalEarned,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        if (updateError) throw updateError;
      }

      // Insert transaction record
      const { error: transactionError } = await supabase
        .from("credit_transactions")
        .insert({
          user_id: userId,
          credits: credits,
          transaction_type: "testing",
          reference_type: "admin_grant",
          balance_after: newBalance,
          description: message || "Testing credits from admin",
        });

      if (transactionError) throw transactionError;

      // Create notification for user
      const { error: notificationError } = await supabase
        .from("notifications")
        .insert({
          user_id: userId,
          type: "credits_received",
          title: "Testing Credits Received",
          message: `You have received ${credits} testing credits. ${message}`,
        });

      if (notificationError) throw notificationError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-orders"] });
      queryClient.invalidateQueries({ queryKey: ["credit-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["all-users-with-credits"] });
      toast.success("Testing credits granted successfully");
      setIsGrantDialogOpen(false);
      setSelectedUser(null);
      setCredits("");
      setMessage("");
    },
    onError: (error) => {
      console.error("Error granting testing credits:", error);
      toast.error("Failed to grant testing credits");
    },
  });

  const handleSubmit = () => {
    if (!selectedUser || !credits || parseInt(credits) <= 0) {
      toast.error("Please enter a valid credit amount");
      return;
    }

    giveTestingCreditsMutation.mutate({
      userId: selectedUser.user_id,
      credits: parseInt(credits),
      message: message.trim(),
    });
  };

  const handleBulkSubmit = async () => {
    if (selectedUsers.size === 0 || !credits || parseInt(credits) <= 0) {
      toast.error("Please select users and enter a valid credit amount");
      return;
    }

    const creditAmount = parseInt(credits);
    const promises = Array.from(selectedUsers).map(userId =>
      giveTestingCreditsMutation.mutateAsync({
        userId,
        credits: creditAmount,
        message: message.trim(),
      })
    );

    try {
      await Promise.all(promises);
      toast.success(`Successfully granted ${creditAmount} credits to ${selectedUsers.size} users`);
      setIsBulkGrantDialogOpen(false);
      setSelectedUsers(new Set());
      setCredits("");
      setMessage("");
    } catch (error) {
      toast.error("Some credits failed to grant. Please check and try again.");
    }
  };

  const filteredUsers = users?.filter(user => 
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate statistics for transaction history
  const statistics = {
    totalCreditsGranted: transactionHistory?.reduce((sum, trans) => sum + trans.credits, 0) || 0,
    totalTransactions: transactionHistory?.length || 0,
    mostActiveUsers: transactionHistory
      ? Object.entries(
          transactionHistory.reduce((acc, trans) => {
            acc[trans.user_id] = {
              name: trans.user_name,
              email: trans.user_email,
              count: (acc[trans.user_id]?.count || 0) + 1,
              totalCredits: (acc[trans.user_id]?.totalCredits || 0) + trans.credits,
            };
            return acc;
          }, {} as Record<string, { name: string; email: string; count: number; totalCredits: number }>)
        )
          .sort((a, b) => b[1].totalCredits - a[1].totalCredits)
          .slice(0, 3)
      : [],
  };

  return (
    <>
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5" />
                Testing Credits
              </CardTitle>
              <CardDescription>Grant credits to users</CardDescription>
            </div>
            <Button onClick={() => setIsDialogOpen(true)} size="sm">
              <Gift className="h-4 w-4 mr-2" />
              Manage
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Main Dialog with Tabs */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Testing Credits Management</DialogTitle>
          </DialogHeader>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Users
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Transaction History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {selectedUsers.size > 0 && (
                  <Button onClick={handleOpenBulkGrantDialog}>
                    <Gift className="h-4 w-4 mr-2" />
                    Grant to {selectedUsers.size} Selected
                  </Button>
                )}
              </div>

              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedUsers.size === filteredUsers?.length && filteredUsers.length > 0}
                          onCheckedChange={toggleAllUsers}
                        />
                      </TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Current Balance</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Loading users...
                        </TableCell>
                      </TableRow>
                    ) : filteredUsers && filteredUsers.length > 0 ? (
                      filteredUsers.map((user) => (
                        <TableRow key={user.user_id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedUsers.has(user.user_id)}
                              onCheckedChange={() => toggleUserSelection(user.user_id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {user.full_name || "Unknown User"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {user.email || "No email"}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {user.current_balance?.toLocaleString()} credits
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenGrantDialog(user)}
                            >
                              <Gift className="h-4 w-4 mr-2" />
                              Grant
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              {/* Statistics Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-border/50 bg-card/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Credits Granted</p>
                        <p className="text-2xl font-bold">{statistics.totalCreditsGranted.toLocaleString()}</p>
                      </div>
                      <Gift className="h-8 w-8 text-accent" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Transactions</p>
                        <p className="text-2xl font-bold">{statistics.totalTransactions}</p>
                      </div>
                      <History className="h-8 w-8 text-accent" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/50">
                  <CardContent className="pt-6">
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Most Active Users</p>
                      {statistics.mostActiveUsers.length > 0 ? (
                        <div className="space-y-1">
                          {statistics.mostActiveUsers.map(([userId, data]) => (
                            <div key={userId} className="flex items-center justify-between text-xs">
                              <span className="font-medium truncate max-w-[120px]">{data.name}</span>
                              <span className="text-muted-foreground">{data.totalCredits} credits</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No data</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Credits</TableHead>
                      <TableHead className="text-right">Balance After</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingHistory ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          Loading transaction history...
                        </TableCell>
                      </TableRow>
                    ) : transactionHistory && transactionHistory.length > 0 ? (
                      transactionHistory.map((trans) => (
                        <TableRow key={trans.id}>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(trans.created_at), "MMM dd, yyyy HH:mm")}
                          </TableCell>
                          <TableCell className="font-medium">
                            {trans.user_name}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {trans.user_email}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            +{trans.credits}
                          </TableCell>
                          <TableCell className="text-right">
                            {trans.balance_after.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {trans.description}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No transaction history found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Grant Credits Dialog - Single User */}
      <Dialog open={isGrantDialogOpen} onOpenChange={setIsGrantDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Grant Testing Credits</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">User:</span>
                  <span className="text-sm font-medium">{selectedUser.full_name || "Unknown"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Email:</span>
                  <span className="text-sm">{selectedUser.email || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Current Balance:</span>
                  <span className="text-sm font-semibold">{selectedUser.current_balance} credits</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="credits">Credits Amount</Label>
                <Input
                  id="credits"
                  type="number"
                  min="1"
                  placeholder="Enter credit amount"
                  value={credits}
                  onChange={(e) => setCredits(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message/Reason</Label>
                <Textarea
                  id="message"
                  placeholder="Enter a message or reason for granting these credits..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                />
              </div>

              <Button
                onClick={handleSubmit}
                disabled={giveTestingCreditsMutation.isPending}
                className="w-full"
              >
                {giveTestingCreditsMutation.isPending ? (
                  "Processing..."
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Grant {credits || 0} Credits
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Grant Credits Dialog */}
      <Dialog open={isBulkGrantDialogOpen} onOpenChange={setIsBulkGrantDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Bulk Grant Testing Credits</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Selected Users:</span>
                <span className="text-sm font-semibold">{selectedUsers.size} users</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-credits">Credits Amount (per user)</Label>
              <Input
                id="bulk-credits"
                type="number"
                min="1"
                placeholder="Enter credit amount per user"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-message">Message/Reason</Label>
              <Textarea
                id="bulk-message"
                placeholder="Enter a message or reason for granting these credits..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
              />
            </div>

            <Button
              onClick={handleBulkSubmit}
              disabled={giveTestingCreditsMutation.isPending}
              className="w-full"
            >
              {giveTestingCreditsMutation.isPending ? (
                "Processing..."
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Grant {credits || 0} Credits to {selectedUsers.size} Users
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
