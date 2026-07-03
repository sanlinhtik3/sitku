// ── FlowState CFO compute (local) ────────────────────────────────────────────
// Client-side port of supabase/functions/_shared/tool-executors/cfo-strategy.ts
// (the 4 CFO executors). Reads the local financeStore instead of Supabase, then
// renders the same widget HTML via the ported widget-presets renderer so the
// FlowState CFO tab shows real numbers + the exact same widgets as BeeBot chat.

import { financeStore } from "@/repositories/local/financeStore";
import { generatePresetHtml, suggestPresetHeight } from "@/lib/flowstate/widget-presets";

export type CFOTool = "cashflow_forecast" | "runway_analysis" | "unit_economics" | "pnl_summary";

export interface CFOResult {
  ok: boolean;
  summary?: string;
  metrics?: Record<string, unknown>;
  recommendations?: string[];
  widget?: { preset: string; data: Record<string, unknown> };
  html?: string | null;
  height?: number;
  error?: string;
  suggestion?: string;
}

// ───────────────────────── Shared helpers (parity with edge fn) ─────────────
function monthLabel(d: Date) { return d.toLocaleString("en-US", { month: "short", year: "2-digit" }); }
function round2(n: number) { return Math.round(n * 100) / 100; }
function safeNum(n: unknown, def = 0) { const x = Number(n); return Number.isFinite(x) ? x : def; }

interface Txn { amount: number; currency: string; type: string; transaction_date: string; category_id: string | null; categoryName?: string | null; }

async function fetchRecentTxns(userId: string, days: number, currency?: string): Promise<Txn[]> {
  const since = new Date(); since.setDate(since.getDate() - days);
  const fromDate = since.toISOString().slice(0, 10);
  const toDate = new Date().toISOString().slice(0, 10);
  const rows = await financeStore.listTransactions(userId, fromDate, toDate);
  return rows
    .filter((t) => !currency || t.currency === currency)
    .map((t) => ({
      amount: Number(t.amount || 0),
      currency: t.currency,
      type: t.type,
      transaction_date: t.transaction_date,
      category_id: t.category_id,
      categoryName: t.category?.name ?? null,
    }));
}

async function fetchBalance(userId: string, currency = "MMK"): Promise<number> {
  // Sum income − expense across ALL transactions in that currency (mirrors edge fn).
  const rows = await financeStore.listTransactions(userId, "1970-01-01", "2999-12-31");
  let bal = 0;
  for (const t of rows) {
    if (t.currency !== currency) continue;
    bal += t.type === "income" ? Number(t.amount || 0) : -Number(t.amount || 0);
  }
  return round2(bal);
}

// ═══════════════════════════════════════════════════════════════════
// 💼 CFO executors (local)
// ═══════════════════════════════════════════════════════════════════

async function cashflowForecast(userId: string, args: Record<string, unknown>): Promise<CFOResult> {
  const months = Math.min(Math.max(safeNum(args.months_ahead, 6), 1), 24);
  const currency = (args.currency as string) || "MMK";

  const txns = await fetchRecentTxns(userId, 90, currency);
  if (!txns.length) {
    return { ok: false, error: "No transactions in last 90 days for currency " + currency, suggestion: "Add some income/expense first." };
  }

  const buckets: Record<string, { income: number; expense: number }> = {};
  for (const t of txns) {
    const d = new Date(t.transaction_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!buckets[key]) buckets[key] = { income: 0, expense: 0 };
    if (t.type === "income") buckets[key].income += t.amount;
    else buckets[key].expense += t.amount;
  }
  const sortedKeys = Object.keys(buckets).sort();
  const monthCount = Math.max(sortedKeys.length, 1);
  const avgIncome = sortedKeys.reduce((s, k) => s + buckets[k].income, 0) / monthCount;
  const avgExpense = sortedKeys.reduce((s, k) => s + buckets[k].expense, 0) / monthCount;
  const netPerMonth = avgIncome - avgExpense;

  const labels: string[] = [];
  const incomeSeries: number[] = [];
  const expenseSeries: number[] = [];
  const today = new Date();
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

  const balance = await fetchBalance(userId, currency);
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

async function runwayAnalysis(userId: string, args: Record<string, unknown>): Promise<CFOResult> {
  const currency = (args.currency as string) || "MMK";
  const txns = await fetchRecentTxns(userId, 90, currency);
  if (!txns.length) return { ok: false, error: "No transactions in last 90 days for " + currency };

  const buckets: Record<string, { income: number; expense: number }> = {};
  for (const t of txns) {
    const d = new Date(t.transaction_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!buckets[key]) buckets[key] = { income: 0, expense: 0 };
    if (t.type === "income") buckets[key].income += t.amount;
    else buckets[key].expense += t.amount;
  }
  const monthCount = Math.max(Object.keys(buckets).length, 1);
  const avgBurn = Object.values(buckets).reduce((s, b) => s + (b.expense - b.income), 0) / monthCount;
  const balance = await fetchBalance(userId, currency);
  const runwayMonths = avgBurn > 0 ? round2(balance / avgBurn) : null;
  const health = runwayMonths == null ? "infinite" : runwayMonths >= 12 ? "healthy" : runwayMonths >= 6 ? "caution" : "critical";

  const today = new Date();
  const ganttTasks: Array<Record<string, unknown>> = [];
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

function unitEconomics(args: Record<string, unknown>): CFOResult {
  const cac = safeNum(args.cac);
  const arpu = safeNum(args.arpu);
  const grossMargin = safeNum(args.gross_margin_pct, 70) / 100;
  const churn = safeNum(args.churn_pct, 5) / 100;
  const currency = (args.currency as string) || "USD";

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

async function pnlSummary(userId: string, args: Record<string, unknown>): Promise<CFOResult> {
  const days = Math.min(Math.max(safeNum(args.days, 30), 1), 365);
  const currency = (args.currency as string) || "MMK";
  const txns = await fetchRecentTxns(userId, days, currency);
  if (!txns.length) return { ok: false, error: `No transactions in last ${days} days for ${currency}.` };

  let revenue = 0, expense = 0;
  const byCategory: Record<string, { name: string; value: number }> = {};
  for (const t of txns) {
    if (t.type === "income") revenue += t.amount;
    else {
      expense += t.amount;
      const k = t.category_id || "uncategorized";
      if (!byCategory[k]) byCategory[k] = { name: t.categoryName || "Uncategorized", value: 0 };
      byCategory[k].value += t.amount;
    }
  }
  const net = revenue - expense;
  const grossMarginPct = revenue > 0 ? round2(((revenue - expense) / revenue) * 100) : 0;

  const catEntries = Object.values(byCategory)
    .map((c) => ({ name: c.name, value: round2(c.value) }))
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
          { id: "cat", preset: "bar_chart", span: 7, data: { title: "Expense by Category", labels: catEntries.map((c) => c.name), values: catEntries.map((c) => c.value), unit: currency, horizontal: true } },
          { id: "split", preset: "donut_chart", span: 5, data: { title: "Revenue vs Expense", segments: [
            { label: "Revenue", value: round2(revenue), color: "var(--color-success)" },
            { label: "Expense", value: round2(expense), color: "var(--color-danger)" },
          ], centerLabel: `${round2(net)} ${currency}` } },
        ],
      },
    },
  };
}

// ───────────────────────── Public entry (parity with edge fn) ──────────────
const COMPOSITE = ["dashboard", "flowchart", "mindmap", "sequence_diagram", "org_chart", "network_graph"];

/** Run a CFO tool locally and render its widget HTML (parity with flowstate-cfo). */
export async function runCfoTool(tool: CFOTool, userId: string, args: Record<string, unknown>): Promise<CFOResult> {
  let result: CFOResult;
  switch (tool) {
    case "cashflow_forecast": result = await cashflowForecast(userId, args); break;
    case "runway_analysis": result = await runwayAnalysis(userId, args); break;
    case "unit_economics": result = unitEconomics(args); break;
    case "pnl_summary": result = await pnlSummary(userId, args); break;
    default: return { ok: false, error: `Unknown tool: ${tool}` };
  }

  let html: string | null = null;
  let height = 400;
  if (result.ok && result.widget?.preset && result.widget?.data) {
    try {
      html = generatePresetHtml(result.widget.preset, result.widget.data);
      const ceiling = COMPOSITE.includes(result.widget.preset) ? 4000 : 1600;
      height = Math.min(Math.max(suggestPresetHeight(result.widget.preset, result.widget.data), 100), ceiling);
    } catch (e) {
      console.error("[cfoCompute] render failed", e);
    }
  }

  return { ...result, html, height };
}
