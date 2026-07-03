// Local, rule-based "Income Brief" — 3–4 deterministic observations surfaced
// from the existing income-intelligence hook. Zero network, zero new deps; runs
// instantly on every range change. Each observation explicitly mentions WHY it
// matters (concentration, coverage, trend, new) so the user gets signal, not
// restated KPIs.
//
// Observations (priority order):
//   1. Trend       — period income up/down vs prev, with the top driver
//   2. Concentration — flag when one sub-source > 50% of period income
//   3. Coverage    — flag if "Unattributed" share is non-trivial (>= 1 entry)
//   4. New sources — sub-sources present this period but absent last period
//
// If no income exists, render a friendly empty state nudging the user to add
// their first income transaction (don't pretend there's signal).

import { Card } from "@/components/ui/card";
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle, Tag, Plus, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IncomeIntelligence } from "@/hooks/useFlowStateIncomeIntelligence";

interface Props {
  data: IncomeIntelligence | undefined;
  currency: string;
  periodLabel: string;
}

const fmt = (n: number, cur: string) => {
  const v = n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
          : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
          : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);
  if (cur === "MMK") return `${v} Ks`;
  if (cur === "USD") return `$${v}`;
  if (cur === "THB") return `฿${v}`;
  return `${v} ${cur}`;
};

type Severity = "positive" | "warning" | "info" | "neutral";

interface Observation {
  id: string;
  icon: React.ReactNode;
  text: React.ReactNode;
  severity: Severity;
}

const SEVERITY_COLOR: Record<Severity, string> = {
  positive: "text-emerald-300 bg-emerald-400/15 border-emerald-400/30",
  warning:  "text-amber-300 bg-amber-400/15 border-amber-400/30",
  info:     "text-sky-300 bg-sky-400/15 border-sky-400/30",
  neutral:  "text-muted-foreground bg-muted/30 border-border/40",
};

const SEVERITY_BAR: Record<Severity, string> = {
  positive: "bg-emerald-400/70",
  warning:  "bg-amber-400/70",
  info:     "bg-sky-400/70",
  neutral:  "bg-border/40",
};

function computeObservations(data: IncomeIntelligence, currency: string, periodLabel: string): Observation[] {
  const obs: Observation[] = [];
  const totalIncome = data.totals.income;

  // ── 1. Trend (income vs prev, with the top driver) ──
  const delta = data.totals.deltaIncomePct;
  const top = data.topSources[0];
  if (delta != null && Number.isFinite(delta)) {
    const up = delta >= 0;
    const sign = up ? "+" : "";
    const driverPhrase = top ? `top driver: ${top.subSource ?? top.source}` : "";
    obs.push({
      id: "trend",
      icon: up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />,
      severity: up ? "positive" : "warning",
      text: <>
        {periodLabel} income {up ? "up" : "down"} <b className="tabular-nums">{sign}{delta.toFixed(1)}%</b> vs prev period
        {driverPhrase && <> · <span className="text-muted-foreground">{driverPhrase}</span></>}.
      </>,
    });
  }

  // ── 2. Concentration risk (top sub-source > 50%) ──
  if (top && totalIncome > 0 && top.pct >= 50) {
    obs.push({
      id: "concentration",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      severity: top.pct >= 75 ? "warning" : "info",
      text: <>
        <b>{top.subSource ?? top.source}</b> dominates — <b className="tabular-nums">{top.pct.toFixed(1)}%</b> of {periodLabel.toLowerCase()} income.
        Concentration risk.
      </>,
    });
  }

  // ── 3. Coverage gap (Unattributed entries present) ──
  const unattributed = data.topSources.filter((s) => s.subSource == null);
  const unattributedTotal = unattributed.reduce((s, r) => s + r.amount, 0);
  const unattributedCount = unattributed.reduce((s, r) => s + r.count, 0);
  if (unattributedCount > 0) {
    obs.push({
      id: "coverage",
      icon: <Tag className="h-3.5 w-3.5" />,
      severity: "info",
      text: <>
        <b className="tabular-nums">{unattributedCount}</b> {unattributedCount === 1 ? "entry" : "entries"} unattributed ({fmt(unattributedTotal, currency)})
        — tag the source on edit to improve insight.
      </>,
    });
  }

  // ── 4. New sources (sub-sources present now, absent in prev period) ──
  const prev = new Set(data.prevSourceKeys);
  const currentKeys = data.topSources.map((s) => `${s.source}::${s.subSource ?? "Unattributed"}`);
  const newKeys = currentKeys.filter((k) => !prev.has(k));
  // Only flag NEW sources if previous period had ANY income (otherwise everything is "new").
  if (newKeys.length > 0 && data.prevSourceKeys.length > 0) {
    const top3 = newKeys.slice(0, 3).map((k) => k.split("::")[1] || k.split("::")[0]);
    obs.push({
      id: "new",
      icon: <Plus className="h-3.5 w-3.5" />,
      severity: "positive",
      text: <>
        <b className="tabular-nums">{newKeys.length}</b> new {newKeys.length === 1 ? "source" : "sources"} this period:
        {" "}<span className="text-muted-foreground">{top3.join(", ")}{newKeys.length > 3 ? "…" : ""}</span>.
      </>,
    });
  }

  return obs;
}

export function IncomeBriefCard({ data, currency, periodLabel }: Props) {
  const hasIncome = (data?.totals.income ?? 0) > 0;
  const obs = data ? computeObservations(data, currency, periodLabel) : [];

  return (
    <Card className="consultant-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-violet-300" /> Income Brief
          </div>
          <div className="text-sm font-semibold mt-0.5">{periodLabel} · auto-observed</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-muted-foreground">Signals</div>
          <div className="text-xs font-semibold text-violet-300 tabular-nums">{obs.length}</div>
        </div>
      </div>

      {!hasIncome ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No income to brief yet.<br/>Add your first income transaction to unlock observations.
        </div>
      ) : obs.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground flex items-center gap-2 justify-center">
          <Info className="h-3.5 w-3.5" /> No notable signals this period.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {obs.map((o) => (
            <li key={o.id} className="flex items-start gap-2.5">
              <span className={cn(
                "h-6 w-6 rounded-lg border flex items-center justify-center shrink-0 mt-0.5",
                SEVERITY_COLOR[o.severity],
              )}>
                {o.icon}
              </span>
              <div className="flex-1 min-w-0 relative pl-2">
                <span className={cn("absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full", SEVERITY_BAR[o.severity])} />
                <p className="text-xs leading-relaxed text-foreground/90">{o.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
