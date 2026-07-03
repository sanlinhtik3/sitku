// ═══ WIDGET DATA VALIDATORS ═══
// Per-preset lightweight validators that return structured errors so the
// agent can self-correct on retry. No Zod dependency — plain TypeScript.

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const OK: ValidationResult = { ok: true, errors: [] };

function fail(...msgs: string[]): ValidationResult {
  return { ok: false, errors: msgs };
}

function isNonEmptyArray(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0;
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && isFinite(v);
}

// ─── bar_chart ─────────────────────────────────────────────────────────────
function validateBarChart(data: any): ValidationResult {
  if (!data) return fail("`data` is required for bar_chart");
  if (!isNonEmptyArray(data.labels)) return fail("bar_chart requires non-empty `labels` array");
  if (!isNonEmptyArray(data.values)) return fail("bar_chart requires non-empty `values` array");
  if (data.labels.length !== data.values.length)
    return fail(`bar_chart: labels.length (${data.labels.length}) ≠ values.length (${data.values.length})`);
  if (!data.values.every(isNumber))
    return fail("bar_chart: all `values` must be finite numbers");
  return OK;
}

// ─── line_chart ────────────────────────────────────────────────────────────
function validateLineChart(data: any): ValidationResult {
  if (!data) return fail("`data` is required for line_chart");
  if (!isNonEmptyArray(data.labels)) return fail("line_chart requires non-empty `labels` array");
  if (!isNonEmptyArray(data.series)) return fail("line_chart requires non-empty `series` array");
  for (const [i, s] of (data.series as any[]).entries()) {
    if (!s.name) return fail(`line_chart: series[${i}] missing \`name\``);
    if (!isNonEmptyArray(s.values)) return fail(`line_chart: series[${i}] missing non-empty \`values\``);
    if (s.values.length !== data.labels.length)
      return fail(`line_chart: series[${i}].values.length (${s.values.length}) ≠ labels.length (${data.labels.length})`);
  }
  return OK;
}

// ─── donut_chart ───────────────────────────────────────────────────────────
function validateDonutChart(data: any): ValidationResult {
  if (!data) return fail("`data` is required for donut_chart");
  if (!isNonEmptyArray(data.segments)) return fail("donut_chart requires non-empty `segments` array");
  for (const [i, seg] of (data.segments as any[]).entries()) {
    if (!seg.label) return fail(`donut_chart: segments[${i}] missing \`label\``);
    if (!isNumber(seg.value)) return fail(`donut_chart: segments[${i}].value must be a number`);
  }
  return OK;
}

// ─── kpi_dashboard ─────────────────────────────────────────────────────────
function validateKpiDashboard(data: any): ValidationResult {
  if (!data) return fail("`data` is required for kpi_dashboard");
  if (!isNonEmptyArray(data.kpis)) return fail("kpi_dashboard requires non-empty `kpis` array");
  for (const [i, k] of (data.kpis as any[]).entries()) {
    if (!k.label) return fail(`kpi_dashboard: kpis[${i}] missing \`label\``);
    if (k.value === undefined || k.value === null) return fail(`kpi_dashboard: kpis[${i}] missing \`value\``);
    if (k.progressPct !== undefined && (typeof k.progressPct !== "number" || !isFinite(k.progressPct) || k.progressPct < 0 || k.progressPct > 100)) {
      return fail(`kpi_dashboard: kpis[${i}].progressPct must be a number between 0 and 100`);
    }
    if (k.status !== undefined && !["on_track","at_risk","off_track"].includes(k.status)) {
      return fail(`kpi_dashboard: kpis[${i}].status must be one of on_track | at_risk | off_track`);
    }
  }
  return OK;
}

// ─── data_table ────────────────────────────────────────────────────────────
function validateDataTable(data: any): ValidationResult {
  if (!data) return fail("`data` is required for data_table");
  if (!isNonEmptyArray(data.columns)) return fail("data_table requires non-empty `columns` array");
  if (!isNonEmptyArray(data.rows)) return fail("data_table requires non-empty `rows` array");
  return OK;
}

// ─── timeline ──────────────────────────────────────────────────────────────
function validateTimeline(data: any): ValidationResult {
  if (!data) return fail("`data` is required for timeline");
  if (!isNonEmptyArray(data.events)) return fail("timeline requires non-empty `events` array");
  for (const [i, ev] of (data.events as any[]).entries()) {
    if (!ev.date) return fail(`timeline: events[${i}] missing \`date\``);
    if (!ev.title) return fail(`timeline: events[${i}] missing \`title\``);
  }
  return OK;
}

// ─── scorecard ─────────────────────────────────────────────────────────────
function validateScorecard(data: any): ValidationResult {
  if (!data) return fail("`data` is required for scorecard");
  if (!isNonEmptyArray(data.metrics)) return fail("scorecard requires non-empty `metrics` array");
  for (const [i, m] of (data.metrics as any[]).entries()) {
    if (!m.label) return fail(`scorecard: metrics[${i}] missing \`label\``);
  }
  return OK;
}

// ─── stat_grid ─────────────────────────────────────────────────────────────
function validateStatGrid(data: any): ValidationResult {
  if (!data) return fail("`data` is required for stat_grid");
  if (!isNonEmptyArray(data.stats)) return fail("stat_grid requires non-empty `stats` array");
  for (const [i, s] of (data.stats as any[]).entries()) {
    if (!s.label) return fail(`stat_grid: stats[${i}] missing \`label\``);
    if (s.value === undefined) return fail(`stat_grid: stats[${i}] missing \`value\``);
  }
  return OK;
}

// ─── progress_bars ─────────────────────────────────────────────────────────
function validateProgressBars(data: any): ValidationResult {
  if (!data) return fail("`data` is required for progress_bars");
  if (!isNonEmptyArray(data.items)) return fail("progress_bars requires non-empty `items` array");
  for (const [i, it] of (data.items as any[]).entries()) {
    if (!it.label) return fail(`progress_bars: items[${i}] missing \`label\``);
    if (!isNumber(it.value)) return fail(`progress_bars: items[${i}].value must be a number`);
  }
  return OK;
}

// ─── progress_tracker ──────────────────────────────────────────────────────
function validateProgressTracker(data: any): ValidationResult {
  if (!data) return fail("`data` is required for progress_tracker");
  if (!isNonEmptyArray(data.steps)) return fail("progress_tracker requires non-empty `steps` array");
  for (const [i, s] of (data.steps as any[]).entries()) {
    if (!s.label) return fail(`progress_tracker: steps[${i}] missing \`label\``);
  }
  return OK;
}

// ─── comparison_table ──────────────────────────────────────────────────────
function validateComparisonTable(data: any): ValidationResult {
  if (!data) return fail("`data` is required for comparison_table");
  if (!isNonEmptyArray(data.columns)) return fail("comparison_table requires non-empty `columns` array (feature + plan names)");
  if (!isNonEmptyArray(data.rows)) return fail("comparison_table requires non-empty `rows` array");
  return OK;
}

// ─── Public router ─────────────────────────────────────────────────────────
const VALIDATORS: Record<string, (data: any) => ValidationResult> = {
  bar_chart: validateBarChart,
  line_chart: validateLineChart,
  donut_chart: validateDonutChart,
  kpi_dashboard: validateKpiDashboard,
  data_table: validateDataTable,
  timeline: validateTimeline,
  scorecard: validateScorecard,
  stat_grid: validateStatGrid,
  progress_bars: validateProgressBars,
  progress_tracker: validateProgressTracker,
  comparison_table: validateComparisonTable,
};

/**
 * Validate widget data for a given preset.
 * Returns { ok: true } for unknown/unregistered presets (fail-open).
 */
export function validateWidgetData(preset: string, data: unknown): ValidationResult {
  const validator = VALIDATORS[preset];
  if (!validator) return OK; // fail-open for unregistered presets
  try {
    return validator(data);
  } catch (e) {
    return fail(`Validation threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}
