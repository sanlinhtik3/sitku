// ═══════════════════════════════════════════════════════════════════
// 💼 BeeBot CFO + 🧭 Strategy Consulting Tool Executors
// All executors return widget-ready payloads:
//   { ok: true, summary, widget: { preset, data }, ... }
// The agent is instructed to pipe `widget` directly into show_widget.
// ═══════════════════════════════════════════════════════════════════

type SB = any;

// ───────────────────────── Shared helpers ─────────────────────────
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthLabel(d: Date) { return d.toLocaleString("en-US", { month: "short", year: "2-digit" }); }
function round2(n: number) { return Math.round(n * 100) / 100; }
function safeNum(n: any, def = 0) { const x = Number(n); return Number.isFinite(x) ? x : def; }

async function fetchRecentTxns(supabase: SB, userId: string, days = 90, currency?: string) {
  const since = new Date(); since.setDate(since.getDate() - days);
  let q = supabase.from("user_transactions")
    .select("amount, currency, type, transaction_date, category_id")
    .eq("user_id", userId)
    .gte("transaction_date", since.toISOString().slice(0, 10));
  if (currency) q = q.eq("currency", currency);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchBalance(supabase: SB, userId: string, currency = "MMK"): Promise<number> {
  const { data } = await supabase.from("user_transactions")
    .select("amount, type")
    .eq("user_id", userId)
    .eq("currency", currency);
  let bal = 0;
  for (const t of (data || [])) {
    bal += t.type === "income" ? Number(t.amount || 0) : -Number(t.amount || 0);
  }
  return round2(bal);
}

// ═══════════════════════════════════════════════════════════════════
// 💼 CFO TOOLS
// ═══════════════════════════════════════════════════════════════════

/** Project N months of cashflow from trailing 90-day averages. */
export async function executeCfoCashflowForecast(supabase: SB, userId: string, args: any) {
  const months = Math.min(Math.max(safeNum(args.months_ahead, 6), 1), 24);
  const currency = (args.currency || "MMK") as string;

  const txns = await fetchRecentTxns(supabase, userId, 90, currency);
  if (!txns.length) {
    return { ok: false, error: "No transactions in last 90 days for currency " + currency, suggestion: "Add some income/expense via manage_flowstate first." };
  }

  // Monthly aggregates
  const buckets: Record<string, { income: number; expense: number }> = {};
  for (const t of txns) {
    const d = new Date(t.transaction_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!buckets[key]) buckets[key] = { income: 0, expense: 0 };
    if (t.type === "income") buckets[key].income += Number(t.amount || 0);
    else buckets[key].expense += Number(t.amount || 0);
  }
  const sortedKeys = Object.keys(buckets).sort();
  const monthCount = Math.max(sortedKeys.length, 1);
  const avgIncome = sortedKeys.reduce((s, k) => s + buckets[k].income, 0) / monthCount;
  const avgExpense = sortedKeys.reduce((s, k) => s + buckets[k].expense, 0) / monthCount;
  const netPerMonth = avgIncome - avgExpense;

  // Build forecast labels + values (history + future)
  const labels: string[] = [];
  const incomeSeries: number[] = [];
  const expenseSeries: number[] = [];
  const today = new Date();
  // 3 trailing months (actual) then N future (projected)
  for (let i = 2; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    labels.push(monthLabel(d));
    incomeSeries.push(round2(buckets[key]?.income || 0));
    expenseSeries.push(round2(buckets[key]?.expense || 0));
  }
  for (let i = 1; i <= months; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    labels.push(monthLabel(d) + " (proj)");
    incomeSeries.push(round2(avgIncome));
    expenseSeries.push(round2(avgExpense));
  }

  const balance = await fetchBalance(supabase, userId, currency);
  const monthsToZero = netPerMonth < 0 ? round2(balance / Math.abs(netPerMonth)) : null;

  return {
    ok: true,
    summary: `Avg net ${round2(netPerMonth)} ${currency}/mo · Balance ${round2(balance)} ${currency}` +
      (monthsToZero ? ` · ${monthsToZero} months runway at current burn` : ""),
    metrics: { avg_income: round2(avgIncome), avg_expense: round2(avgExpense), net_per_month: round2(netPerMonth), balance, months_to_zero: monthsToZero, currency },
    widget: {
      preset: "dashboard",
      data: {
        title: `Cashflow Forecast — Next ${months} Months`,
        density: "comfortable",
        sections: [
          { id: "kpi", preset: "kpi_dashboard", span: 12, data: { kpis: [
            { label: "Avg Income", value: round2(avgIncome), unit: currency, trend: "up" },
            { label: "Avg Expense", value: round2(avgExpense), unit: currency, trend: netPerMonth < 0 ? "up" : "flat" },
            { label: "Net / Month", value: round2(netPerMonth), unit: currency, trend: netPerMonth >= 0 ? "up" : "down" },
            { label: "Runway", value: monthsToZero ?? "∞", unit: monthsToZero ? "mo" : "" },
          ] } },
          { id: "trend", preset: "line_chart", span: 12, data: { title: "Income vs Expense (3mo actual + projection)", labels, series: [
            { name: "Income", values: incomeSeries },
            { name: "Expense", values: expenseSeries },
          ], unit: currency } },
        ],
      },
    },
  };
}

/** Runway analysis with health-coded gantt. */
export async function executeCfoRunwayAnalysis(supabase: SB, userId: string, args: any) {
  const currency = (args.currency || "MMK") as string;
  const txns = await fetchRecentTxns(supabase, userId, 90, currency);
  if (!txns.length) return { ok: false, error: "No transactions in last 90 days for " + currency };

  const buckets: Record<string, { income: number; expense: number }> = {};
  for (const t of txns) {
    const d = new Date(t.transaction_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!buckets[key]) buckets[key] = { income: 0, expense: 0 };
    if (t.type === "income") buckets[key].income += Number(t.amount || 0);
    else buckets[key].expense += Number(t.amount || 0);
  }
  const monthCount = Math.max(Object.keys(buckets).length, 1);
  const avgBurn = (Object.values(buckets).reduce((s, b) => s + (b.expense - b.income), 0)) / monthCount;
  const balance = await fetchBalance(supabase, userId, currency);
  const runwayMonths = avgBurn > 0 ? round2(balance / avgBurn) : null;
  const health = runwayMonths == null ? "infinite" : runwayMonths >= 12 ? "healthy" : runwayMonths >= 6 ? "caution" : "critical";

  // Gantt: each remaining month color-coded
  const today = new Date();
  const ganttTasks: any[] = [];
  const safeMonths = runwayMonths == null ? 12 : Math.min(Math.ceil(runwayMonths), 24);
  for (let i = 0; i < safeMonths; i++) {
    const start = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + i + 1, 0);
    const remaining = runwayMonths == null ? Infinity : runwayMonths - i;
    const color = remaining > 12 ? "var(--color-success)" : remaining > 6 ? "var(--color-warning)" : "var(--color-danger)";
    ganttTasks.push({
      label: monthLabel(start),
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      color,
      status: remaining > 6 ? "completed" : "active",
    });
  }

  const recommendations: string[] = [];
  if (health === "critical") recommendations.push("Freeze hiring & non-essential spend immediately.", "Accelerate revenue or raise bridge capital.");
  else if (health === "caution") recommendations.push("Tighten OpEx 10-20%.", "Plan fundraise within next 3 months.");
  else recommendations.push("Maintain current discipline.", "Consider strategic investments while runway is strong.");

  return {
    ok: true,
    summary: `Runway ${runwayMonths ?? "∞"} months · ${health.toUpperCase()} · Burn ${round2(avgBurn)} ${currency}/mo`,
    metrics: { balance, avg_burn: round2(avgBurn), runway_months: runwayMonths, health },
    recommendations,
    widget: {
      preset: "dashboard",
      data: {
        title: "Runway Analysis",
        density: "comfortable",
        sections: [
          { id: "kpi", preset: "kpi_dashboard", span: 12, data: { kpis: [
            { label: "Cash", value: balance, unit: currency },
            { label: "Burn / Month", value: round2(avgBurn), unit: currency, trend: avgBurn > 0 ? "down" : "flat" },
            { label: "Runway", value: runwayMonths ?? "∞", unit: runwayMonths ? "mo" : "", sublabel: health.toUpperCase() },
            { label: "Status", value: health.toUpperCase() },
          ] } },
          { id: "gantt", preset: "gantt_chart", span: 12, data: { title: "Months Remaining", tasks: ganttTasks } },
        ],
      },
    },
  };
}

/** Unit economics: CAC / LTV / Payback. Inputs: cac, arpu, gross_margin_pct, churn_pct */
export function executeCfoUnitEconomics(_supabase: SB, _userId: string, args: any) {
  const cac = safeNum(args.cac);
  const arpu = safeNum(args.arpu);
  const grossMargin = safeNum(args.gross_margin_pct, 70) / 100;
  const churn = safeNum(args.churn_pct, 5) / 100;
  const currency = args.currency || "USD";

  if (!cac || !arpu) return { ok: false, error: "Provide cac and arpu numbers (and gross_margin_pct, churn_pct optional)." };

  const ltv = churn > 0 ? round2((arpu * grossMargin) / churn) : Infinity;
  const ratio = cac > 0 ? round2(ltv / cac) : Infinity;
  const paybackMonths = (arpu * grossMargin) > 0 ? round2(cac / (arpu * grossMargin)) : Infinity;
  const verdict = ratio >= 3 && paybackMonths <= 12 ? "Healthy" : ratio >= 1.5 ? "Borderline" : "Unhealthy";

  return {
    ok: true,
    summary: `LTV/CAC ${ratio} · Payback ${paybackMonths} mo · ${verdict}`,
    metrics: { cac, arpu, ltv, ratio, payback_months: paybackMonths, verdict, currency },
    widget: {
      preset: "scorecard",
      data: {
        title: "Unit Economics",
        metrics: [
          { label: "CAC", value: cac, unit: currency },
          { label: "LTV", value: ltv === Infinity ? "∞" : ltv, unit: currency },
          { label: "LTV / CAC", value: ratio === Infinity ? "∞" : ratio, delta: ratio >= 3 ? 1 : -1 },
          { label: "Payback", value: paybackMonths === Infinity ? "∞" : paybackMonths, unit: "mo" },
          { label: "Verdict", value: verdict },
        ],
      },
    },
  };
}

/** Period P&L from FlowState transactions. */
export async function executeCfoPnlSummary(supabase: SB, userId: string, args: any) {
  const days = Math.min(Math.max(safeNum(args.days, 30), 1), 365);
  const currency = (args.currency || "MMK") as string;
  const txns = await fetchRecentTxns(supabase, userId, days, currency);
  if (!txns.length) return { ok: false, error: `No transactions in last ${days} days for ${currency}.` };

  let revenue = 0, expense = 0;
  const byCategory: Record<string, number> = {};
  for (const t of txns) {
    if (t.type === "income") revenue += Number(t.amount || 0);
    else {
      expense += Number(t.amount || 0);
      const k = t.category_id || "uncategorized";
      byCategory[k] = (byCategory[k] || 0) + Number(t.amount || 0);
    }
  }
  const net = revenue - expense;
  const grossMarginPct = revenue > 0 ? round2(((revenue - expense) / revenue) * 100) : 0;

  // Resolve category names
  const ids = Object.keys(byCategory).filter(k => k !== "uncategorized");
  const nameMap: Record<string, string> = {};
  if (ids.length) {
    const { data } = await supabase.from("transaction_categories").select("id, name").in("id", ids);
    for (const c of (data || [])) nameMap[c.id] = c.name;
  }
  const catEntries = Object.entries(byCategory)
    .map(([k, v]) => ({ name: nameMap[k] || "Uncategorized", value: round2(v) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return {
    ok: true,
    summary: `Net ${round2(net)} ${currency} (Margin ${grossMarginPct}%) over ${days} days`,
    metrics: { revenue: round2(revenue), expense: round2(expense), net: round2(net), gross_margin_pct: grossMarginPct },
    widget: {
      preset: "dashboard",
      data: {
        title: `P&L — Last ${days} Days`,
        density: "comfortable",
        sections: [
          { id: "kpi", preset: "kpi_dashboard", span: 12, data: { kpis: [
            { label: "Revenue", value: round2(revenue), unit: currency, trend: "up" },
            { label: "Expense", value: round2(expense), unit: currency, trend: "down" },
            { label: "Net", value: round2(net), unit: currency, trend: net >= 0 ? "up" : "down" },
            { label: "Margin", value: grossMarginPct, unit: "%" },
          ] } },
          { id: "cat", preset: "bar_chart", span: 7, data: { title: "Expense by Category", labels: catEntries.map(c => c.name), values: catEntries.map(c => c.value), unit: currency, horizontal: true } },
          { id: "split", preset: "donut_chart", span: 5, data: { title: "Revenue vs Expense", segments: [
            { label: "Revenue", value: round2(revenue), color: "var(--color-success)" },
            { label: "Expense", value: round2(expense), color: "var(--color-danger)" },
          ], centerLabel: `${round2(net)} ${currency}` } },
        ],
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// 🧭 STRATEGY CONSULTING TOOLS
// ═══════════════════════════════════════════════════════════════════

export function executeStrategySwot(_supabase: SB, _userId: string, args: any) {
  const s = (args.strengths || []) as string[];
  const w = (args.weaknesses || []) as string[];
  const o = (args.opportunities || []) as string[];
  const t = (args.threats || []) as string[];
  if (!s.length && !w.length && !o.length && !t.length) {
    return { ok: false, error: "Provide arrays: strengths, weaknesses, opportunities, threats." };
  }
  const toItems = (arr: string[]) => arr.slice(0, 8).map((label, i) => ({ label, value: arr.length - i, max: arr.length, sublabel: "" }));

  return {
    ok: true,
    summary: `SWOT — ${s.length}S / ${w.length}W / ${o.length}O / ${t.length}T`,
    widget: {
      preset: "dashboard",
      data: {
        title: args.title || "SWOT Analysis",
        density: "comfortable",
        sections: [
          { id: "s", preset: "progress_bars", span: 6, title: "Strengths", data: { title: "💪 Strengths", items: toItems(s) } },
          { id: "w", preset: "progress_bars", span: 6, title: "Weaknesses", data: { title: "⚠️ Weaknesses", items: toItems(w) } },
          { id: "o", preset: "progress_bars", span: 6, title: "Opportunities", data: { title: "🚀 Opportunities", items: toItems(o) } },
          { id: "t", preset: "progress_bars", span: 6, title: "Threats", data: { title: "🛡️ Threats", items: toItems(t) } },
        ],
      },
    },
  };
}

export function executeStrategyPorter(_supabase: SB, _userId: string, args: any) {
  const forces = {
    rivalry: safeNum(args.rivalry, 3),
    supplier_power: safeNum(args.supplier_power, 3),
    buyer_power: safeNum(args.buyer_power, 3),
    substitutes: safeNum(args.substitutes, 3),
    new_entrants: safeNum(args.new_entrants, 3),
  };
  const labelMap: Record<string, string> = {
    rivalry: "Competitive Rivalry",
    supplier_power: "Supplier Power",
    buyer_power: "Buyer Power",
    substitutes: "Threat of Substitutes",
    new_entrants: "Threat of New Entrants",
  };
  const nodes = [{ id: "firm", label: args.firm || "Your Firm", group: "center" },
    ...Object.keys(forces).map(k => ({ id: k, label: `${labelMap[k]}\n(${forces[k as keyof typeof forces]}/5)`, group: "force" }))];
  const links = Object.keys(forces).map(k => ({ source: k, target: "firm", weight: forces[k as keyof typeof forces] }));
  const avg = round2(Object.values(forces).reduce((s, v) => s + v, 0) / 5);

  return {
    ok: true,
    summary: `Industry attractiveness: ${avg}/5 (lower = more attractive)`,
    widget: {
      preset: "dashboard",
      data: {
        title: args.title || "Porter's Five Forces",
        density: "comfortable",
        sections: [
          { id: "graph", preset: "network_graph", span: 7, data: { title: "Five Forces", nodes, links } },
          { id: "score", preset: "scorecard", span: 5, data: { title: "Force Severity", metrics: Object.entries(forces).map(([k, v]) => ({ label: labelMap[k], value: `${v}/5` })) } },
        ],
      },
    },
  };
}

export function executeStrategyOkr(_supabase: SB, _userId: string, args: any) {
  const objectives = (args.objectives || []) as Array<{ name: string; key_results: Array<{ name: string; progress: number }> }>;
  if (!objectives.length) return { ok: false, error: "Provide objectives:[{name, key_results:[{name, progress 0-100}]}]" };
  const flat = objectives.flatMap(o => o.key_results.map(kr => ({ obj: o.name, ...kr })));
  const avg = flat.length ? round2(flat.reduce((s, k) => s + safeNum(k.progress), 0) / flat.length) : 0;

  return {
    ok: true,
    summary: `Avg KR progress: ${avg}% (healthy 60-70%)`,
    widget: {
      preset: "dashboard",
      data: {
        title: args.title || "OKR Tracker",
        density: "comfortable",
        sections: [
          { id: "kpi", preset: "kpi_dashboard", span: 12, data: { kpis: objectives.map(o => {
            const a = round2(o.key_results.reduce((s, k) => s + safeNum(k.progress), 0) / Math.max(o.key_results.length, 1));
            return { label: o.name, value: a, unit: "%", trend: a >= 60 ? "up" : "down", sublabel: `${o.key_results.length} KRs` };
          }) } },
          { id: "kr", preset: "progress_bars", span: 12, data: { title: "Key Results", items: flat.map(k => ({ label: `${k.obj} → ${k.name}`, value: safeNum(k.progress), max: 100, sublabel: `${safeNum(k.progress)}%` })) } },
        ],
      },
    },
  };
}

export function executeStrategyRoadmap(_supabase: SB, _userId: string, args: any) {
  const initiatives = (args.initiatives || []) as Array<{ label: string; start: string; end: string; status?: string }>;
  if (!initiatives.length) return { ok: false, error: "Provide initiatives:[{label, start (YYYY-MM-DD), end, status?}]" };
  const colorFor = (s?: string) => s === "completed" ? "var(--color-success)" : s === "active" ? "var(--color-accent)" : "var(--color-warning)";
  return {
    ok: true,
    summary: `${initiatives.length} initiatives planned`,
    widget: {
      preset: "gantt_chart",
      data: {
        title: args.title || "Strategic Roadmap",
        tasks: initiatives.map(i => ({ label: i.label, start: i.start, end: i.end, color: colorFor(i.status), status: i.status })),
      },
    },
  };
}

export function executeStrategyLeanCanvas(_supabase: SB, _userId: string, args: any) {
  const blocks = [
    { key: "problem", label: "Problem" },
    { key: "customer_segments", label: "Customer Segments" },
    { key: "uvp", label: "Unique Value Prop" },
    { key: "solution", label: "Solution" },
    { key: "channels", label: "Channels" },
    { key: "revenue_streams", label: "Revenue Streams" },
    { key: "cost_structure", label: "Cost Structure" },
    { key: "key_metrics", label: "Key Metrics" },
    { key: "unfair_advantage", label: "Unfair Advantage" },
  ];
  const sections = blocks.map(b => ({
    id: b.key,
    preset: "stat_grid" as const,
    span: 4,
    title: b.label,
    data: { title: b.label, stats: ((args[b.key] || []) as string[]).slice(0, 4).map((label, i) => ({ label, value: `#${i + 1}` })) },
  }));
  return {
    ok: true,
    summary: "Lean Canvas — 9 blocks",
    widget: {
      preset: "dashboard",
      data: { title: args.title || "Lean Canvas", density: "compact", sections },
    },
  };
}
