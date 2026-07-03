// ═══════════════════════════════════════════════════════════════
// AgentConsultant / Agentic Era — tool executor
// Adapter mapping `manage_consultant` actions to the new agentic_* schema.
// ═══════════════════════════════════════════════════════════════

type SB = any;

const CONSULTANT_FINANCE_CURRENCY = "USDT";

const todayMM = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Yangon" }));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const VALID_PLATFORMS = new Set([
  "facebook","instagram","tiktok","youtube","x","linkedin","threads","other",
  "telegram","podcast","newsletter",
]);
const VALID_REVENUE_SOURCES = new Set([
  "sponsored","affiliate","adsense","subscription","product","service","tips","other",
]);

function widget(preset: string, data: any) { return { ok: true, widget: { preset, data } }; }
function err(msg: string) { return { ok: false, error: msg }; }

async function ensureChannel(supabase: SB, userId: string, platform: string): Promise<string> {
  const { data: existing } = await supabase
    .from("agentic_channels")
    .select("id")
    .eq("user_id", userId).eq("platform", platform).eq("is_active", true)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await supabase
    .from("agentic_channels")
    .insert({ user_id: userId, platform, display_name: platform.charAt(0).toUpperCase()+platform.slice(1) })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}

export async function executeManageConsultant(supabase: SB, userId: string, args: any): Promise<any> {
  if (!userId) return err("unauthenticated");
  const action = String(args?.action || "").trim();
  if (!action) return err("action is required");

  switch (action) {
    case "create_post": {
      const post_name = String(args.post_name || args.title || "").trim();
      if (!post_name) return err("post_name is required");
      const platform = VALID_PLATFORMS.has(args.platform) ? args.platform : "facebook";
      const channelId = await ensureChannel(supabase, userId, platform);
      const { data, error } = await supabase.from("agentic_posts").insert({
        user_id: userId, channel_id: channelId,
        title: post_name,
        post_url: args.post_url || null,
        posted_at: args.posted_at || todayMM(),
        notes: args.notes || null,
      }).select().single();
      if (error) return err(error.message);
      return { ok: true, post: data, message: `Post "${post_name}" created.` };
    }

    case "update_post": {
      if (!args.post_id) return err("post_id is required");
      const patch: any = {};
      if (args.post_name !== undefined || args.title !== undefined) patch.title = args.post_name ?? args.title;
      if (args.post_url !== undefined) patch.post_url = args.post_url;
      if (args.notes !== undefined) patch.notes = args.notes;
      if (args.posted_at !== undefined) patch.posted_at = args.posted_at;
      if (args.platform && VALID_PLATFORMS.has(args.platform)) {
        patch.channel_id = await ensureChannel(supabase, userId, args.platform);
      }
      const { data, error } = await supabase.from("agentic_posts").update(patch)
        .eq("id", args.post_id).eq("user_id", userId).select().single();
      if (error) return err(error.message);
      return { ok: true, post: data };
    }

    case "delete_post": {
      if (!args.post_id) return err("post_id is required");
      const { error } = await supabase.from("agentic_posts").delete()
        .eq("id", args.post_id).eq("user_id", userId);
      if (error) return err(error.message);
      return { ok: true, deleted: args.post_id };
    }

    case "list_posts": {
      const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);
      const { data, error } = await supabase.from("agentic_posts")
        .select("id, title, posted_at, post_url, channel_id, agentic_channels!inner(platform)")
        .eq("user_id", userId)
        .order("posted_at", { ascending: false }).limit(limit);
      if (error) return err(error.message);
      const rows = (data || []).filter((p: any) => !args.platform || p.agentic_channels?.platform === args.platform);
      return widget("table", {
        title: "Tracked Posts",
        columns: ["title","platform","posted_at","post_url"],
        rows: rows.map((p: any) => ({
          title: p.title, platform: p.agentic_channels?.platform ?? "other",
          posted_at: p.posted_at, post_url: p.post_url || "—",
        })),
      });
    }

    case "get_post": {
      if (!args.post_id) return err("post_id is required");
      const { data, error } = await supabase.from("agentic_posts")
        .select("*, agentic_channels!inner(platform)")
        .eq("id", args.post_id).eq("user_id", userId).maybeSingle();
      if (error) return err(error.message);
      return { ok: true, post: data };
    }

    case "add_metrics":
    case "update_metrics": {
      if (!args.post_id) return err("post_id is required");
      const patch: any = {
        views: Number(args.views) || 0,
        likes: Number(args.likes) || 0,
        comments: Number(args.comments) || 0,
        shares: Number(args.shares) || 0,
        saves: Number(args.saves) || 0,
        reach: Number(args.reach) || 0,
      };
      if (args.notes !== undefined) patch.notes = args.notes;
      const { data, error } = await supabase.from("agentic_posts")
        .update(patch).eq("id", args.post_id).eq("user_id", userId).select().single();
      if (error) return err(error.message);
      return { ok: true, metrics: data, message: `Metrics updated.` };
    }

    case "delete_metrics":
      return err("delete_metrics not supported in agentic schema (metrics are inline on posts)");

    case "list_metrics": {
      if (!args.post_id) return err("post_id is required");
      const { data, error } = await supabase.from("agentic_posts")
        .select("id, title, posted_at, views, likes, comments, shares, saves, reach")
        .eq("id", args.post_id).eq("user_id", userId).maybeSingle();
      if (error) return err(error.message);
      return widget("kpi_cards", {
        title: `Metrics · ${data?.title ?? "Post"}`,
        cards: [
          { label: "Views", value: data?.views ?? 0 },
          { label: "Likes", value: data?.likes ?? 0 },
          { label: "Comments", value: data?.comments ?? 0 },
          { label: "Shares", value: data?.shares ?? 0 },
          { label: "Saves", value: data?.saves ?? 0 },
          { label: "Reach", value: data?.reach ?? 0 },
        ],
      });
    }

    case "add_daily_snapshot":
    case "update_daily_snapshot": {
      const platform = VALID_PLATFORMS.has(args.platform) ? args.platform : "facebook";
      const channelId = args.channel_id || await ensureChannel(supabase, userId, platform);
      const capturedAt = args.captured_at || args.metric_date || todayMM();
      const { data, error } = await supabase.from("agentic_metric_snapshots").upsert({
        user_id: userId,
        channel_id: channelId,
        captured_at: capturedAt,
        followers: args.followers == null ? null : Number(args.followers),
        total_views: args.total_views == null ? null : Number(args.total_views),
        posts_count: args.posts_count == null ? null : Number(args.posts_count),
        engagement_rate: args.engagement_rate == null ? null : Number(args.engagement_rate),
        impressions: args.impressions == null ? null : Number(args.impressions),
        reach: args.reach == null ? null : Number(args.reach),
        notes: args.notes || null,
        source: args.source || "manual",
      }, { onConflict: "channel_id,captured_at" }).select().single();
      if (error) return err(error.message);
      return { ok: true, snapshot: data, message: `Daily snapshot saved for ${capturedAt}.` };
    }

    case "list_daily_snapshots": {
      const { from, to } = resolveRange(args);
      let query = supabase.from("agentic_metric_snapshots")
        .select("captured_at, followers, total_views, posts_count, engagement_rate, impressions, reach, agentic_channels!inner(platform, display_name)")
        .eq("user_id", userId)
        .gte("captured_at", from)
        .lte("captured_at", to)
        .order("captured_at", { ascending: true });
      if (args.channel_id) query = query.eq("channel_id", args.channel_id);
      const { data, error } = await query;
      if (error) return err(error.message);
      const rows = (data || []) as any[];
      return widget("line_chart", {
        title: `Daily KPI Snapshots · ${from} → ${to}`,
        x_label: "Date",
        y_label: "Value",
        series: [
          { name: "Total Views", points: rows.map(r => ({ x: r.captured_at, y: Number(r.total_views || 0) })) },
          { name: "Followers", points: rows.map(r => ({ x: r.captured_at, y: Number(r.followers || 0) })) },
          { name: "Reach", points: rows.map(r => ({ x: r.captured_at, y: Number(r.reach || 0) })) },
        ],
        rows: rows.map(r => ({
          date: r.captured_at,
          platform: r.agentic_channels?.platform ?? "other",
          channel: r.agentic_channels?.display_name ?? "Channel",
          followers: r.followers ?? 0,
          total_views: r.total_views ?? 0,
          engagement_rate: r.engagement_rate ?? 0,
          reach: r.reach ?? 0,
        })),
      });
    }

    case "add_finance": {
      const entry_type = args.entry_type;
      if (entry_type !== "expense" && entry_type !== "income") return err("entry_type must be expense|income");
      const category = String(args.category || "").trim();
      const amount = Number(args.amount);
      if (!category) return err("category is required");
      if (!Number.isFinite(amount) || amount < 0) return err("amount must be a positive number");
      if (entry_type === "income") {
        const src = VALID_REVENUE_SOURCES.has(category.toLowerCase()) ? category.toLowerCase() : "other";
        const { data, error } = await supabase.from("agentic_revenue").insert({
          user_id: userId,
          occurred_at: args.entry_date || todayMM(),
          source: src, amount,
          currency: CONSULTANT_FINANCE_CURRENCY,
          related_post_id: args.related_post_id || null,
          description: args.description || (src !== category.toLowerCase() ? category : null),
        }).select().single();
        if (error) return err(error.message);
        return { ok: true, entry: data, message: `Income of ${amount} ${data.currency} recorded.` };
      } else {
        const { data, error } = await supabase.from("agentic_expenses").insert({
          user_id: userId,
          occurred_at: args.entry_date || todayMM(),
          category, amount,
          currency: CONSULTANT_FINANCE_CURRENCY,
          description: args.description || null,
        }).select().single();
        if (error) return err(error.message);
        return { ok: true, entry: data, message: `Expense of ${amount} ${data.currency} recorded.` };
      }
    }

    case "update_finance":
      return err("update_finance not implemented in V1; delete and re-add.");

    case "delete_finance": {
      if (!args.entry_id) return err("entry_id is required");
      const r = await supabase.from("agentic_revenue").delete()
        .eq("id", args.entry_id).eq("user_id", userId);
      if (!r.error) {
        await supabase.from("agentic_expenses").delete()
          .eq("id", args.entry_id).eq("user_id", userId);
      }
      return { ok: true, deleted: args.entry_id };
    }

    case "list_finance": {
      const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 200);
      const wantIncome = !args.entry_type || args.entry_type === "income";
      const wantExpense = !args.entry_type || args.entry_type === "expense";
      const [rev, exp] = await Promise.all([
        wantIncome ? supabase.from("agentic_revenue")
          .select("id, occurred_at, source, amount, currency, description")
          .eq("user_id", userId).eq("currency", CONSULTANT_FINANCE_CURRENCY).order("occurred_at",{ascending:false}).limit(limit)
          : { data: [], error: null },
        wantExpense ? supabase.from("agentic_expenses")
          .select("id, occurred_at, category, amount, currency, description")
          .eq("user_id", userId).eq("currency", CONSULTANT_FINANCE_CURRENCY).order("occurred_at",{ascending:false}).limit(limit)
          : { data: [], error: null },
      ]);
      if (rev.error) return err(rev.error.message);
      if (exp.error) return err(exp.error.message);
      const rows = [
        ...((rev.data||[]) as any[]).map((e:any)=>({entry_date:e.occurred_at,entry_type:"income",category:e.source,amount:e.amount,currency:e.currency,description:e.description||"—"})),
        ...((exp.data||[]) as any[]).map((e:any)=>({entry_date:e.occurred_at,entry_type:"expense",category:e.category,amount:e.amount,currency:e.currency,description:e.description||"—"})),
      ].sort((a,b)=>b.entry_date.localeCompare(a.entry_date)).slice(0, limit);
      return widget("table", {
        title: `Finance Entries (${CONSULTANT_FINANCE_CURRENCY})`,
        columns: ["entry_date","entry_type","category","amount","currency","description"],
        rows,
      });
    }

    case "dashboard_summary": {
      const { from, to } = resolveRange(args);
      const { data, error } = await supabase.rpc("agentic_dashboard_summary", { p_from: from, p_to: to });
      if (error) return err(error.message);
      const d: any = data || {};
      const [rev, exp] = await Promise.all([
        supabase.from("agentic_revenue").select("amount")
          .eq("user_id", userId).eq("currency", CONSULTANT_FINANCE_CURRENCY).gte("occurred_at", from).lte("occurred_at", to),
        supabase.from("agentic_expenses").select("amount")
          .eq("user_id", userId).eq("currency", CONSULTANT_FINANCE_CURRENCY).gte("occurred_at", from).lte("occurred_at", to),
      ]);
      if (rev.error) return err(rev.error.message);
      if (exp.error) return err(exp.error.message);
      const revenue = ((rev.data || []) as any[]).reduce((s, r) => s + Number(r.amount || 0), 0);
      const spend = ((exp.data || []) as any[]).reduce((s, r) => s + Number(r.amount || 0), 0);
      const net = revenue - spend;
      const roi = spend > 0 ? Number(((net / spend) * 100).toFixed(2)) : null;
      return widget("kpi_cards", {
        title: `Agentic Era Dashboard · ${from} → ${to}`,
        cards: [
          { label: "Posts", value: d.posts ?? 0 },
          { label: "Views", value: d.views ?? 0 },
          { label: "Engagement", value: d.engagement ?? 0 },
          { label: "Followers", value: d.followers ?? 0 },
          { label: `Spend (${CONSULTANT_FINANCE_CURRENCY})`, value: spend },
          { label: `Revenue (${CONSULTANT_FINANCE_CURRENCY})`, value: revenue },
          { label: `Net (${CONSULTANT_FINANCE_CURRENCY})`, value: net },
          { label: "ROI %", value: roi ?? "—" },
        ],
      });
    }

    case "post_leaderboard": {
      const { from, to } = resolveRange(args);
      const metric = String(args.metric || "views");
      const { data, error } = await supabase.rpc("agentic_top_posts", {
        p_metric: metric, p_from: from, p_to: to, p_limit: Number(args.limit) || 10,
      });
      if (error) return err(error.message);
      const rows = (data?.rows || []) as any[];
      return widget("bar_chart", {
        title: `Top Posts by ${metric} · ${from} → ${to}`,
        x_label: "Post", y_label: metric,
        bars: rows.map(r => ({ label: String(r.title || "").slice(0,28), value: Number(r[metric] || 0) })),
      });
    }

    case "finance_summary": {
      const { from, to } = resolveRange(args);
      const [rev, exp] = await Promise.all([
        supabase.from("agentic_revenue").select("amount")
          .eq("user_id", userId).eq("currency", CONSULTANT_FINANCE_CURRENCY).gte("occurred_at", from).lte("occurred_at", to),
        supabase.from("agentic_expenses").select("amount")
          .eq("user_id", userId).eq("currency", CONSULTANT_FINANCE_CURRENCY).gte("occurred_at", from).lte("occurred_at", to),
      ]);
      if (rev.error) return err(rev.error.message);
      if (exp.error) return err(exp.error.message);
      const revenue = ((rev.data||[]) as any[]).reduce((s,r)=>s+Number(r.amount||0),0);
      const spend = ((exp.data||[]) as any[]).reduce((s,r)=>s+Number(r.amount||0),0);
      const net = revenue - spend;
      const roi = spend > 0 ? Number(((net/spend)*100).toFixed(2)) : null;
      return widget("kpi_cards", {
        title: `Finance Summary (${CONSULTANT_FINANCE_CURRENCY}) · ${from} → ${to}`,
        cards: [
          { label: "Spend", value: spend },
          { label: "Revenue", value: revenue },
          { label: "Net", value: net },
          { label: "ROI %", value: roi ?? "—" },
        ],
      });
    }

    case "weekly_analysis": {
      const { from, to } = resolveRange({ ...args, days: args.days || 7 });
      const baseline = resolvePreviousRange(from, to);
      const [posts, previousPosts, rev, exp, previousRev, previousExp] = await Promise.all([
        supabase.from("agentic_posts")
          .select("id, title, posted_at, views, likes, comments, shares, saves, reach, post_url, agentic_channels!inner(platform)")
          .eq("user_id", userId).gte("posted_at", from).lte("posted_at", to),
        supabase.from("agentic_posts")
          .select("views, likes, comments, shares, saves, reach")
          .eq("user_id", userId).gte("posted_at", baseline.from).lte("posted_at", baseline.to),
        supabase.from("agentic_revenue").select("amount")
          .eq("user_id", userId).eq("currency", CONSULTANT_FINANCE_CURRENCY).gte("occurred_at", from).lte("occurred_at", to),
        supabase.from("agentic_expenses").select("amount")
          .eq("user_id", userId).eq("currency", CONSULTANT_FINANCE_CURRENCY).gte("occurred_at", from).lte("occurred_at", to),
        supabase.from("agentic_revenue").select("amount")
          .eq("user_id", userId).eq("currency", CONSULTANT_FINANCE_CURRENCY).gte("occurred_at", baseline.from).lte("occurred_at", baseline.to),
        supabase.from("agentic_expenses").select("amount")
          .eq("user_id", userId).eq("currency", CONSULTANT_FINANCE_CURRENCY).gte("occurred_at", baseline.from).lte("occurred_at", baseline.to),
      ]);
      const firstError = posts.error || previousPosts.error || rev.error || exp.error || previousRev.error || previousExp.error;
      if (firstError) return err(firstError.message);

      const rows = ((posts.data || []) as any[]).map((p) => ({
        ...p,
        platform: p.agentic_channels?.platform ?? "other",
        engagement: Number(p.likes || 0) + Number(p.comments || 0) + Number(p.shares || 0) + Number(p.saves || 0),
      }));
      const prevRows = (previousPosts.data || []) as any[];
      const totalViews = rows.reduce((s, p) => s + Number(p.views || 0), 0);
      const totalEngagement = rows.reduce((s, p) => s + Number(p.engagement || 0), 0);
      const prevViews = prevRows.reduce((s, p) => s + Number(p.views || 0), 0);
      const revenue = ((rev.data || []) as any[]).reduce((s, r) => s + Number(r.amount || 0), 0);
      const spend = ((exp.data || []) as any[]).reduce((s, r) => s + Number(r.amount || 0), 0);
      const prevRevenue = ((previousRev.data || []) as any[]).reduce((s, r) => s + Number(r.amount || 0), 0);
      const prevSpend = ((previousExp.data || []) as any[]).reduce((s, r) => s + Number(r.amount || 0), 0);
      const topPosts = rows.sort((a, b) => Number(b.views || 0) - Number(a.views || 0)).slice(0, Number(args.limit) || 7);
      const net = revenue - spend;
      const roi = spend > 0 ? Number(((net / spend) * 100).toFixed(2)) : null;
      return widget("kpi_cards", {
        title: `Weekly Analysis (${CONSULTANT_FINANCE_CURRENCY}) · ${from} → ${to}`,
        summary: {
          posts: rows.length,
          views: totalViews,
          views_delta_pct: percentChange(totalViews, prevViews),
          engagement: totalEngagement,
          revenue,
          spend,
          net,
          roi_pct: roi,
          baseline: {
            from: baseline.from,
            to: baseline.to,
            views: prevViews,
            revenue: prevRevenue,
            spend: prevSpend,
          },
        },
        cards: [
          { label: "Week Views", value: totalViews },
          { label: "Best Post", value: topPosts[0]?.views ?? 0 },
          { label: "100K+ Posts", value: rows.filter((p) => Number(p.views || 0) >= 100000).length },
          { label: `Net (${CONSULTANT_FINANCE_CURRENCY})`, value: net },
          { label: "ROI %", value: roi ?? "—" },
        ],
        top_posts: topPosts.map((p) => ({
          title: p.title,
          platform: p.platform,
          posted_at: p.posted_at,
          views: p.views,
          engagement: p.engagement,
          post_url: p.post_url || null,
        })),
      });
    }

    case "forecast": {
      const metric = String(args.metric || "views");
      const horizon = Math.min(Math.max(Number(args.horizon_days) || 30, 7), 90);
      const { data, error } = await supabase.rpc("agentic_forecast", {
        p_metric: metric, p_channel_id: args.channel_id || null,
        p_horizon_days: horizon, p_lookback_days: Number(args.lookback_days) || 60,
      });
      if (error) return err(error.message);
      const d: any = data || {};
      return widget("line_chart", {
        title: `Forecast · ${metric} (next ${horizon} days)`,
        x_label: "Date", y_label: metric,
        series: [
          { name: "History",  points: ((d.history||[])  as any[]).map(p=>({x:p.day, y:Number(p.value||0)})) },
          { name: "Forecast", points: ((d.forecast||[]) as any[]).map(p=>({x:p.day, y:Number(p.forecast||0)})) },
        ],
      });
    }

    default:
      return err(`Unknown action: ${action}`);
  }
}

function resolveRange(args: any): { from: string; to: string } {
  if (args?.from && args?.to) return { from: args.from, to: args.to };
  const days = Math.min(Math.max(Number(args?.days) || 7, 1), 365);
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Yangon" }));
  const from = new Date(today); from.setDate(from.getDate() - (days - 1));
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  return { from: fmt(from), to: fmt(today) };
}

function resolvePreviousRange(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  const previousTo = new Date(start);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(previousFrom), to: fmt(previousTo) };
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}
