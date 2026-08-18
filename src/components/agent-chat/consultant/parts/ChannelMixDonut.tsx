import { Card } from "@/components/ui/card";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowDown, ArrowUp } from "lucide-react";

const PLATFORM_COLORS: Record<string,string> = { youtube:"#ef4444", tiktok:"#d946ef", instagram:"#ec4899", facebook:"#3b82f6", telegram:"#38bdf8" };
const fallbackColors = ["#38bdf8", "#34d399", "#f4d35e", "#fb7185", "#c4b5fd"];

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
  : String(Math.round(n || 0));

interface PlatformMixRow {
  platform: string;
  views: number;
  engagement: number;
  views_delta_pct: number;
}

export function ChannelMixDonut({
  platformMix,
  periodLabel,
}: {
  platformMix?: PlatformMixRow[] | null;
  periodLabel: string;
}) {
  const rows = (platformMix ?? []).filter((row) => row.views || row.engagement);

  const totalViews = rows.reduce((s, r) => s + r.views, 0);
  const totalEngagement = rows.reduce((s,r)=>s+r.engagement,0);
  const best = rows[0];

  return (
    <Card className="consultant-card p-4 sm:px-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="consultant-section-title">Channel mix</div>
          <div className="text-[11.5px] text-[#8a8a8e] mt-0.5">{periodLabel} attention allocation</div>
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
            <div className="relative h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rows} dataKey="views" nameKey="platform" innerRadius={43} outerRadius={64} paddingAngle={2} animationDuration={700} animationEasing="ease-out">
                    {rows.map((row, idx) => <Cell key={idx} fill={PLATFORM_COLORS[row.platform] || fallbackColors[idx % fallbackColors.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11, borderRadius: 8 }}
                    formatter={(v: number) => [fmt(Number(v)), "Views"]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-base font-bold tabular-nums">{fmt(totalEngagement)}</span><span className="text-[9px] uppercase tracking-[.08em] text-[#8a8a8e]">engage</span></div>
            </div>
            <div className="space-y-2">
              {rows.slice(0, 5).map((r, idx) => {
                const pct = totalViews > 0 ? (r.views / totalViews) * 100 : 0;
                return (
                  <div key={r.platform}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2 w-2 rounded-[3px] shrink-0" style={{ background: PLATFORM_COLORS[r.platform] || fallbackColors[idx % fallbackColors.length] }} />
                        <span className="text-xs capitalize truncate">{r.platform}</span>
                      </div>
                      <span className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
                        {pct.toFixed(1)}%
                        <span className={r.views_delta_pct >= 0 ? "text-emerald-300" : "text-rose-400"} title="Views change vs previous period">
                          {r.views_delta_pct >= 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                        </span>
                      </span>
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
