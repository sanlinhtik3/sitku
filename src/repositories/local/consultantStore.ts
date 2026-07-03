// ── Agent Consultant storage engine (local) ─────────────────────────────────
// Local-first data layer for the Agent Consultant (creator-economy KPI) surface,
// ported off the Supabase `agentic_*` tables + the `agentic_dashboard_summary`
// RPC. Same IndexedDB + write-through cache pattern as `financeStore`/`noteStore`.
//
// Stores (DB `beebot-consultant`): channels, posts, snapshots, revenue, expenses.
// Reads come from an in-memory cache after `ready()`; writes update the cache and
// persist through a serialized queue. A realistic 35-day demo dataset is seeded on
// first run so the consultant dashboard/charts render immediately offline.

import { ensurePersistentStorage } from "@/lib/storageDurability";

export type Platform =
  | "facebook" | "instagram" | "tiktok" | "youtube"
  | "telegram" | "x" | "linkedin" | "threads"
  | "podcast" | "newsletter" | "other";

export const CONSULTANT_FINANCE_CURRENCY = "USDT";
export const LOCAL_USER_ID = "local-user";

export interface ChannelRow {
  id: string; user_id: string; platform: Platform; handle: string | null;
  display_name: string; is_active: boolean; created_at: string;
}
export interface PostRow {
  id: string; user_id: string; channel_id: string; posted_at: string; title: string;
  post_url: string | null; views: number; likes: number; comments: number; shares: number;
  saves: number; reach: number; notes: string | null; source: string;
  created_at: string; updated_at: string;
}
export interface SnapshotRow {
  id: string; user_id: string; channel_id: string; captured_at: string;
  followers: number | null; total_views: number | null; posts_count: number | null;
  engagement_rate: number | null; impressions: number | null; reach: number | null;
  notes: string | null; source: string;
}
export interface RevenueRow {
  id: string; user_id: string; channel_id: string | null; related_post_id: string | null;
  occurred_at: string; source: string; amount: number; currency: string; description: string | null;
}
export interface ExpenseRow {
  id: string; user_id: string; channel_id: string | null; occurred_at: string;
  category: string; amount: number; currency: string; description: string | null;
}

// Joined shapes returned to the hook (mirror the Supabase `agentic_channels!inner(...)` selects)
type ChannelJoin = { platform: Platform; display_name: string };
export type SnapshotJoined = SnapshotRow & { agentic_channels: ChannelJoin };
export type PostJoined = PostRow & { agentic_channels: ChannelJoin };

const DB_NAME = "beebot-consultant";
const DB_VERSION = 1;
const CHANNELS = "channels";
const POSTS = "posts";
const SNAPSHOTS = "snapshots";
const REVENUE = "revenue";
const EXPENSES = "expenses";

function uid(): string {
  return crypto.randomUUID?.() || `id_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}
function nowIso(): string { return new Date().toISOString(); }
function localDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
  });
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [CHANNELS, POSTS, SNAPSHOTS, REVENUE, EXPENSES]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}

const REVENUE_SOURCES = ["sponsored", "affiliate", "adsense", "subscription", "product", "service", "tips", "other"];

// Deterministic PRNG so the seeded demo numbers are stable (no Math.random drift).
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

class ConsultantStore {
  private channels = new Map<string, ChannelRow>();
  private posts = new Map<string, PostRow>();
  private snapshots = new Map<string, SnapshotRow>();
  private revenue = new Map<string, RevenueRow>();
  private expenses = new Map<string, ExpenseRow>();
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  ready(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.init();
    return this.initPromise;
  }

  private async init() {
    try { await ensurePersistentStorage(); } catch { /* best-effort */ }
    this.db = await openDb();
    await this.hydrate();
    await this.ensureSeed();
  }

  private async hydrate() {
    if (!this.db) return;
    const tx = this.db.transaction([CHANNELS, POSTS, SNAPSHOTS, REVENUE, EXPENSES], "readonly");
    const [chs, posts, snaps, revs, exps] = await Promise.all([
      promisify(tx.objectStore(CHANNELS).getAll() as IDBRequest<ChannelRow[]>),
      promisify(tx.objectStore(POSTS).getAll() as IDBRequest<PostRow[]>),
      promisify(tx.objectStore(SNAPSHOTS).getAll() as IDBRequest<SnapshotRow[]>),
      promisify(tx.objectStore(REVENUE).getAll() as IDBRequest<RevenueRow[]>),
      promisify(tx.objectStore(EXPENSES).getAll() as IDBRequest<ExpenseRow[]>),
    ]);
    for (const c of chs) this.channels.set(c.id, c);
    for (const p of posts) this.posts.set(p.id, p);
    for (const s of snaps) this.snapshots.set(s.id, s);
    for (const r of revs) this.revenue.set(r.id, r);
    for (const e of exps) this.expenses.set(e.id, e);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
  private put(store: string, value: unknown): Promise<void> {
    return this.enqueue(async () => {
      if (!this.db) return;
      const tx = this.db.transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      await txDone(tx);
    });
  }
  private del(store: string, key: IDBValidKey): Promise<void> {
    return this.enqueue(async () => {
      if (!this.db) return;
      const tx = this.db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      await txDone(tx);
    });
  }

  // ── Seed realistic demo data on first run ───────────────────────────────────
  private async ensureSeed() {
    if (this.channels.size > 0) return;
    const userId = LOCAL_USER_ID;
    const rng = makeRng(20260617);
    const today = new Date();

    const channelDefs: Array<{ platform: Platform; handle: string; display_name: string; baseFollowers: number; baseViews: number }> = [
      { platform: "youtube", handle: "@beebot", display_name: "BeeBot YouTube", baseFollowers: 48200, baseViews: 32000 },
      { platform: "tiktok", handle: "@beebot.ai", display_name: "BeeBot TikTok", baseFollowers: 91500, baseViews: 64000 },
      { platform: "instagram", handle: "@beebot.app", display_name: "BeeBot IG", baseFollowers: 27300, baseViews: 18000 },
    ];

    const channels: ChannelRow[] = channelDefs.map((d) => ({
      id: uid(), user_id: userId, platform: d.platform, handle: d.handle,
      display_name: d.display_name, is_active: true, created_at: nowIso(),
    }));
    for (const c of channels) { this.channels.set(c.id, c); await this.put(CHANNELS, c); }

    const DAYS = 35;
    const titles = [
      "How I automate my workflow", "3 AI tools you need", "Behind the scenes",
      "Q&A with the community", "Building in public #",  "My morning routine",
      "Reacting to your setups", "The truth about creators", "Tutorial: from zero",
      "Weekly recap", "Hot take", "Day in the life",
    ];

    for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOffset);
      const dateStr = localDateString(d);
      const growth = (DAYS - dayOffset) / DAYS; // 0..1 ramp

      for (let ci = 0; ci < channelDefs.length; ci++) {
        const ch = channels[ci];
        const def = channelDefs[ci];

        // Daily snapshot (followers grow over time)
        const followers = Math.round(def.baseFollowers * (0.9 + 0.15 * growth) + rng() * 400);
        const totalViews = Math.round(def.baseViews * (0.8 + 0.5 * growth) + rng() * 3000);
        const snap: SnapshotRow = {
          id: uid(), user_id: userId, channel_id: ch.id, captured_at: dateStr,
          followers, total_views: totalViews, posts_count: 1,
          engagement_rate: Number((4 + rng() * 4).toFixed(2)),
          impressions: Math.round(totalViews * (1.2 + rng() * 0.6)),
          reach: Math.round(totalViews * (0.7 + rng() * 0.3)),
          notes: null, source: "import",
        };
        this.snapshots.set(snap.id, snap); await this.put(SNAPSHOTS, snap);

        // Not every channel posts every day
        if (rng() > 0.55) continue;
        const viral = rng() > 0.9;
        const views = Math.round((viral ? 120000 : 4000 + rng() * 38000) * (0.7 + 0.6 * growth));
        const likes = Math.round(views * (0.04 + rng() * 0.05));
        const comments = Math.round(likes * (0.05 + rng() * 0.1));
        const shares = Math.round(likes * (0.08 + rng() * 0.12));
        const saves = Math.round(likes * (0.1 + rng() * 0.15));
        const reach = Math.round(views * (0.85 + rng() * 0.3));
        const post: PostRow = {
          id: uid(), user_id: userId, channel_id: ch.id, posted_at: dateStr,
          title: titles[Math.floor(rng() * titles.length)] + (viral ? " 🔥" : ""),
          post_url: `https://example.com/${def.platform}/${dateStr}`,
          views, likes, comments, shares, saves, reach, notes: null,
          source: "import", created_at: nowIso(), updated_at: nowIso(),
        };
        this.posts.set(post.id, post); await this.put(POSTS, post);

        // Occasional revenue tied to a post
        if (rng() > 0.7) {
          const src = rng() > 0.5 ? "adsense" : "sponsored";
          const amount = Number(((src === "sponsored" ? 150 : 20) + rng() * 220).toFixed(2));
          const rev: RevenueRow = {
            id: uid(), user_id: userId, channel_id: ch.id, related_post_id: post.id,
            occurred_at: dateStr, source: src, amount, currency: CONSULTANT_FINANCE_CURRENCY,
            description: src === "sponsored" ? "Brand deal" : "Platform payout",
          };
          this.revenue.set(rev.id, rev); await this.put(REVENUE, rev);
        }
      }

      // Occasional expense (ads / tools)
      if (rng() > 0.72) {
        const cat = rng() > 0.5 ? "Ads" : "Tools";
        const exp: ExpenseRow = {
          id: uid(), user_id: userId, channel_id: null, occurred_at: dateStr,
          category: cat, amount: Number((15 + rng() * 90).toFixed(2)),
          currency: CONSULTANT_FINANCE_CURRENCY, description: cat === "Ads" ? "Boosted post" : "SaaS subscription",
        };
        this.expenses.set(exp.id, exp); await this.put(EXPENSES, exp);
      }
    }
  }

  private channelJoin(channelId: string): ChannelJoin {
    const c = this.channels.get(channelId);
    return { platform: (c?.platform ?? "other") as Platform, display_name: c?.display_name ?? "Channel" };
  }

  // ── Channels ────────────────────────────────────────────────────────────────
  async listChannels(): Promise<ChannelRow[]> {
    await this.ready();
    return [...this.channels.values()]
      .filter((c) => c.is_active)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async ensureChannel(userId: string, platform: Platform): Promise<string> {
    await this.ready();
    const existing = [...this.channels.values()]
      .filter((c) => c.user_id === userId && c.platform === platform && c.is_active)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    if (existing) return existing.id;
    const created: ChannelRow = {
      id: uid(), user_id: userId, platform, handle: null,
      display_name: platform.charAt(0).toUpperCase() + platform.slice(1),
      is_active: true, created_at: nowIso(),
    };
    this.channels.set(created.id, created);
    await this.put(CHANNELS, created);
    return created.id;
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────
  async listSnapshots(range?: { from: string; to: string }): Promise<SnapshotJoined[]> {
    await this.ready();
    return [...this.snapshots.values()]
      .filter((s) => !range || (s.captured_at >= range.from && s.captured_at <= range.to))
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at))
      .map((s) => ({ ...s, agentic_channels: this.channelJoin(s.channel_id) }));
  }

  async upsertSnapshot(userId: string, s: {
    platform: Platform; captured_at: string; followers?: number; total_views?: number;
    posts_count?: number; engagement_rate?: number; impressions?: number; reach?: number; notes?: string | null;
  }): Promise<void> {
    await this.ready();
    const channelId = await this.ensureChannel(userId, s.platform);
    const existing = [...this.snapshots.values()].find((x) => x.channel_id === channelId && x.captured_at === s.captured_at);
    const row: SnapshotRow = {
      id: existing?.id ?? uid(), user_id: userId, channel_id: channelId, captured_at: s.captured_at,
      followers: s.followers ?? null, total_views: s.total_views ?? null, posts_count: s.posts_count ?? null,
      engagement_rate: s.engagement_rate ?? null, impressions: s.impressions ?? null, reach: s.reach ?? null,
      notes: s.notes ?? null, source: "manual",
    };
    this.snapshots.set(row.id, row);
    await this.put(SNAPSHOTS, row);
  }

  // ── Posts ─────────────────────────────────────────────────────────────────
  /** All posts, newest-first, with channel platform joined (posts list). */
  async listPosts(): Promise<PostJoined[]> {
    await this.ready();
    return [...this.posts.values()]
      .sort((a, b) => b.posted_at.localeCompare(a.posted_at))
      .map((p) => ({ ...p, agentic_channels: this.channelJoin(p.channel_id) }));
  }

  /** Posts within a date range, joined (weekly analysis / dashboard). */
  async queryPosts(from: string, to: string): Promise<PostJoined[]> {
    await this.ready();
    return [...this.posts.values()]
      .filter((p) => p.posted_at >= from && p.posted_at <= to)
      .map((p) => ({ ...p, agentic_channels: this.channelJoin(p.channel_id) }));
  }

  async upsertPost(userId: string, p: {
    id?: string; platform: Platform; post_name: string; post_url?: string | null;
    posted_at?: string; notes?: string | null;
  }): Promise<{ id: string }> {
    await this.ready();
    const channelId = await this.ensureChannel(userId, p.platform);
    if (p.id && this.posts.has(p.id)) {
      const existing = this.posts.get(p.id)!;
      const updated: PostRow = {
        ...existing, channel_id: channelId, title: p.post_name,
        post_url: p.post_url ?? null, posted_at: p.posted_at ?? existing.posted_at,
        notes: p.notes ?? null, updated_at: nowIso(),
      };
      this.posts.set(updated.id, updated);
      await this.put(POSTS, updated);
      return { id: updated.id };
    }
    const row: PostRow = {
      id: uid(), user_id: userId, channel_id: channelId, title: p.post_name,
      post_url: p.post_url ?? null, posted_at: p.posted_at ?? localDateString(),
      views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0,
      notes: p.notes ?? null, source: "manual", created_at: nowIso(), updated_at: nowIso(),
    };
    this.posts.set(row.id, row);
    await this.put(POSTS, row);
    return { id: row.id };
  }

  async deletePost(id: string): Promise<void> {
    await this.ready();
    this.posts.delete(id);
    await this.del(POSTS, id);
  }

  async updatePostMetrics(id: string, m: {
    views?: number; likes?: number; comments?: number; shares?: number; saves?: number; reach?: number; notes?: string | null;
  }): Promise<void> {
    await this.ready();
    const existing = this.posts.get(id);
    if (!existing) return;
    const updated: PostRow = {
      ...existing,
      views: m.views ?? 0, likes: m.likes ?? 0, comments: m.comments ?? 0,
      shares: m.shares ?? 0, saves: m.saves ?? 0, reach: m.reach ?? 0,
      notes: m.notes ?? null, updated_at: nowIso(),
    };
    this.posts.set(id, updated);
    await this.put(POSTS, updated);
  }

  /** Posts as flat metric rows (newest-first); optional single-post filter. */
  async listPostMetrics(postId?: string): Promise<PostRow[]> {
    await this.ready();
    return [...this.posts.values()]
      .filter((p) => !postId || p.id === postId)
      .sort((a, b) => b.posted_at.localeCompare(a.posted_at));
  }

  // ── Revenue / Expenses ──────────────────────────────────────────────────────
  async listRevenue(opts?: { from?: string; to?: string; limit?: number }): Promise<RevenueRow[]> {
    await this.ready();
    let rows = [...this.revenue.values()].filter((r) => r.currency === CONSULTANT_FINANCE_CURRENCY);
    if (opts?.from) rows = rows.filter((r) => r.occurred_at >= opts.from!);
    if (opts?.to) rows = rows.filter((r) => r.occurred_at <= opts.to!);
    rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  }

  async listExpenses(opts?: { from?: string; to?: string; limit?: number }): Promise<ExpenseRow[]> {
    await this.ready();
    let rows = [...this.expenses.values()].filter((e) => e.currency === CONSULTANT_FINANCE_CURRENCY);
    if (opts?.from) rows = rows.filter((e) => e.occurred_at >= opts.from!);
    if (opts?.to) rows = rows.filter((e) => e.occurred_at <= opts.to!);
    rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  }

  async addRevenue(userId: string, e: {
    entry_date?: string; source: string; amount: number; related_post_id?: string | null; description?: string | null;
  }): Promise<void> {
    await this.ready();
    const src = REVENUE_SOURCES.includes(e.source.toLowerCase()) ? e.source.toLowerCase() : "other";
    const row: RevenueRow = {
      id: uid(), user_id: userId, channel_id: null, related_post_id: e.related_post_id ?? null,
      occurred_at: e.entry_date ?? localDateString(), source: src, amount: e.amount,
      currency: CONSULTANT_FINANCE_CURRENCY,
      description: e.description ?? (src !== e.source.toLowerCase() ? e.source : null),
    };
    this.revenue.set(row.id, row);
    await this.put(REVENUE, row);
  }

  async addExpense(userId: string, e: {
    entry_date?: string; category: string; amount: number; description?: string | null;
  }): Promise<void> {
    await this.ready();
    const row: ExpenseRow = {
      id: uid(), user_id: userId, channel_id: null, occurred_at: e.entry_date ?? localDateString(),
      category: e.category, amount: e.amount, currency: CONSULTANT_FINANCE_CURRENCY,
      description: e.description ?? null,
    };
    this.expenses.set(row.id, row);
    await this.put(EXPENSES, row);
  }

  async deleteRevenue(id: string): Promise<void> {
    await this.ready();
    this.revenue.delete(id);
    await this.del(REVENUE, id);
  }
  async deleteExpense(id: string): Promise<void> {
    await this.ready();
    this.expenses.delete(id);
    await this.del(EXPENSES, id);
  }

  // ── Dashboard summary (local reimplementation of the agentic_dashboard_summary RPC) ──
  async dashboardSummary(from: string, to: string): Promise<{
    from: string; to: string; posts: number; views: number; engagement: number; followers: number;
    by_platform: Array<{ platform: Platform; views: number; engagement: number; revenue: number }>;
    trend: Array<{ day: string; views: number; engagement: number }>;
  }> {
    await this.ready();
    const posts = [...this.posts.values()].filter((p) => p.posted_at >= from && p.posted_at <= to);
    const eng = (p: PostRow) => p.likes + p.comments + p.shares + p.saves;

    const views = posts.reduce((s, p) => s + p.views, 0);
    const engagement = posts.reduce((s, p) => s + eng(p), 0);

    // Followers: latest snapshot per channel where captured_at <= to, summed.
    const latestByChannel = new Map<string, SnapshotRow>();
    for (const s of this.snapshots.values()) {
      if (s.captured_at > to) continue;
      const cur = latestByChannel.get(s.channel_id);
      if (!cur || s.captured_at > cur.captured_at) latestByChannel.set(s.channel_id, s);
    }
    let followers = 0;
    for (const s of latestByChannel.values()) followers += Number(s.followers || 0);

    // by_platform: per channel views + engagement + revenue (rolled up to platform)
    const revInRange = [...this.revenue.values()].filter((r) => r.occurred_at >= from && r.occurred_at <= to && r.currency === CONSULTANT_FINANCE_CURRENCY);
    const byPlatformMap = new Map<Platform, { platform: Platform; views: number; engagement: number; revenue: number }>();
    const ensurePlat = (platform: Platform) => {
      if (!byPlatformMap.has(platform)) byPlatformMap.set(platform, { platform, views: 0, engagement: 0, revenue: 0 });
      return byPlatformMap.get(platform)!;
    };
    for (const c of this.channels.values()) ensurePlat(c.platform);
    for (const p of posts) {
      const plat = this.channels.get(p.channel_id)?.platform ?? "other";
      const row = ensurePlat(plat as Platform);
      row.views += p.views;
      row.engagement += eng(p);
    }
    for (const r of revInRange) {
      if (!r.channel_id) continue;
      const plat = this.channels.get(r.channel_id)?.platform;
      if (plat) ensurePlat(plat).revenue += Number(r.amount || 0);
    }

    // trend: per day views + engagement
    const trendMap = new Map<string, { day: string; views: number; engagement: number }>();
    for (const p of posts) {
      if (!trendMap.has(p.posted_at)) trendMap.set(p.posted_at, { day: p.posted_at, views: 0, engagement: 0 });
      const t = trendMap.get(p.posted_at)!;
      t.views += p.views;
      t.engagement += eng(p);
    }

    return {
      from, to,
      posts: posts.length,
      views,
      engagement,
      followers,
      by_platform: [...byPlatformMap.values()],
      trend: [...trendMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
    };
  }

  /** Top posts by metric within a range (local reimplementation of agentic_top_posts RPC). */
  async topPosts(from: string, to: string, metric = "engagement", limit = 5): Promise<{
    rows: Array<{ id: string; title: string; post_url: string | null; platform: Platform; views: number; engagement: number; value: number }>;
  }> {
    await this.ready();
    const eng = (p: PostRow) => p.likes + p.comments + p.shares + p.saves;
    const valid = ["views", "likes", "comments", "shares", "saves", "reach", "engagement"];
    const m = valid.includes(metric) ? metric : "views";
    const valueOf = (p: PostRow): number => m === "engagement" ? eng(p) : (p as unknown as Record<string, number>)[m] ?? p.views;
    const rows = [...this.posts.values()]
      .filter((p) => p.posted_at >= from && p.posted_at <= to)
      .map((p) => ({
        id: p.id, title: p.title, post_url: p.post_url,
        platform: this.channelJoin(p.channel_id).platform,
        views: p.views, engagement: eng(p), value: valueOf(p),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
    return { rows };
  }

  // ── Backup / restore (raw dump — preserves ids) ───────────────────────────
  async exportRaw(): Promise<{
    channels: ChannelRow[]; posts: PostRow[]; snapshots: SnapshotRow[];
    revenue: RevenueRow[]; expenses: ExpenseRow[];
  }> {
    await this.ready();
    return {
      channels: [...this.channels.values()], posts: [...this.posts.values()],
      snapshots: [...this.snapshots.values()], revenue: [...this.revenue.values()],
      expenses: [...this.expenses.values()],
    };
  }

  async importRaw(data: {
    channels?: ChannelRow[]; posts?: PostRow[]; snapshots?: SnapshotRow[];
    revenue?: RevenueRow[]; expenses?: ExpenseRow[];
  }): Promise<void> {
    await this.ready();
    await this.clearAll();
    const load = async <T extends { id: string }>(store: string, map: Map<string, T>, rows?: T[]) => {
      if (!rows) return;
      for (const r of rows) { map.set(r.id, r); await this.put(store, r); }
    };
    await load(CHANNELS, this.channels, data.channels);
    await load(POSTS, this.posts, data.posts);
    await load(SNAPSHOTS, this.snapshots, data.snapshots);
    await load(REVENUE, this.revenue, data.revenue);
    await load(EXPENSES, this.expenses, data.expenses);
  }

  /** Wipe all consultant data (used by manage/danger-zone if needed). */
  async clearAll(): Promise<void> {
    await this.ready();
    for (const [id] of this.posts) await this.del(POSTS, id);
    for (const [id] of this.snapshots) await this.del(SNAPSHOTS, id);
    for (const [id] of this.revenue) await this.del(REVENUE, id);
    for (const [id] of this.expenses) await this.del(EXPENSES, id);
    for (const [id] of this.channels) await this.del(CHANNELS, id);
    this.posts.clear(); this.snapshots.clear(); this.revenue.clear(); this.expenses.clear(); this.channels.clear();
  }
}

export const consultantStore = new ConsultantStore();
