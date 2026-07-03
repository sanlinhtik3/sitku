import { Gauge, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTokens } from "../format-utils";
import { getLimits, getUsagePercentage, getUsageColor, getProgressColor } from "./useAnalyticsData";
import type { ProcessedAnalytics } from "./useAnalyticsData";

interface UsageLimitsPanelProps {
  analytics: ProcessedAnalytics;
}

export function UsageLimitsPanel({ analytics }: UsageLimitsPanelProps) {
  const limits = getLimits(analytics.primaryModel);
  const rpdPercentage = getUsagePercentage(analytics.todayRequests, limits.rpd);
  const tpmPercentage = getUsagePercentage(analytics.hourTokens, limits.tpm);

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Gauge className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-medium">Usage vs Limits</h3>
          <Badge variant="outline" className="text-xs ml-auto border-amber-500/30 text-amber-400">
            {limits.displayName}
          </Badge>
        </div>

        <div className="space-y-4">
          {/* RPD Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Today's Requests (RPD)</span>
              <span className={`font-medium ${getUsageColor(rpdPercentage)}`}>
                {analytics.todayRequests} / {limits.rpd}
              </span>
            </div>
            <div className="relative h-2 bg-muted/30 rounded-full overflow-hidden">
              <div
                className={`absolute left-0 top-0 h-full rounded-full transition-all ${getProgressColor(rpdPercentage)}`}
                style={{ width: `${rpdPercentage}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {Math.round(rpdPercentage)}% used • {limits.rpd - analytics.todayRequests} remaining
            </p>
          </div>

          {/* TPM Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tokens (Last Hour)</span>
              <span className={`font-medium ${getUsageColor(tpmPercentage)}`}>
                {formatTokens(analytics.hourTokens)} / {formatTokens(limits.tpm)}
              </span>
            </div>
            <div className="relative h-2 bg-muted/30 rounded-full overflow-hidden">
              <div
                className={`absolute left-0 top-0 h-full rounded-full transition-all ${getProgressColor(tpmPercentage)}`}
                style={{ width: `${tpmPercentage}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {Math.round(tpmPercentage)}% used • {formatTokens(limits.tpm - analytics.hourTokens)} remaining
            </p>
          </div>

          {(rpdPercentage >= 70 || tpmPercentage >= 70) && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-200/80">
                Approaching usage limits. Consider upgrading your API tier or using a different model.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground/70 pt-2 border-t border-border/30">
            ⚠️ Limits are estimates based on Gemini Free Tier. Check{" "}
            <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              AI Studio
            </a>{" "}
            for exact quotas.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
