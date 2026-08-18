import { Card } from "@/components/ui/card";
import { ExternalLink, Loader2 } from "lucide-react";

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(Math.round(n ?? 0));

const PLATFORM_DOT: Record<string, string> = {
  facebook: "bg-blue-500",
  instagram: "bg-pink-500",
  tiktok: "bg-fuchsia-500",
  youtube: "bg-red-500",
  x: "bg-neutral-300",
  linkedin: "bg-sky-500",
  threads: "bg-purple-500",
  other: "bg-emerald-500",
};

interface TopPostRow {
  id: string;
  title: string;
  post_url: string | null;
  platform: string;
  views: number;
  engagement: number;
}

export function TopPerformersList({ posts, periodLabel, isLoading }: { posts?: TopPostRow[]; periodLabel: string; isLoading?: boolean }) {
  const rows = posts?.slice(0, 5) ?? [];

  return (
    <Card className="consultant-card consultant-fade p-4 sm:px-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="consultant-section-title">Top performers</div>
          <div className="mt-0.5 text-[11.5px] text-[#8a8a8e]">Ranked by engagement · {periodLabel.toLowerCase()}</div>
        </div>
        <span className="hidden text-[10px] text-[#6a6a6c] sm:block">views-led ranking</span>
      </div>

      {isLoading ? (
        <div className="py-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No performance data for {periodLabel.toLowerCase()}. Add metrics to start ranking posts.
        </div>
      ) : (
        <div className="divide-y divide-white/[.055]">
          {rows.map((row, idx) => {
            const platform = row.platform ?? "other";
            const dot = PLATFORM_DOT[platform] ?? PLATFORM_DOT.other;
            return (
              <div key={row.id} className="flex items-center gap-3 py-2.5 transition-colors hover:bg-white/[.02]">
                <div className="text-[11px] tabular-nums text-muted-foreground w-5">#{idx + 1}</div>
                <div className={`h-7 w-7 rounded-xl ${dot}/20 border border-border/20 flex items-center justify-center shrink-0`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate flex items-center gap-1.5">
                    {row.title}
                    {row.post_url && (
                      <a href={row.post_url} target="_blank" rel="noreferrer"
                        className="text-muted-foreground hover:text-emerald-300 shrink-0">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground capitalize">{platform}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums text-emerald-300">
                    {fmt(row.views)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">views</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
