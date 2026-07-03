import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { TrendingUp, TrendingDown, Coins, Sparkles, Calendar, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function CreditAnalytics() {
  const { user } = useAuth();

  const { data: monthlySpending } = useQuery({
    queryKey: ["monthly-spending", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Group by month
      const grouped = data.reduce((acc: any, transaction) => {
        const month = new Date(transaction.created_at!).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        if (!acc[month]) {
          acc[month] = { month, earned: 0, spent: 0 };
        }
        if (transaction.transaction_type === 'purchase' || transaction.transaction_type === 'trial') {
          acc[month].earned += transaction.credits;
        } else {
          acc[month].spent += Math.abs(transaction.credits);
        }
        return acc;
      }, {});

      return Object.values(grouped);
    },
    enabled: !!user,
  });

  const { data: usageByFeature } = useQuery({
    queryKey: ["usage-by-feature", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("ai_generated_content")
        .select("category")
        .eq("user_id", user.id);

      if (error) throw error;

      // Count by category
      const counts = data.reduce((acc: any, item) => {
        const category = item.category || 'uncategorized';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {});

      return Object.entries(counts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      }));
    },
    enabled: !!user,
  });

  const { data: recentTransactions } = useQuery({
    queryKey: ["recent-transactions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: stats } = useQuery({
    queryKey: ["credit-stats", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_credits")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const getRecommendation = () => {
    if (!stats || !monthlySpending || monthlySpending.length === 0) return null;

    const monthlyData = monthlySpending as any[];
    const avgMonthlySpending = monthlyData.reduce((sum: number, month: any) => sum + month.spent, 0) / monthlyData.length;
    const currentBalance = stats.balance;

    if (currentBalance < avgMonthlySpending * 0.5) {
      return {
        type: "warning",
        title: "Low Credit Balance",
        description: `Your current balance (${currentBalance} credits) is below your average monthly usage (${Math.round(avgMonthlySpending)} credits). Consider purchasing a plan soon.`,
        suggestedPlan: avgMonthlySpending > 100 ? "Premium Plan" : avgMonthlySpending > 50 ? "Pro Plan" : "Starter Plan",
      };
    }

    if (stats.total_spent > 200 && stats.trial_credits_used) {
      return {
        type: "success",
        title: "Great Usage Pattern!",
        description: `You've used ${stats.total_spent} credits efficiently. Consider bulk purchasing to save more with discounts.`,
        suggestedPlan: "Bulk Purchase (3+ plans)",
      };
    }

    return {
      type: "info",
      title: "Optimized Usage",
      description: `Your credit usage is well-balanced. Current balance: ${currentBalance} credits.`,
      suggestedPlan: "Continue current plan",
    };
  };

  const recommendation = getRecommendation();

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', '#8884d8', '#82ca9d', '#ffc658'];

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Credit Analytics</h1>
            <p className="text-muted-foreground">Track your credit usage and optimize your purchases</p>
          </div>

          {/* Stats Overview */}
          <div className="grid md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
                <Coins className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.balance || 0}</div>
                <p className="text-xs text-muted-foreground">Available credits</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.total_earned || 0}</div>
                <p className="text-xs text-muted-foreground">All-time credits earned</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.total_spent || 0}</div>
                <p className="text-xs text-muted-foreground">Credits used</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Generations</CardTitle>
                <Sparkles className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{usageByFeature?.reduce((sum, item) => sum + (item.value as number), 0) || 0}</div>
                <p className="text-xs text-muted-foreground">AI content created</p>
              </CardContent>
            </Card>
          </div>

          {/* Recommendation Alert */}
          {recommendation && (
            <Alert className="mb-8">
              <Target className="h-4 w-4" />
              <AlertTitle>{recommendation.title}</AlertTitle>
              <AlertDescription>
                {recommendation.description}
                <Badge className="ml-2" variant="secondary">{recommendation.suggestedPlan}</Badge>
              </AlertDescription>
            </Alert>
          )}

          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Monthly Spending Trends</CardTitle>
                <CardDescription>Credits earned vs spent over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlySpending}>
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="earned" fill="hsl(var(--primary))" name="Earned" />
                    <Bar dataKey="spent" fill="hsl(var(--destructive))" name="Spent" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Usage by Feature</CardTitle>
                <CardDescription>AI generations by content category</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={usageByFeature}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="hsl(var(--primary))"
                      dataKey="value"
                    >
                      {usageByFeature?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Your latest credit activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentTransactions?.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{transaction.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(transaction.created_at!).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${transaction.credits > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {transaction.credits > 0 ? '+' : ''}{transaction.credits}
                      </p>
                      <Badge variant="outline">{transaction.transaction_type}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
