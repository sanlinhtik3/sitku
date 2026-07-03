import { Card, CardContent } from "@/components/ui/card";
import { Users, Gift, Copy, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";

interface ReferralsWidgetProps {
  userId: string;
  inviteCode?: string | null;
}

export const ReferralsWidget = ({ userId, inviteCode }: ReferralsWidgetProps) => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["referral-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_settings")
        .select("is_enabled")
        .single();
      if (error) return null;
      return data;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["referrals-overview", userId],
    queryFn: async () => {
      const { data: referralCode, error } = await supabase
        .from("referral_codes")
        .select("total_referrals, total_credits_earned")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      return {
        totalReferrals: referralCode?.total_referrals || 0,
        creditsEarned: referralCode?.total_credits_earned || 0,
      };
    },
    enabled: !!userId && settings?.is_enabled !== false,
  });

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      toast.success("Invite code copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Don't render if referrals are disabled
  if (settings?.is_enabled === false) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-card to-card/80 border-primary/20">
        <CardContent className="p-4 sm:p-5">
          <Skeleton className="h-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className="cursor-pointer transition-all hover:shadow-lg hover:shadow-primary/10 hover:scale-[1.02] bg-gradient-to-br from-purple-500/5 via-card to-card border-primary/20"
      onClick={() => navigate("/referrals")}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 sm:p-3 bg-gradient-to-br from-purple-500/20 to-pink-500/10 rounded-xl">
            <Users className="h-5 w-5 sm:h-6 sm:w-6 text-purple-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground">Referrals</p>
            <div className="flex items-baseline gap-2">
              <p className="text-xl sm:text-2xl font-bold">{data?.totalReferrals || 0}</p>
              <span className="text-xs text-muted-foreground">invited</span>
            </div>
            {(data?.creditsEarned || 0) > 0 ? (
              <div className="flex items-center gap-1 text-xs text-purple-400 mt-0.5">
                <Gift className="h-3 w-3" />
                <span>{data?.creditsEarned} credits earned</span>
              </div>
            ) : inviteCode ? (
              <button 
                onClick={handleCopyCode}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-0.5 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-green-500" />
                    <span className="text-green-500">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span className="font-mono">{inviteCode}</span>
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
