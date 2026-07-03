// Widget Preset Template Generators (Claude-Style Rich Library, v2)
// Generates themed HTML using CSS variable system for InlineWidgetCard rendering.
// All charts are inline SVG → no CDN dependency, instant render, theme-aware.

interface ComparisonRow {
  label: string;
  values: string[];
}

interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
  status?: "completed" | "active" | "upcoming";
}

interface ScorecardMetric {
  label: string;
  value: string | number;
  delta?: number;
  unit?: string;
}

interface ProgressStep {
  label: string;
  status?: "completed" | "active" | "upcoming";
}

interface KpiCard {
  label: string;
  value: string | number;
  delta?: number;
  trend?: "up" | "down" | "flat";
  unit?: string;
  sublabel?: string;
  target?: number | string;
  progressPct?: number;
  status?: "on_track" | "at_risk" | "off_track";
}

interface BarChartData {
  labels: string[];
  values: number[];
  title?: string;
  color?: string;
  horizontal?: boolean;
  unit?: string;
}

interface LineSeries {
  name: string;
  values: number[];
  color?: string;
}

interface LineChartData {
  labels: string[];
  series: LineSeries[];
  title?: string;
  unit?: string;
}

interface DonutSegment {
  label: string;
  value: number;
  color?: string;
}

interface ProgressItem {
  label: string;
  value: number;
  max?: number;
  color?: string;
  sublabel?: string;
}

interface StatItem {
  label: string;
  value: string | number;
  icon?: string;
  color?: string;
}

interface TableColumn {
  key: string;
  label: string;
  type?: "text" | "number" | "badge" | "progress";
}

// Default palette using CSS vars (theme-safe)
const PALETTE = [
  "var(--color-accent)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-danger)",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#f59e0b",
];

export function generatePresetHtml(preset: string, data: Record<string, any>): string {
  switch (preset) {
    case "dashboard":
      return generateDashboard(data.sections || [], data.title, data.density);
    case "comparison_table":
      return generateComparisonTable(data.columns || [], data.rows || [], data.highlight);
    case "timeline":
      return generateTimeline(data.events || []);
    case "scorecard":
      return generateScorecard(data.metrics || [], data.title);
    case "progress_tracker":
      return generateProgressTracker(data.steps || [], data.current);
    case "kpi_dashboard":
      return generateKpiDashboard(data.kpis || [], data.title);
    case "bar_chart":
      return generateBarChart(data as BarChartData);
    case "line_chart":
      return generateLineChart(data as LineChartData);
    case "donut_chart":
      return generateDonutChart(data.segments || [], data.title, data.centerLabel);
    case "progress_bars":
      return generateProgressBars(data.items || [], data.title);
    case "stat_grid":
      return generateStatGrid(data.stats || [], data.title, data.columns);
    case "data_table":
      return generateDataTable(data.columns || [], data.rows || [], data.title, data.footer);
    case "calendar_view":
      return generateCalendarView(data.year, data.month, data.events || [], data.title);
    case "gantt_chart":
      return generateGanttChart(data.tasks || [], data.title);
    case "pricing_cards":
      return generatePricingCards(data.plans || [], data.title);
    case "image_gallery":
      return generateImageGallery(data.images || [], data.title, data.columns);
    case "code_diff":
      return generateCodeDiff(data.lines || [], data.title, data.language);
    case "tree_view":
      return generateTreeView(data.nodes || [], data.title);
    case "map_pins":
      return generateMapPins(data.pins || [], data.title);
    case "quiz_card":
      return generateQuizCard(data.question || "", data.options || [], data.title);
    case "form_builder":
      return generateFormBuilder(data.fields || [], data.submitLabel, data.title);
    case "flowchart":
      return generateMermaidDiagram(buildFlowchartMermaid(data), data.title, "flowchart");
    case "mindmap":
      return generateMermaidDiagram(buildMindmapMermaid(data), data.title, "mindmap");
    case "sequence_diagram":
      return generateMermaidDiagram(buildSequenceMermaid(data), data.title, "sequence");
    case "org_chart":
      return generateMermaidDiagram(buildOrgChartMermaid(data), data.title, "org");
    case "network_graph":
      return generateNetworkGraph(data);
    default:
      return `<div style="padding:24px;color:var(--color-danger);">Unknown preset: ${esc(preset)}</div>`;
  }
}

/** Suggested iframe height for each preset (used when auto_height=true). */
export function suggestPresetHeight(preset: string, data: Record<string, any>): number {
  switch (preset) {
    case "dashboard": {
      const sections = (data?.sections ?? []) as Array<{ preset: string; data?: any; span?: number; hidden?: boolean }>;
      const visible = sections.filter(s => !s?.hidden && !(s?.preset && isSectionDataEmpty(s.preset, s.data ?? {})));
      let total = 56; // header + padding
      let rowSpan = 0, rowMax = 0;
      for (const s of visible) {
        const span = Math.min(Math.max(s.span ?? 12, 1), 12);
        const h = suggestPresetHeight(s.preset, s.data ?? {});
        if (rowSpan + span > 12) { total += rowMax + 16; rowSpan = 0; rowMax = 0; }
        rowSpan += span;
        rowMax = Math.max(rowMax, h);
      }
      total += rowMax + 16;
      // Hint only — iframe measures actual height; don't over-clamp.
      return Math.min(total, 4000);
    }
    case "kpi_dashboard": {
      const n = (data?.kpis?.length ?? 3);
      return n <= 4 ? 200 : 360;
    }
    case "scorecard": return 200;
    case "stat_grid": {
      const n = (data?.stats?.length ?? 4);
      return n <= 4 ? 180 : 320;
    }
    case "bar_chart": return data?.horizontal ? Math.min(80 + (data?.values?.length ?? 5) * 32, 480) : 320;
    case "line_chart": return 340;
    case "donut_chart": return 320;
    case "progress_bars": return Math.min(80 + (data?.items?.length ?? 4) * 56, 520);
    case "data_table": return Math.min(120 + (data?.rows?.length ?? 5) * 44, 600);
    case "comparison_table": return Math.min(120 + (data?.rows?.length ?? 5) * 44, 600);
    case "timeline": return Math.min(60 + (data?.events?.length ?? 4) * 90, 640);
    case "progress_tracker": return 160;
    case "calendar_view": return 380;
    case "gantt_chart": return Math.min(80 + (data?.tasks?.length ?? 4) * 38, 540);
    case "pricing_cards": return 480;
    case "image_gallery": {
      const n = data?.images?.length ?? 4;
      const cols = data?.columns ?? (n > 6 ? 4 : 3);
      const rows = Math.ceil(n / cols);
      return Math.min(60 + rows * 140, 600);
    }
    case "code_diff": return Math.min(80 + (data?.lines?.length ?? 8) * 22, 560);
    case "tree_view": return Math.min(80 + (data?.nodes?.length ?? 5) * 28, 520);
    case "map_pins": return 380;
    case "quiz_card": return 240 + (data?.options?.length ?? 4) * 56;
    case "form_builder": return 120 + (data?.fields?.length ?? 3) * 76;
    case "flowchart": {
      const n = (data?.nodes?.length ?? 6);
      const dir = data?.direction === "LR" ? 1 : 0;
      return Math.min(120 + (dir ? 80 : 56) * Math.max(3, Math.ceil(n / (dir ? 4 : 2))), 1400);
    }
    case "mindmap": {
      const branches = (data?.branches?.length ?? 4);
      return Math.min(220 + branches * 50, 1200);
    }
    case "sequence_diagram": {
      const steps = (data?.steps?.length ?? 4);
      return Math.min(180 + steps * 42, 1100);
    }
    case "org_chart": {
      const total = countOrgNodes(data?.root) || 4;
      return Math.min(160 + Math.ceil(Math.sqrt(total)) * 80, 1200);
    }
    case "network_graph": {
      const n = (data?.nodes?.length ?? 6);
      return Math.min(280 + n * 14, 900);
    }
    default: return 400;
  }
}

function countOrgNodes(node: any): number {
  if (!node || typeof node !== "object") return 0;
  let count = 1;
  const children = Array.isArray(node.children) ? node.children : [];
  for (const c of children) count += countOrgNodes(c);
  return count;
}

// ─────────────────────────────────────────────────────────────────
// Composable Dashboard — multiple presets in one responsive grid
// ─────────────────────────────────────────────────────────────────

interface DashboardSection {
  id?: string;
  preset: string;
  data?: any;
  span?: number; // 1-12 CSS-grid columns
  title?: string;
  note?: string;
  hidden?: boolean;
}

const VALID_PRESETS = new Set([
  "dashboard","comparison_table","timeline","scorecard","progress_tracker",
  "kpi_dashboard","bar_chart","line_chart","donut_chart","progress_bars",
  "stat_grid","data_table","calendar_view","gantt_chart","pricing_cards",
  "image_gallery","code_diff","tree_view","map_pins","quiz_card","form_builder",
  "flowchart","mindmap","sequence_diagram","org_chart","network_graph",
]);

/**
 * Validate a dashboard payload. Returns per-section errors so the executor
 * (and the layout-builder UI) can show a helpful inline message instead of
 * blowing up the whole widget when one section is malformed.
 */
export function validateDashboard(data: any): { ok: boolean; errors: Array<{ index: number; reason: string }> } {
  const errors: Array<{ index: number; reason: string }> = [];
  if (!data || typeof data !== "object") {
    return { ok: false, errors: [{ index: -1, reason: "data must be an object with `sections[]`" }] };
  }
  const sections = Array.isArray(data.sections) ? data.sections : null;
  if (!sections) return { ok: false, errors: [{ index: -1, reason: "data.sections[] is required" }] };
  sections.forEach((s: any, i: number) => {
    if (!s || typeof s !== "object") { errors.push({ index: i, reason: "section is not an object" }); return; }
    if (!s.preset || typeof s.preset !== "string") { errors.push({ index: i, reason: "section.preset is required" }); return; }
    if (s.preset === "dashboard") { errors.push({ index: i, reason: "nested 'dashboard' presets are not allowed" }); return; }
    if (!VALID_PRESETS.has(s.preset)) { errors.push({ index: i, reason: `unknown preset '${s.preset}'` }); return; }
    if (s.span != null && (typeof s.span !== "number" || s.span < 1 || s.span > 12)) {
      errors.push({ index: i, reason: "section.span must be a number 1-12" });
    }
  });
  return { ok: errors.length === 0, errors };
}

/**
 * Build a known-good 3-row "golden" dashboard payload from already-shaped inputs.
 * Used by the data-composer when input contains scalar totals + a time series + a
 * record list. Layout (mobile-first; collapses to 1-col under 768px):
 *
 *   Row 1 (span 12):   kpi_dashboard      — 3-4 KPI cards
 *   Row 2 (span 8 + 4): line_chart + donut_chart
 *   Row 3 (span 12):   data_table         — top N rows
 */
export function buildGoldenDashboard(input: {
  title?: string;
  density?: string;
  focus?: string;
  kpis?: Array<{ label: string; value: string | number; delta?: string; trend?: "up" | "down" | "flat" }>;
  lineLabels?: string[];
  lineSeries?: Array<{ name: string; values: number[] }>;
  donutSegments?: Array<{ label: string; value: number }>;
  tableColumns?: Array<{ key: string; label: string; type?: string }>;
  tableRows?: Array<Record<string, unknown>>;
}): { title?: string; density?: string; focus?: string; sections: Array<{ id: string; preset: string; data: any; span: number }> } {
  const sections: Array<{ id: string; preset: string; data: any; span: number }> = [];

  // ─── Layout Decision Rubric (agent-side intelligence, no user editor) ───
  const kpiCount = input.kpis?.length ?? 0;
  const hasLine = !!(input.lineLabels && input.lineSeries && input.lineSeries.length > 0);
  const hasDonut = !!(input.donutSegments && input.donutSegments.length > 0);
  const tableRowCount = input.tableRows?.length ?? 0;

  // KPI row — span allocation by count
  if (kpiCount === 1) {
    // Hero card: full-width, large typography (renderer reads kpis.length to scale)
    sections.push({ id: "g_kpi", preset: "kpi_dashboard", span: 12, data: { kpis: input.kpis, hero: true } });
  } else if (kpiCount >= 2) {
    sections.push({ id: "g_kpi", preset: "kpi_dashboard", span: 12, data: { kpis: input.kpis } });
  }

  // Trend + breakdown side-by-side (8/4) when both exist; else full-width
  if (hasLine && hasDonut) {
    sections.push({ id: "g_line", preset: "line_chart", span: 8, data: { labels: input.lineLabels, series: input.lineSeries } });
    sections.push({ id: "g_donut", preset: "donut_chart", span: 4, data: { segments: input.donutSegments } });
  } else if (hasLine) {
    sections.push({ id: "g_line", preset: "line_chart", span: 12, data: { labels: input.lineLabels, series: input.lineSeries } });
  } else if (hasDonut) {
    sections.push({ id: "g_donut", preset: "donut_chart", span: 12, data: { segments: input.donutSegments } });
  }

  if (input.tableColumns && tableRowCount > 0) {
    sections.push({ id: "g_tbl", preset: "data_table", span: 12, data: { columns: input.tableColumns, rows: input.tableRows!.slice(0, 50) } });
  }

  // ─── Auto-density: pick by total data point count (data points = KPIs + line points + donut + table rows)
  let density = input.density;
  if (!density) {
    const linePoints = (input.lineSeries ?? []).reduce((sum, s) => sum + (s.values?.length ?? 0), 0);
    const totalPoints = kpiCount + linePoints + (input.donutSegments?.length ?? 0) + tableRowCount;
    if (totalPoints <= 6) density = "roomy";
    else if (totalPoints <= 20) density = "comfortable";
    else density = "compact";
  }

  // ─── Auto-focus: pick the KPI with the largest absolute delta as the focal candidate
  let focus = input.focus;
  if (!focus && input.kpis && input.kpis.length > 0) {
    let best: { id: string; absDelta: number } | null = null;
    for (let i = 0; i < input.kpis.length; i++) {
      const k = input.kpis[i];
      const raw = typeof k.delta === "string" ? k.delta.replace(/[^0-9.\-]/g, "") : "";
      const num = raw ? Math.abs(parseFloat(raw)) : 0;
      if (Number.isFinite(num) && num > 0 && (!best || num > best.absDelta)) {
        best = { id: `kpi_${i}`, absDelta: num };
      }
    }
    if (best) focus = best.id;
  }

  return { title: input.title, density, focus, sections };
}

function generateDashboard(sections: DashboardSection[], title?: string, density?: string): string {
  if (!sections.length) {
    return `<div style="padding:24px;color:var(--color-text-secondary);text-align:center;">Empty dashboard — add sections[].</div>`;
  }
  // Filter hidden + drop sections whose data is effectively empty so we
  // never render a giant empty rectangle inside a dashboard.
  const visible = sections.filter(s => !s.hidden && !(s.preset && isSectionDataEmpty(s.preset, s.data ?? {})));
  if (!visible.length) {
    return `<div style="padding:14px;color:var(--color-text-secondary);text-align:center;font-size:12px;">No data available yet.</div>`;
  }
  const cells = visible.map((s, idx) => {
    const span = Math.min(Math.max(s.span ?? 12, 1), 12);
    let inner = "";
    if (!s.preset || s.preset === "dashboard" || !VALID_PRESETS.has(s.preset)) {
      inner = `<div class="bb-dash-err">Section ${idx + 1}: invalid preset '${esc(s.preset || "?")}'</div>`;
    } else {
      try {
        inner = generatePresetHtml(s.preset, s.data ?? {});
      } catch (e) {
        inner = `<div class="bb-dash-err">Section ${idx + 1}: ${esc(String(e instanceof Error ? e.message : e))}</div>`;
      }
    }
    const sectionTitle = s.title ? `<div class="bb-dash-stitle">${esc(s.title)}</div>` : "";
    const note = s.note ? `<div class="bb-dash-snote">${esc(s.note)}</div>` : "";
    return `<div class="bb-dash-cell" data-span="${span}" style="--bb-span:${span};">${sectionTitle}${inner}${note}</div>`;
  }).join("");

  const header = title
    ? `<div class="bb-dash-header">${esc(title)}</div>`
    : "";

  // Density tokens — mobile-first scaling
  const densityVars = density === "compact"
    ? `--bb-gap:8px;--bb-pad:10px;--bb-fs:13px;`
    : density === "roomy"
    ? `--bb-gap:20px;--bb-pad:20px;--bb-fs:15px;`
    : `--bb-gap:14px;--bb-pad:14px;--bb-fs:14px;`;

  return `
<style>
  .bb-dash { width:100%; ${densityVars} font-size:var(--bb-fs); }
  .bb-dash-header {
    font-size:clamp(16px, 2.5vw, 20px); font-weight:700; color:var(--color-text-primary);
    padding:4px 4px 14px; letter-spacing:-0.01em;
  }
  .bb-dash-stitle {
    font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase;
    color:var(--color-text-secondary); margin:0 2px 6px;
  }
  .bb-dash-snote {
    font-size:11px; color:var(--color-text-secondary); margin:6px 2px 0; opacity:0.8;
  }
  .bb-dash-err {
    padding:12px; border-radius:8px;
    background:color-mix(in srgb, var(--color-danger) 12%, transparent);
    border:1px solid color-mix(in srgb, var(--color-danger) 35%, transparent);
    color:var(--color-danger); font-size:12px;
  }
  .bb-dash-grid {
    display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:var(--bb-gap);
  }
  .bb-dash-cell { min-width:0; grid-column: span var(--bb-span, 12); }
  .bb-dash-cell > *:not(.bb-dash-stitle):not(.bb-dash-snote) { height:auto; }
  /* Tablet: spans of 3 and 4 round up to 6 so we never get fragile thirds */
  @media (max-width: 1024px) {
    .bb-dash-cell[data-span="3"], .bb-dash-cell[data-span="4"] { grid-column: span 6; }
  }
  /* Mobile: everything full width */
  @media (max-width: 768px) {
    .bb-dash-cell { grid-column: span 12 !important; }
    .bb-dash-grid { gap:12px; }
  }
</style>
<div class="bb-dash">${header}<div class="bb-dash-grid">${cells}</div></div>`;
}

// ─────────────────────────────────────────────────────────────────
// Existing presets (kept for backward compatibility)
// ─────────────────────────────────────────────────────────────────

function generateComparisonTable(columns: string[], rows: ComparisonRow[], highlight?: number): string {
  const highlightIdx = typeof highlight === "number" ? highlight : -1;
  const ths = columns.map((c, i) =>
    `<th style="${i === highlightIdx ? 'color:var(--color-accent);' : ''}">${esc(c)}</th>`
  ).join("");

  const trs = rows.map(r => {
    const tds = r.values.map((v, i) =>
      `<td style="${i === highlightIdx ? 'color:var(--color-accent);font-weight:600;' : ''}">${esc(v)}</td>`
    ).join("");
    return `<tr><td style="font-weight:500;">${esc(r.label)}</td>${tds}</tr>`;
  }).join("");

  return `
<div style="overflow-x:auto;">
  <table>
    <thead><tr><th></th>${ths}</tr></thead>
    <tbody>${trs}</tbody>
  </table>
</div>`;
}

function generateTimeline(events: TimelineEvent[]): string {
  const items = events.map((e, i) => {
    const statusColor = e.status === "completed" ? "var(--color-success)"
      : e.status === "active" ? "var(--color-accent)"
      : "var(--color-text-secondary)";
    const dotStyle = e.status === "active"
      ? `box-shadow:0 0 0 4px color-mix(in srgb, ${statusColor} 30%, transparent);` : "";
    return `
<div style="display:flex;gap:16px;position:relative;">
  <div style="display:flex;flex-direction:column;align-items:center;min-width:20px;">
    <div style="width:12px;height:12px;border-radius:50%;background:${statusColor};${dotStyle}flex-shrink:0;margin-top:4px;"></div>
    ${i < events.length - 1 ? `<div style="width:2px;flex:1;background:var(--color-border);margin:4px 0;"></div>` : ""}
  </div>
  <div style="padding-bottom:${i === events.length - 1 ? 0 : 20}px;">
    <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:2px;">${esc(e.date)}</div>
    <div style="font-weight:600;color:var(--color-text-primary);margin-bottom:4px;">${esc(e.title)}</div>
    ${e.description ? `<div style="font-size:13px;color:var(--color-text-secondary);">${esc(e.description)}</div>` : ""}
  </div>
</div>`;
  }).join("");

  return `<div style="padding:8px 0;">${items}</div>`;
}

function generateScorecard(metrics: ScorecardMetric[], title?: string): string {
  const cols = metrics.length <= 2 ? 2 : metrics.length <= 3 ? 3 : 4;
  const cards = metrics.map(m => {
    const delta = m.delta;
    let deltaHtml = "";
    if (typeof delta === "number" && delta !== 0) {
      const color = delta > 0 ? "var(--color-success)" : "var(--color-danger)";
      const arrow = delta > 0 ? "▲" : "▼";
      deltaHtml = `<span style="font-size:12px;color:${color};margin-left:6px;">${arrow} ${Math.abs(delta)}${m.unit === "%" ? "%" : ""}</span>`;
    }
    return `
<div class="card" style="text-align:center;">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-secondary);margin-bottom:8px;">${esc(m.label)}</div>
  <div style="font-size:24px;font-weight:700;color:var(--color-text-primary);">${esc(String(m.value))}${m.unit && m.unit !== "%" ? `<span style="font-size:14px;color:var(--color-text-secondary);margin-left:2px;">${esc(m.unit)}</span>` : ""}${deltaHtml}</div>
</div>`;
  }).join("");

  return `<div class="grid grid-${cols}">${cards}</div>`;
}

function generateProgressTracker(steps: ProgressStep[], current?: number): string {
  const currentIdx = typeof current === "number" ? current : steps.findIndex(s => s.status === "active");

  const items = steps.map((s, i) => {
    const isCompleted = s.status === "completed" || (currentIdx >= 0 && i < currentIdx);
    const isActive = s.status === "active" || i === currentIdx;
    const bg = isCompleted ? "var(--color-success)" : isActive ? "var(--color-accent)" : "var(--color-bg-secondary)";
    const textColor = isCompleted || isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)";
    const lineColor = isCompleted ? "var(--color-success)" : "var(--color-border)";
    const icon = isCompleted ? "✓" : `${i + 1}`;

    return `
<div style="display:flex;align-items:center;flex:1;min-width:0;">
  <div style="display:flex;flex-direction:column;align-items:center;gap:6px;min-width:32px;">
    <div style="width:28px;height:28px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;${isActive ? `box-shadow:0 0 0 4px color-mix(in srgb, ${bg} 30%, transparent);` : ""}">${icon}</div>
    <div style="font-size:11px;color:${textColor};text-align:center;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.label)}</div>
  </div>
  ${i < steps.length - 1 ? `<div style="flex:1;height:2px;background:${lineColor};margin:0 4px 18px 4px;"></div>` : ""}
</div>`;
  }).join("");

  return `<div style="display:flex;align-items:flex-start;padding:16px 8px;">${items}</div>`;
}

// ─────────────────────────────────────────────────────────────────
// New presets (Claude-style)
// ─────────────────────────────────────────────────────────────────

function generateKpiDashboard(kpis: KpiCard[], title?: string): string {
  const cols = kpis.length <= 2 ? 2 : kpis.length <= 3 ? 3 : 4;
  const cards = kpis.map(k => {
    // Accept flexible delta inputs: number `delta`, or string `change`/`deltaLabel` like "+12.4%" / "-2.3%".
    const anyK = k as any;
    let deltaNum: number | null = typeof k.delta === "number" ? k.delta : null;
    let deltaLabel: string | null = null;
    const rawChange = anyK.change ?? anyK.deltaLabel ?? anyK.changePercent;
    if (deltaNum === null && typeof rawChange === "string") {
      const m = rawChange.replace(/[, ]/g, "").match(/(-?\+?\d+(\.\d+)?)/);
      if (m) deltaNum = parseFloat(m[1]);
      deltaLabel = rawChange;
    } else if (deltaNum === null && typeof rawChange === "number") {
      deltaNum = rawChange;
    }
    const trend = k.trend ?? (deltaNum !== null ? (deltaNum > 0 ? "up" : deltaNum < 0 ? "down" : "flat") : undefined);
    const trendColor = trend === "up" ? "var(--color-success)"
      : trend === "down" ? "var(--color-danger)"
      : trend === "flat" ? "var(--color-text-secondary)" : null;
    const arrow = trend === "up" ? "▲" : trend === "down" ? "▼" : trend === "flat" ? "—" : "";
    let deltaHtml = "";
    if (trendColor && (deltaNum !== null || trend === "flat")) {
      const cleanLabel = deltaLabel
        ? deltaLabel.replace(/^[+\-▲▼↑↓\s]+/, "").trim()
        : (deltaNum !== null ? `${deltaNum > 0 ? "+" : deltaNum < 0 ? "-" : ""}${Math.abs(deltaNum)}${k.unit === "%" ? "%" : "%"}` : "");
      // Claude-style: text-only delta, no pill background. Just arrow + colored number + optional context.
      const ctx = (anyK.deltaContext || anyK.contextLabel || "") as string;
      deltaHtml = `<div style="display:inline-flex;align-items:center;gap:6px;margin-top:10px;font-size:12px;font-weight:600;color:${trendColor};">
  <span style="font-size:11px;">${arrow}</span>
  <span>${esc(cleanLabel)}</span>${ctx ? `<span style="color:var(--color-text-secondary);font-weight:500;">${esc(ctx)}</span>` : ""}
</div>`;
    }
    const action = escAttr(`Why is ${k.label} at ${String(k.value)}? Explain.`);
    const tipParts = [
      `${k.label}|||${String(k.value)}${k.unit ? " " + k.unit : ""}`,
    ];
    if (deltaNum !== null) tipParts.push(`Δ|||${deltaNum > 0 ? "+" : ""}${deltaNum}${k.unit === "%" ? "%" : "%"}`);
    // ─── Goal/Target progress (optional) ───
    let targetHtml = "";
    let pct: number | null = null;
    if (typeof k.progressPct === "number" && isFinite(k.progressPct)) {
      pct = Math.max(0, Math.min(100, k.progressPct));
    } else if (k.target != null) {
      const valNum = typeof k.value === "number" ? k.value : parseFloat(String(k.value).replace(/[, ]/g, ""));
      const tgtNum = typeof k.target === "number" ? k.target : parseFloat(String(k.target).replace(/[, ]/g, ""));
      if (isFinite(valNum) && isFinite(tgtNum) && tgtNum > 0) {
        pct = Math.max(0, Math.min(100, (valNum / tgtNum) * 100));
      }
    }
    if (pct !== null) {
      const status = k.status ?? (pct >= 90 ? "on_track" : pct >= 60 ? "at_risk" : "off_track");
      const barColor = status === "on_track" ? "var(--color-success)" : status === "at_risk" ? "var(--color-warning)" : "var(--color-danger)";
      const targetLabel = k.target != null ? `${esc(String(k.value))} / ${esc(String(k.target))}` : `${pct.toFixed(0)}%`;
      targetHtml = `
  <div style="margin-top:10px;">
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--color-text-secondary);margin-bottom:4px;font-weight:500;"><span>${targetLabel}</span><span style="color:${barColor};font-weight:600;">${pct.toFixed(0)}%</span></div>
    <div style="background:var(--color-bg-secondary);height:4px;border-radius:2px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:${barColor};border-radius:2px;transition:width .4s;"></div></div>
  </div>`;
      tipParts.push(`Target|||${String(k.target ?? `${pct.toFixed(0)}%`)}`);
    }
    const tip = escAttr(tipParts.join("\n"));
    return `
<div class="card kpi-card" data-bb-action="${action}" data-bb-tip="${tip}" style="padding:18px 20px;transition:transform .15s,border-color .15s;border-radius:14px;" onmouseover="this.style.transform='translateY(-1px)';this.style.borderColor='color-mix(in srgb,var(--color-accent) 35%, var(--color-border))';" onmouseout="this.style.transform='';this.style.borderColor='';">
  <div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:10px;font-weight:500;letter-spacing:-0.005em;">${esc(k.label)}</div>
  <div style="font-size:32px;font-weight:700;color:var(--color-text-primary);line-height:1.05;letter-spacing:-0.02em;">${esc(String(k.value))}${k.unit && k.unit !== "%" ? `<span style="font-size:15px;color:var(--color-text-secondary);margin-left:4px;font-weight:500;">${esc(k.unit)}</span>` : ""}</div>
  ${k.sublabel ? `<div style="font-size:12px;color:var(--color-text-secondary);margin-top:4px;">${esc(k.sublabel)}</div>` : ""}
  ${deltaHtml}
  ${targetHtml}
</div>`;
  }).join("");
  return `<div class="grid grid-${cols}" style="gap:14px;">${cards}</div>`;
}

function generateBarChart(d: BarChartData): string {
  const values = d.values || [];
  const labels = d.labels || [];
  if (values.length === 0) return emptyState("No data");
  const max = Math.max(...values, 1);
  const horizontal = !!d.horizontal;
  const baseColor = d.color || "#5b8def"; // Claude-blue default for bars
  const titleHtml = d.title
    ? `<div style="font-size:14px;font-weight:600;color:var(--color-text-primary);margin-bottom:14px;letter-spacing:-0.01em;">${esc(d.title)}</div>`
    : "";

  if (horizontal) {
    const rows = values.map((v, i) => {
      const pct = (v / max) * 100;
      const tip = escAttr(`${labels[i] ?? ""}|||${formatNum(v)}${d.unit ?? ""}`);
      return `
<div data-bb-tip="${tip}" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
  <div style="flex:0 0 90px;font-size:12px;color:var(--color-text-secondary);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(labels[i] ?? "")}</div>
  <div style="flex:1;background:var(--color-bg-secondary);border-radius:6px;height:22px;position:relative;overflow:hidden;">
    <div style="width:${pct}%;height:100%;background:linear-gradient(90deg, ${baseColor}, color-mix(in srgb, ${baseColor} 70%, transparent));border-radius:6px;transition:width .4s;"></div>
  </div>
  <div style="flex:0 0 60px;font-size:12px;font-weight:600;color:var(--color-text-primary);">${formatNum(v)}${d.unit ? esc(d.unit) : ""}</div>
</div>`;
    }).join("");
    return `<div class="card" style="padding:18px 20px;border-radius:14px;">${titleHtml}<div>${rows}</div></div>`;
  }

  // Vertical SVG bar chart — Claude style: slim bars, light grid, no value-on-top
  const W = 600, H = 260, padL = 44, padR = 12, padT = 16, padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const barGap = Math.max(4, Math.min(16, innerW / values.length / 4));
  const barW = Math.max(6, (innerW - barGap * (values.length - 1)) / values.length);
  // For dense charts, slim further (Claude-style narrow bars)
  const finalBarW = values.length > 6 ? Math.min(barW, 32) : barW;
  const barOffset = (barW - finalBarW) / 2;

  const gridSteps = 5;
  const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => i / gridSteps).map(t => {
    const y = padT + innerH * (1 - t);
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--color-border)" stroke-width="1" opacity="${t === 0 ? 0.6 : 0.25}"/>
<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--color-text-secondary)" opacity="0.7">${formatNum(max * t)}</text>`;
  }).join("");

  const bars = values.map((v, i) => {
    const h = (v / max) * innerH;
    const x = padL + i * (barW + barGap) + barOffset;
    const y = padT + innerH - h;
    const lbl = labels[i] ?? "";
    const action = escAttr(`Explain ${lbl}: ${formatNum(v)}${d.unit ?? ""}`);
    const tip = escAttr(`${lbl}|||${formatNum(v)}${d.unit ?? ""}`);
    return `<g data-bb-action="${action}" data-bb-tip="${tip}" data-bar-color="${baseColor}">
<rect x="${x}" y="${y}" width="${finalBarW}" height="${h}" rx="2" fill="${baseColor}" opacity="0.9"></rect>
<text x="${x + finalBarW / 2}" y="${H - padB + 16}" text-anchor="middle" font-size="11" fill="var(--color-text-secondary)" opacity="0.8">${esc(truncate(lbl, 10))}</text>
</g>`;
  }).join("");

  return `<div class="card" style="padding:18px 20px;border-radius:14px;">${titleHtml}<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible;">${gridLines}${bars}</svg></div>`;
}

function generateLineChart(d: LineChartData): string {
  const labels = d.labels || [];
  const series = d.series || [];
  if (series.length === 0 || labels.length === 0) return emptyState("No data");

  const allVals = series.flatMap(s => s.values);
  const maxV = Math.max(...allVals, 1);
  // Nice y-axis: pad max up by ~5%, start min at floor (round to nice step)
  const rawMin = Math.min(...allVals, 0);
  const padded = (maxV - rawMin) * 0.05;
  const niceMax = maxV + padded;
  const minV = rawMin;
  const range = niceMax - minV || 1;

  const W = 600, H = 280, padL = 48, padR = 16, padT = 18, padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xAt = (i: number) => labels.length === 1 ? padL + innerW / 2 : padL + (i / (labels.length - 1)) * innerW;
  const yAt = (v: number) => padT + innerH * (1 - (v - minV) / range);

  const titleHtml = d.title
    ? `<div style="font-size:14px;font-weight:600;color:var(--color-text-primary);margin-bottom:10px;letter-spacing:-0.01em;">${esc(d.title)}</div>`
    : "";

  const gridSteps = 5;
  const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => i / gridSteps).map(t => {
    const y = padT + innerH * (1 - t);
    const val = minV + range * t;
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--color-border)" stroke-width="1" opacity="${t === 0 ? 0.6 : 0.22}"/>
<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--color-text-secondary)" opacity="0.7">${formatNum(val)}</text>`;
  }).join("");

  // X-axis labels (max 12 visible — Claude shows all months for 12-point series)
  const stride = Math.max(1, Math.ceil(labels.length / 12));
  const xLabels = labels.map((l, i) => {
    if (i % stride !== 0 && i !== labels.length - 1) return "";
    return `<text x="${xAt(i)}" y="${H - padB + 18}" text-anchor="middle" font-size="11" fill="var(--color-text-secondary)" opacity="0.8">${esc(truncate(l, 10))}</text>`;
  }).join("");

  // Smooth catmull-rom-ish curve via cubic bezier
  function smoothPath(vals: number[]): string {
    if (vals.length < 2) return `M ${xAt(0)} ${yAt(vals[0] ?? 0)}`;
    let p = `M ${xAt(0)} ${yAt(vals[0])}`;
    for (let i = 0; i < vals.length - 1; i++) {
      const x0 = xAt(i), y0 = yAt(vals[i]);
      const x1 = xAt(i + 1), y1 = yAt(vals[i + 1]);
      const cx = (x0 + x1) / 2;
      p += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    return p;
  }

  const seriesSvg = series.map((s, si) => {
    const color = s.color || ["#5b8def", "#10b981", "#f59e0b", "#ec4899"][si % 4];
    const gradId = `bb-area-${si}-${Math.random().toString(36).slice(2, 6)}`;
    const linePath = smoothPath(s.values);
    const areaPath = `${linePath} L ${xAt(s.values.length - 1)} ${padT + innerH} L ${xAt(0)} ${padT + innerH} Z`;
    const dots = s.values.map((v, i) => {
      const tip = escAttr(`${labels[i] ?? ""}|||${s.name}:${color}:${formatNum(v)}${d.unit ?? ""}`);
      return `<g data-bb-tip="${tip}"><circle cx="${xAt(i)}" cy="${yAt(v)}" r="12" fill="${color}" opacity="0"/><circle cx="${xAt(i)}" cy="${yAt(v)}" r="3.5" fill="${color}" stroke="var(--color-bg-secondary)" stroke-width="1.5"/></g>`;
    }).join("");
    return `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
<stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
</linearGradient></defs>
<g>
<path d="${areaPath}" fill="url(#${gradId})"/>
<path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>
${dots}
</g>`;
  }).join("");

  const legend = series.map((s, si) => {
    const color = s.color || ["#5b8def", "#10b981", "#f59e0b", "#ec4899"][si % 4];
    return `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:16px;font-size:12px;color:var(--color-text-primary);font-weight:500;"><span style="width:11px;height:11px;border-radius:3px;background:${color};"></span>${esc(s.name)}</span>`;
  }).join("");

  return `<div class="card" style="padding:18px 20px;border-radius:14px;">
${titleHtml}
<div style="margin-bottom:8px;">${legend}</div>
<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible;">${gridLines}${seriesSvg}${xLabels}</svg>
</div>`;
}

function generateDonutChart(segments: DonutSegment[], title?: string, centerLabel?: string): string {
  if (segments.length === 0) return emptyState("No data");
  const total = segments.reduce((a, s) => a + (s.value || 0), 0) || 1;
  // Claude-style palette: vibrant Material-like colors
  const claudePalette = ["#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#22d3ee"];
  const cx = 130, cy = 130, r = 105, ir = 65;

  let acc = 0;
  const arcs = segments.map((s, i) => {
    const color = s.color || claudePalette[i % claudePalette.length];
    const frac = (s.value || 0) / total;
    const a0 = acc * 2 * Math.PI - Math.PI / 2;
    acc += frac;
    const a1 = acc * 2 * Math.PI - Math.PI / 2;
    const large = frac > 0.5 ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const xi1 = cx + ir * Math.cos(a1), yi1 = cy + ir * Math.sin(a1);
    const xi0 = cx + ir * Math.cos(a0), yi0 = cy + ir * Math.sin(a0);
    const path = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${ir} ${ir} 0 ${large} 0 ${xi0} ${yi0} Z`;
    const action = escAttr(`Break down ${s.label}: ${formatNum(s.value)} (${(frac * 100).toFixed(1)}%)`);
    const tip = escAttr(`${s.label}|||${color}:${formatNum(s.value)} · ${(frac * 100).toFixed(1)}%`);
    return `<path d="${path}" fill="${color}" stroke="var(--color-bg-secondary)" stroke-width="1.5" data-bb-action="${action}" data-bb-tip="${tip}"></path>`;
  }).join("");

  // Top horizontal legend (Claude style)
  const legend = segments.map((s, i) => {
    const color = s.color || claudePalette[i % claudePalette.length];
    return `<span style="display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--color-text-primary);font-weight:500;">
  <span style="width:12px;height:12px;border-radius:3px;background:${color};display:inline-block;"></span>${esc(s.label)}
</span>`;
  }).join("");

  const titleHtml = title
    ? `<div style="font-size:14px;font-weight:600;color:var(--color-text-primary);margin-bottom:14px;letter-spacing:-0.01em;">${esc(title)}</div>`
    : "";

  // Optional center label only when explicitly provided (Claude leaves it empty)
  const centerLbl = centerLabel
    ? `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="20" font-weight="700" fill="var(--color-text-primary)">${esc(String(centerLabel))}</text>`
    : "";

  return `<div class="card" style="padding:18px 20px;border-radius:14px;">
  ${titleHtml}
  <div style="display:flex;flex-wrap:wrap;gap:16px 20px;margin-bottom:12px;">${legend}</div>
  <div style="display:flex;justify-content:center;align-items:center;padding:8px 0;">
    <svg viewBox="0 0 260 260" width="260" height="260" style="max-width:100%;">${arcs}${centerLbl}</svg>
  </div>
</div>`;
}

function generateProgressBars(items: ProgressItem[], title?: string): string {
  if (items.length === 0) return emptyState("No items");
  const rows = items.map((it, i, arr) => {
    const max = it.max ?? 100;
    const pct = Math.max(0, Math.min(100, (it.value / max) * 100));
    const color = it.color || PALETTE[i % PALETTE.length];
    const isLast = i === arr.length - 1;
    return `
<div style="margin-bottom:${isLast ? 0 : 12}px;">
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
    <div>
      <span style="font-size:13px;font-weight:600;color:var(--color-text-primary);">${esc(it.label)}</span>
      ${it.sublabel ? `<span style="font-size:11px;color:var(--color-text-secondary);margin-left:8px;">${esc(it.sublabel)}</span>` : ""}
    </div>
    <span style="font-size:12px;color:var(--color-text-secondary);"><b style="color:var(--color-text-primary);">${formatNum(it.value)}</b> / ${formatNum(max)}</span>
  </div>
  <div style="background:var(--color-bg-secondary);border-radius:999px;height:8px;overflow:hidden;">
    <div style="width:${pct}%;height:100%;background:linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 60%, transparent));border-radius:999px;transition:width .4s;"></div>
  </div>
</div>`;
  }).join("");
  return `<div>${rows}</div>`;
}

function generateStatGrid(stats: StatItem[], title?: string, columns?: 2 | 3 | 4): string {
  if (stats.length === 0) return emptyState("No stats");
  const cols = columns ?? (stats.length <= 2 ? 2 : stats.length <= 4 ? 4 : stats.length <= 6 ? 3 : 4);
  const cards = stats.map(s => {
    const color = s.color || "var(--color-accent)";
    return `
<div class="card" style="padding:14px;display:flex;align-items:center;gap:12px;">
  ${s.icon ? `<div style="width:36px;height:36px;border-radius:8px;background:color-mix(in srgb, ${color} 15%, transparent);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${esc(s.icon)}</div>` : ""}
  <div style="min-width:0;flex:1;">
    <div style="font-size:18px;font-weight:700;color:var(--color-text-primary);line-height:1.1;">${esc(String(s.value))}</div>
    <div style="font-size:11px;color:var(--color-text-secondary);margin-top:2px;text-transform:uppercase;letter-spacing:0.04em;">${esc(s.label)}</div>
  </div>
</div>`;
  }).join("");
  return `<div class="grid grid-${cols}">${cards}</div>`;
}

function generateDataTable(columns: TableColumn[], rows: any[], title?: string, footer?: string): string {
  if (columns.length === 0) return emptyState("No columns");
  const ths = columns.map(c => `<th style="text-align:${c.type === 'number' ? 'right' : 'left'};">${esc(c.label)}</th>`).join("");
  const trs = rows.map(r => {
    const tds = columns.map(c => {
      const v = r?.[c.key];
      if (v === undefined || v === null || v === "") return `<td style="color:var(--color-text-secondary);">—</td>`;
      switch (c.type) {
        case "number":
          return `<td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:500;">${esc(String(v))}</td>`;
        case "badge": {
          const s = String(v).toLowerCase();
          const color = s.includes("succ") || s.includes("active") || s.includes("ok") || s.includes("done")
            ? "var(--color-success)"
            : s.includes("fail") || s.includes("error") || s.includes("danger")
            ? "var(--color-danger)"
            : s.includes("warn") || s.includes("pending")
            ? "var(--color-warning)"
            : "var(--color-accent)";
          return `<td><span style="display:inline-block;padding:2px 10px;border-radius:999px;background:color-mix(in srgb, ${color} 14%, transparent);color:${color};font-size:11px;font-weight:600;">${esc(String(v))}</span></td>`;
        }
        case "progress": {
          const n = typeof v === "number" ? v : parseFloat(String(v)) || 0;
          const pct = Math.max(0, Math.min(100, n));
          return `<td><div style="display:flex;align-items:center;gap:8px;"><div style="flex:1;background:var(--color-bg-secondary);border-radius:999px;height:6px;overflow:hidden;min-width:60px;"><div style="width:${pct}%;height:100%;background:var(--color-accent);"></div></div><span style="font-size:11px;color:var(--color-text-secondary);min-width:32px;">${pct.toFixed(0)}%</span></div></td>`;
        }
        default:
          return `<td>${esc(String(v))}</td>`;
      }
    }).join("");
    return `<tr>${tds}</tr>`;
  }).join("");
  const footerHtml = footer ? `<div style="font-size:11px;color:var(--color-text-secondary);margin-top:8px;text-align:right;">${esc(footer)}</div>` : "";
  const titleHtml = title
    ? `<div style="font-size:14px;font-weight:600;color:var(--color-text-primary);margin-bottom:14px;letter-spacing:-0.01em;">${esc(title)}</div>`
    : "";
  return `<div class="card" style="padding:18px 20px;border-radius:14px;">${titleHtml}<div style="overflow-x:auto;"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>${footerHtml}</div>`;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function emptyState(msg: string): string {
  // Compact: was 32px padding; new ~10px keeps the cell from creating
  // an artificial empty rectangle inside dashboards.
  return `<div data-bb-empty="1" style="padding:10px 12px;color:var(--color-text-secondary);font-size:11px;opacity:0.7;text-align:center;">${esc(msg)}</div>`;
}

/** Returns true if the section's data is effectively empty for its preset. */
function isSectionDataEmpty(preset: string, data: any): boolean {
  if (!data || typeof data !== "object") return true;
  switch (preset) {
    case "kpi_dashboard": return !Array.isArray(data.kpis) || data.kpis.length === 0;
    case "scorecard": return !Array.isArray(data.metrics) || data.metrics.length === 0;
    case "stat_grid": return !Array.isArray(data.stats) || data.stats.length === 0;
    case "bar_chart": return !Array.isArray(data.values) || data.values.length === 0;
    case "line_chart": {
      const s = data.series; const l = data.labels;
      if (!Array.isArray(s) || s.length === 0) return true;
      if (!Array.isArray(l) || l.length === 0) return true;
      return s.every((x: any) => !Array.isArray(x?.values) || x.values.length === 0);
    }
    case "donut_chart": return !Array.isArray(data.segments) || data.segments.length === 0
      || data.segments.every((s: any) => !s?.value);
    case "progress_bars": return !Array.isArray(data.items) || data.items.length === 0;
    case "data_table": return !Array.isArray(data.rows) || data.rows.length === 0;
    case "comparison_table": return !Array.isArray(data.rows) || data.rows.length === 0;
    case "timeline": return !Array.isArray(data.events) || data.events.length === 0;
    case "gantt_chart": return !Array.isArray(data.tasks) || data.tasks.length === 0;
    case "pricing_cards": return !Array.isArray(data.plans) || data.plans.length === 0;
    case "image_gallery": return !Array.isArray(data.images) || data.images.length === 0;
    case "tree_view": return !Array.isArray(data.nodes) || data.nodes.length === 0;
    case "progress_tracker": return !Array.isArray(data.steps) || data.steps.length === 0;
    default: return false;
  }
}

function formatNum(v: number | string): string {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!isFinite(n)) return esc(String(v));
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2).replace(/\.?0+$/, "");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * escAttr — stricter HTML attribute context escaping.
 * Prevents attribute breakout via `"`, `'`, `` ` ``, `=`, `\n`, `\r`.
 * Use for any ${userInput} inside HTML attribute values like data-bb-action="…".
 */
function escAttr(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;")
    .replace(/=/g, "&#61;")
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;");
}

// ─────────────────────────────────────────────────────────────────
// V2 PRESETS — Claude-style rich widgets (calendar, gantt, pricing,
// gallery, diff, tree, map, quiz, form). All inline SVG, no CDN.
// Interactive presets (pricing/quiz/form) use window.beebot.send()
// bridge injected by InlineWidgetCard.
// ─────────────────────────────────────────────────────────────────

interface CalendarEvent { date: string; label?: string; color?: string; }
function generateCalendarView(year?: number, month?: number, events: CalendarEvent[] = [], title?: string): string {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = (month ?? now.getMonth() + 1) - 1; // 0-based
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const monthName = first.toLocaleString("en-US", { month: "long" });

  const eventMap = new Map<number, CalendarEvent[]>();
  for (const ev of events) {
    const d = new Date(ev.date);
    if (d.getFullYear() === y && d.getMonth() === m) {
      const day = d.getDate();
      if (!eventMap.has(day)) eventMap.set(day, []);
      eventMap.get(day)!.push(ev);
    }
  }

  const dows = ["S","M","T","W","T","F","S"];
  const cells: string[] = [];
  for (let i = 0; i < startDow; i++) cells.push(`<div></div>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const evs = eventMap.get(d) ?? [];
    const dots = evs.slice(0, 3).map(e =>
      `<span style="width:5px;height:5px;border-radius:50%;background:${esc(e.color || 'var(--color-accent)')};"></span>`
    ).join("");
    cells.push(`
      <div style="aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:8px;background:var(--color-bg-secondary);font-size:12px;color:var(--color-text-primary);">
        <span style="font-weight:500;">${d}</span>
        <div style="display:flex;gap:2px;height:5px;">${dots}</div>
      </div>
    `);
  }

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="font-size:14px;font-weight:600;">${esc(title || `${monthName} ${y}`)}</h3>
        <span style="font-size:11px;color:var(--color-text-secondary);">${events.length} event${events.length===1?'':'s'}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:6px;">
        ${dows.map(d => `<div style="text-align:center;font-size:10px;color:var(--color-text-secondary);font-weight:600;letter-spacing:0.05em;">${d}</div>`).join("")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">${cells.join("")}</div>
    </div>
  `;
}

interface GanttTask { label: string; start: number; end: number; color?: string; status?: "completed"|"active"|"upcoming"; }
function generateGanttChart(tasks: GanttTask[], title?: string): string {
  if (!tasks.length) return emptyState("No tasks");
  const minStart = Math.min(...tasks.map(t => t.start));
  const maxEnd = Math.max(...tasks.map(t => t.end));
  const range = Math.max(maxEnd - minStart, 1);
  const labelW = 110;
  const rows = tasks.map((t, i) => {
    const left = ((t.start - minStart) / range) * 100;
    const width = Math.max(((t.end - t.start) / range) * 100, 2);
    const color = t.color || (t.status === "completed" ? "var(--color-success)" : t.status === "active" ? "var(--color-accent)" : "var(--color-text-secondary)");
    return `
      <div style="display:flex;align-items:center;gap:8px;height:30px;">
        <div style="width:${labelW}px;font-size:12px;color:var(--color-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;">${esc(t.label)}</div>
        <div style="flex:1;position:relative;height:20px;background:color-mix(in srgb,var(--color-bg-secondary) 60%,transparent);border-radius:6px;">
          <div style="position:absolute;left:${left}%;width:${width}%;top:0;bottom:0;background:${color};border-radius:6px;opacity:0.85;"></div>
        </div>
      </div>
    `;
  }).join("");
  return `
    <div class="card">
      ${title ? `<h3 style="font-size:14px;font-weight:600;margin-bottom:12px;">${esc(title)}</h3>` : ""}
      <div style="display:flex;flex-direction:column;gap:6px;">${rows}</div>
    </div>
  `;
}

interface PricingPlan { name: string; price: string; period?: string; features: string[]; cta?: string; highlighted?: boolean; action?: string; }
function generatePricingCards(plans: PricingPlan[], title?: string): string {
  if (!plans.length) return emptyState("No pricing plans");
  const cards = plans.map(p => {
    const features = p.features.map(f => `<li style="display:flex;align-items:flex-start;gap:8px;font-size:12px;padding:4px 0;">
      <span style="color:var(--color-success);font-weight:700;">✓</span><span>${esc(f)}</span>
    </li>`).join("");
    const ctaLabel = esc(p.cta || "Choose plan");
    const action = escAttr(p.action || `Choose ${p.name}`);
    const highlighted = p.highlighted ? "border:1.5px solid var(--color-accent);box-shadow:0 0 24px color-mix(in srgb,var(--color-accent) 25%,transparent);" : "";
    return `
      <div class="card" style="${highlighted}display:flex;flex-direction:column;gap:12px;">
        <div>
          <div style="font-size:12px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em;">${esc(p.name)}</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px;">${esc(p.price)}<span style="font-size:12px;color:var(--color-text-secondary);font-weight:400;">${p.period ? "/"+esc(p.period) : ""}</span></div>
        </div>
        <ul style="list-style:none;padding:0;margin:0;flex:1;">${features}</ul>
        <button data-bb-action="${action}" style="width:100%;padding:10px;border:none;border-radius:8px;background:${p.highlighted?'var(--color-accent)':'var(--color-bg-primary)'};color:${p.highlighted?'white':'var(--color-text-primary)'};font-weight:600;font-size:13px;cursor:pointer;border:1px solid var(--color-border);">${ctaLabel}</button>
      </div>
    `;
  }).join("");
  return `
    <div>
      ${title ? `<h3 style="font-size:14px;font-weight:600;margin-bottom:12px;padding:0 4px;">${esc(title)}</h3>` : ""}
      <div class="grid grid-${Math.min(plans.length,3)}" style="grid-template-columns:repeat(${Math.min(plans.length,3)},1fr);">${cards}</div>
    </div>
  `;
}

interface GalleryImage { url: string; caption?: string; }
function generateImageGallery(images: GalleryImage[], title?: string, columns?: number): string {
  if (!images.length) return emptyState("No images");
  const cols = columns ?? (images.length > 6 ? 4 : 3);
  const items = images.map(img => `
    <div style="border-radius:10px;overflow:hidden;background:var(--color-bg-secondary);">
      <div style="aspect-ratio:1;background:url('${esc(img.url)}') center/cover no-repeat;"></div>
      ${img.caption ? `<div style="padding:6px 8px;font-size:11px;color:var(--color-text-secondary);text-align:center;">${esc(img.caption)}</div>` : ""}
    </div>
  `).join("");
  return `
    <div>
      ${title ? `<h3 style="font-size:14px;font-weight:600;margin-bottom:10px;padding:0 4px;">${esc(title)}</h3>` : ""}
      <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;">${items}</div>
    </div>
  `;
}

interface DiffLine { type: "add"|"remove"|"context"; text: string; lineNumber?: number; }
function generateCodeDiff(lines: DiffLine[], title?: string, language?: string): string {
  if (!lines.length) return emptyState("No diff");
  const rows = lines.map(l => {
    const sign = l.type === "add" ? "+" : l.type === "remove" ? "-" : " ";
    const bg = l.type === "add" ? "color-mix(in srgb,var(--color-success) 15%,transparent)" :
               l.type === "remove" ? "color-mix(in srgb,var(--color-danger) 15%,transparent)" : "transparent";
    const color = l.type === "add" ? "var(--color-success)" : l.type === "remove" ? "var(--color-danger)" : "var(--color-text-primary)";
    return `<div style="display:flex;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12px;background:${bg};padding:2px 0;">
      <span style="width:32px;text-align:right;padding-right:8px;color:var(--color-text-secondary);user-select:none;">${l.lineNumber ?? ""}</span>
      <span style="width:18px;text-align:center;color:${color};user-select:none;">${sign}</span>
      <span style="flex:1;color:${color};white-space:pre;overflow-x:auto;">${esc(l.text)}</span>
    </div>`;
  }).join("");
  return `
    <div class="card" style="padding:0;overflow:hidden;">
      ${title || language ? `<div style="padding:8px 12px;border-bottom:1px solid var(--color-border);display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:12px;font-weight:600;">${esc(title || "Diff")}</span>
        ${language ? `<span style="font-size:10px;text-transform:uppercase;color:var(--color-text-secondary);">${esc(language)}</span>` : ""}
      </div>` : ""}
      <div style="overflow-x:auto;padding:8px 0;">${rows}</div>
    </div>
  `;
}

interface TreeNode { label: string; children?: TreeNode[]; icon?: string; meta?: string; }
function generateTreeView(nodes: TreeNode[], title?: string): string {
  if (!nodes.length) return emptyState("Empty tree");
  function render(arr: TreeNode[], depth = 0): string {
    return arr.map(n => {
      const action = escAttr(`Tell me more about ${n.label}`);
      return `
      <div data-bb-action="${action}" style="padding-left:${depth*16}px;display:flex;align-items:center;gap:6px;font-size:13px;padding:4px 0;color:var(--color-text-primary);cursor:pointer;border-radius:6px;transition:background .12s;" onmouseover="this.style.background='color-mix(in srgb,var(--color-accent) 10%,transparent)'" onmouseout="this.style.background=''">
        <span style="color:var(--color-text-secondary);">${n.children?.length ? "▸" : "•"}</span>
        ${n.icon ? `<span>${esc(n.icon)}</span>` : ""}
        <span style="flex:1;">${esc(n.label)}</span>
        ${n.meta ? `<span style="font-size:11px;color:var(--color-text-secondary);">${esc(n.meta)}</span>` : ""}
      </div>
      ${n.children?.length ? render(n.children, depth+1) : ""}
    `;
    }).join("");
  }
  return `
    <div class="card">
      ${title ? `<h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">${esc(title)}</h3>` : ""}
      <div>${render(nodes)}</div>
    </div>
  `;
}

interface MapPin { x: number; y: number; label: string; color?: string; }
function generateMapPins(pins: MapPin[], title?: string): string {
  if (!pins.length) return emptyState("No locations");
  const dots = pins.map(p => {
    const color = p.color || "var(--color-accent)";
    return `<g>
      <circle cx="${p.x}" cy="${p.y}" r="6" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="${p.x}" cy="${p.y}" r="12" fill="${color}" opacity="0.25">
        <animate attributeName="r" from="6" to="16" dur="1.8s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.5" to="0" dur="1.8s" repeatCount="indefinite"/>
      </circle>
    </g>`;
  }).join("");
  const labels = pins.map(p => `<div style="display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 0;">
    <span style="width:8px;height:8px;border-radius:50%;background:${esc(p.color || 'var(--color-accent)')};"></span>${esc(p.label)}
  </div>`).join("");
  return `
    <div class="card" style="display:flex;gap:12px;">
      <div style="flex:1;background:var(--color-bg-secondary);border-radius:10px;overflow:hidden;min-height:200px;">
        ${title ? `<div style="padding:8px 12px;font-size:12px;font-weight:600;border-bottom:1px solid var(--color-border);">${esc(title)}</div>` : ""}
        <svg viewBox="0 0 400 200" style="width:100%;display:block;">
          <rect width="400" height="200" fill="color-mix(in srgb,var(--color-bg-primary) 50%,transparent)"/>
          <path d="M40,80 Q100,40 180,70 T360,90 Q340,140 260,150 T80,140 Z" fill="color-mix(in srgb,var(--color-text-secondary) 20%,transparent)" stroke="var(--color-border)" stroke-width="1"/>
          ${dots}
        </svg>
      </div>
      <div style="width:140px;flex-shrink:0;">${labels}</div>
    </div>
  `;
}

function generateQuizCard(question: string, options: string[], title?: string): string {
  if (!options.length) return emptyState("No options");
  const buttons = options.map((opt, i) => `
    <button data-bb-action="${escAttr(`My answer: ${opt}`)}" style="display:block;width:100%;text-align:left;padding:12px 14px;margin-bottom:6px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-bg-secondary);color:var(--color-text-primary);font-size:13px;cursor:pointer;transition:all 0.15s;">
      <span style="font-weight:600;color:var(--color-accent);margin-right:8px;">${String.fromCharCode(65+i)}.</span>${esc(opt)}
    </button>
  `).join("");
  return `
    <div class="card">
      ${title ? `<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">${esc(title)}</div>` : ""}
      <div style="font-size:15px;font-weight:600;margin-bottom:14px;line-height:1.4;">${esc(question)}</div>
      <div>${buttons}</div>
    </div>
  `;
}

interface FormField { name: string; label: string; type?: "text"|"textarea"|"number"|"email"|"select"; placeholder?: string; options?: string[]; required?: boolean; }
function generateFormBuilder(fields: FormField[], submitLabel?: string, title?: string): string {
  if (!fields.length) return emptyState("No fields");
  const inputs = fields.map(f => {
    const id = `f_${f.name.replace(/[^a-z0-9_]/gi,'')}`;
    const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : "";
    const req = f.required ? "required" : "";
    let input = "";
    if (f.type === "textarea") {
      input = `<textarea id="${id}" name="${esc(f.name)}" ${ph} ${req} rows="3" style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg-secondary);color:var(--color-text-primary);font-family:inherit;font-size:13px;resize:vertical;"></textarea>`;
    } else if (f.type === "select") {
      const opts = (f.options || []).map(o => `<option>${esc(o)}</option>`).join("");
      input = `<select id="${id}" name="${esc(f.name)}" ${req} style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg-secondary);color:var(--color-text-primary);font-size:13px;">${opts}</select>`;
    } else {
      input = `<input id="${id}" name="${esc(f.name)}" type="${esc(f.type || 'text')}" ${ph} ${req} style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg-secondary);color:var(--color-text-primary);font-size:13px;"/>`;
    }
    return `<div style="margin-bottom:10px;">
      <label for="${id}" style="display:block;font-size:11px;color:var(--color-text-secondary);margin-bottom:4px;font-weight:600;">${esc(f.label)}${f.required?' *':''}</label>
      ${input}
    </div>`;
  }).join("");
  return `
    <form id="bb-form" class="card" onsubmit="event.preventDefault();var fd=new FormData(this);var lines=[];fd.forEach(function(v,k){lines.push(k+': '+v);});if(window.beebot)window.beebot.send('Form submitted:\\n'+lines.join('\\n'));">
      ${title ? `<h3 style="font-size:14px;font-weight:600;margin-bottom:12px;">${esc(title)}</h3>` : ""}
      ${inputs}
      <button type="submit" style="width:100%;padding:10px;border:none;border-radius:8px;background:var(--color-accent);color:white;font-weight:600;font-size:13px;cursor:pointer;margin-top:6px;">${esc(submitLabel || "Submit")}</button>
    </form>
  `;
}

// ─────────────────────────────────────────────────────────────────
// DIAGRAM PRESETS — Mermaid in sandboxed iframe (CDN-loaded)
// Click any node → window.beebot.send("Tell me more about <label>")
// Mermaid CDN is allowlisted in InlineWidgetCard CSP (cdn.jsdelivr.net).
// ─────────────────────────────────────────────────────────────────

interface DiagramNode { id?: string; label: string; type?: "start" | "end" | "decision" | "process"; }
interface DiagramEdge { from: string; to: string; label?: string; }

function safeMermaidId(input: string, idx: number): string {
  const s = String(input || "").replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  if (!s || /^\d/.test(s)) return `n${idx}_${s || "x"}`;
  return s;
}

function escMermaidLabel(s: string): string {
  // Mermaid node label: wrap in quotes and neutralize Mermaid syntax characters
  // that could break out of the label context (||, [], (), {}, ;, newline, ")
  const safe = String(s || "")
    .replace(/\|/g, "&#124;")   // | used in subgraphs/aliases
    .replace(/\[/g, "&#91;")    // [ starts node/class
    .replace(/\]/g, "&#93;")    // ] closes node
    .replace(/\(/g, "&#40;")    // ( round node
    .replace(/\)/g, "&#41;")    // )
    .replace(/\{/g, "&#123;")   // { diamond
    .replace(/\}/g, "&#125;")   // }
    .replace(/;/g, "&#59;")     // ; statement separator
    .replace(/\n/g, " ")        // newlines break Mermaid parsing
    .replace(/"/g, "&quot;");   // double-quotes end label
  return `"${safe}"`;
}

function buildFlowchartMermaid(data: any): string {
  const direction = data?.direction === "LR" ? "LR" : "TB";
  const rawNodes: DiagramNode[] = Array.isArray(data?.nodes) ? data.nodes : [];
  const edges: DiagramEdge[] = Array.isArray(data?.edges) ? data.edges : [];
  if (rawNodes.length === 0) return "";

  const idMap = new Map<string, string>();
  const nodes = rawNodes.map((n, i) => {
    const orig = n.id || n.label || `n${i}`;
    const id = safeMermaidId(orig, i);
    idMap.set(orig, id);
    if (n.id) idMap.set(n.id, id);
    return { ...n, _id: id };
  });

  const lines: string[] = [`flowchart ${direction}`];
  for (const n of nodes) {
    const lbl = escMermaidLabel(n.label || n._id);
    let shape: string;
    switch (n.type) {
      case "start":
      case "end":
        shape = `${n._id}([${lbl}])`;
        break;
      case "decision":
        shape = `${n._id}{${lbl}}`;
        break;
      default:
        shape = `${n._id}[${lbl}]`;
    }
    lines.push(`  ${shape}`);
  }
  for (const e of edges) {
    const from = idMap.get(e.from) || safeMermaidId(e.from, 0);
    const to = idMap.get(e.to) || safeMermaidId(e.to, 0);
    if (e.label) {
      lines.push(`  ${from} -- ${escMermaidLabel(e.label)} --> ${to}`);
    } else {
      lines.push(`  ${from} --> ${to}`);
    }
  }
  // Style: subtle accent fill
  lines.push(`  classDef bb fill:transparent,stroke:var(--color-accent),stroke-width:1.5px,color:var(--color-text-primary);`);
  lines.push(`  class ${nodes.map(n => n._id).join(",")} bb;`);
  return lines.join("\n");
}

interface MindmapBranch { label: string; children?: MindmapBranch[]; }
function buildMindmapMermaid(data: any): string {
  const root = data?.root?.label || data?.title || "Idea";
  const branches: MindmapBranch[] = Array.isArray(data?.branches) ? data.branches : [];
  const lines: string[] = ["mindmap", `  root((${escMermaidLabel(root).slice(1, -1)}))`];
  function walk(arr: MindmapBranch[], depth: number) {
    for (const b of arr) {
      lines.push(`${"  ".repeat(depth + 1)}${escMermaidLabel(b.label).slice(1, -1)}`);
      if (Array.isArray(b.children) && b.children.length) walk(b.children, depth + 1);
    }
  }
  walk(branches, 1);
  return lines.join("\n");
}

interface SequenceStep { from: string; to: string; message: string; }
function buildSequenceMermaid(data: any): string {
  const actors: string[] = Array.isArray(data?.actors) ? data.actors : [];
  const steps: SequenceStep[] = Array.isArray(data?.steps) ? data.steps : [];
  const lines: string[] = ["sequenceDiagram"];
  const seen = new Set<string>();
  for (const a of actors) {
    const id = safeMermaidId(a, 0);
    seen.add(a);
    lines.push(`  participant ${id} as ${escMermaidLabel(a)}`);
  }
  for (const s of steps) {
    if (!seen.has(s.from)) { lines.push(`  participant ${safeMermaidId(s.from, 0)} as ${escMermaidLabel(s.from)}`); seen.add(s.from); }
    if (!seen.has(s.to)) { lines.push(`  participant ${safeMermaidId(s.to, 0)} as ${escMermaidLabel(s.to)}`); seen.add(s.to); }
    const msg = String(s.message || "").replace(/\n/g, " ");
    lines.push(`  ${safeMermaidId(s.from, 0)}->>${safeMermaidId(s.to, 0)}: ${msg}`);
  }
  return lines.join("\n");
}

interface OrgNode { label: string; role?: string; children?: OrgNode[]; }
function buildOrgChartMermaid(data: any): string {
  const root: OrgNode | undefined = data?.root;
  if (!root) return "";
  const lines: string[] = ["flowchart TB"];
  let counter = 0;
  function nodeId(): string { counter += 1; return `o${counter}`; }
  function walk(node: OrgNode, parentId: string | null) {
    const id = nodeId();
    const label = node.role ? `${node.label}<br/><i>${node.role}</i>` : node.label;
    lines.push(`  ${id}[${escMermaidLabel(label)}]`);
    if (parentId) lines.push(`  ${parentId} --> ${id}`);
    if (Array.isArray(node.children)) for (const c of node.children) walk(c, id);
  }
  walk(root, null);
  lines.push(`  classDef bb fill:transparent,stroke:var(--color-accent),stroke-width:1.5px,color:var(--color-text-primary);`);
  return lines.join("\n");
}

function generateMermaidDiagram(mermaidSrc: string, title: string | undefined, kind: string): string {
  if (!mermaidSrc) return emptyState("Diagram needs at least one node");
  const id = `m_${Math.random().toString(36).slice(2, 8)}`;
  // Encode source for safe inclusion
  const encoded = mermaidSrc.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/<\/script/gi, "<\\/script");
  return `
<div class="card" style="padding:14px;">
  ${title ? `<div style="font-size:13px;font-weight:600;color:var(--color-text-primary);margin-bottom:10px;display:flex;align-items:center;gap:8px;">
    <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--color-accent);"></span>${esc(title)}
    <span style="margin-left:auto;font-size:10px;font-weight:500;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.06em;">${esc(kind)}</span>
  </div>` : ""}
  <div id="${id}" class="bb-mermaid-host" style="width:100%;display:flex;justify-content:center;align-items:center;min-height:80px;color:var(--color-text-primary);">
    <span style="font-size:11px;color:var(--color-text-secondary);">Rendering diagram…</span>
  </div>
  <div style="font-size:10px;color:var(--color-text-secondary);margin-top:8px;text-align:center;opacity:0.75;">Tap any element to explore</div>
</div>
<script>
  (function() {
    var src = \`${encoded}\`;
    function injectStyles(svg) {
      try {
        svg.style.maxWidth = "100%";
        svg.style.height = "auto";
        // Make nodes clickable
        var nodes = svg.querySelectorAll('.node, .actor, g[id^="flowchart-"], .mindmap-node');
        nodes.forEach(function(node) {
          node.style.cursor = "pointer";
          node.addEventListener('click', function(ev) {
            ev.stopPropagation();
            var label = (node.querySelector('text, foreignObject span, .nodeLabel') || {}).textContent || '';
            label = String(label).trim();
            if (label && window.beebot) window.beebot.send("Tell me more about: " + label);
          });
        });
      } catch(e) {}
    }
    function render() {
      try {
        if (!window.mermaid) return setTimeout(render, 80);
        window.mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          themeVariables: {
            background: 'transparent',
            primaryColor: 'transparent',
            primaryTextColor: '#e5e7eb',
            primaryBorderColor: '#a78bfa',
            lineColor: '#a78bfa',
            secondaryColor: '#1f2937',
            tertiaryColor: '#0f172a',
            fontFamily: 'Inter, system-ui, sans-serif'
          },
          flowchart: { curve: 'basis', padding: 12, useMaxWidth: true },
          sequence: { useMaxWidth: true },
          mindmap: { useMaxWidth: true }
        });
        window.mermaid.render('${id}_svg', src).then(function(out) {
          var host = document.getElementById('${id}');
          if (!host) return;
          host.innerHTML = out.svg;
          var svg = host.querySelector('svg');
          if (svg) injectStyles(svg);
        }).catch(function(err) {
          var host = document.getElementById('${id}');
          if (host) host.innerHTML = '<div style="color:var(--color-danger);font-size:12px;padding:12px;">Diagram render failed: ' + String(err && err.message || err) + '</div>';
        });
      } catch(e) {
        var host = document.getElementById('${id}');
        if (host) host.innerHTML = '<div style="color:var(--color-danger);font-size:12px;padding:12px;">Diagram error: ' + String(e && e.message || e) + '</div>';
      }
    }
    if (!window.mermaid && !document.getElementById('bb-mermaid-script')) {
      var s = document.createElement('script');
      s.id = 'bb-mermaid-script';
      s.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
      s.onload = render;
      s.onerror = function() {
        var host = document.getElementById('${id}');
        if (host) host.innerHTML = '<div style="color:var(--color-danger);font-size:12px;padding:12px;">Failed to load diagram engine.</div>';
      };
      document.head.appendChild(s);
    } else {
      render();
    }
  })();
</script>`;
}

// ─────────────────────────────────────────────────────────────────
// NETWORK GRAPH — pure SVG force-free layout (radial arrangement)
// ─────────────────────────────────────────────────────────────────

interface NetworkNode { id: string; label?: string; group?: string; }
interface NetworkLink { source: string; target: string; weight?: number; }
function generateNetworkGraph(data: any): string {
  const nodes: NetworkNode[] = Array.isArray(data?.nodes) ? data.nodes : [];
  const links: NetworkLink[] = Array.isArray(data?.links) ? data.links : [];
  if (nodes.length === 0) return emptyState("No nodes");

  const W = 600, H = 400;
  const cx = W / 2, cy = H / 2;
  const radius = Math.min(W, H) * 0.38;

  // Radial layout
  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    positions.set(n.id, { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
  });

  // Color by group
  const groupColors = new Map<string, string>();
  let gi = 0;
  for (const n of nodes) {
    const g = n.group || "default";
    if (!groupColors.has(g)) {
      groupColors.set(g, PALETTE[gi % PALETTE.length]);
      gi += 1;
    }
  }

  const edgeSvg = links.map(l => {
    const a = positions.get(l.source);
    const b = positions.get(l.target);
    if (!a || !b) return "";
    const w = Math.max(1, Math.min(4, l.weight || 1));
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--color-border)" stroke-width="${w}" opacity="0.55"/>`;
  }).join("");

  const nodeSvg = nodes.map(n => {
    const p = positions.get(n.id)!;
    const color = groupColors.get(n.group || "default")!;
    const lbl = esc(n.label || n.id);
    const action = escAttr(`Tell me more about ${n.label || n.id}`);
    return `<g style="cursor:pointer;" role="button" tabindex="0" aria-label="${escAttr(n.label || n.id)}" data-bb-action="${action}">
      <circle cx="${p.x}" cy="${p.y}" r="14" fill="${color}" opacity="0.9" stroke="var(--color-bg-primary)" stroke-width="2"/>
      <text x="${p.x}" y="${p.y + 30}" text-anchor="middle" font-size="11" fill="var(--color-text-primary)" font-weight="500">${lbl}</text>
      <title>${lbl}</title>
    </g>`;
  }).join("");

  const legend = Array.from(groupColors.entries()).map(([g, c]) =>
    `<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--color-text-secondary);margin-right:12px;">
       <span style="width:8px;height:8px;border-radius:50%;background:${c};"></span>${esc(g)}
     </span>`
  ).join("");

  return `
<div class="card" style="padding:14px;">
  ${data?.title ? `<div style="font-size:13px;font-weight:600;margin-bottom:8px;">${esc(data.title)}</div>` : ""}
  <div style="margin-bottom:8px;">${legend}</div>
  <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block;">
    ${edgeSvg}${nodeSvg}
  </svg>
  <div style="font-size:10px;color:var(--color-text-secondary);margin-top:6px;text-align:center;opacity:0.75;">Tap any node to explore</div>
</div>`;
}
