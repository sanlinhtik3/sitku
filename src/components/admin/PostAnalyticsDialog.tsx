import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Eye, Users, Monitor, Globe, Smartphone, Tablet, 
  TrendingUp, TrendingDown, BarChart3, Activity 
} from 'lucide-react';
import { format, subDays, startOfDay, startOfMonth, isWithinInterval } from 'date-fns';

interface PostAnalyticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string | null;
  postTitle: string;
}

interface PostView {
  viewed_at: string;
  user_id: string | null;
  session_id: string | null;
}

interface ChartDataPoint {
  date: string;
  views: number;
  uniqueVisitors: number;
}

interface DeviceData {
  type: string;
  count: number;
  percentage: number;
}

interface BrowserData {
  name: string;
  count: number;
  percentage: number;
}

export const PostAnalyticsDialog = ({ 
  open, 
  onOpenChange, 
  postId, 
  postTitle 
}: PostAnalyticsDialogProps) => {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(30);
  const [views, setViews] = useState<PostView[]>([]);
  const [engagements, setEngagements] = useState(0);
  const [deviceData, setDeviceData] = useState<DeviceData[]>([]);
  const [browserData, setBrowserData] = useState<BrowserData[]>([]);

  useEffect(() => {
    if (open && postId) {
      fetchAnalytics();
    }
  }, [open, postId, timeRange]);

  const fetchAnalytics = async () => {
    if (!postId) return;
    
    setLoading(true);
    try {
      const rangeStart = subDays(new Date(), timeRange);
      
      // Fetch views
      const { data: viewsData, error: viewsError } = await supabase
        .from('post_views')
        .select('viewed_at, user_id, session_id')
        .eq('post_id', postId)
        .gte('viewed_at', rangeStart.toISOString());

      if (viewsError) throw viewsError;
      setViews(viewsData || []);

      // Fetch engagements
      const { count: engagementCount } = await supabase
        .from('post_engagements')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId)
        .gte('engaged_at', rangeStart.toISOString());

      setEngagements(engagementCount || 0);

      // Fetch device/browser data for logged-in users
      const userIds = [...new Set((viewsData || []).filter(v => v.user_id).map(v => v.user_id))];
      
      if (userIds.length > 0) {
        const { data: sessionsData } = await supabase
          .from('user_sessions')
          .select('device_type, browser')
          .in('user_id', userIds);

        if (sessionsData) {
          // Calculate device breakdown
          const deviceCounts: Record<string, number> = {};
          const browserCounts: Record<string, number> = {};
          
          sessionsData.forEach(session => {
            const deviceType = session.device_type || 'Unknown';
            const browser = session.browser || 'Unknown';
            deviceCounts[deviceType] = (deviceCounts[deviceType] || 0) + 1;
            browserCounts[browser] = (browserCounts[browser] || 0) + 1;
          });

          const totalDevices = Object.values(deviceCounts).reduce((a, b) => a + b, 0);
          const totalBrowsers = Object.values(browserCounts).reduce((a, b) => a + b, 0);

          setDeviceData(
            Object.entries(deviceCounts)
              .map(([type, count]) => ({
                type,
                count,
                percentage: Math.round((count / totalDevices) * 100)
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 5)
          );

          setBrowserData(
            Object.entries(browserCounts)
              .map(([name, count]) => ({
                name,
                count,
                percentage: Math.round((count / totalBrowsers) * 100)
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 5)
          );
        }
      } else {
        setDeviceData([]);
        setBrowserData([]);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate time period stats
  const timePeriodStats = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const yesterdayStart = startOfDay(subDays(now, 1));
    const yesterdayEnd = startOfDay(now);
    const last7DaysStart = subDays(now, 7);
    const last30DaysStart = subDays(now, 30);
    const last90DaysStart = subDays(now, 90);
    const thisMonthStart = startOfMonth(now);

    const filterByRange = (start: Date, end?: Date) => {
      return views.filter(v => {
        const viewDate = new Date(v.viewed_at);
        if (end) {
          return isWithinInterval(viewDate, { start, end });
        }
        return viewDate >= start;
      }).length;
    };

    return {
      today: filterByRange(todayStart),
      yesterday: filterByRange(yesterdayStart, yesterdayEnd),
      last7Days: filterByRange(last7DaysStart),
      last30Days: filterByRange(last30DaysStart),
      last90Days: filterByRange(last90DaysStart),
      thisMonth: filterByRange(thisMonthStart)
    };
  }, [views]);

  // Calculate chart data
  const chartData = useMemo((): ChartDataPoint[] => {
    const dateMap: Record<string, { views: number; visitors: Set<string> }> = {};
    
    // Initialize all dates in range
    for (let i = timeRange - 1; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'MMM dd');
      dateMap[date] = { views: 0, visitors: new Set() };
    }

    // Populate with actual data
    views.forEach(view => {
      const date = format(new Date(view.viewed_at), 'MMM dd');
      if (dateMap[date]) {
        dateMap[date].views++;
        const visitorId = view.user_id || view.session_id || 'anonymous';
        dateMap[date].visitors.add(visitorId);
      }
    });

    return Object.entries(dateMap).map(([date, data]) => ({
      date,
      views: data.views,
      uniqueVisitors: data.visitors.size
    }));
  }, [views, timeRange]);

  // Calculate overview stats
  const overviewStats = useMemo(() => {
    const uniqueUsers = new Set(views.filter(v => v.user_id).map(v => v.user_id));
    const uniqueSessions = new Set(views.filter(v => v.session_id && !v.user_id).map(v => v.session_id));
    const uniqueVisitors = uniqueUsers.size + uniqueSessions.size;
    const totalViews = views.length;
    const avgViewsPerVisitor = uniqueVisitors > 0 ? (totalViews / uniqueVisitors).toFixed(1) : '0';

    return {
      totalViews,
      uniqueVisitors,
      avgViewsPerVisitor,
      engagements
    };
  }, [views, engagements]);

  // Calculate trend
  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const todayTrend = calculateTrend(timePeriodStats.today, timePeriodStats.yesterday);

  const getDeviceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'mobile': return <Smartphone className="h-4 w-4" />;
      case 'tablet': return <Tablet className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };

  const QuickStatCard = ({ 
    label, 
    value, 
    trend 
  }: { 
    label: string; 
    value: number; 
    trend?: number;
  }) => (
    <Card className="bg-card/30 backdrop-blur-sm border-primary/10 hover:border-primary/30 transition-all overflow-hidden">
      <CardContent className="p-1.5 sm:p-2 md:p-3">
        <p className="text-[9px] sm:text-[10px] md:text-xs text-muted-foreground uppercase tracking-wide truncate">{label}</p>
        <div className="flex items-center gap-0.5 sm:gap-1 mt-0.5 sm:mt-1">
          <p className="text-sm sm:text-base md:text-lg font-bold leading-tight">{value.toLocaleString()}</p>
          {trend !== undefined && (
            <Badge 
              variant={trend >= 0 ? "default" : "destructive"} 
              className="text-[7px] sm:text-[8px] md:text-[10px] px-0.5 sm:px-1 py-0 h-3.5 sm:h-4 shrink-0 leading-none"
            >
              {trend >= 0 ? <TrendingUp className="h-2 w-2 mr-0.5" /> : <TrendingDown className="h-2 w-2 mr-0.5" />}
              {trend >= 0 ? '+' : ''}{trend}%
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-[90vw] md:max-w-[800px] lg:max-w-[900px] overflow-hidden bg-background/95 backdrop-blur-xl border-border/50 p-3 sm:p-4 md:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
            <BarChart3 className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">Post Analytics</span>
          </DialogTitle>
          <p className="text-[10px] sm:text-xs md:text-sm text-muted-foreground truncate">{postTitle}</p>
        </DialogHeader>

        <div className="overflow-y-auto overflow-x-hidden max-h-[calc(80vh-80px)] -mx-3 px-3 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6">
          {loading ? (
            <div className="space-y-3 sm:space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-12 sm:h-14 md:h-16" />
                ))}
              </div>
              <Skeleton className="h-[140px] sm:h-[160px]" />
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                <Skeleton className="h-20 sm:h-24" />
                <Skeleton className="h-20 sm:h-24" />
              </div>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4 md:space-y-6">
              {/* Time Period Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2">
                <QuickStatCard label="Today" value={timePeriodStats.today} trend={todayTrend} />
                <QuickStatCard label="Yesterday" value={timePeriodStats.yesterday} />
                <QuickStatCard label="7 Days" value={timePeriodStats.last7Days} />
                <QuickStatCard label="30 Days" value={timePeriodStats.last30Days} />
              </div>

              {/* Gradient Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

              {/* Views Over Time Chart */}
              <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
                <CardHeader className="pb-1.5 sm:pb-2 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <CardTitle className="text-[10px] sm:text-xs md:text-sm font-medium flex items-center gap-1.5">
                      <Activity className="h-3 w-3 text-primary shrink-0" />
                      Views Over Time
                    </CardTitle>
                    <div className="flex gap-0.5 sm:gap-1">
                      {[7, 14, 30, 90].map(days => (
                        <Button 
                          key={days}
                          size="sm" 
                          variant={timeRange === days ? "default" : "outline"}
                          onClick={() => setTimeRange(days)}
                          className="h-5 sm:h-6 px-1 sm:px-1.5 text-[9px] sm:text-[10px] md:text-xs"
                        >
                          {days}d
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-1 sm:px-2 md:px-4 pb-2 sm:pb-3">
                  <div className="w-full overflow-hidden">
                    <ResponsiveContainer width="99%" height={130}>
                      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                        <defs>
                          <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 7 }} 
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis 
                          tick={{ fontSize: 7 }} 
                          tickLine={false}
                          axisLine={false}
                          width={24}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card) / 0.95)',
                            border: '1px solid hsl(var(--primary) / 0.2)',
                            borderRadius: '6px',
                            backdropFilter: 'blur(8px)',
                            fontSize: '10px',
                            padding: '4px 8px'
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="views" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={1.5}
                          fill="url(#viewsGradient)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Gradient Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

              {/* Audience Overview */}
              <div>
                <h3 className="text-[10px] sm:text-xs md:text-sm font-medium mb-1.5 sm:mb-2 flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-primary shrink-0" />
                  Audience Overview
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2">
                  <Card className="bg-card/50 border-border/50 overflow-hidden">
                    <CardContent className="p-1.5 sm:p-2 md:p-3">
                      <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                        <Eye className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                        <span className="text-[8px] sm:text-[10px] md:text-xs uppercase truncate">Views</span>
                      </div>
                      <p className="text-sm sm:text-base md:text-lg font-bold leading-tight">{overviewStats.totalViews.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50 border-border/50 overflow-hidden">
                    <CardContent className="p-1.5 sm:p-2 md:p-3">
                      <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                        <Users className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                        <span className="text-[8px] sm:text-[10px] md:text-xs uppercase truncate">Visitors</span>
                      </div>
                      <p className="text-sm sm:text-base md:text-lg font-bold leading-tight">{overviewStats.uniqueVisitors.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50 border-border/50 overflow-hidden">
                    <CardContent className="p-1.5 sm:p-2 md:p-3">
                      <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                        <Activity className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                        <span className="text-[8px] sm:text-[10px] md:text-xs uppercase truncate">Per Visit</span>
                      </div>
                      <p className="text-sm sm:text-base md:text-lg font-bold leading-tight">{overviewStats.avgViewsPerVisitor}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50 border-border/50 overflow-hidden">
                    <CardContent className="p-1.5 sm:p-2 md:p-3">
                      <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                        <TrendingUp className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                        <span className="text-[8px] sm:text-[10px] md:text-xs uppercase truncate">Engage</span>
                      </div>
                      <p className="text-sm sm:text-base md:text-lg font-bold leading-tight">{overviewStats.engagements.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Gradient Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

              {/* Device & Browser Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                {/* Device Breakdown */}
                <Card className="bg-card/50 border-border/50 overflow-hidden">
                  <CardContent className="p-1.5 sm:p-2 md:p-3">
                    <h4 className="text-[10px] sm:text-xs md:text-sm font-medium mb-1.5 sm:mb-2 flex items-center gap-1.5">
                      <Monitor className="h-3 w-3 text-primary shrink-0" />
                      Devices
                    </h4>
                    {deviceData.length > 0 ? (
                      <div className="space-y-1.5 sm:space-y-2">
                        {deviceData.map(device => (
                          <div key={device.type} className="flex items-center justify-between gap-1.5">
                            <span className="text-[10px] sm:text-xs flex items-center gap-1 truncate flex-1">
                              <span className="shrink-0">{getDeviceIcon(device.type)}</span>
                              <span className="truncate">{device.type}</span>
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <div className="w-8 sm:w-12 md:w-16 h-1 sm:h-1.5 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-primary rounded-full" 
                                  style={{ width: `${device.percentage}%` }}
                                />
                              </div>
                              <span className="text-[8px] sm:text-[10px] text-muted-foreground w-5 sm:w-6">{device.percentage}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] sm:text-xs text-muted-foreground">No data</p>
                    )}
                  </CardContent>
                </Card>
                
                {/* Browser Breakdown */}
                <Card className="bg-card/50 border-border/50 overflow-hidden">
                  <CardContent className="p-1.5 sm:p-2 md:p-3">
                    <h4 className="text-[10px] sm:text-xs md:text-sm font-medium mb-1.5 sm:mb-2 flex items-center gap-1.5">
                      <Globe className="h-3 w-3 text-primary shrink-0" />
                      Browsers
                    </h4>
                    {browserData.length > 0 ? (
                      <div className="space-y-1.5 sm:space-y-2">
                        {browserData.map(browser => (
                          <div key={browser.name} className="flex items-center justify-between gap-1.5">
                            <span className="text-[10px] sm:text-xs truncate flex-1">{browser.name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <div className="w-8 sm:w-12 md:w-16 h-1 sm:h-1.5 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-secondary rounded-full" 
                                  style={{ width: `${browser.percentage}%` }}
                                />
                              </div>
                              <span className="text-[8px] sm:text-[10px] text-muted-foreground w-5 sm:w-6">{browser.percentage}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] sm:text-xs text-muted-foreground">No data</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Additional Stats */}
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                <Card className="bg-card/30 border-primary/10 overflow-hidden">
                  <CardContent className="p-1.5 sm:p-2">
                    <p className="text-[8px] sm:text-[10px] md:text-xs text-muted-foreground uppercase truncate">Last 90 Days</p>
                    <p className="text-xs sm:text-sm md:text-base font-bold">{timePeriodStats.last90Days.toLocaleString()} views</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/30 border-primary/10 overflow-hidden">
                  <CardContent className="p-1.5 sm:p-2">
                    <p className="text-[8px] sm:text-[10px] md:text-xs text-muted-foreground uppercase truncate">This Month</p>
                    <p className="text-xs sm:text-sm md:text-base font-bold">{timePeriodStats.thisMonth.toLocaleString()} views</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
