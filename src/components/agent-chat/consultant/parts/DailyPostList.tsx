import { useMemo } from "react";
import { CheckCircle2, Clock3, ExternalLink, Plus, Sparkles, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { localDateString } from "@/lib/consultantHelpers";
import { useConsultantPosts } from "@/hooks/useConsultantData";

const PLATFORM_DOT: Record<string, string> = {
  facebook: "bg-blue-500",
  instagram: "bg-pink-500",
  tiktok: "bg-fuchsia-500",
  youtube: "bg-red-500",
  telegram: "bg-sky-400",
  x: "bg-neutral-300",
  linkedin: "bg-sky-500",
  threads: "bg-purple-500",
  newsletter: "bg-amber-400",
  podcast: "bg-violet-400",
  other: "bg-emerald-500",
};

interface Props {
  dailyTarget?: number;
  onAddPost: () => void;
}

export function DailyPostList({ dailyTarget = 3, onAddPost }: Props) {
  const posts = useConsultantPosts();
  const today = localDateString();
  const displayDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${today}T00:00:00`));

  const todaysPosts = useMemo(() => {
    return (posts.data ?? [])
      .filter((post) => post.posted_at === today)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [posts.data, today]);

  const postedCount = todaysPosts.length;
  const remaining = Math.max(0, dailyTarget - postedCount);
  const progress = dailyTarget > 0 ? Math.min(100, Math.round((postedCount / dailyTarget) * 100)) : 100;
  const targetMet = remaining === 0;
  const nextAction = targetMet
    ? "Target met. Shift into performance mode: update metrics, watch early engagement, and promote the strongest post."
    : `${remaining} post${remaining === 1 ? "" : "s"} left. Publish the next strongest idea before the day closes, then log metrics after the first signal lands.`;

  return (
    <Card className="consultant-card p-4 overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Today Post List</div>
            <span className="consultant-control rounded-full px-2 py-0.5 text-[10px] text-muted-foreground">{displayDate}</span>
          </div>
          <div className="text-sm font-semibold mt-1 tracking-tight">Daily publishing control</div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onAddPost}
          className="h-8 rounded-full bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20 text-[11px] font-semibold"
        >
          <Plus className="h-3.5 w-3.5" />
          Log post
        </Button>
      </div>

      <div className="consultant-panel p-3 mb-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`h-8 w-8 rounded-2xl border flex items-center justify-center shrink-0 ${
              targetMet ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-amber-500/15 border-amber-500/30 text-amber-300"
            }`}>
              {targetMet ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium">{postedCount}/{dailyTarget} posts shipped</div>
              <div className="text-[10px] text-muted-foreground">{targetMet ? "Publishing target complete" : `${remaining} remaining today`}</div>
            </div>
          </div>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{progress}%</span>
        </div>
        <Progress value={progress} className="h-1.5 bg-muted/25" />
      </div>

      <div className="consultant-panel p-3 mb-3">
        <div className="flex gap-2">
          <div className="h-8 w-8 rounded-2xl bg-primary/15 text-primary border border-primary/20 flex items-center justify-center shrink-0">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium">Beebot Consultant</div>
            <p className="text-[11px] leading-relaxed text-muted-foreground mt-0.5">{nextAction}</p>
          </div>
        </div>
      </div>

      {posts.isLoading ? (
        <div className="py-7 text-center text-xs text-muted-foreground">Loading today's posts...</div>
      ) : todaysPosts.length === 0 ? (
        <div className="py-7 text-center">
          <Clock3 className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
          <div className="text-xs font-medium">No posts logged today</div>
          <div className="text-[10px] text-muted-foreground mt-1">Start with the highest-leverage post, then let the list track execution.</div>
        </div>
      ) : (
        <div className="divide-y divide-border/15">
          {todaysPosts.map((post) => {
            const dot = PLATFORM_DOT[post.platform] ?? PLATFORM_DOT.other;
            return (
              <div key={post.id} className="py-2.5 flex items-center gap-3">
                <div className={`h-8 w-8 rounded-2xl ${dot}/20 border border-border/20 flex items-center justify-center shrink-0`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate flex items-center gap-1.5">
                    {post.post_name}
                    {post.post_url && (
                      <a href={post.post_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-emerald-300 shrink-0">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground capitalize">{post.platform}</div>
                </div>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
