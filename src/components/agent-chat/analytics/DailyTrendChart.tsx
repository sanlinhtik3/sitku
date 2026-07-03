import { TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

interface DailyTrendChartProps {
  dailyData: { date: string; requests: number; tokens: number; cachedTokens: number }[];
}

export function DailyTrendChart({ dailyData }: DailyTrendChartProps) {
  const safeData = dailyData || [];
  return (
    <Card className="border-border/30 bg-card/50">
      <CardContent className="p-4">
        <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-purple-400" />
          Daily Usage Trend
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={safeData}>
            <defs>
              <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(280, 70%, 50%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(280, 70%, 50%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorCached" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(190, 70%, 50%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(190, 70%, 50%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
            />
            <Area type="monotone" dataKey="requests" stroke="hsl(280, 70%, 50%)" strokeWidth={2} fill="url(#colorRequests)" />
            <Area type="monotone" dataKey="cachedTokens" stroke="hsl(190, 70%, 50%)" strokeWidth={2} fill="url(#colorCached)" name="Cached Tokens" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
