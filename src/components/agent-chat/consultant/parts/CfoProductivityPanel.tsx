import { Card } from "@/components/ui/card";
import { BarChart3, CircleDollarSign, Database, Target, Zap } from "lucide-react";
import { type DateRange } from "@/lib/consultantHelpers";

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
  targets,
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
    posts?: number;
  } | null;
  targets?: { data_coverage_pct:number; hundred_k_posts:number; hundred_k_goal:number; cadence_pct:number; cfo_health_pct:number } | null;
  periodLabel: string;
}) {
  const revenue = Number(dashboard?.revenue || 0);
  const net = Number(dashboard?.net || 0);
  const roi = dashboard?.roi_pct == null ? null : Number(dashboard.roi_pct);
  const engagement = Number(dashboard?.engagement || 0);
  const posts = Number(dashboard?.posts ?? dashboard?.total_posts ?? 0);

  const marginPct = revenue > 0 ? (net / revenue) * 100 : 0;
  const views = Number(dashboard?.views || 0);
  const engagementRate = views > 0 ? (engagement / views) * 100 : 0;
  const dayCount = daysInclusive(range);
  const cadenceScore = clamp((posts / Math.max(1, dayCount)) * 100);
  const cfoScore = clamp((marginPct * 0.55) + (Number(roi ?? 0) * 0.25) + (engagementRate * 4));

  const targetRows = [
    { label:"Data coverage", value:targets?.data_coverage_pct ?? 0, hint:`${targets?.data_coverage_pct ?? 0}%`, color:"#7dd3fc", icon:<Database className="h-3.5 w-3.5"/> },
    { label:"100K-view posts", value:targets?.hundred_k_goal ? ((targets.hundred_k_posts/targets.hundred_k_goal)*100) : 0, hint:`${targets?.hundred_k_posts ?? 0} / ${targets?.hundred_k_goal ?? 5}`, color:"var(--consultant-ac)", icon:<Target className="h-3.5 w-3.5"/> },
    { label:"Cadence", value:targets?.cadence_pct ?? cadenceScore, hint:`${posts} posts / ${dayCount} days`, color:"#c4b5fd", icon:<BarChart3 className="h-3.5 w-3.5"/> },
    { label:"CFO health", value:targets?.cfo_health_pct ?? cfoScore, hint:roi == null ? "needs spend data" : `${roi.toFixed(1)}% ROI`, color:"#6ee7b7", icon:<CircleDollarSign className="h-3.5 w-3.5"/> },
  ];

  return (
    <Card className="consultant-card p-4 sm:px-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="consultant-section-title">Targets</div>
          <div className="text-[11.5px] text-[#8a8a8e] mt-0.5">{periodLabel} operating goals</div>
        </div>
        <div className="h-9 w-9 rounded-xl border border-emerald-400/25 bg-emerald-500/10 flex items-center justify-center">
          <Zap className="h-4 w-4 text-emerald-300" />
        </div>
      </div>

      <div className="space-y-[13px]">
        {targetRows.map((row)=><TargetRow key={row.label} {...row}/>) }
      </div>
    </Card>
  );
}

function TargetRow({label,value,hint,color,icon}:{label:string;value:number;hint:string;color:string;icon:React.ReactNode}) { return <div>
  <div className="mb-1.5 flex items-center justify-between text-[11.5px]"><span className="flex items-center gap-1.5 text-[#a4a4aa]" style={{color}}>{icon}<span className="text-[#a4a4aa]">{label}</span></span><span className="font-semibold tabular-nums text-[#e4e4e8]">{hint}</span></div>
  <div className="h-[5px] overflow-hidden rounded-full bg-white/[.07]"><div className="consultant-grow h-full rounded-full" style={{width:`${clamp(value)}%`,background:color}}/></div>
</div> }
