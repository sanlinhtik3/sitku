import { Activity, Zap, Clock, DollarSign, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatTokens } from "../format-utils";
import type { ProcessedAnalytics } from "./useAnalyticsData";

interface AnalyticsStatsCardsProps {
  analytics: ProcessedAnalytics;
}

export function AnalyticsStatsCards({ analytics }: AnalyticsStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <Card className="bg-gradient-to-br from-purple-500/10 to-transparent border-purple-500/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-purple-400" />
            <span className="text-xs text-muted-foreground">RPD</span>
          </div>
          <p className="text-2xl font-bold mt-1">{analytics.rpd}</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-muted-foreground">Tokens</span>
          </div>
          <p className="text-2xl font-bold mt-1">{formatTokens(analytics.totalTokens)}</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-green-500/10 to-transparent border-green-500/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-green-400" />
            <span className="text-xs text-muted-foreground">Avg Time</span>
          </div>
          <p className="text-2xl font-bold mt-1">{analytics.avgDuration.toFixed(1)}s</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-muted-foreground">Est. Cost</span>
          </div>
          <p className="text-2xl font-bold mt-1">${analytics.totalCost.toFixed(4)}</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-cyan-500/10 to-transparent border-cyan-500/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <span className="text-xs text-muted-foreground">Cache Hit</span>
          </div>
          <p className="text-2xl font-bold mt-1">{analytics.cacheHitRate.toFixed(0)}%</p>
        </CardContent>
      </Card>
    </div>
  );
}
