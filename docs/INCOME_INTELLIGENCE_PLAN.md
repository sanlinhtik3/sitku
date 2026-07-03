# Deep Research Plan — CFO "Income Intelligence"

Bring the Agent Consultant's rich, range-driven visualizations into the **Personal CFO** (`/beebot#cfo`),
driven by **real income-by-source data** (daily / weekly / monthly), with a **2-level source drilldown**
(category › sub-source). Planning artifact — no code yet.

## Context / why

- The CFO `Overview` "Spending by Category" donut is **expense-only** (`useFlowState.tsx:313`
  `transactions.filter(t => t.type === "expense")`). Income is summed as a single number
  (`incomeThisMonth`) and **never broken down by source anywhere**. The income-intelligence surface
  the user wants does not exist yet — this is net-new, not an enhancement.
- The Agent Consultant (`/beebot#consultant`) already nails the pattern we want: **one range selector
  (today/week/month/28d/90d) → one data hook → many glass-card Recharts widgets**
  (`AgentConsultantPanel.tsx`). We replicate the *pattern*, not the social widgets 1:1.

## Locked decisions

1. **Source model = category + sub-source (2-level).** Income category (Salary/Business/Investment/
   Gift/Other) is level 1; a new optional free-text `source` ("Client A", "YouTube") is level 2.
2. **Placement = inside the existing CFO tab.** Income Intelligence renders at the **top** of
   `FlowStateCFO.tsx`; the current Runway/Forecast/P&L/Unit-Economics cards stay **below**. No new tab.

---

## Part A — Data model: add `source` to income transactions

IndexedDB object stores are schemaless, so **no DB version bump / migration** is needed — existing rows
simply have `source: undefined`.

- **`src/hooks/useFlowState.tsx`** — add `source?: string | null` to the `Transaction` interface (and the
  add/update payload types).
- **`src/repositories/local/financeStore.ts`** — `addTransaction` / `updateTransaction` persist the new
  `source` field (pass-through; `join()` unchanged).
- **`src/components/flowstate/AddTransactionDialog.tsx`** + **`EditTransactionDialog.tsx`** — when
  `type === "income"`, show a **"Source / Client"** text input (optional, free-text, autocomplete from
  existing distinct sources for that category). Hidden for expenses.
- Backward-compatible: rows without `source` roll up under their category only (sub-source = "Unattributed").

## Part B — One aggregation hook

**`src/hooks/useFlowStateIncomeIntelligence.ts`** (new) — single hook feeding every widget, mirroring
`useConsultantFinanceSummary`. Reads `financeStore.listTransactions(userId, from, to)` (+ previous period
for deltas), multi-currency via `useExchangeRates`. Returns:

```ts
{
  totals: { income, expense, net, sourceCount, deltaIncomePct },
  bySource: {                       // level 1: income category
    source, icon, color, amount, pct, count,
    subSources: { name, amount, pct, count }[],   // level 2: the `source` field
  }[],
  byDay:   { date, income, expense, net }[],      // range-filled (eachDayInRange)
  topSources: { source, subSource?, amount, pct, count }[],  // ranked desc
  todayEntries: { time, category, source, amount, currency, note }[],
}
```

**Reuse, don't re-derive:** extract the generic date helpers `consultantRangeForPreset` /
`eachDayInRange` / `localDateString` / `previousRange` out of `useConsultantData.ts` into
**`src/lib/dateRange.ts`** so finance imports them without pulling the agentic data layer. Update the
consultant to import from the new location (no behavior change).

## Part C — Components (`src/components/flowstate/intelligence/`)

Each = a `consultant-card` glass `Card` with the consultant header pattern (period label → title →
metric), Recharts, `lazy()` + `Suspense` (Recharts ~499KB; same as the consultant does).

| File | Maps to | Notes |
|---|---|---|
| `FinanceRangeSelector.tsx` | Welcome range pills | today/week/month/28d/90d; reuses `ConsultantRangePreset` |
| `IncomeSourceDonut.tsx` | Channel Mix | **2-ring nested Recharts `<Pie>`**: inner = category, outer = sub-source. Center = total income + "N sources". Click a slice → highlight + drilldown list. *Primary ask.* |
| `IncomeNetTimeline.tsx` | KPI Timeline | multi-line Income / Expense / Net per day |
| `IncomeVsExpenseBars.tsx` | Revenue vs Spend | grouped bars per day |
| `TopIncomeSources.tsx` | Top Performers | ranked list, category › sub-source, amount + count + pct |
| `TodayIncomeList.tsx` | Today Post List | today's income rows: amount + source; header shows **source count** ("ဒီနေ့ source ဘယ်လောက်ခု") |
| `IncomeActivityCard.tsx` *(P2)* | This Week Activity | recent income/expense feed |

## Part D — Wire into the CFO tab

`src/components/flowstate/FlowStateCFO.tsx` — prepend an **Income Intelligence** section above the existing
CFO Suite:
```
<FinanceRangeSelector value=… onChange=… />
<IncomeIntelligenceKpis … />      // income · net · source count · top source (+ delta)
<IncomeNetTimeline … />
<grid> <IncomeSourceDonut …/> <TopIncomeSources …/> </grid>
<IncomeVsExpenseBars … />
<TodayIncomeList … />
— existing Cashflow Forecast / Runway / P&L / Unit Economics stay below —
```
The range selector state lives in `FlowStateCFO`; all income widgets read the one hook with that range.
The existing CFO Suite keeps its own 90-day window (unchanged).

---

## Phasing

- **P1 (core ask):** Part A (source field) → `dateRange.ts` extract → `useFlowStateIncomeIntelligence` →
  `FinanceRangeSelector` + `IncomeSourceDonut` (2-ring) + `IncomeNetTimeline`. Ships "today's income by
  source, daily/weekly/monthly" end-to-end.
- **P2:** `IncomeVsExpenseBars` + `TopIncomeSources` + `TodayIncomeList` + KPI strip.
- **P3:** `IncomeActivityCard` + optional AI commentary (reuse `FlowStateAIInsights` pattern).

## Risks / watch-items

- **2-ring donut** — Recharts nested `<Pie>` is supported but legend/tooltip needs care; fallback =
  single donut by category + on-select sub-source list if nesting looks noisy at small sizes.
- **Empty/`undefined` source** — always roll up to "Unattributed" so totals reconcile with `incomeThisMonth`.
- **Range selector vs CFO Suite window** — keep them independent; don't let the new selector silently
  change the 90-day CFO compute (would confuse runway numbers).
- **`dateRange.ts` extract** — pure move; verify the consultant still renders (it imports the same helpers).

## Verification (when built)

`npx tsc --noEmit` + `npx vite build`. Seed income across 2–3 categories and ≥2 sub-sources over several
days via `financeStore`; open `#cfo` (CFO tab); flip range today/week/month → donut (both rings),
timeline, top-sources, today-list all recompute; click a donut category → sub-source drilldown; confirm
totals reconcile with the header KPIs. Screenshot each range.
