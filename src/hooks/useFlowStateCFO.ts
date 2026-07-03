import { useQuery } from "@tanstack/react-query";
import { runCfoTool, type CFOTool, type CFOResult } from "@/lib/flowstate/cfoCompute";

export type { CFOTool };

// Kept for backward compatibility with existing imports.
export type CFOResponse = CFOResult;

export function useCashflowForecast(userId: string | undefined, months: number, currency: string, enabled = true) {
  return useQuery({
    queryKey: ["cfo", "cashflow_forecast", userId, months, currency],
    queryFn: () => runCfoTool("cashflow_forecast", userId!, { months_ahead: months, currency }),
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRunway(userId: string | undefined, currency: string, enabled = true) {
  return useQuery({
    queryKey: ["cfo", "runway_analysis", userId, currency],
    queryFn: () => runCfoTool("runway_analysis", userId!, { currency }),
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePnlSummary(userId: string | undefined, days: number, currency: string, enabled = true) {
  return useQuery({
    queryKey: ["cfo", "pnl_summary", userId, days, currency],
    queryFn: () => runCfoTool("pnl_summary", userId!, { days, currency }),
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUnitEconomics(
  userId: string | undefined,
  args: { cac: number; arpu: number; gross_margin_pct?: number; churn_pct?: number; currency?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["cfo", "unit_economics", userId, args],
    queryFn: () => runCfoTool("unit_economics", userId!, args),
    enabled: enabled && !!userId && args.cac > 0 && args.arpu > 0,
    staleTime: 5 * 60 * 1000,
  });
}
