import { ArrowDown, ArrowUp } from "lucide-react";

interface Analysis { deltas?: { views:number; engagement:number; net:number; posts:number }; totals?: { cost_per_view:number }; baselineTotals?: { views:number; spend:number } }

export function GrowthPulse({ analysis }: { analysis?: Analysis | null }) {
  const deltas=analysis?.deltas;
  const oldCpv=(analysis?.baselineTotals?.views ?? 0)>0 ? (analysis?.baselineTotals?.spend ?? 0)/(analysis?.baselineTotals?.views ?? 1) : 0;
  const cpv=analysis?.totals?.cost_per_view ?? 0;
  const cpvDelta=oldCpv>0 ? ((cpv-oldCpv)/oldCpv)*100 : 0;
  const rows=[
    {label:"Views",delta:deltas?.views??0,note:"attention",good:(deltas?.views??0)>=0},
    {label:"Engagement",delta:deltas?.engagement??0,note:"signal quality",good:(deltas?.engagement??0)>=0},
    {label:"Net profit",delta:deltas?.net??0,note:"operating leverage",good:(deltas?.net??0)>=0},
    {label:"Posts",delta:deltas?.posts??0,note:"cadence",good:(deltas?.posts??0)>=0},
    {label:"Cost / view",delta:cpvDelta,note:"efficiency",good:cpvDelta<=0},
  ];
  return <section className="consultant-card consultant-fade p-4 sm:h-[136px] sm:px-5">
    <div className="mb-3 flex items-center gap-2.5"><h3 className="consultant-section-title">Growth pulse</h3><span className="text-[11px] text-[#8a8a8e]">current vs previous period</span></div>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {rows.map((row)=><div key={row.label} className={`h-[73px] rounded-[13px] border px-3 py-2 ${row.good?"border-emerald-400/20 bg-emerald-400/[.055]":"border-rose-400/20 bg-rose-400/[.055]"}`}>
        <div className="flex items-center justify-between text-[10.5px] text-[#8a8a8e]"><span>{row.label}</span>{row.delta>=0?<ArrowUp size={13} className={row.good?"text-[#6ee7b7]":"text-[#fb7185]"}/>:<ArrowDown size={13} className={row.good?"text-[#6ee7b7]":"text-[#fb7185]"}/>}</div>
        <div className={`mt-1 text-base font-bold tabular-nums ${row.good?"text-[#6ee7b7]":"text-[#fb7185]"}`}>{row.delta>0?"+":""}{row.delta.toFixed(1)}%</div>
        <div className="mt-0.5 text-[10px] text-[#6a6a6c]">{row.note}</div>
      </div>)}
    </div>
  </section>;
}
