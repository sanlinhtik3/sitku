import { memberMetrics, useTeamState } from "@/repositories/local/teamStore";
import { useState } from "react";
import { TeamManagementDialog } from "./TeamManagementDialog";

export function TeamPerformanceTable() {
  const { members, tasks } = useTeamState();
  const [teamOpen, setTeamOpen] = useState(() => new URLSearchParams(window.location.search).get("_team") === "1");
  const onManageTeam = () => {
    setTeamOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.set("_s", "consultant");
    url.searchParams.set("_team", "1");
    history.replaceState(null, "", `${url.pathname}${url.search}`);
  };
  const closeTeam = (next: boolean) => {
    setTeamOpen(next);
    if (!next) {
      const url = new URL(window.location.href);
      url.searchParams.set("_s", "consultant");
      url.searchParams.delete("_team");
      history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
  };
  const rows = members.filter((member) => !member.archived).map((member) => ({ member, metrics: memberMetrics(member, tasks) }));
  return <><section className="consultant-card consultant-fade overflow-hidden p-4 sm:px-5">
    <div className="mb-1 flex items-center justify-between gap-3"><div><h3 className="consultant-section-title">Team performance</h3><p className="mt-0.5 text-[11.5px] text-[#8a8a8e]">Delivery 60 · impact 40 · local attribution</p></div><button type="button" onClick={onManageTeam} className="consultant-control hidden sm:grid h-8 place-items-center rounded-[10px] px-3 text-[11px] text-[#a4a4aa]">Manage team</button></div>
    {!rows.length ? <button type="button" onClick={onManageTeam} className="my-3 grid w-full place-items-center rounded-[14px] border border-dashed border-white/[.09] py-9 text-[11.5px] text-[#8a8a8e]">Add your team to activate workload and KPI insights</button> : <div className="consultant-scroll mt-2 overflow-x-auto pb-1"><div className="min-w-[720px]">
      <div className="grid grid-cols-[1.5fr_.55fr_.7fr_.55fr_1fr_.8fr] gap-2 px-1.5 py-2 text-[10px] uppercase tracking-[.08em] text-[#6a6a6c]"><span>Member</span><span className="text-right">Active</span><span className="text-right">On time</span><span className="text-right">Impact</span><span>Workload</span><span className="text-right">KPI score</span></div>
      {rows.map(({member,metrics})=>{const color=metrics.kpi>=75?"#6ee7b7":metrics.kpi>=50?"#fbbf24":"#fb7185";const load=Math.min(100,metrics.active/Math.max(1,member.capacityHours/8)*100);return <button onClick={onManageTeam} key={member.id} className="grid w-full grid-cols-[1.5fr_.55fr_.7fr_.55fr_1fr_.8fr] items-center gap-2 border-t border-white/[.05] px-1.5 py-2.5 text-left transition-colors hover:bg-white/[.025]">
        <div className="flex min-w-0 items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] border text-[11.5px] font-bold" style={{color,borderColor:`${color}35`,background:`${color}12`}}>{member.name.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}</span><div className="min-w-0"><div className="truncate text-[12.5px] font-medium text-[#ededef]">{member.name}</div><div className="text-[10.5px] text-[#8a8a8e]">{member.role}</div></div></div>
        <span className="text-right text-[12.5px] tabular-nums">{metrics.active}</span><span className="text-right text-[12.5px] tabular-nums">{metrics.onTimeRate?`${Math.round(metrics.onTimeRate)}%`:"—"}</span><span className="text-right text-xs font-semibold tabular-nums" style={{color}}>{metrics.impact?Math.round(metrics.impact):"—"}</span><div className="flex items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[.08]"><span className="block h-full rounded-full" style={{width:`${load}%`,background:color}}/></span><small className="w-7 text-right text-[#8a8a8e]">{Math.round(load)}%</small></div><div className="flex items-center justify-end gap-2"><span className="h-1 w-[52px] overflow-hidden rounded-full bg-white/[.08]"><span className="consultant-grow block h-full rounded-full" style={{width:`${metrics.kpi}%`,background:color}}/></span><span className="w-6 text-right text-[13px] font-bold tabular-nums" style={{color}}>{metrics.kpi||"—"}</span></div>
      </button>})}
    </div></div>}
  </section><TeamManagementDialog open={teamOpen} onOpenChange={closeTeam} /></>;
}
