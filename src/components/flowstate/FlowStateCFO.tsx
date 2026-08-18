import { lazy, Suspense, useState, useMemo, type CSSProperties } from "react";
import { Loader2, ArrowUpRight, ArrowDownRight, Sparkles, Sun } from "@/components/flowstate/solarIcons";
import { consultantRangeForPreset, type ConsultantRangePreset } from "@/lib/consultantHelpers";
import { useFlowStateIncomeIntelligence } from "@/hooks/useFlowStateIncomeIntelligence";
import { FuiPanel } from "@/design-system/fui";

// §2 timeline chart — lazy (Recharts). The rest of the CFO income view is a 1:1 port of the
// handoff's inline-styled glass cards (Personal CFO v2.dc.html §1/§3/§4), wired to the real
// useFlowStateIncomeIntelligence payload. See design_handoff_personal_cfo/README.md.
const IncomeNetTimeline = lazy(() => import("@/components/flowstate/intelligence/IncomeNetTimeline").then((m) => ({ default: m.IncomeNetTimeline })));

/* Semantic theme tokens keep CFO meaning stable across built-in and personal themes. */
const C = {
  title: "var(--bb-text-1)", body: "var(--bb-text-2)", sub: "var(--bb-text-3)", muted: "var(--bb-text-3)", faint: "var(--bb-text-4)",
  pos: "var(--bb-positive)", posStrong: "var(--bb-positive)", posDot: "var(--bb-positive)",
  neg: "var(--bb-negative)", negDot: "var(--bb-negative)",
  warn: "var(--bb-warning)", info: "var(--bb-info)", violet: "var(--bb-accent)",
};
const tint = (color: string, alpha: number) => `color-mix(in oklab, ${color} ${Math.round(alpha * 100)}%, transparent)`;

const ChartSkeleton = ({ h = 200 }: { h?: number }) => (
  <div className="flex items-center justify-center text-xs text-muted-foreground gap-2" style={{ height: h }}>
    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
  </div>
);

interface FlowStateCFOProps {
  userId: string;
  currency: string;
  rangePreset?: ConsultantRangePreset;
  onRangePresetChange?: (preset: ConsultantRangePreset) => void;
  showIncomeTimeline?: boolean;
  showIncomeIntelligence?: boolean;
  /** Retained for backward-compat with existing callers (FlowStateDialog); no longer used. */
  onOpenInBeeBot?: (prompt: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- onOpenInBeeBot kept for API stability after CFO Suite removal.
export function FlowStateCFO({ userId, currency, rangePreset, onRangePresetChange, showIncomeTimeline = true, showIncomeIntelligence = true, onOpenInBeeBot: _onOpenInBeeBot }: FlowStateCFOProps) {
  // Range is driven by the global header control (rangePreset prop); local fallback for standalone use.
  const [localRangePreset] = useState<ConsultantRangePreset>("this_month");
  const incomeRangePreset = rangePreset ?? localRangePreset;
  const incomeRangeSel = useMemo(() => consultantRangeForPreset(incomeRangePreset), [incomeRangePreset]);
  const incomeIntel = useFlowStateIncomeIntelligence(userId, incomeRangeSel.range, currency);
  const ii = incomeIntel.data;

  // ── currency formatter matching the handoff figure style ──
  const fmt = useMemo(() => {
    return (n: number, opts?: { sign?: boolean }) => {
      const neg = n < 0;
      const abs = Math.abs(n);
      const sign = neg ? "−" : opts?.sign ? "+" : "";
      const digits = currency === "USD" ? 2 : 0;
      const num = abs.toLocaleString(undefined, { maximumFractionDigits: digits });
      if (currency === "USD") return `${sign}$${num}`;
      if (currency === "MMK") return `${sign}${num} Ks`;
      if (currency === "USDT") return `${sign}${num} USDT`;
      return `${sign}฿${num}`;
    };
  }, [currency]);

  // ── derive the handoff view-models from ii ──
  const vm = useMemo(() => {
    const income = ii?.totals.income ?? 0;
    const sourceCount = ii?.totals.sourceCount ?? 0;
    const delta = ii?.totals.deltaIncomePct ?? null;
    const todayIncome = (ii?.todayEntries ?? []).reduce((s, e) => s + e.amount, 0);
    const todayCount = ii?.todayEntries.length ?? 0;

    // §1 pulse — per-metric direction-of-good coloring (not sign-based).
    const pulse = [
      { label: "Today · income", value: fmt(todayIncome), color: todayIncome > 0 ? C.pos : C.muted, dir: 0,
        note: `${todayCount} ${todayCount === 1 ? "entry" : "entries"} today` },
      { label: incomeRangeSel.label, value: fmt(income), color: income > 0 ? C.pos : C.muted, dir: 1,
        note: `${sourceCount} ${sourceCount === 1 ? "source" : "sources"}` },
      { label: "Sources", value: String(sourceCount), color: sourceCount <= 1 ? C.warn : C.info, dir: 0,
        note: sourceCount <= 1 ? "single source · concentration" : "diversified" },
      { label: "Δ vs prev", value: delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta}%`,
        color: delta == null ? C.muted : delta >= 0 ? C.pos : C.neg, dir: delta == null ? 0 : delta >= 0 ? 1 : -1,
        note: "vs previous period" },
    ];

    // §3 source-flow bars (income by source; width = share of the largest).
    const bySource = ii?.bySource ?? [];
    const maxAmt = Math.max(1, ...bySource.map((b) => b.amount));
    const sourceFlow = bySource.slice(0, 6).map((b) => ({
      label: b.source, amt: fmt(b.amount), color: b.color || C.posStrong, w: `${Math.max(3, (b.amount / maxAmt) * 100)}%`,
    }));

    // §3 top sources (category ▸ sub-source, ranked).
    const topSources = (ii?.topSources ?? []).slice(0, 4).map((t, i) => ({
      rank: String(i + 1).padStart(2, "0"),
      name: t.subSource || t.source,
      cat: t.source,
      amt: fmt(t.amount),
      w: `${Math.max(3, income > 0 ? (t.amount / income) * 100 : 0)}%`,
      meta: `×${t.count} · ${t.pct}%`,
    }));

    // §4 income brief — auto-observed signals.
    const brief: { icon: "up" | "down" | "spark" | "info"; color: string; text: string }[] = [];
    if (delta != null) brief.push({
      icon: delta >= 0 ? "up" : "down", color: delta >= 0 ? C.pos : C.neg,
      text: `Income ${delta >= 0 ? "up" : "down"} ${Math.abs(delta)}% vs the previous period.`,
    });
    const newSources = (ii?.bySource ?? []).flatMap((b) => b.subSources.map((s) => `${b.source}::${s.name}`))
      .filter((k) => ii && !ii.prevSourceKeys.includes(k)).length;
    if (newSources > 0) brief.push({ icon: "info", color: C.info, text: `${newSources} new income source${newSources === 1 ? "" : "s"} appeared this period.` });
    const top = bySource[0];
    if (top && income > 0) {
      const pct = Number(((top.amount / income) * 100).toFixed(1));
      if (pct >= 50) brief.push({ icon: "spark", color: C.warn, text: `${top.source} dominates — ${pct}% of income. Concentration risk.` });
      else brief.push({ icon: "spark", color: C.violet, text: `Top source ${top.source} is ${pct}% of income — reasonably diversified.` });
    }

    return { income, sourceCount, delta, todayIncome, todayCount, pulse, sourceFlow, topSources, brief };
  }, [ii, fmt, incomeRangeSel.label]);

  const card: CSSProperties = { padding: "18px 20px" };
  const sectionTitle: CSSProperties = { fontSize: 14, fontWeight: 640, letterSpacing: "-0.02em", color: C.title };
  const eyebrow: CSSProperties = { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.09em", color: C.muted };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ░ §1 Income intelligence strip ░ */}
      {showIncomeIntelligence && <FuiPanel tone="secondary" className="flowstate-glass" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 640, letterSpacing: "-0.02em", color: C.title }}>Income intelligence</span>
          <span style={{ fontSize: 11, color: C.muted }}>this period vs previous</span>
        </div>
        <div className="flowstate-income-pulse-grid" style={{ display: "grid", gap: 8 }}>
          {vm.pulse.map((p, i) => (
            <div key={i} className="flowstate-pulse-cell" style={{ borderColor: tint(p.color, 0.25), background: tint(p.color, 0.06) }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <span style={{ fontSize: 10.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
                {p.dir !== 0 && (p.dir > 0
                  ? <ArrowUpRight size={13} style={{ color: p.color }} />
                  : <ArrowDownRight size={13} style={{ color: p.color }} />)}
              </div>
              <div className="tabular-nums" style={{ marginTop: 4, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: p.color }}>{p.value}</div>
              <div style={{ marginTop: 2, fontSize: 10, color: C.faint }}>{p.note}</div>
            </div>
          ))}
        </div>
      </FuiPanel>}

      {/* ░ §2 Income timeline — IncomeNetTimeline owns its glass card + header + footer (handoff §2). ░ */}
      {showIncomeTimeline && <Suspense fallback={<div className="flowstate-glass" style={card}><ChartSkeleton /></div>}>
        <IncomeNetTimeline
          byDay={ii?.byDay ?? []}
          range={incomeRangeSel.range}
          currency={currency}
          periodLabel={incomeRangeSel.label}
          totalIncome={ii?.totals.income ?? 0}
          totalExpense={ii?.totals.expense ?? 0}
          deltaIncomePct={ii?.totals.deltaIncomePct ?? null}
        />
      </Suspense>}

      {/* ░ §3 Source flow ‖ Top sources ░ */}
      {showIncomeIntelligence && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="max-[900px]:!grid-cols-1">
        <FuiPanel tone="secondary" className="flowstate-glass" style={card}>
          <div style={{ marginBottom: 14 }}>
            <div style={eyebrow}>{incomeRangeSel.label} Source Flow</div>
            <div style={{ ...sectionTitle, marginTop: 2 }}>Income by source</div>
          </div>
          {vm.sourceFlow.length === 0 ? (
            <div style={{ padding: "22px 8px", textAlign: "center", fontSize: 11.5, color: C.muted }}>No income sources in this period yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {vm.sourceFlow.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 88, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: C.body }}>
                  <span className="flowstate-source-dot" style={{ background: s.color }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                  </span>
                  <span className="flowstate-source-track">
                    <span style={{ width: s.w, background: s.color }} />
                  </span>
                  <span className="tabular-nums" style={{ width: 84, flexShrink: 0, textAlign: "right", fontSize: 11.5, fontWeight: 600, color: C.pos }}>{s.amt}</span>
                </div>
              ))}
            </div>
          )}
        </FuiPanel>

        <FuiPanel tone="secondary" className="flowstate-glass" style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
            <div>
              <div style={eyebrow}>{incomeRangeSel.label} Top Sources</div>
              <div style={{ ...sectionTitle, marginTop: 2 }}>Highest-earning category ▸ source</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: C.muted }}>Sources</div>
              <div className="tabular-nums" style={{ fontSize: 12, fontWeight: 650, color: C.pos }}>{vm.sourceCount}</div>
            </div>
          </div>
          {vm.topSources.length === 0 ? (
            <div style={{ padding: "22px 8px", textAlign: "center", fontSize: 11.5, color: C.muted }}>No sources yet.</div>
          ) : vm.topSources.map((t, i) => (
            <div key={i} className="flowstate-data-row">
              <span className="tabular-nums" style={{ fontSize: 11, color: C.faint, width: 16, flexShrink: 0 }}>{t.rank}</span>
              <span className="flowstate-rank-icon" style={{ background: tint(C.posStrong, 0.14), borderColor: tint(C.posStrong, 0.25), color: C.pos }}>
                <ArrowUpRight size={14} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 520, color: C.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.name} <span style={{ fontSize: 10, color: C.muted }}>· {t.cat}</span>
                </div>
                <div className="flowstate-rank-track">
                  <div style={{ width: t.w }} />
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div className="tabular-nums" style={{ fontSize: 12.5, fontWeight: 650, color: C.pos }}>{t.amt}</div>
                <div className="tabular-nums" style={{ fontSize: 10, color: C.faint }}>{t.meta}</div>
              </div>
            </div>
          ))}
        </FuiPanel>
      </div>}

      {/* ░ §4 Today ‖ Income brief ░ */}
      {showIncomeIntelligence && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="max-[900px]:!grid-cols-1">
        <FuiPanel tone="secondary" className="flowstate-glass" style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
            <div>
              <div style={{ ...eyebrow, display: "inline-flex", alignItems: "center", gap: 5 }}><Sun size={12} style={{ color: C.warn }} />Today · income</div>
              <div style={{ ...sectionTitle, marginTop: 2 }}>What came in so far</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: C.muted }}>Total today</div>
              <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 650, color: vm.todayIncome > 0 ? C.pos : C.muted }}>{fmt(vm.todayIncome)}</div>
              <div className="tabular-nums" style={{ fontSize: 10, color: C.faint }}>{vm.todayCount} entries</div>
            </div>
          </div>
          {vm.todayCount === 0 ? (
            <div style={{ padding: "26px 8px", textAlign: "center", fontSize: 11.5, lineHeight: 1.6, color: C.muted }}>
              No income today yet.<br />Tap <span style={{ color: C.title }}>+ Add entry</span> to log a new source.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {(ii?.todayEntries ?? []).map((e) => (
                <div key={e.id} className="flowstate-data-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 550, color: C.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.source}</div>
                    <div style={{ fontSize: 10.5, color: C.muted }}>{e.category}</div>
                  </div>
                  <span className="tabular-nums" style={{ fontSize: 12.5, fontWeight: 650, color: C.pos, flexShrink: 0 }}>{fmt(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </FuiPanel>

        <FuiPanel tone="secondary" className="flowstate-glass" style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ ...eyebrow, display: "inline-flex", alignItems: "center", gap: 5 }}><Sparkles size={12} style={{ color: C.violet }} />Income Brief</div>
              <div style={{ ...sectionTitle, marginTop: 2 }}>{incomeRangeSel.label} · auto-observed</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: C.muted }}>Signals</div>
              <div className="tabular-nums" style={{ fontSize: 12, fontWeight: 650, color: C.violet }}>{vm.brief.length}</div>
            </div>
          </div>
          {vm.brief.length === 0 ? (
            <div style={{ padding: "22px 8px", textAlign: "center", fontSize: 11.5, color: C.muted }}>Log income to surface signals.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {vm.brief.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span className="flowstate-brief-icon" style={{ borderColor: tint(b.color, 0.3), background: tint(b.color, 0.12), color: b.color }}>
                    {b.icon === "up" ? <ArrowUpRight size={13} /> : b.icon === "down" ? <ArrowDownRight size={13} /> : b.icon === "info" ? <Sparkles size={12} /> : <Sparkles size={12} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, paddingLeft: 9, borderLeft: `2px solid ${tint(b.color, 0.5)}` }}>
                    <div style={{ fontSize: 11.5, lineHeight: 1.5, color: C.body }}>{b.text}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FuiPanel>
      </div>}
    </div>
  );
}
