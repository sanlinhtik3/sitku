import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";

export interface UnifiedUser {
  user_id: string;
  full_name: string | null;
  email: string | null;
  tier_key: string | null;
  iu_balance: number | null;
  iu_bonus: number | null;
  preferred_model: string | null;
  iu_consumed_today: number;
  total_uses_today: number;
  daily_limit: number | null;
  provider_used: string | null;
  model_used: string | null;
  gemini_model: string | null;
  is_paused: boolean;
  has_personal_key: boolean;
  granted_by: string | null;
  plan_type: string | null;
}

export interface IntelligenceStats {
  totalUsers: number;
  iuUsedToday: number;
  activeToday: number;
  usageRate: number;
}

export interface IUTrend {
  date: string;
  iu: number;
  requests: number;
}

export interface ProviderDist {
  name: string;
  value: number;
}

export interface TopConsumer {
  user_id: string;
  full_name: string | null;
  email: string | null;
  iu_total: number;
}

const today = () => {
  const d = new Date();
  return format(d, "yyyy-MM-dd");
};

export function useUnifiedUsers() {
  return useQuery({
    queryKey: ["unified-intelligence-users"],
    refetchInterval: 30_000,
    queryFn: async () => {
      // 1. All profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .order("created_at", { ascending: false });

      if (!profiles?.length) return [];

      const userIds = profiles.map((p) => p.user_id);

      // 2. Credits/tier
      const { data: credits } = await supabase
        .from("user_credits")
        .select("user_id, tier_key, iu_balance, iu_bonus, preferred_model")
        .in("user_id", userIds);

      // 3. Today's usage
      const { data: todayUsage } = await supabase
        .from("daily_usage")
        .select("user_id, iu_consumed, total_uses, daily_limit, model_used, provider_used")
        .eq("usage_date", today())
        .in("user_id", userIds);

      // 4. AI settings
      const { data: aiSettings } = await supabase
        .from("ai_user_settings")
        .select("user_id, gemini_model, is_paused, granted_by")
        .in("user_id", userIds);

      // 5. Users with personal keys
      const { data: usersWithKeys } = await supabase
        .from("ai_user_settings")
        .select("user_id")
        .in("user_id", userIds)
        .not("gemini_api_key", "is", null);
      const keySet = new Set(usersWithKeys?.map((u) => u.user_id) || []);

      // 6. Active subscriptions
      const { data: subs } = await supabase
        .from("pro_subscriptions")
        .select("user_id, plan_type")
        .eq("status", "active")
        .in("user_id", userIds);

      // Merge
      return profiles.map((p): UnifiedUser => {
        const credit = credits?.find((c) => c.user_id === p.user_id);
        const usage = todayUsage?.find((u) => u.user_id === p.user_id);
        const ai = aiSettings?.find((a) => a.user_id === p.user_id);
        const sub = subs?.find((s) => s.user_id === p.user_id);

        return {
          user_id: p.user_id,
          full_name: p.full_name,
          email: p.email,
          tier_key: credit?.tier_key || "explorer",
          iu_balance: credit?.iu_balance ?? 0,
          iu_bonus: credit?.iu_bonus ?? 0,
          preferred_model: credit?.preferred_model,
          iu_consumed_today: usage?.iu_consumed ?? 0,
          total_uses_today: usage?.total_uses ?? 0,
          daily_limit: usage?.daily_limit ?? 10,
          provider_used: usage?.provider_used,
          model_used: usage?.model_used,
          gemini_model: ai?.gemini_model,
          is_paused: ai?.is_paused ?? false,
          has_personal_key: keySet.has(p.user_id),
          granted_by: ai?.granted_by ?? null,
          plan_type: sub?.plan_type ?? null,
        };
      });
    },
  });
}

export function useIntelligenceStats() {
  return useQuery({
    queryKey: ["unified-intelligence-stats"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count: totalUsers } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      const { data: todayData } = await supabase
        .from("daily_usage")
        .select("iu_consumed, total_uses")
        .eq("usage_date", today());

      const iuUsedToday = todayData?.reduce((s, r) => s + (r.iu_consumed ?? 0), 0) ?? 0;
      const activeToday = todayData?.filter((r) => (r.total_uses ?? 0) > 0).length ?? 0;

      return {
        totalUsers: totalUsers ?? 0,
        iuUsedToday,
        activeToday,
        usageRate: totalUsers ? (activeToday / totalUsers) * 100 : 0,
      } as IntelligenceStats;
    },
  });
}

export function useIUTrends() {
  return useQuery({
    queryKey: ["unified-iu-trends"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const sevenDaysAgo = format(subDays(new Date(), 6), "yyyy-MM-dd");
      const { data } = await supabase
        .from("daily_usage")
        .select("usage_date, iu_consumed, total_uses")
        .gte("usage_date", sevenDaysAgo)
        .order("usage_date", { ascending: true });

      // Group by date
      const grouped: Record<string, { iu: number; requests: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = format(subDays(new Date(), i), "yyyy-MM-dd");
        grouped[d] = { iu: 0, requests: 0 };
      }

      data?.forEach((r) => {
        if (grouped[r.usage_date]) {
          grouped[r.usage_date].iu += r.iu_consumed ?? 0;
          grouped[r.usage_date].requests += r.total_uses ?? 0;
        }
      });

      return Object.entries(grouped).map(
        ([date, val]): IUTrend => ({
          date: format(new Date(date + "T00:00:00"), "MMM dd"),
          iu: Math.round(val.iu * 100) / 100,
          requests: val.requests,
        })
      );
    },
  });
}

export function useProviderDistribution() {
  return useQuery({
    queryKey: ["unified-provider-dist"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const sevenDaysAgo = format(subDays(new Date(), 6), "yyyy-MM-dd");
      const { data } = await supabase
        .from("daily_usage")
        .select("provider_used, iu_consumed")
        .gte("usage_date", sevenDaysAgo);

      const dist: Record<string, number> = {};
      data?.forEach((r) => {
        const provider = r.provider_used || "unknown";
        dist[provider] = (dist[provider] || 0) + (r.iu_consumed ?? 0);
      });

      return Object.entries(dist).map(
        ([name, value]): ProviderDist => ({ name, value: Math.round(value * 100) / 100 })
      );
    },
  });
}

export function useTopConsumers() {
  return useQuery({
    queryKey: ["unified-top-consumers"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const sevenDaysAgo = format(subDays(new Date(), 6), "yyyy-MM-dd");
      const { data } = await supabase
        .from("daily_usage")
        .select("user_id, iu_consumed")
        .gte("usage_date", sevenDaysAgo);

      const userMap: Record<string, number> = {};
      data?.forEach((r) => {
        userMap[r.user_id] = (userMap[r.user_id] || 0) + (r.iu_consumed ?? 0);
      });

      const sorted = Object.entries(userMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (!sorted.length) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", sorted.map((s) => s[0]));

      return sorted.map(
        ([user_id, iu_total]): TopConsumer => {
          const p = profiles?.find((pr) => pr.user_id === user_id);
          return {
            user_id,
            full_name: p?.full_name ?? null,
            email: p?.email ?? null,
            iu_total: Math.round(iu_total * 100) / 100,
          };
        }
      );
    },
  });
}
