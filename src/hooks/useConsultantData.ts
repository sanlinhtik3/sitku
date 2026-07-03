import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { consultantStore, LOCAL_USER_ID } from "@/repositories/local/consultantStore";
import { toast } from "sonner";

// Re-export the pure helpers + types so existing callers are unaffected. The
// canonical home is now @/lib/consultantHelpers (extracted to break a
// production TDZ crash — see that file's header).
export {
  type DateRange,
  type ConsultantRangePreset,
  type ConsultantRangeSelection,
  CONSULTANT_FINANCE_CURRENCY,
  localDateString,
  defaultRange,
  consultantRangeForPreset,
  eachDayInRange,
  timelineDayLabel,
  isFutureTimelineDay,
} from "@/lib/consultantHelpers";

// Import locally for internal use.
import {
  type DateRange,
  localDateString,
  defaultRange,
  consultantRangeForPreset,
  eachDayInRange,
} from "@/lib/consultantHelpers";

export type Platform =
  | "facebook" | "instagram" | "tiktok" | "youtube"
  | "telegram" | "x" | "linkedin" | "threads"
  | "podcast" | "newsletter" | "other";

export interface ConsultantPost {
  id: string;
  user_id: string;
  platform: Platform;
  post_url: string | null;
  post_name: string;
  posted_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsultantMetric {
  id: string;
  post_id: string;
  metric_date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  notes: string | null;
}

export interface ConsultantFinance {
  id: string;
  entry_date: string;
  entry_type: "expense" | "income";
  category: string;
  amount: number;
  currency: string;
  related_post_id: string | null;
  description: string | null;
}

export interface ConsultantChannel {
  id: string;
  user_id: string;
  platform: Platform;
  handle: string | null;
  display_name: string;
  is_active: boolean;
}

export interface ConsultantDailySnapshot {
  id: string;
  user_id: string;
  channel_id: string;
  platform: Platform;
  channel_name: string;
  captured_at: string;
  followers: number;
  total_views: number;
  posts_count: number;
  engagement_rate: number;
  impressions: number;
  reach: number;
  notes: string | null;
}

const KEYS = {
  posts: ["agentic", "posts"] as const,
  channels: ["agentic", "channels"] as const,
  snapshots: (r?: DateRange) => ["agentic", "snapshots", r?.from ?? "all", r?.to ?? "all"] as const,
  weeklyAnalysis: (r: DateRange) => ["agentic", "weekly-analysis", r.from, r.to] as const,
  metrics: (postId?: string) => ["agentic", "metrics", postId ?? "all"] as const,
  finance: ["agentic", "finance"] as const,
  dashboard: (r: DateRange) => ["agentic", "dashboard", r.from, r.to] as const,
  financeSummary: (r: DateRange) => ["agentic", "finance-summary", r.from, r.to] as const,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(s: string) {
  const [year, month, day] = s.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fmtDate(d);
}

function daysInclusive(range: DateRange) {
  return Math.max(1, Math.round((parseDate(range.to).getTime() - parseDate(range.from).getTime()) / DAY_MS) + 1);
}

function previousRange(range: DateRange): DateRange {
  const days = daysInclusive(range);
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(days - 1)), to };
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function sumBy<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((sum, row) => sum + Number(pick(row) || 0), 0);
}

// ── Channels ───────────────────────────────────────────────
export function useConsultantChannels() {
  return useQuery({
    queryKey: KEYS.channels,
    queryFn: async () => {
      const data = await consultantStore.listChannels();
      return data.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        platform: r.platform as Platform,
        handle: r.handle,
        display_name: r.display_name,
        is_active: r.is_active,
      })) as ConsultantChannel[];
    },
  });
}

// ── Daily channel snapshots ────────────────────────────────
export function useConsultantDailySnapshots(range?: DateRange) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: KEYS.snapshots(range),
    queryFn: async () => {
      const data = await consultantStore.listSnapshots(range);
      return data.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        channel_id: r.channel_id,
        platform: (r.agentic_channels?.platform ?? "other") as Platform,
        channel_name: r.agentic_channels?.display_name ?? "Channel",
        captured_at: r.captured_at,
        followers: Number(r.followers ?? 0),
        total_views: Number(r.total_views ?? 0),
        posts_count: Number(r.posts_count ?? 0),
        engagement_rate: Number(r.engagement_rate ?? 0),
        impressions: Number(r.impressions ?? 0),
        reach: Number(r.reach ?? 0),
        notes: r.notes ?? null,
      })) as ConsultantDailySnapshot[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (s: {
      platform: Platform;
      captured_at: string;
      followers?: number;
      total_views?: number;
      posts_count?: number;
      engagement_rate?: number;
      impressions?: number;
      reach?: number;
      notes?: string | null;
    }) => {
      await consultantStore.upsertSnapshot(LOCAL_USER_ID, s);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentic"] });
      toast.success("Daily snapshot saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save daily snapshot"),
  });

  return { ...list, upsert };
}

// ── Weekly performance analysis (read-only) ────────────────
export function useConsultantWeeklyAnalysis(range: DateRange) {
  return useQuery({
    queryKey: KEYS.weeklyAnalysis(range),
    queryFn: async () => {
      const baseline = previousRange(range);
      const [currentPostsRes, baselinePostsRes, currentRevRes, currentExpRes, baselineRevRes, baselineExpRes, snapshotsRes] = await Promise.all([
        consultantStore.queryPosts(range.from, range.to).then((data) => ({ data })),
        consultantStore.queryPosts(baseline.from, baseline.to).then((data) => ({ data })),
        consultantStore.listRevenue({ from: range.from, to: range.to }).then((data) => ({ data })),
        consultantStore.listExpenses({ from: range.from, to: range.to }).then((data) => ({ data })),
        consultantStore.listRevenue({ from: baseline.from, to: baseline.to }).then((data) => ({ data })),
        consultantStore.listExpenses({ from: baseline.from, to: baseline.to }).then((data) => ({ data })),
        consultantStore.listSnapshots(range).then((data) => ({ data })),
      ]);

      const currentPosts = ((currentPostsRes.data ?? []) as any[]).map((p) => ({
        id: p.id,
        title: p.title ?? "Untitled",
        post_url: p.post_url ?? null,
        posted_at: p.posted_at,
        platform: p.agentic_channels?.platform ?? "other",
        channel_name: p.agentic_channels?.display_name ?? "Channel",
        views: Number(p.views || 0),
        likes: Number(p.likes || 0),
        comments: Number(p.comments || 0),
        shares: Number(p.shares || 0),
        saves: Number(p.saves || 0),
        reach: Number(p.reach || 0),
        engagement: Number(p.likes || 0) + Number(p.comments || 0) + Number(p.shares || 0) + Number(p.saves || 0),
      }));

      const baselinePosts = ((baselinePostsRes.data ?? []) as any[]).map((p) => ({
        views: Number(p.views || 0),
        reach: Number(p.reach || 0),
        engagement: Number(p.likes || 0) + Number(p.comments || 0) + Number(p.shares || 0) + Number(p.saves || 0),
      }));

      const currentRevenue = sumBy((currentRevRes.data ?? []) as any[], (r) => Number(r.amount || 0));
      const currentSpend = sumBy((currentExpRes.data ?? []) as any[], (r) => Number(r.amount || 0));
      const baselineRevenue = sumBy((baselineRevRes.data ?? []) as any[], (r) => Number(r.amount || 0));
      const baselineSpend = sumBy((baselineExpRes.data ?? []) as any[], (r) => Number(r.amount || 0));

      const totals = {
        posts: currentPosts.length,
        views: sumBy(currentPosts, (p) => p.views),
        engagement: sumBy(currentPosts, (p) => p.engagement),
        reach: sumBy(currentPosts, (p) => p.reach),
        revenue: currentRevenue,
        spend: currentSpend,
        net: currentRevenue - currentSpend,
      };
      const baselineTotals = {
        posts: baselinePosts.length,
        views: sumBy(baselinePosts, (p) => p.views),
        engagement: sumBy(baselinePosts, (p) => p.engagement),
        reach: sumBy(baselinePosts, (p) => p.reach),
        revenue: baselineRevenue,
        spend: baselineSpend,
        net: baselineRevenue - baselineSpend,
      };

      const topPosts = [...currentPosts].sort((a, b) => b.views - a.views).slice(0, 7);
      const bestPost = topPosts[0] ?? null;
      const hundredKPosts = currentPosts.filter((p) => p.views >= 100_000).length;
      const avgViews = totals.posts > 0 ? totals.views / totals.posts : 0;
      const lowSignalPosts = currentPosts
        .filter((p) => p.views < Math.max(3_000, avgViews * 0.25))
        .sort((a, b) => a.views - b.views)
        .slice(0, 5);

      const dailyMap = new Map<string, {
        date: string;
        views: number;
        engagement: number;
        posts: number;
        followers: number;
        reach: number;
        revenue: number;
        spend: number;
      }>();
      const ensureDay = (date: string) => {
        if (!dailyMap.has(date)) {
          dailyMap.set(date, { date, views: 0, engagement: 0, posts: 0, followers: 0, reach: 0, revenue: 0, spend: 0 });
        }
        return dailyMap.get(date)!;
      };

      currentPosts.forEach((p) => {
        const day = ensureDay(p.posted_at);
        day.views += p.views;
        day.engagement += p.engagement;
        day.reach += p.reach;
        day.posts += 1;
      });
      ((snapshotsRes.data ?? []) as any[]).forEach((s) => {
        const day = ensureDay(s.captured_at);
        day.followers += Number(s.followers || 0);
        if (day.views === 0) day.views += Number(s.total_views || 0);
        if (day.reach === 0) day.reach += Number(s.reach || 0);
      });
      ((currentRevRes.data ?? []) as any[]).forEach((r) => {
        ensureDay(r.occurred_at).revenue += Number(r.amount || 0);
      });
      ((currentExpRes.data ?? []) as any[]).forEach((r) => {
        ensureDay(r.occurred_at).spend += Number(r.amount || 0);
      });

      const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      const peakDay = [...daily].sort((a, b) => b.views - a.views)[0] ?? null;
      const snapshotDays = new Set(((snapshotsRes.data ?? []) as any[]).map((s) => s.captured_at)).size;
      const days = daysInclusive(range);
      const roiPct = totals.spend > 0 ? Number(((totals.net / totals.spend) * 100).toFixed(1)) : null;
      const baselineRoiPct = baselineTotals.spend > 0 ? Number(((baselineTotals.net / baselineTotals.spend) * 100).toFixed(1)) : null;

      return {
        range,
        baseline,
        days,
        totals: {
          ...totals,
          roi_pct: roiPct,
          avg_views_per_post: Math.round(avgViews),
          engagement_rate: totals.views > 0 ? Number(((totals.engagement / totals.views) * 100).toFixed(2)) : 0,
          cost_per_view: totals.views > 0 ? Number((totals.spend / totals.views).toFixed(4)) : 0,
        },
        baselineTotals: {
          ...baselineTotals,
          roi_pct: baselineRoiPct,
          avg_views_per_post: baselineTotals.posts > 0 ? Math.round(baselineTotals.views / baselineTotals.posts) : 0,
        },
        deltas: {
          views: pctChange(totals.views, baselineTotals.views),
          engagement: pctChange(totals.engagement, baselineTotals.engagement),
          posts: pctChange(totals.posts, baselineTotals.posts),
          revenue: pctChange(totals.revenue, baselineTotals.revenue),
          net: pctChange(totals.net, baselineTotals.net),
        },
        topPosts,
        bestPost,
        lowSignalPosts,
        daily,
        peakDay,
        targets: {
          data_coverage_pct: Math.round((snapshotDays / days) * 100),
          hundred_k_posts: hundredKPosts,
          hundred_k_goal: Math.max(5, hundredKPosts + 2),
          cadence_pct: Math.round(Math.min(100, (totals.posts / days) * 100)),
          cfo_health_pct: Math.round(Math.max(0, Math.min(100, (totals.revenue > 0 ? (totals.net / totals.revenue) * 70 : 0) + (roiPct ?? 0) * 0.3))),
        },
      };
    },
  });
}

// ── Posts ────────────────────────────────────────────────
export function useConsultantPosts() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: KEYS.posts,
    queryFn: async () => {
      const data = await consultantStore.listPosts();
      return data.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        platform: (r.agentic_channels?.platform ?? "other") as Platform,
        post_url: r.post_url,
        post_name: r.title,
        posted_at: r.posted_at,
        notes: r.notes,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })) as ConsultantPost[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (p: Partial<ConsultantPost> & { post_name: string; platform: Platform }): Promise<{ id: string }> => {
      return consultantStore.upsertPost(LOCAL_USER_ID, {
        id: p.id,
        platform: p.platform,
        post_name: p.post_name,
        post_url: p.post_url ?? null,
        posted_at: p.posted_at,
        notes: p.notes ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentic"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save post"),
  });


  const remove = useMutation({
    mutationFn: async (id: string) => {
      await consultantStore.deletePost(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentic"] });
      toast.success("Post deleted");
    },
  });

  return { ...list, upsert, remove };
}

// ── Metrics (synthesized from agentic_posts inline counters) ─────
export function useConsultantMetrics(postId?: string) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: KEYS.metrics(postId),
    queryFn: async () => {
      const data = await consultantStore.listPostMetrics(postId);
      return data.map((r) => ({
        id: r.id,
        post_id: r.id,
        metric_date: r.posted_at,
        views: r.views ?? 0,
        likes: r.likes ?? 0,
        comments: r.comments ?? 0,
        shares: r.shares ?? 0,
        saves: r.saves ?? 0,
        reach: r.reach ?? 0,
        notes: r.notes ?? null,
      })) as ConsultantMetric[];
    },
  });

  const addOrUpdate = useMutation({
    mutationFn: async (m: Partial<ConsultantMetric> & { post_id: string; metric_date: string }) => {
      // Update the post's inline counters (latest values)
      await consultantStore.updatePostMetrics(m.post_id, {
        views: m.views ?? 0,
        likes: m.likes ?? 0,
        comments: m.comments ?? 0,
        shares: m.shares ?? 0,
        saves: m.saves ?? 0,
        reach: m.reach ?? 0,
        notes: m.notes ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentic"] });
    },

    onError: (e: any) => toast.error(e?.message ?? "Failed to save metrics"),
  });

  return { ...list, addOrUpdate };
}

// ── Finance (split across revenue + expenses) ─────────────
export function useConsultantFinance() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: KEYS.finance,
    queryFn: async () => {
      const [revData, expData] = await Promise.all([
        consultantStore.listRevenue({ limit: 250 }),
        consultantStore.listExpenses({ limit: 250 }),
      ]);
      const rev = { data: revData };
      const exp = { data: expData };
      const r: ConsultantFinance[] = ((rev.data ?? []) as any[]).map((x) => ({
        id: x.id,
        entry_date: x.occurred_at,
        entry_type: "income",
        category: x.source,
        amount: Number(x.amount),
        currency: x.currency,
        related_post_id: x.related_post_id,
        description: x.description,
      }));
      const e: ConsultantFinance[] = ((exp.data ?? []) as any[]).map((x) => ({
        id: x.id,
        entry_date: x.occurred_at,
        entry_type: "expense",
        category: x.category,
        amount: Number(x.amount),
        currency: x.currency,
        related_post_id: null,
        description: x.description,
      }));
      return [...r, ...e].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
    },
  });

  const add = useMutation({
    mutationFn: async (e: Partial<ConsultantFinance> & {
      entry_type: "expense" | "income"; category: string; amount: number;
    }) => {
      if (e.entry_type === "income") {
        await consultantStore.addRevenue(LOCAL_USER_ID, {
          entry_date: e.entry_date,
          source: e.category,
          amount: e.amount,
          related_post_id: e.related_post_id ?? null,
          description: e.description ?? null,
        });
      } else {
        await consultantStore.addExpense(LOCAL_USER_ID, {
          entry_date: e.entry_date,
          category: e.category,
          amount: e.amount,
          description: e.description ?? null,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentic"] });
      toast.success("Entry saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const remove = useMutation({
    mutationFn: async ({ id, entry_type }: { id: string; entry_type: "income" | "expense" }) => {
      if (entry_type === "income") await consultantStore.deleteRevenue(id);
      else await consultantStore.deleteExpense(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agentic"] }),
  });


  return { ...list, add, remove };
}

// ── Dashboard summary (re-shaped to legacy shape) ─────────
export function useConsultantDashboard(range: DateRange) {
  return useQuery({
    queryKey: KEYS.dashboard(range),
    queryFn: async () => {
      const d: any = await consultantStore.dashboardSummary(range.from, range.to);
      const [revData, expData, channelsData] = await Promise.all([
        consultantStore.listRevenue({ from: range.from, to: range.to }),
        consultantStore.listExpenses({ from: range.from, to: range.to }),
        consultantStore.listChannels(),
      ]);
      const rev = { data: revData };
      const exp = { data: expData };
      const channels = { data: channelsData };
      const revenue = ((rev.data ?? []) as any[]).reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const spend = ((exp.data ?? []) as any[]).reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const net = revenue - spend;
      const channelPlatform = new Map(((channels.data ?? []) as any[]).map((row) => [row.id, row.platform]));
      const revenueByPlatform = ((rev.data ?? []) as any[]).reduce((map, row) => {
        const channelId = row.channel_id;
        const platform = channelId ? channelPlatform.get(channelId) : null;
        if (platform) map.set(platform, (map.get(platform) ?? 0) + Number(row.amount || 0));
        return map;
      }, new Map<string, number>());
      const byPlatform = Array.isArray(d.by_platform)
        ? d.by_platform.map((row: any) => ({
          ...row,
          revenue: revenueByPlatform.get(row.platform) ?? 0,
        }))
        : [];
      // Map new field names → legacy keys consumed by OverviewKpiGrid
      return {
        from: d.from, to: d.to,
        total_posts: d.posts ?? 0,
        views: d.views ?? 0,
        engagement: d.engagement ?? 0,
        spend,
        revenue,
        net,
        roi_pct: spend > 0 ? Number(((net / spend) * 100).toFixed(2)) : null,
        followers: d.followers ?? 0,
        by_platform: byPlatform,
        trend: d.trend ?? [],
      } as any;
    },
  });
}

// ── Finance summary (computed client-side) ────────────────
export function useConsultantFinanceSummary(range: DateRange) {
  return useQuery({
    queryKey: KEYS.financeSummary(range),
    queryFn: async () => {
      const [revData, expData] = await Promise.all([
        consultantStore.listRevenue({ from: range.from, to: range.to }),
        consultantStore.listExpenses({ from: range.from, to: range.to }),
      ]);
      const rev = { data: revData };
      const exp = { data: expData };
      const revRows = (rev.data ?? []) as any[];
      const expRows = (exp.data ?? []) as any[];

      const revenue = revRows.reduce((s, r) => s + Number(r.amount || 0), 0);
      const spend = expRows.reduce((s, r) => s + Number(r.amount || 0), 0);
      const net = revenue - spend;

      const byCatMap = new Map<string, { category: string; entry_type: string; amount: number }>();
      revRows.forEach((r) => {
        const k = `${r.source}|income`;
        byCatMap.set(k, { category: r.source, entry_type: "income", amount: (byCatMap.get(k)?.amount ?? 0) + Number(r.amount || 0) });
      });
      expRows.forEach((r) => {
        const k = `${r.category}|expense`;
        byCatMap.set(k, { category: r.category, entry_type: "expense", amount: (byCatMap.get(k)?.amount ?? 0) + Number(r.amount || 0) });
      });

      const byDayMap = new Map<string, { entry_date: string; revenue: number; spend: number }>();
      const ensure = (d: string) => {
        if (!byDayMap.has(d)) byDayMap.set(d, { entry_date: d, revenue: 0, spend: 0 });
        return byDayMap.get(d)!;
      };
      eachDayInRange(range).forEach(ensure);
      revRows.forEach((r) => { ensure(r.occurred_at).revenue += Number(r.amount || 0); });
      expRows.forEach((r) => { ensure(r.occurred_at).spend += Number(r.amount || 0); });

      return {
        from: range.from, to: range.to,
        revenue, spend, net,
        roi_pct: spend > 0 ? Number((((revenue - spend) / spend) * 100).toFixed(2)) : null,
        by_category: Array.from(byCatMap.values()).sort((a, b) => b.amount - a.amount),
        by_day: Array.from(byDayMap.values()).sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
      } as any;
    },
  });
}
