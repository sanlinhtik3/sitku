import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useState } from "react";
import { Gift, Users, TrendingUp, Settings } from "lucide-react";
import { format } from "date-fns";
import { ReferralAnalytics } from "./ReferralAnalytics";

export const AdminReferrals = () => {
  const queryClient = useQueryClient();
  const [referrerCredits, setReferrerCredits] = useState(5);
  const [refereeCredits, setRefereeCredits] = useState(5);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["referral-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_settings")
        .select("*")
        .single();

      if (error) throw error;
      setReferrerCredits(data.referrer_credits);
      setRefereeCredits(data.referee_credits);
      return data;
    },
  });

  const { data: referralStats } = useQuery({
    queryKey: ["referral-stats"],
    queryFn: async () => {
      const { data: referrals, error } = await supabase
        .from("referrals")
        .select("credits_awarded");

      if (error) throw error;

      const totalReferrals = referrals?.length || 0;
      const totalCreditsAwarded = referrals?.reduce((sum, r) => sum + r.credits_awarded, 0) || 0;

      return {
        totalReferrals,
        totalCreditsAwarded,
      };
    },
  });

  const { data: topReferrers } = useQuery({
    queryKey: ["top-referrers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_codes")
        .select(`
          *,
          profiles:user_id(full_name, avatar_url)
        `)
        .order("total_referrals", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
  });

  const { data: recentReferrals } = useQuery({
    queryKey: ["recent-referrals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select(`
          *,
          referrer:referrer_user_id(full_name),
          referee:referred_user_id(full_name)
        `)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (isEnabled: boolean) => {
      if (!settings?.id) {
        throw new Error("Settings not loaded");
      }

      const { error } = await supabase
        .from("referral_settings")
        .update({ is_enabled: isEnabled })
        .eq("id", settings.id);

      if (error) throw error;
      return isEnabled;
    },
    onSuccess: (isEnabled) => {
      queryClient.invalidateQueries({ queryKey: ["referral-settings"] });
      toast.success(`Referral program ${isEnabled ? "enabled" : "disabled"} successfully`);
    },
    onError: (error) => {
      console.error("Toggle error:", error);
      toast.error("Failed to update settings");
    },
  });

  const updateCreditsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("referral_settings")
        .update({
          referrer_credits: referrerCredits,
          referee_credits: refereeCredits,
        })
        .eq("id", settings?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referral-settings"] });
      toast.success("Credit amounts updated");
    },
    onError: () => {
      toast.error("Failed to update credit amounts");
    },
  });

  if (settingsLoading) {
    return <div className="space-y-3 p-4"><div className="h-4 w-48 rounded bg-muted/30 animate-pulse" /><div className="h-4 w-32 rounded bg-muted/30 animate-pulse" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Referral Program</h2>
        <p className="text-muted-foreground">
          Manage the referral program and track user referrals
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{referralStats?.totalReferrals || 0}</div>
            <p className="text-xs text-muted-foreground">Active referrals</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credits Awarded</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{referralStats?.totalCreditsAwarded || 0}</div>
            <p className="text-xs text-muted-foreground">Total credits given</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Program Status</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={settings?.is_enabled ? "default" : "secondary"}>
              {settings?.is_enabled ? "Active" : "Disabled"}
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">Current status</p>
          </CardContent>
        </Card>
      </div>

        <Card>
          <CardHeader>
            <CardTitle>Top Referrers</CardTitle>
            <CardDescription>Users with the most successful referrals</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Referral Code</TableHead>
                  <TableHead>Total Referrals</TableHead>
                  <TableHead>Credits Earned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topReferrers?.map((referrer: any) => (
                  <TableRow key={referrer.id}>
                    <TableCell className="font-medium">
                      {referrer.profiles?.full_name || "Anonymous User"}
                    </TableCell>
                    <TableCell>
                      <code className="px-2 py-1 bg-muted rounded text-xs">
                        {referrer.code}
                      </code>
                    </TableCell>
                    <TableCell>{referrer.total_referrals}</TableCell>
                    <TableCell className="text-primary font-medium">
                      {referrer.total_credits_earned}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Referrals</CardTitle>
            <CardDescription>Latest successful referrals</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referrer</TableHead>
                  <TableHead>Referred User</TableHead>
                  <TableHead>Credits Awarded</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentReferrals?.map((referral: any) => (
                  <TableRow key={referral.id}>
                    <TableCell className="font-medium">
                      {referral.referrer?.full_name || "Anonymous"}
                    </TableCell>
                    <TableCell>{referral.referee?.full_name || "Anonymous"}</TableCell>
                    <TableCell className="text-primary">
                      +{referral.credits_awarded}
                    </TableCell>
                    <TableCell>
                      {format(new Date(referral.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{referral.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <ReferralAnalytics />
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Program Settings</CardTitle>
          <CardDescription>Configure the referral program</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="referral-enabled">Enable Referral Program</Label>
              <p className="text-sm text-muted-foreground">
                Allow users to earn credits by referring friends
              </p>
            </div>
            <Switch
              id="referral-enabled"
              checked={settings?.is_enabled}
              onCheckedChange={(checked) => toggleMutation.mutate(checked)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="referrer-credits">Referrer Credits</Label>
              <Input
                id="referrer-credits"
                type="number"
                min="0"
                value={referrerCredits}
                onChange={(e) => setReferrerCredits(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Credits awarded to the person who refers
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="referee-credits">Referee Credits</Label>
              <Input
                id="referee-credits"
                type="number"
                min="0"
                value={refereeCredits}
                onChange={(e) => setRefereeCredits(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Credits awarded to the person who signs up
              </p>
            </div>
          </div>

          <Button
            onClick={() => updateCreditsMutation.mutate()}
            disabled={updateCreditsMutation.isPending}
          >
            Save Credit Settings
          </Button>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
