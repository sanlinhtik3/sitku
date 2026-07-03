import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Copy, Check, Gift, Facebook, Twitter } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const ReferralWidget = () => {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: referralCode, isLoading: codeLoading } = useQuery({
    queryKey: ["referral-code", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from("referral_codes")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: referrals } = useQuery({
    queryKey: ["referrals", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("referrals")
        .select(`
          *,
          profiles:referred_user_id(full_name)
        `)
        .eq("referrer_user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: settings } = useQuery({
    queryKey: ["referral-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_settings")
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
  });

  const referralLink = `${window.location.origin}/auth?ref=${referralCode?.code || ""}`;

  const handleCopy = () => {
    if (referralCode?.code) {
      navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareFacebook = () => {
    const url = encodeURIComponent(referralLink);
    const text = encodeURIComponent(`Join me and get ${settings?.referee_credits || 5} free credits!`);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, "_blank");
  };

  const handleShareTwitter = () => {
    const url = encodeURIComponent(referralLink);
    const text = encodeURIComponent(`Join me and get ${settings?.referee_credits || 5} free credits! 🎁`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank");
  };

  if (!settings?.is_enabled) {
    return null;
  }

  if (codeLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-32 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          <CardTitle>Refer & Earn</CardTitle>
        </div>
        <CardDescription>
          Invite friends and both get {settings?.referrer_credits || 5} free credits!
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Your Referral Link</label>
          <div className="flex gap-2">
            <Input
              value={referralLink}
              readOnly
              className="bg-background"
            />
            <Button
              onClick={handleCopy}
              variant="outline"
              size="icon"
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Share on Social Media</label>
          <div className="flex gap-2">
            <Button
              onClick={handleShareFacebook}
              variant="outline"
              className="flex-1"
            >
              <Facebook className="h-4 w-4 mr-2" />
              Facebook
            </Button>
            <Button
              onClick={handleShareTwitter}
              variant="outline"
              className="flex-1"
            >
              <Twitter className="h-4 w-4 mr-2" />
              Twitter
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Total Referrals</p>
            </div>
            <p className="text-2xl font-bold">{referralCode?.total_referrals || 0}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Credits Earned</p>
            </div>
            <p className="text-2xl font-bold text-primary">
              {referralCode?.total_credits_earned || 0}
            </p>
          </div>
        </div>

        {referrals && referrals.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Recent Referrals</p>
            <div className="space-y-2">
              {referrals.slice(0, 3).map((referral: any) => (
                <div
                  key={referral.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <span className="text-sm">
                    {referral.profiles?.full_name || "Anonymous User"}
                  </span>
                  <Badge variant="secondary">+{referral.credits_awarded} credits</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
