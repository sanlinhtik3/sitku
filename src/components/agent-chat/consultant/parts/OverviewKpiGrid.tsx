import type { ReactNode } from "react";
import { Card, DollarMinimalistic, Eye, Heart, Bolt, Chart2 } from "@solar-icons/react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { CONSULTANT_FINANCE_CURRENCY } from "@/lib/consultantHelpers";
import { FuiLabel, FuiMetric, FuiStatus } from "@/design-system/fui";

const compact = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : Math.round(n).toLocaleString();
const money = (n: number) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)} ${CONSULTANT_FINANCE_CURRENCY}`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

interface Summary { revenue?:number; spend?:number; net?:number; roi_pct?:number|null; total_posts?:number; views?:number; engagement?:number }
interface Analysis {
  totals?: { revenue:number; spend:number; net:number; posts:number; views:number; engagement_rate:number; roi_pct:number|null };
  baselineTotals?: { revenue:number; spend:number; net:number; posts:number; views:number; roi_pct:number|null };
  deltas?: { revenue:number; net:number; posts:number; views:number; engagement:number };
}

export function OverviewKpiGrid({ data, analysis, periodLabel }: { data?: Summary | null; analysis?: Analysis | null; periodLabel: string }) {
  const t = analysis?.totals;
  const b = analysis?.baselineTotals;
  const d = analysis?.deltas;
  const revenue = t?.revenue ?? data?.revenue ?? 0;
  const spend = t?.spend ?? data?.spend ?? 0;
  const net = t?.net ?? data?.net ?? revenue - spend;
  const views = t?.views ?? data?.views ?? 0;
  const posts = t?.posts ?? data?.total_posts ?? 0;
  const engagementRate = t?.engagement_rate ?? (views > 0 ? ((data?.engagement ?? 0) / views) * 100 : 0);
  const roi = t?.roi_pct ?? data?.roi_pct ?? 0;
  const baselineRoi = b?.roi_pct ?? 0;
  const roiDelta = roi - baselineRoi;
  const spendDelta = b?.spend ? ((spend - b.spend) / b.spend) * 100 : 0;

  const items = [
    { label:"Revenue", value:money(revenue), prev:money(b?.revenue ?? 0), delta:d?.revenue ?? 0, good:(d?.revenue ?? 0)>=0, icon:<DollarMinimalistic size={16}/> },
    { label:"Spend", value:money(spend), prev:money(b?.spend ?? 0), delta:spendDelta, good:spendDelta<=0, icon:<Card size={16}/> },
    { label:"Net", value:money(net), prev:money(b?.net ?? 0), delta:d?.net ?? 0, good:(d?.net ?? 0)>=0, icon:<Chart2 size={16}/> },
    { label:"Posts", value:String(posts), prev:String(b?.posts ?? 0), delta:d?.posts ?? 0, good:(d?.posts ?? 0)>=0, icon:<Bolt size={16}/> },
    { label:"Views", value:compact(views), prev:compact(b?.views ?? 0), delta:d?.views ?? 0, good:(d?.views ?? 0)>=0, icon:<Eye size={16}/> },
    { label:"Engage rate", value:`${engagementRate.toFixed(1)}%`, prev:"baseline", delta:d?.engagement ?? 0, good:(d?.engagement ?? 0)>=0, icon:<Heart size={16}/> },
  ];

  return <div className="consultant-fade grid grid-cols-1 gap-[14px] md:grid-cols-[minmax(230px,.72fr)_minmax(0,2fr)]">
    <div className="consultant-card flex min-h-[261px] flex-col items-center justify-center p-5 text-center">
      <RoiRing value={roi} />
      <FuiLabel className="mt-1">{periodLabel} ROI</FuiLabel>
      <div className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${roiDelta >= 0 ? "border-emerald-400/20 bg-emerald-400/[.08] text-[#6ee7b7]" : "border-rose-400/20 bg-rose-400/[.08] text-[#fb7185]"}`}>
        {roiDelta >= 0 ? <ArrowUp size={11}/> : <ArrowDown size={11}/>} {roiDelta >= 0 ? "+" : ""}{roiDelta.toFixed(1)} pts vs previous
      </div>
      <FuiStatus status="info" className="mt-2" label={`Baseline ${baselineRoi.toFixed(1)}% · previous period`} />
    </div>
    <div className="grid min-h-[261px] grid-cols-2 gap-2.5 md:grid-cols-3">
      {items.map((item, index) => <KpiTile key={item.label} {...item} delay={index * .045} />)}
    </div>
  </div>;
}

function RoiRing({ value }: { value:number }) {
  const r=61, c=2*Math.PI*r, visual=Math.max(0,Math.min(100,value))/100;
  return <div className="relative h-[148px] w-[148px]">
    <svg viewBox="0 0 148 148" className="h-full w-full -rotate-90 overflow-visible">
      <defs><linearGradient id="consultantRoi" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff2c4"/><stop offset="1" stopColor="var(--consultant-ac)"/></linearGradient></defs>
      <circle cx="74" cy="74" r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="10"/>
      <circle cx="74" cy="74" r={r} fill="none" stroke="url(#consultantRoi)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${c*visual} ${c}`} className="drop-shadow-[0_0_8px_color-mix(in_oklab,var(--consultant-ac)_55%,transparent)]"/>
    </svg>
    <div className="absolute inset-0 flex items-center justify-center"><FuiMetric className="text-[30px] font-[740] tracking-[-.03em]">{value.toFixed(0)}%</FuiMetric></div>
  </div>;
}

function KpiTile({label,value,prev,delta,good,icon,delay}:{label:string;value:string;prev:string;delta:number;good:boolean;icon:ReactNode;delay:number}) {
  const up=delta>=0;
  return <div className="consultant-card consultant-kpi-tile consultant-fade min-w-0 p-3.5" style={{animationDelay:`${delay}s`}}>
    <div className="flex items-center justify-between gap-2"><FuiLabel>{label}</FuiLabel><span className="text-[var(--bb-text-3)]">{icon}</span></div>
    <div className="mt-2 flex min-w-0 items-baseline gap-2"><FuiMetric className="truncate text-[clamp(17px,1.8vw,22px)] font-bold tracking-[-.03em]">{value}</FuiMetric><span className={`inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-semibold ${good?"text-[var(--bb-positive)]":"text-[var(--bb-negative)]"}`}>{up?<ArrowUp size={11}/>:<ArrowDown size={11}/>} {pct(delta)}</span></div>
    <div className="mt-1 text-[10px] tabular-nums text-[var(--bb-text-3)]">prev {prev}</div>
  </div>;
}
