import { memo, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from "recharts";
import { 
  Crown, Zap, Calendar, TrendingUp, Bot, FileText, 
  DollarSign, Briefcase, Video, Clock
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProPlan } from "@/hooks/useProPlan";
import { ProBadge, FreePlanBadge } from "@/components/ProBadge";
import { format, subDays } from "date-fns";

interface UsageAnalyticsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FEATURE_COLORS: Record<string, string> = {
  beebot: 'hsl(280, 80%, 60%)',
  ai_content: 'hsl(200, 80%, 60%)',
  flowstate: 'hsl(160, 80%, 50%)',
  easy_srt: 'hsl(30, 80%, 60%)',
  
  workspace: 'hsl(220, 80%, 60%)',
  other: 'hsl(0, 0%, 50%)',
};

const FEATURE_LABELS: Record<string, string> = {
  beebot: 'BeeBot AI',
  ai_content: 'AI Content',
  flowstate: 'FlowState',
  easy_srt: 'Easy SRT',
  
  workspace: 'Studio Hub',
};

const FEATURE_ICONS: Record<string, any> = {
  beebot: Bot,
  ai_content: FileText,
  flowstate: DollarSign,
  easy_srt: Video,
  
  workspace: Briefcase,
};

export const UsageAnalyticsModal = memo(({ open, onOpenChange }: UsageAnalyticsModalProps) => {
  const { user } = useAuth();
  const { isPro, dailyLimit, usesToday, remainingUses, daysRemaining, expiresAt } = useProPlan();

  // Fetch usage history (last 7 days)
  const { data: usageHistory } = useQuery({
    queryKey: ["usage-history", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("daily_usage")
        .select("*")
        .eq("user_id", user.id)
        .gte("usage_date", format(subDays(new Date(), 6), 'yyyy-MM-dd'))
        .order("usage_date", { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!user?.id,
  });

  // Fetch feature breakdown (last 30 days)
  const { data: featureBreakdown } = useQuery({
    queryKey: ["feature-breakdown", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("usage_logs")
        .select("feature_key")
        .eq("user_id", user.id)
        .gte("created_at", format(subDays(new Date(), 29), 'yyyy-MM-dd'));
      
      if (error) throw error;
      
      // Count by feature
      const counts: Record<string, number> = {};
      (data || []).forEach(log => {
        counts[log.feature_key] = (counts[log.feature_key] || 0) + 1;
      });
      
      return Object.entries(counts).map(([key, value]) => ({
        name: FEATURE_LABELS[key] || key,
        value,
        color: FEATURE_COLORS[key] || FEATURE_COLORS.other,
      }));
    },
    enabled: open && !!user?.id,
  });

  // Format chart data
  const chartData = useMemo(() => {
    if (!usageHistory) return [];
    
    // Fill in missing days
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const usage = usageHistory.find(u => u.usage_date === dateStr);
      
      return {
        date: format(date, 'EEE'),
        fullDate: dateStr,
        uses: usage?.total_uses || 0,
        limit: usage?.daily_limit || dailyLimit,
      };
    });
    
    return last7Days;
  }, [usageHistory, dailyLimit]);

  // Calculate totals
  const totalUsesThisWeek = chartData.reduce((sum, d) => sum + d.uses, 0);
  const avgUsesPerDay = (totalUsesThisWeek / 7).toFixed(1);

  const usagePercentage = (usesToday / dailyLimit) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Usage Analytics
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Plan Status Card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {isPro ? <ProBadge size="md" /> : <FreePlanBadge size="md" />}
                </div>
                {isPro && daysRemaining !== null && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{daysRemaining} days remaining</span>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Today's Usage</span>
                  <span className="font-medium">{usesToday} / {dailyLimit}</span>
                </div>
                <Progress value={usagePercentage} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {remainingUses} uses remaining today
                </p>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="daily" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="daily">Daily Trend</TabsTrigger>
              <TabsTrigger value="features">By Feature</TabsTrigger>
            </TabsList>

            <TabsContent value="daily" className="space-y-4">
              {/* Daily Usage Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Last 7 Days</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <RechartsTooltip 
                          contentStyle={{ 
                            background: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="uses" 
                          stroke="hsl(var(--primary))" 
                          fill="hsl(var(--primary) / 0.2)" 
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-primary">{totalUsesThisWeek}</div>
                    <div className="text-xs text-muted-foreground">This Week</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-primary">{avgUsesPerDay}</div>
                    <div className="text-xs text-muted-foreground">Avg/Day</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-primary">{dailyLimit}</div>
                    <div className="text-xs text-muted-foreground">Daily Limit</div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="features" className="space-y-4">
              {/* Feature Breakdown Pie Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Feature Usage (30 days)</CardTitle>
                </CardHeader>
                <CardContent>
                  {featureBreakdown && featureBreakdown.length > 0 ? (
                    <div className="flex items-center gap-4">
                      <div className="h-40 w-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={featureBreakdown}
                              cx="50%"
                              cy="50%"
                              innerRadius={35}
                              outerRadius={60}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {featureBreakdown.map((entry, index) => (
                                <Cell key={index} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-2">
                        {featureBreakdown.map((feature, index) => (
                          <div key={index} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: feature.color }}
                              />
                              <span>{feature.name}</span>
                            </div>
                            <span className="font-medium">{feature.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No usage data yet
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Feature List */}
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                  const Icon = FEATURE_ICONS[key] || Zap;
                  const usage = featureBreakdown?.find(f => f.name === label);
                  
                  return (
                    <Card key={key}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div 
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${FEATURE_COLORS[key]}20` }}
                        >
                          <Icon className="h-4 w-4" style={{ color: FEATURE_COLORS[key] }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{label}</div>
                          <div className="text-xs text-muted-foreground">
                            {usage?.value || 0} uses
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
});

UsageAnalyticsModal.displayName = "UsageAnalyticsModal";
