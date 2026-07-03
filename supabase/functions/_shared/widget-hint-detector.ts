// ═══ Widget Hint Detector ═══
// Inspects tool-result shape and returns a one-line nudge for the agent
// when the data looks like it should be visualized as a dashboard/chart/table.
//
// Returns null when the data is too small / not numeric / already visualized.
// Otherwise returns a short [Visualization Hint] line that the agentic-loop
// injects as a transient system message before the next model call.

const NUMERIC_RE = /^-?\d+(\.\d+)?%?$/;

function isNumericish(v: unknown): boolean {
  if (typeof v === "number" && Number.isFinite(v)) return true;
  if (typeof v === "string" && NUMERIC_RE.test(v.trim())) return true;
  return false;
}

function countNumericFields(obj: Record<string, unknown>): number {
  let n = 0;
  for (const v of Object.values(obj)) if (isNumericish(v)) n++;
  return n;
}

function detectArrayShape(arr: unknown[]): { rows: number; numericCols: number } {
  if (arr.length === 0) return { rows: 0, numericCols: 0 };
  const sample = arr.slice(0, 8).filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[];
  if (sample.length === 0) return { rows: arr.length, numericCols: 0 };
  const keys = Object.keys(sample[0]);
  let numericCols = 0;
  for (const k of keys) {
    const allNumeric = sample.every((r) => isNumericish(r[k]));
    if (allNumeric) numericCols++;
  }
  return { rows: arr.length, numericCols };
}

export interface WidgetHint {
  hint: string;
  reason: "numeric_fields" | "tabular" | "chart_shape" | "kpi_array";
  suggestedPreset: string;
}

/**
 * Inspects a tool result and returns a visualization hint when the shape
 * strongly suggests a dashboard/chart should be rendered.
 *
 * Returns null for: small payloads, error results, non-data results,
 * already-rendered widgets, or when the agent has clearly already chosen prose.
 */
export function detectWidgetOpportunity(
  toolName: string,
  result: unknown,
): WidgetHint | null {
  // Skip widget tools themselves and non-object results
  if (toolName === "show_widget" || toolName === "compose_dashboard") return null;
  if (!result || typeof result !== "object") return null;
  if ((result as any).error) return null;

  const r = result as Record<string, unknown>;

  // Shape 1: explicit chart-ready payload
  if (r.labels && r.values) {
    return {
      hint: `[Visualization Hint] Tool '${toolName}' returned chart-ready data (labels[]+values[]). Render it with show_widget(preset='bar_chart' or 'line_chart') in your reply. Do NOT narrate raw numbers.`,
      reason: "chart_shape",
      suggestedPreset: "bar_chart",
    };
  }
  if (r.series && r.labels) {
    return {
      hint: `[Visualization Hint] Tool '${toolName}' returned multi-series chart data. Render it with show_widget(preset='line_chart') in your reply.`,
      reason: "chart_shape",
      suggestedPreset: "line_chart",
    };
  }
  if (r.rows && r.columns) {
    return {
      hint: `[Visualization Hint] Tool '${toolName}' returned tabular data (rows+columns). Render it with show_widget(preset='data_table') in your reply.`,
      reason: "tabular",
      suggestedPreset: "data_table",
    };
  }

  // Shape 2: array of records — check for tabular/KPI shape
  for (const [k, v] of Object.entries(r)) {
    if (Array.isArray(v) && v.length >= 4) {
      const { rows, numericCols } = detectArrayShape(v);
      if (rows >= 4 && numericCols >= 2) {
        return {
          hint: `[Visualization Hint] Tool '${toolName}' returned ${rows} records with ${numericCols} numeric columns under '${k}'. Use compose_dashboard({title, data:result, focus:'list'}) — it auto-builds KPIs + chart + table. Do NOT narrate the rows as prose.`,
          reason: "tabular",
          suggestedPreset: "dashboard",
        };
      }
    }
  }

  // Shape 3: ≥3 numeric fields at top level → KPI dashboard
  const numericCount = countNumericFields(r);
  if (numericCount >= 3) {
    // Finance-shaped result (income/expense/net/balance) → push to compose_dashboard
    const isFinanceShape =
      ("income" in r || "expense" in r || "balance" in r || "net" in r || "total_balance" in r);
    if (isFinanceShape) {
      return {
        hint: `[Visualization Hint] Tool '${toolName}' returned finance metrics (${numericCount} numeric fields). You MUST render with compose_dashboard({title:"Finance Summary", data:result, focus:"metrics"}) — KPI row + line + donut + table in ONE call. Do NOT narrate the numbers as prose; that violates the Honesty Protocol.`,
        reason: "numeric_fields",
        suggestedPreset: "dashboard",
      };
    }
    return {
      hint: `[Visualization Hint] Tool '${toolName}' returned ${numericCount} numeric fields. Render with compose_dashboard({title, data:result, focus:'metrics'}) — it auto-builds KPI cards. Do NOT narrate the numbers as prose.`,
      reason: "numeric_fields",
      suggestedPreset: "kpi_dashboard",
    };
  }

  // Shape 4: nested aggregation object (e.g., flowstate insights, financial_report period summary)
  for (const v of Object.values(r)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = v as Record<string, unknown>;
      if (countNumericFields(inner) >= 4) {
        return {
          hint: `[Visualization Hint] Tool '${toolName}' returned a nested object with multiple numeric metrics. Render with compose_dashboard({title, data:result, focus:'metrics'}).`,
          reason: "numeric_fields",
          suggestedPreset: "dashboard",
        };
      }
    }
  }

  return null;
}
