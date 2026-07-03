import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReferralWidget } from "@/components/ReferralWidget";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users, TrendingUp, Clock, Award } from "lucide-react";
import { format, subDays } from "date-fns";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Navigate } from "react-router-dom";

export default function Referrals() {
  const { user } = useAuth();

  const { data: referralSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["referral-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_settings")
        .select("is_enabled")
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (settingsLoading) {
    return null;
  }

  if (!referralSettings?.is_enabled) {
    return <Navigate to="/404" replace />;
  }

  const { data: referralStats } = useQuery({
    queryKey: ["referral-stats", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data: referrals, error } = await supabase
        .from("referrals")
        .select("*")
        .eq("referrer_user_id", user.id)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const totalReferrals = referrals?.length || 0;
      const completedReferrals = referrals?.filter((r) => r.status === "completed").length || 0;
      const conversionRate = totalReferrals > 0 ? ((completedReferrals / totalReferrals) * 100).toFixed(1) : "0";
      const creditsEarned = referrals?.reduce((sum, r) => sum + r.credits_awarded, 0) || 0;

      const dailyMap: Record<string, { date: string; referrals: number; completed: number }> = {};
      referrals?.forEach((ref) => {
        const date = format(new Date(ref.created_at), "MMM dd");
        if (!dailyMap[date]) dailyMap[date] = { date, referrals: 0, completed: 0 };
        dailyMap[date].referrals += 1;
        if (ref.status === "completed") dailyMap[date].completed += 1;
      });

      return {
        totalReferrals,
        completedReferrals,
        conversionRate,
        creditsEarned,
        chartData: Object.values(dailyMap),
      };
    },
    enabled: !!user?.id,
  });

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Referral Program</h1>
        <p className="text-muted-foreground">Invite friends and earn rewards together</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{referralStats?.totalReferrals || 0}</div>
                <p className="text-xs text-muted-foreground">Friends invited</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{referralStats?.completedReferrals || 0}</div>
                <p className="text-xs text-muted-foreground">Successful signups</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{referralStats?.conversionRate || 0}%</div>
                <p className="text-xs text-muted-foreground">Success rate</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Credits Earned</CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{referralStats?.creditsEarned || 0}</div>
                <p className="text-xs text-muted-foreground">Total rewards</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ReferralWidget />
            <Card>
              <CardHeader>
                <CardTitle>How It Works</CardTitle>
                <CardDescription>Earn rewards by inviting friends</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">1</div>
                  <div>
                    <h4 className="font-semibold">Share Your Link</h4>
                    <p className="text-sm text-muted-foreground">Copy your unique referral link and share it with friends</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">2</div>
                  <div>
                    <h4 className="font-semibold">Friends Sign Up</h4>
                    <p className="text-sm text-muted-foreground">When they create an account using your link, you both get rewarded</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">3</div>
                  <div>
                    <h4 className="font-semibold">Earn Credits</h4>
                    <p className="text-sm text-muted-foreground">Get instant credits added to your account for each successful referral</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Referral Trends (Last 30 Days)</CardTitle>
              <CardDescription>Track your referral performance over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={referralStats?.chartData || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--popover))", 
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                    labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="referrals" stroke="hsl(var(--primary))" strokeWidth={3} name="Total Referrals" dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="completed" stroke="hsl(var(--chart-2))" strokeWidth={3} name="Completed" dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conversion Funnel</CardTitle>
              <CardDescription>Referral journey breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[
                  { name: "Clicks", value: referralStats?.totalReferrals || 0 },
                  { name: "Signups", value: referralStats?.completedReferrals || 0 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--popover))", 
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                    labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
