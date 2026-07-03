import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { consultantStore } from "@/repositories/local/consultantStore";
import { ExternalLink, Loader2 } from "lucide-react";
import type { DateRange } from "@/hooks/useConsultantData";

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
  title?: string | null;
  post_name?: string | null;
  post_url?: string | null;
  platform?: string | null;
  engagement?: number | string | null;
}

export function TopPerformersList({ range, periodLabel }: { range: DateRange; periodLabel: string }) {
  const q = useQuery({
    queryKey: ["agentic", "leaderboard", range.from, range.to],
    queryFn: async () => {
      const data = await consultantStore.topPosts(range.from, range.to, "engagement", 5);
      // Normalize: store returns { title, ... } — map to legacy { post_name }
      const rows = ((data as { rows?: TopPostRow[] } | null)?.rows ?? []);
      return rows.map((r) => ({
        ...r,
        post_name: r.title ?? r.post_name ?? "Untitled",
      }));
    },
  });

  return (
    <Card className="consultant-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{periodLabel} Top Performers</div>
          <div className="text-sm font-semibold mt-0.5">By engagement</div>
        </div>
        <span className="text-[10px] text-muted-foreground">{range.from} → {range.to}</span>
      </div>

      {q.isLoading ? (
        <div className="py-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : q.data?.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No performance data for {periodLabel.toLowerCase()}. Add metrics to start ranking posts.
        </div>
      ) : (
        <div className="divide-y divide-border/15">
          {q.data?.map((row, idx) => {
            const platform = row.platform ?? "other";
            const dot = PLATFORM_DOT[platform] ?? PLATFORM_DOT.other;
            return (
              <div key={row.id} className="py-2.5 flex items-center gap-3">
                <div className="text-[11px] tabular-nums text-muted-foreground w-5">#{idx + 1}</div>
                <div className={`h-7 w-7 rounded-xl ${dot}/20 border border-border/20 flex items-center justify-center shrink-0`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate flex items-center gap-1.5">
                    {row.post_name}
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
                    {fmt(Number(row.engagement || 0))}
                  </div>
                  <div className="text-[10px] text-muted-foreground">engage</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
