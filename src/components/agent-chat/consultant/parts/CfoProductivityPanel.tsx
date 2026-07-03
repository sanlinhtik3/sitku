import type React from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BadgeCheck, Clock3, DollarSign, Focus, ShieldAlert, Zap } from "lucide-react";
import { CONSULTANT_FINANCE_CURRENCY, type DateRange } from "@/lib/consultantHelpers";

const fmtMoney = (n: number) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n || 0)} ${CONSULTANT_FINANCE_CURRENCY}`;

const clamp = (n: number) => Math.max(0, Math.min(100, n));

const daysInclusive = (range: DateRange) => {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const ms = to.getTime() - from.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 1;
  return Math.floor(ms / 86_400_000) + 1;
};

export function CfoProductivityPanel({
  range,
  dashboard,
  periodLabel,
}: {
  range: DateRange;
  dashboard?: {
    revenue?: number;
    spend?: number;
    net?: number;
    roi_pct?: number | null;
    views?: number;
    engagement?: number;
    total_posts?: number;
  } | null;
  periodLabel: string;
}) {
  const revenue = Number(dashboard?.revenue || 0);
  const spend = Number(dashboard?.spend || 0);
  const net = Number(dashboard?.net || 0);
  const roi = dashboard?.roi_pct == null ? null : Number(dashboard.roi_pct);
  const views = Number(dashboard?.views || 0);
  const engagement = Number(dashboard?.engagement || 0);
  const posts = Number(dashboard?.total_posts || 0);

  const marginPct = revenue > 0 ? (net / revenue) * 100 : 0;
  const costPerView = views > 0 ? spend / views : 0;
  const engagementRate = views > 0 ? (engagement / views) * 100 : 0;
  const dayCount = daysInclusive(range);
  const cadenceScore = clamp((posts / Math.max(1, dayCount)) * 100);
  const cfoScore = clamp((marginPct * 0.55) + (Number(roi ?? 0) * 0.25) + (engagementRate * 4));

  const hacks = [
    {
      icon: <Focus className="h-3.5 w-3.5" />,
      title: "Double down window",
      body: posts < 3 ? "Post 3 test assets before judging the channel." : "Repurpose the top post into 3 angle variants.",
    },
    {
      icon: <Clock3 className="h-3.5 w-3.5" />,
      title: "Daily measurement",
      body: "Log channel snapshots at the same time every day to make forecasts cleaner.",
    },
    {
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
      title: "CFO guardrail",
      body: spend > revenue ? "Pause low-signal spend until one offer shows positive net." : "Protect winners with a fixed reinvestment cap.",
    },
  ];

  return (
    <Card className="consultant-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">CFO + Productivity</div>
          <div className="text-sm font-semibold mt-0.5">{periodLabel} {CONSULTANT_FINANCE_CURRENCY} money, focus, and execution</div>
        </div>
        <div className="h-9 w-9 rounded-xl border border-emerald-400/25 bg-emerald-500/10 flex items-center justify-center">
          <Zap className="h-4 w-4 text-emerald-300" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <MiniStat icon={<DollarSign className="h-3 w-3" />} label="Net" value={fmtMoney(net)} tone={net >= 0 ? "good" : "bad"} />
        <MiniStat icon={<BadgeCheck className="h-3 w-3" />} label="Margin" value={`${marginPct.toFixed(1)}%`} tone={marginPct >= 0 ? "good" : "bad"} />
        <MiniStat icon={<Clock3 className="h-3 w-3" />} label="CPV" value={`${costPerView.toFixed(1)}`} />
      </div>

      <div className="space-y-3 mb-4">
        <ProgressRow label="CFO health" value={cfoScore} hint={roi == null ? "needs spend data" : `${roi.toFixed(1)}% ROI`} />
        <ProgressRow label="Engagement quality" value={clamp(engagementRate * 10)} hint={`${engagementRate.toFixed(2)}% ER`} />
        <ProgressRow label="Execution cadence" value={cadenceScore} hint={`${posts} posts / ${dayCount} days`} />
      </div>

      <div className="grid gap-2">
        {hacks.map((h) => (
          <div key={h.title} className="consultant-panel p-2.5">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="text-emerald-300">{h.icon}</span>
              {h.title}
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{h.body}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MiniStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-border/25 bg-background/25 p-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-xs font-semibold tabular-nums truncate ${tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-400" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function ProgressRow({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{hint}</span>
      </div>
      <Progress value={clamp(value)} className="h-1.5" />
    </div>
  );
}
