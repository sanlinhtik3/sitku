import { Card, CardContent } from "@/components/ui/card";
import { Crown, AlertTriangle, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { differenceInDays } from "date-fns";

interface SubscriptionWidgetProps {
  userId: string;
}

export const SubscriptionWidget = ({ userId }: SubscriptionWidgetProps) => {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["subscription-overview", userId],
    queryFn: async () => {
      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select("id, status, access_expires_at, is_expired")
        .eq("user_id", userId)
        .eq("status", "approved");

      if (error) throw error;

      const now = new Date();
      const active = enrollments?.filter(e => !e.is_expired) || [];
      const expiringSoon = active.filter(e => {
        if (!e.access_expires_at) return false;
        const daysLeft = differenceInDays(new Date(e.access_expires_at), now);
        return daysLeft >= 0 && daysLeft <= 7;
      });

      return {
        activeCount: active.length,
        expiringSoonCount: expiringSoon.length,
        totalEnrollments: enrollments?.length || 0,
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

  const isHealthy = (data?.expiringSoonCount || 0) === 0;
  const statusColor = isHealthy ? "from-green-500/20 to-emerald-500/10" : "from-amber-500/20 to-orange-500/10";
  const iconColor = isHealthy ? "text-green-500" : "text-amber-500";

  return (
    <Card 
      className="cursor-pointer transition-all hover:shadow-lg hover:shadow-primary/10 hover:scale-[1.02] bg-gradient-to-br from-card to-card/80 border-primary/20"
      onClick={() => navigate("/dashboard")}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 sm:p-3 bg-gradient-to-br ${statusColor} rounded-xl`}>
            <Crown className={`h-5 w-5 sm:h-6 sm:w-6 ${iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground">Subscriptions</p>
            <div className="flex items-baseline gap-2">
              <p className="text-xl sm:text-2xl font-bold">{data?.activeCount || 0}</p>
              <span className="text-xs text-muted-foreground">active</span>
            </div>
            {(data?.expiringSoonCount || 0) > 0 ? (
              <div className="flex items-center gap-1 text-xs text-amber-500 mt-0.5">
                <AlertTriangle className="h-3 w-3" />
                <span>{data?.expiringSoonCount} expiring soon</span>
              </div>
            ) : data?.activeCount ? (
              <div className="flex items-center gap-1 text-xs text-green-500 mt-0.5">
                <CheckCircle className="h-3 w-3" />
                <span>All good</span>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
