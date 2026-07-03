import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, subHours, format } from "date-fns";
import { getModelInfo, getModelColor, getModelDisplayName } from "@/lib/ai-models";

export interface ProcessedAnalytics {
  rpd: number;
  totalTokens: number;
  avgDuration: number;
  totalCost: number;
  dailyData: { date: string; requests: number; tokens: number; cachedTokens: number }[];
  modelBreakdown: { model: string; count: number; fill: string }[];
  apiSourceBreakdown: { name: string; value: number; fill: string }[];
  todayRequests: number;
  hourTokens: number;
  primaryModel: string;
  totalCachedTokens: number;
  cacheHitRate: number;
  estimatedSavings: number;
  // ═══ Streaming Performance (Phase E) ═══
  avgFirstTokenMs: number;       // mean time-to-first-token (ms)
  p95FirstTokenMs: number;       // p95 time-to-first-token (ms)
  avgTokensPerSec: number;       // mean streaming throughput
  streamingSampleCount: number;  // how many records contributed
  // ═══ Widget Activation (F6) ═══
  widgetRenderedCount: number;       // turns that produced a widget
  widgetShouldHaveCount: number;     // turns where data warranted a widget
  widgetActivationRate: number;      // % of "should-have" turns that actually rendered
}

const API_SOURCE_COLORS = {
  personal_key: "#10b981",
  gateway: "#3b82f6",
};

export function useAnalyticsData(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["ai-usage-analytics", userId],
    queryFn: async (): Promise<ProcessedAnalytics> => {
      const sevenDaysAgo = subDays(new Date(), 7);
      const oneHourAgo = subHours(new Date(), 1);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("agent_ai_usage")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw error;

      const records = (data || []) as any[];

      const totalRequests = records.length;
      const rpd = Math.round(totalRequests / 7);
      const totalTokens = records.reduce((sum, r) => sum + (r.tokens_total || 0), 0);
      const totalCost = records.reduce((sum, r) => sum + (r.estimated_cost || 0), 0);
      const totalCachedTokens = records.reduce((sum, r) => sum + (r.cached_tokens || 0), 0);
      const cacheHitCount = records.filter(r => (r.cached_tokens || 0) > 0).length;
      const cacheHitRate = totalRequests > 0 ? (cacheHitCount / totalRequests) * 100 : 0;
      const estimatedSavings = totalCachedTokens * 0.75 * (0.075 / 1_000_000);

      const durations = records.filter(r => r.request_duration_ms).map(r => r.request_duration_ms!);
      const avgDuration = durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length / 1000
        : 0;

      const todayRequests = records.filter(r => new Date(r.created_at) >= todayStart).length;
      const hourTokens = records
        .filter(r => new Date(r.created_at) >= oneHourAgo)
        .reduce((sum, r) => sum + (r.tokens_total || 0), 0);

      const modelCounts = new Map<string, number>();
      records.forEach(r => {
        const model = r.model_used || "unknown";
        modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
      });
      const primaryModel = [...modelCounts.entries()]
        .sort((a, b) => b[1] - a[1])[0]?.[0] || "gemini-3.5-flash";

      const dailyMap = new Map<string, { requests: number; tokens: number; cachedTokens: number }>();
      for (let i = 6; i >= 0; i--) {
        const date = format(subDays(new Date(), i), "EEE");
        dailyMap.set(date, { requests: 0, tokens: 0, cachedTokens: 0 });
      }
      records.forEach(r => {
        const date = format(new Date(r.created_at), "EEE");
        const existing = dailyMap.get(date) || { requests: 0, tokens: 0, cachedTokens: 0 };
        dailyMap.set(date, {
          requests: existing.requests + 1,
          tokens: existing.tokens + (r.tokens_total || 0),
          cachedTokens: existing.cachedTokens + (r.cached_tokens || 0),
        });
      });
      const dailyData = Array.from(dailyMap.entries()).map(([date, d]) => ({ date, ...d }));

      const modelBreakdown = Array.from(modelCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([model, count]) => ({
          model: getModelDisplayName(model),
          count,
          fill: getModelColor(model),
        }));

      const personalKeyCount = records.filter(r => r.api_source === "personal_key").length;
      const systemKeyCount = records.filter(r => 
        r.api_source === "system_key" || r.api_source === "gateway" || r.api_source === "lovable_gateway"
      ).length;
      const apiSourceBreakdown = [
        { name: "Personal Key", value: personalKeyCount, fill: API_SOURCE_COLORS.personal_key },
        { name: "System Key", value: systemKeyCount, fill: API_SOURCE_COLORS.gateway },
      ].filter(item => item.value > 0);

      // ═══ Streaming performance metrics ═══
      const ttftSamples = records.map(r => r.first_token_ms).filter((v): v is number => typeof v === 'number' && v > 0);
      const tpsSamples = records.map(r => r.tokens_per_sec).filter((v): v is number => typeof v === 'number' && v > 0);
      const avgFirstTokenMs = ttftSamples.length > 0 ? Math.round(ttftSamples.reduce((a, b) => a + b, 0) / ttftSamples.length) : 0;
      const sortedTtft = [...ttftSamples].sort((a, b) => a - b);
      const p95Idx = Math.floor(sortedTtft.length * 0.95);
      const p95FirstTokenMs = sortedTtft.length > 0 ? Math.round(sortedTtft[Math.min(p95Idx, sortedTtft.length - 1)]) : 0;
      const avgTokensPerSec = tpsSamples.length > 0 ? Number((tpsSamples.reduce((a, b) => a + b, 0) / tpsSamples.length).toFixed(1)) : 0;

      // ═══ Widget activation metrics (F6) ═══
      const widgetRenderedCount = records.filter(r => (r as any).widget_rendered === true).length;
      const widgetShouldHaveCount = records.filter(r => (r as any).widget_should_have_rendered === true).length;
      // Activation rate = rendered / (rendered + should-have-but-didn't). Both flags can be true on the same row.
      const denom = Math.max(widgetRenderedCount + widgetShouldHaveCount, 1);
      const widgetActivationRate = widgetShouldHaveCount === 0 && widgetRenderedCount === 0
        ? 0
        : Math.round((widgetRenderedCount / denom) * 100);

      return {
        rpd, totalTokens, avgDuration, totalCost, dailyData, modelBreakdown, apiSourceBreakdown,
        todayRequests, hourTokens, primaryModel, totalCachedTokens, cacheHitRate, estimatedSavings,
        avgFirstTokenMs, p95FirstTokenMs, avgTokensPerSec, streamingSampleCount: ttftSamples.length,
        widgetRenderedCount, widgetShouldHaveCount, widgetActivationRate,
      };
    },
    enabled: enabled && !!userId,
    refetchInterval: enabled ? 30000 : false,
  });
}

export function getLimits(model: string | undefined) {
  const info = getModelInfo(model);
  return { rpm: info.rpm, tpm: info.tpm, rpd: info.rpd, displayName: info.displayName };
}

export function getUsagePercentage(current: number, limit: number) {
  return Math.min(100, (current / limit) * 100);
}

export function getUsageColor(percentage: number) {
  if (percentage >= 90) return "text-red-400";
  if (percentage >= 70) return "text-amber-400";
  return "text-green-400";
}

export function getProgressColor(percentage: number) {
  if (percentage >= 90) return "bg-red-500";
  if (percentage >= 70) return "bg-amber-500";
  return "bg-green-500";
}
