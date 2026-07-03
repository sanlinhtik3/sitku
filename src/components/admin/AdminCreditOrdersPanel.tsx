import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X, Eye, Clock, CheckCircle, XCircle, Info, DollarSign, TrendingUp, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

interface CreditOrder {
  id: string;
  user_id: string;
  credits_purchased: number;
  amount_paid: number;
  payment_receipt_url: string | null;
  payment_notes: string | null;
  status: string;
  submitted_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  credit_plans: { name: string } | null;
}

interface Profile {
  full_name: string | null;
  avatar_url: string | null;
}

export function AdminCreditOrdersPanel() {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<CreditOrder | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Fetch total count for pagination
  const { data: totalCount } = useQuery({
    queryKey: ["admin-credit-orders-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("credit_orders")
        .select("*", { count: "exact", head: true });

      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch paginated orders
  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-credit-orders", currentPage],
    queryFn: async () => {
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("credit_orders")
        .select(`
          *,
          credit_plans(name)
        `)
        .order("submitted_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      return data as CreditOrder[];
    },
  });

  // Fetch revenue statistics
  const { data: revenueStats } = useQuery({
    queryKey: ["admin-revenue-stats"],
    queryFn: async () => {
      const now = new Date();
      const todayStart = startOfDay(now);
      const yesterdayStart = startOfDay(subDays(now, 1));
      const yesterdayEnd = endOfDay(subDays(now, 1));
      const days7 = subDays(now, 7);
      const days30 = subDays(now, 30);
      const days90 = subDays(now, 90);

      // Fetch all completed orders
      const { data, error } = await supabase
        .from("credit_orders")
        .select("amount_paid, approved_at")
        .eq("status", "completed")
        .not("approved_at", "is", null);

      if (error) throw error;

      const calculateRevenue = (startDate: Date, endDate?: Date) => {
        return data
          .filter((order) => {
            const approvedDate = new Date(order.approved_at!);
            if (endDate) {
              return approvedDate >= startDate && approvedDate <= endDate;
            }
            return approvedDate >= startDate;
          })
          .reduce((sum, order) => sum + Number(order.amount_paid), 0);
      };

      return {
        today: calculateRevenue(todayStart),
        yesterday: calculateRevenue(yesterdayStart, yesterdayEnd),
        last7Days: calculateRevenue(days7),
        last30Days: calculateRevenue(days30),
        last90Days: calculateRevenue(days90),
      };
    },
  });

  // Fetch profiles separately
  const { data: profiles } = useQuery({
    queryKey: ["credit-order-profiles", orders?.map(o => o.user_id)],
    queryFn: async () => {
      if (!orders) return {};
      
      const userIds = [...new Set(orders.map(o => o.user_id))];
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);

      if (error) throw error;
      
      return data.reduce((acc, profile) => {
        acc[profile.user_id] = profile;
        return acc;
      }, {} as Record<string, { full_name: string | null; avatar_url: string | null }>);
    },
    enabled: !!orders && orders.length > 0,
  });

  const reviewOrderMutation = useMutation({
    mutationFn: async ({
      orderId,
      action,
      reason,
    }: {
      orderId: string;
      action: "approve" | "reject";
      reason?: string;
    }) => {
      const updateData: any = {
        status: action === "approve" ? "completed" : "rejected",
      };

      if (action === "reject" && reason) {
        updateData.rejection_reason = reason;
      }

      const { error } = await supabase
        .from("credit_orders")
        .update(updateData)
        .eq("id", orderId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-credit-orders"] });
      toast.success(
        variables.action === "approve"
          ? "Order approved successfully"
          : "Order rejected successfully"
      );
      setIsReviewDialogOpen(false);
      setSelectedOrder(null);
      setRejectionReason("");
      setReviewAction(null);
    },
    onError: (error) => {
      toast.error("Failed to process order");
      console.error(error);
    },
  });

  const handleReviewClick = (order: CreditOrder, action: "approve" | "reject", profile: Profile | null) => {
    setSelectedOrder(order);
    setSelectedProfile(profile);
    setReviewAction(action);
    setIsReviewDialogOpen(true);
  };

  const handleDetailClick = (order: CreditOrder, profile: Profile | null) => {
    setSelectedOrder(order);
    setSelectedProfile(profile);
    setIsDetailDialogOpen(true);
  };

  const handleConfirmReview = () => {
    if (!selectedOrder || !reviewAction) return;

    reviewOrderMutation.mutate({
      orderId: selectedOrder.id,
      action: reviewAction,
      reason: reviewAction === "reject" ? rejectionReason : undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
      case "completed":
        return <Badge className="gap-1 bg-green-500"><CheckCircle className="h-3 w-3" />Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingOrders = orders?.filter((o) => o.status === "pending") || [];
  const totalPages = Math.ceil((totalCount || 0) / pageSize);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-muted animate-pulse rounded-lg" />
        <div className="h-32 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Revenue Statistics */}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${revenueStats?.today.toFixed(2) || "0.00"}</div>
              <p className="text-xs text-muted-foreground">Revenue today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Yesterday</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${revenueStats?.yesterday.toFixed(2) || "0.00"}</div>
              <p className="text-xs text-muted-foreground">Previous day</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">7 Days</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${revenueStats?.last7Days.toFixed(2) || "0.00"}</div>
              <p className="text-xs text-muted-foreground">Last week</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">30 Days</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${revenueStats?.last30Days.toFixed(2) || "0.00"}</div>
              <p className="text-xs text-muted-foreground">Last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">90 Days</CardTitle>
              <TrendingUp className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${revenueStats?.last90Days.toFixed(2) || "0.00"}</div>
              <p className="text-xs text-muted-foreground">Last quarter</p>
            </CardContent>
          </Card>
        </div>

        {/* Order Statistics */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingOrders.length}</div>
              <p className="text-xs text-muted-foreground">Awaiting review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCount || 0}</div>
              <p className="text-xs text-muted-foreground">All time orders</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${revenueStats?.last90Days.toFixed(2) || "0.00"}</div>
              <p className="text-xs text-muted-foreground">Last 90 days</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Orders Section */}
        {pendingOrders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pending Orders</CardTitle>
              <CardDescription>Review and approve/reject credit purchase requests</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingOrders.map((order) => {
                const profile = profiles?.[order.user_id];
                return (
                  <div
                    key={order.id}
                    className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {profile?.full_name || "Unknown User"}
                        </span>
                        {getStatusBadge(order.status)}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Plan:</span>{" "}
                          <span className="font-medium">{order.credit_plans?.name}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Credits:</span>{" "}
                          <span className="font-medium">{order.credits_purchased.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Amount:</span>{" "}
                          <span className="font-medium">${order.amount_paid.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Submitted:</span>{" "}
                          <span className="font-medium">
                            {format(new Date(order.submitted_at), "MMM dd, yyyy")}
                          </span>
                        </div>
                      </div>

                      {order.payment_notes && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Notes:</span>{" "}
                          <span>{order.payment_notes}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDetailClick(order, profile || null)}
                      >
                        <Info className="h-4 w-4 mr-1" />
                        Details
                      </Button>
                      
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleReviewClick(order, "approve", profile || null)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleReviewClick(order, "reject", profile || null)}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* All Orders Section with Pagination */}
        <Card>
          <CardHeader>
            <CardTitle>All Orders</CardTitle>
            <CardDescription>
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount || 0)} of {totalCount || 0} orders
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {orders && orders.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No orders found</p>
            ) : (
              <>
                <div className="space-y-3">
                  {orders?.map((order) => {
                    const profile = profiles?.[order.user_id];
                    return (
                      <motion.div
                        key={order.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {profile?.full_name || "Unknown User"}
                            </span>
                            {getStatusBadge(order.status)}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Plan:</span>{" "}
                              <span className="font-medium">{order.credit_plans?.name}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Credits:</span>{" "}
                              <span className="font-medium">{order.credits_purchased.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Amount:</span>{" "}
                              <span className="font-medium">${order.amount_paid.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Date:</span>{" "}
                              <span className="font-medium">
                                {format(new Date(order.submitted_at), "MMM dd, yyyy HH:mm")}
                              </span>
                            </div>
                          </div>

                          {order.rejection_reason && (
                            <div className="text-sm text-destructive">
                              <span className="font-medium">Rejection Reason:</span> {order.rejection_reason}
                            </div>
                          )}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDetailClick(order, profile || null)}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <Pagination className="mt-6">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                        // Show first page, last page, current page, and pages around current
                        if (
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1)
                        ) {
                          return (
                            <PaginationItem key={page}>
                              <PaginationLink
                                onClick={() => setCurrentPage(page)}
                                isActive={currentPage === page}
                                className="cursor-pointer"
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        } else if (page === currentPage - 2 || page === currentPage + 2) {
                          return <PaginationItem key={page}>...</PaginationItem>;
                        }
                        return null;
                      })}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Review Dialog */}
      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approve" ? "Approve Order" : "Reject Order"}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === "approve"
                ? "This will credit the user's account and send them a notification."
                : "Please provide a reason for rejection. The user will be notified."}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">User:</span>
                  <span className="font-medium">{selectedProfile?.full_name || "Unknown User"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Plan:</span>
                  <span className="font-medium">{selectedOrder.credit_plans?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Credits:</span>
                  <span className="font-medium">{selectedOrder.credits_purchased.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Amount:</span>
                  <span className="font-medium">${selectedOrder.amount_paid.toFixed(2)}</span>
                </div>
              </div>

              {reviewAction === "reject" && (
                <div className="space-y-2">
                  <Label htmlFor="rejection-reason">Rejection Reason *</Label>
                  <Textarea
                    id="rejection-reason"
                    placeholder="Please explain why this order is being rejected..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={4}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsReviewDialogOpen(false);
                setRejectionReason("");
                setReviewAction(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant={reviewAction === "approve" ? "default" : "destructive"}
              onClick={handleConfirmReview}
              disabled={
                reviewOrderMutation.isPending ||
                (reviewAction === "reject" && !rejectionReason.trim())
              }
            >
              {reviewOrderMutation.isPending ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog with Motion */}
      <AnimatePresence>
        {isDetailDialogOpen && (
          <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
            <DialogContent asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-primary" />
                    Order Details
                  </DialogTitle>
                  <DialogDescription>
                    Complete information about this credit order
                  </DialogDescription>
                </DialogHeader>

                {selectedOrder && (
                  <div className="space-y-4 py-4">
                    {/* User Information */}
                    <div className="p-4 bg-accent/50 rounded-lg space-y-3">
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase">User Information</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">User Name</p>
                          <p className="font-medium">{selectedProfile?.full_name || "Unknown User"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Status</p>
                          <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Order Information */}
                    <div className="p-4 bg-accent/50 rounded-lg space-y-3">
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase">Order Information</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Plan</p>
                          <p className="font-medium">{selectedOrder.credit_plans?.name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Credits</p>
                          <p className="font-medium">{selectedOrder.credits_purchased.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Amount Paid</p>
                          <p className="font-medium text-primary">${selectedOrder.amount_paid.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Submitted At</p>
                          <p className="font-medium">{format(new Date(selectedOrder.submitted_at), "MMM dd, yyyy HH:mm")}</p>
                        </div>
                      </div>
                    </div>

                    {/* Payment Information */}
                    {selectedOrder.payment_receipt_url && (
                      <div className="p-4 bg-accent/50 rounded-lg space-y-3">
                        <h3 className="font-semibold text-sm text-muted-foreground uppercase">Payment Information</h3>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => window.open(selectedOrder.payment_receipt_url!, "_blank")}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Payment Receipt
                        </Button>
                      </div>
                    )}

                    {/* Payment Notes */}
                    {selectedOrder.payment_notes && (
                      <div className="p-4 bg-accent/50 rounded-lg space-y-3">
                        <h3 className="font-semibold text-sm text-muted-foreground uppercase">Payment Notes</h3>
                        <p className="text-sm">{selectedOrder.payment_notes}</p>
                      </div>
                    )}

                    {/* Status Information */}
                    {(selectedOrder.approved_at || selectedOrder.rejected_at) && (
                      <div className="p-4 bg-accent/50 rounded-lg space-y-3">
                        <h3 className="font-semibold text-sm text-muted-foreground uppercase">Status Information</h3>
                        {selectedOrder.approved_at && (
                          <div>
                            <p className="text-xs text-muted-foreground">Approved At</p>
                            <p className="font-medium text-green-600">{format(new Date(selectedOrder.approved_at), "MMM dd, yyyy HH:mm")}</p>
                          </div>
                        )}
                        {selectedOrder.rejected_at && (
                          <div>
                            <p className="text-xs text-muted-foreground">Rejected At</p>
                            <p className="font-medium text-destructive">{format(new Date(selectedOrder.rejected_at), "MMM dd, yyyy HH:mm")}</p>
                          </div>
                        )}
                        {selectedOrder.rejection_reason && (
                          <div>
                            <p className="text-xs text-muted-foreground">Rejection Reason</p>
                            <p className="font-medium text-destructive">{selectedOrder.rejection_reason}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </motion.div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
}
