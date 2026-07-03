import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTrendingUp, IconRocket, IconBolt } from "@tabler/icons-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import type { IUTrend, ProviderDist, TopConsumer } from "./useUnifiedIntelligenceData";

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2, 217 91% 60%))", "hsl(var(--chart-3, 142 71% 45%))", "hsl(var(--chart-4, 38 92% 50%))"];

interface Props {
  trends: IUTrend[] | undefined;
  providerDist: ProviderDist[] | undefined;
  topConsumers: TopConsumer[] | undefined;
}

export function IntelligenceAnalytics({ trends, providerDist, topConsumers }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* IU Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <IconTrendingUp className="h-5 w-5" />
              IU Usage (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    formatter={(value: number) => [value.toFixed(1), "IU"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                  <Area type="monotone" dataKey="iu" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Provider Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <IconRocket className="h-5 w-5" />
              Provider Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {providerDist?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={providerDist as any[]}
                      cx="50%" cy="50%"
                      innerRadius={60} outerRadius={100}
                      paddingAngle={2} dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {providerDist.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [value.toFixed(1), "IU"]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">No data yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Consumers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <IconBolt className="h-5 w-5" />
            Top IU Consumers (7 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {topConsumers?.length ? (
              topConsumers.map((c, i) => (
                <div key={c.user_id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground">#{i + 1}</span>
                    <div>
                      <p className="font-medium">{c.full_name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{c.iu_total} IU</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-4">No usage data yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
