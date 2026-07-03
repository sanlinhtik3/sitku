import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, MousePointerClick, Clock } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays } from "date-fns";

export const ReferralAnalytics = () => {
  const { data: analytics } = useQuery({
    queryKey: ["referral-analytics"],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30);
      const { data: referrals, error } = await supabase
        .from("referrals")
        .select("*")
        .gte("created_at", thirtyDaysAgo.toISOString());

      if (error) throw error;

      const totalReferrals = referrals?.length || 0;
      const completedReferrals = referrals?.filter(r => r.status === "completed").length || 0;
      const conversionRate = totalReferrals > 0 ? (completedReferrals / totalReferrals) * 100 : 0;

      const dailyMap: Record<string, { date: string; referrals: number; completed: number }> = {};
      referrals?.forEach((referral) => {
        const date = format(new Date(referral.created_at), "MMM dd");
        if (!dailyMap[date]) dailyMap[date] = { date, referrals: 0, completed: 0 };
        dailyMap[date].referrals += 1;
        if (referral.status === "completed") dailyMap[date].completed += 1;
      });

      const completedWithTime = referrals?.filter(r => r.status === "completed");
      const avgTimeToConversion = completedWithTime?.length 
        ? completedWithTime.reduce((sum, r) => sum + new Date(r.created_at).getTime(), 0) / completedWithTime.length
        : 0;

      return {
        totalReferrals,
        completedReferrals,
        conversionRate,
        timeSeriesData: Object.values(dailyMap),
        avgTimeToConversion: Math.round(avgTimeToConversion / (1000 * 60 * 60 * 24)),
      };
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalReferrals || 0}</div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.completedReferrals || 0}</div>
            <p className="text-xs text-muted-foreground">Successful signups</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.conversionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Click to signup</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.avgTimeToConversion || 0}d</div>
            <p className="text-xs text-muted-foreground">To conversion</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Referral Trends</CardTitle>
          <CardDescription>Daily referral activity over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={analytics?.timeSeriesData || []}>
              <defs>
                <linearGradient id="colorReferrals" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "hsl(var(--popover))", 
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                }}
                labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600 }}
              />
              <Line 
                type="monotone" 
                dataKey="referrals" 
                stroke="hsl(var(--primary))" 
                strokeWidth={3}
                fill="url(#colorReferrals)"
                name="Total Referrals"
                dot={{ r: 5, strokeWidth: 2 }} 
                activeDot={{ r: 7, strokeWidth: 2 }}
              />
              <Line 
                type="monotone" 
                dataKey="completed" 
                stroke="hsl(var(--chart-2))" 
                strokeWidth={3}
                fill="url(#colorCompleted)"
                name="Completed"
                dot={{ r: 5, strokeWidth: 2 }} 
                activeDot={{ r: 7, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conversion Funnel</CardTitle>
          <CardDescription>Referral conversion breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={[
              { stage: "Total", count: analytics?.totalReferrals || 0 },
              { stage: "Completed", count: analytics?.completedReferrals || 0 },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="stage" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "hsl(var(--popover))", 
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                }}
                labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600 }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};
