import { Zap, Gauge, Activity, LayoutDashboard } from "lucide-react";
import type { ProcessedAnalytics } from "./useAnalyticsData";

interface Props {
  analytics: Pick<ProcessedAnalytics, "avgFirstTokenMs" | "p95FirstTokenMs" | "avgTokensPerSec" | "streamingSampleCount" | "widgetRenderedCount" | "widgetShouldHaveCount" | "widgetActivationRate">;
}

// World-class SSE benchmarks (Claude.ai / Kimi reference range)
const TTFT_GOOD = 800;   // ms — under this is excellent
const TTFT_OKAY = 1500;  // ms — under this is acceptable
const TPS_GOOD = 35;     // tokens/sec — Claude streaming feel
const TPS_OKAY = 18;

function getTtftColor(ms: number) {
  if (ms === 0) return "text-muted-foreground";
  if (ms <= TTFT_GOOD) return "text-emerald-400";
  if (ms <= TTFT_OKAY) return "text-amber-400";
  return "text-red-400";
}

function getTpsColor(tps: number) {
  if (tps === 0) return "text-muted-foreground";
  if (tps >= TPS_GOOD) return "text-emerald-400";
  if (tps >= TPS_OKAY) return "text-amber-400";
  return "text-red-400";
}

function getActivationColor(pct: number, total: number) {
  if (total === 0) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-400";
  if (pct >= 50) return "text-amber-400";
  return "text-red-400";
}

export function StreamingPerformanceCard({ analytics }: Props) {
  const { avgFirstTokenMs, p95FirstTokenMs, avgTokensPerSec, streamingSampleCount,
          widgetRenderedCount, widgetShouldHaveCount, widgetActivationRate } = analytics;

  const widgetTotal = widgetRenderedCount + widgetShouldHaveCount;
  if (streamingSampleCount === 0 && widgetTotal === 0) {
    return null; // no data yet — hide gracefully
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-purple-400" />
          Streaming Performance
        </h3>
        <span className="text-xs text-muted-foreground">{streamingSampleCount} samples</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Avg TTFT */}
        <div className="rounded-lg bg-background/60 border border-border/30 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg TTFT</span>
          </div>
          <div className={`text-xl font-bold ${getTtftColor(avgFirstTokenMs)}`}>
            {avgFirstTokenMs}<span className="text-xs ml-0.5 font-normal opacity-70">ms</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            target &lt;{TTFT_GOOD}ms
          </div>
        </div>

        {/* P95 TTFT */}
        <div className="rounded-lg bg-background/60 border border-border/30 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Gauge className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">P95 TTFT</span>
          </div>
          <div className={`text-xl font-bold ${getTtftColor(p95FirstTokenMs)}`}>
            {p95FirstTokenMs}<span className="text-xs ml-0.5 font-normal opacity-70">ms</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            tail latency
          </div>
        </div>

        {/* Throughput */}
        <div className="rounded-lg bg-background/60 border border-border/30 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Throughput</span>
          </div>
          <div className={`text-xl font-bold ${getTpsColor(avgTokensPerSec)}`}>
            {avgTokensPerSec}<span className="text-xs ml-0.5 font-normal opacity-70">t/s</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            target ≥{TPS_GOOD} t/s
          </div>
        </div>
      </div>

      {/* Widget Activation Rate (F6) */}
      {widgetTotal > 0 && (
        <div className="mt-3 rounded-lg bg-background/60 border border-border/30 p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <LayoutDashboard className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Widget Activation (7d)</span>
            </div>
            <span className="text-[10px] text-muted-foreground">{widgetRenderedCount} rendered / {widgetTotal} opportunities</span>
          </div>
          <div className={`text-xl font-bold ${getActivationColor(widgetActivationRate, widgetTotal)}`}>
            {widgetActivationRate}<span className="text-xs ml-0.5 font-normal opacity-70">%</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            target ≥80% — when tool data warrants a widget, it should be rendered
          </div>
        </div>
      )}
    </div>
  );
}
