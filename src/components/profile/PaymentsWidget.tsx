import { Card, CardContent } from "@/components/ui/card";
import { Receipt, Clock, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

import { formatDistanceToNow } from "date-fns";

interface PaymentsWidgetProps {
  userId: string;
}

export const PaymentsWidget = ({ userId }: PaymentsWidgetProps) => {

  const { data, isLoading } = useQuery({
    queryKey: ["payments-overview", userId],
    queryFn: async () => {
      // Get pending credit orders
      const { data: pendingOrders, error: ordersError } = await supabase
        .from("credit_orders")
        .select("id, status, submitted_at")
        .eq("user_id", userId)
        .in("status", ["pending", "submitted"])
        .order("submitted_at", { ascending: false });

      if (ordersError) throw ordersError;

      // Get last approved order
      const { data: lastOrder, error: lastError } = await supabase
        .from("credit_orders")
        .select("approved_at")
        .eq("user_id", userId)
        .eq("status", "approved")
        .order("approved_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastError) throw lastError;

      return {
        pendingCount: pendingOrders?.length || 0,
        lastPaymentAt: lastOrder?.approved_at || null,
      };
    },
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-card to-card/80 border-primary/20">
        <CardContent className="p-4 sm:p-5">
          <Skeleton className="h-16" />
        </CardContent>
      </Card>
    );
  }

  const hasPending = (data?.pendingCount || 0) > 0;

  return (
    <Card className="bg-gradient-to-br from-card to-card/80 border-primary/20">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 sm:p-3 bg-gradient-to-br ${hasPending ? "from-blue-500/20 to-cyan-500/10" : "from-slate-500/20 to-slate-500/10"} rounded-xl`}>
            <Receipt className={`h-5 w-5 sm:h-6 sm:w-6 ${hasPending ? "text-blue-500" : "text-muted-foreground"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground">Payments</p>
            {hasPending ? (
              <>
                <div className="flex items-baseline gap-2">
                  <p className="text-xl sm:text-2xl font-bold text-blue-500">{data?.pendingCount}</p>
                  <span className="text-xs text-muted-foreground">pending</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-blue-400 mt-0.5">
                  <Clock className="h-3 w-3" />
                  <span>Awaiting approval</span>
                </div>
              </>
            ) : (
              <>
                <p className="text-xl sm:text-2xl font-bold text-green-500">✓</p>
                {data?.lastPaymentAt ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span>Last: {formatDistanceToNow(new Date(data.lastPaymentAt), { addSuffix: true })}</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No pending orders</p>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
