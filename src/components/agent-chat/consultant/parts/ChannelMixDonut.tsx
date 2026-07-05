import { Card } from "@/components/ui/card";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#38bdf8", "#22c55e", "#f59e0b", "#f43f5e", "#a78bfa", "#14b8a6", "#eab308"];

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
  : String(Math.round(n || 0));

interface PlatformMixRow {
  platform?: string | null;
  views?: number | string | null;
  engagement?: number | string | null;
  revenue?: number | string | null;
}

export function ChannelMixDonut({
  dashboard,
  periodLabel,
}: {
  dashboard?: { by_platform?: PlatformMixRow[] } | null;
  periodLabel: string;
}) {
  const rows = (dashboard?.by_platform ?? [])
    .map((r) => ({
      platform: String(r.platform ?? "other"),
      views: Number(r.views || 0),
      engagement: Number(r.engagement || 0),
      revenue: Number(r.revenue || 0),
    }))
    .filter((r) => r.views || r.engagement || r.revenue)
    .sort((a, b) => (b.views + b.engagement + b.revenue) - (a.views + a.engagement + a.revenue));

  const totalViews = rows.reduce((s, r) => s + r.views, 0);
  const best = rows[0];

  return (
    <Card className="consultant-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{periodLabel} Channel Mix</div>
          <div className="text-sm font-semibold mt-0.5">Donut allocation by attention</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-muted-foreground">Best channel</div>
          <div className="text-xs font-semibold capitalize text-sky-300">{best?.platform ?? "--"}</div>
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] gap-3 items-center min-h-[170px]">
        {rows.length === 0 ? (
          <div className="col-span-2 text-center text-xs text-muted-foreground py-10">
            Add platform data to reveal your channel mix.
          </div>
        ) : (
          <>
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rows} dataKey="views" nameKey="platform" innerRadius={43} outerRadius={64} paddingAngle={2} animationDuration={700} animationEasing="ease-out">
                    {rows.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11, borderRadius: 8 }}
                    formatter={(v: number) => [fmt(Number(v)), "Views"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {rows.slice(0, 5).map((r, idx) => {
                const pct = totalViews > 0 ? (r.views / totalViews) * 100 : 0;
                return (
                  <div key={r.platform} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: COLORS[idx % COLORS.length] }} />
                        <span className="text-xs capitalize truncate">{r.platform}</span>
                      </div>
                      <span className="text-[10px] tabular-nums text-muted-foreground">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/25 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: COLORS[idx % COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
