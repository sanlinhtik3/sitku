// ═══ Data Composer ═══
// Inspect arbitrary data (object, array, mixed) and emit a `dashboard` payload
// that maps to the right widget presets. Pure heuristics — no LLM call.

type Hints = { title?: string; focus?: "metrics" | "trends" | "breakdown" | "list"; density?: string };
type Section = { id?: string; preset: string; data: any; span?: number; title?: string };

const NUM_RE = /^-?\d+(\.\d+)?$/;
const DATE_KEY_RE = /^(date|day|month|year|week|time|timestamp|created_?at|updated_?at|period)$/i;

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function looksNumeric(v: unknown): boolean {
  if (isNumber(v)) return true;
  if (typeof v === "string" && NUM_RE.test(v.trim())) return true;
  return false;
}
function toNum(v: unknown): number {
  if (isNumber(v)) return v;
  if (typeof v === "string") { const n = Number(v.replace(/,/g, "")); return Number.isFinite(n) ? n : 0; }
  return 0;
}
function looksDateKey(k: string): boolean { return DATE_KEY_RE.test(k); }
function fmtNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(n * 100) / 100);
}

function pickLabelKey(keys: string[]): string | null {
  const prefer = ["label", "name", "title", "category", "type", "key"];
  for (const p of prefer) { const k = keys.find(x => x.toLowerCase() === p); if (k) return k; }
  // first non-numeric key
  return keys[0] ?? null;
}
function pickValueKey(rec: Record<string, unknown>, exclude: string[]): string | null {
  const keys = Object.keys(rec).filter(k => !exclude.includes(k));
  const prefer = ["value", "count", "total", "amount", "sum", "qty", "score"];
  for (const p of prefer) { const k = keys.find(x => x.toLowerCase() === p && looksNumeric(rec[x])); if (k) return k; }
  return keys.find(k => looksNumeric(rec[k])) ?? null;
}
function pickDateKey(keys: string[]): string | null {
  return keys.find(k => looksDateKey(k)) ?? null;
}

/**
 * Compose a `dashboard` payload from arbitrary input.
 * Always returns a valid payload (sections may be empty if input is meaningless).
 */
import { buildGoldenDashboard } from "./widget-presets.ts";

export function composeDashboard(input: unknown, hints: Hints = {}): { title?: string; density?: string; sections: Section[] } {
  const sections: Section[] = [];
  const title = hints.title;
  const density = hints.density;

  // Golden 3-row overview: scalar totals + nested time-series/records → canonical KPI + chart + table layout.
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    const scalarKpis: Array<{ label: string; value: string }> = [];
    let timeSeries: { labels: string[]; series: Array<{ name: string; values: number[] }> } | null = null;
    let recordList: { columns: Array<{ key: string; label: string; type?: string }>; rows: Record<string, unknown>[] } | null = null;
    let donutSegs: Array<{ label: string; value: number }> | null = null;

    for (const [k, v] of Object.entries(obj)) {
      if (isNumber(v) || (typeof v === "string" && NUM_RE.test(String(v).trim()))) {
        scalarKpis.push({ label: prettify(k), value: fmtNum(toNum(v)) });
      } else if (Array.isArray(v) && v.length > 0 && v.every(x => x && typeof x === "object" && !Array.isArray(x))) {
        const records = v as Record<string, unknown>[];
        const allKeys = Array.from(records.reduce<Set<string>>((acc, r) => { Object.keys(r).forEach(kk => acc.add(kk)); return acc; }, new Set()));
        const dateKey = pickDateKey(allKeys);
        const valueKey = dateKey ? pickValueKey(records[0], [dateKey]) : null;
        if (!timeSeries && dateKey && valueKey) {
          timeSeries = {
            labels: records.map(r => String(r[dateKey] ?? "")),
            series: [{ name: prettify(valueKey), values: records.map(r => toNum(r[valueKey])) }],
          };
        } else if (!recordList && allKeys.length >= 2) {
          const cols = allKeys.slice(0, 8).map(kk => ({
            key: kk,
            label: prettify(kk),
            type: looksNumeric(records[0]?.[kk]) ? "number" : "text",
          }));
          recordList = {
            columns: cols,
            rows: records.slice(0, 50).map(r => {
              const o: Record<string, unknown> = {};
              for (const c of cols) o[c.key] = r[c.key] ?? "";
              return o;
            }),
          };
          const catKey = cols.find(c => c.type === "text")?.key;
          const numKey = cols.find(c => c.type === "number")?.key;
          if (catKey && numKey && records.length <= 6) {
            donutSegs = records.map(r => ({ label: String(r[catKey] ?? ""), value: toNum(r[numKey]) }));
          }
        }
      }
    }

    const wantOverview = hints.focus === undefined || hints.focus === "metrics" || hints.focus === "list";
    const hasMix = scalarKpis.length >= 2 && (timeSeries !== null || recordList !== null);
    if (wantOverview && hasMix) {
      const golden = buildGoldenDashboard({
        title,
        density,
        kpis: scalarKpis.slice(0, 4),
        lineLabels: timeSeries?.labels,
        lineSeries: timeSeries?.series,
        donutSegments: donutSegs ?? undefined,
        tableColumns: recordList?.columns,
        tableRows: recordList?.rows,
      });
      return golden as { title?: string; density?: string; sections: Section[] };
    }
  }

  // Case A: bare array
  if (Array.isArray(input)) {
    composeFromArray(input, sections, hints);
    return { title, density, sections };
  }

  // Case B: plain object
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;

    // 1) Top-level numeric scalars → KPI row
    const kpis: Array<{ label: string; value: string }> = [];
    for (const [k, v] of Object.entries(obj)) {
      if (isNumber(v) || (typeof v === "string" && NUM_RE.test(v.trim()))) {
        kpis.push({ label: prettify(k), value: fmtNum(toNum(v)) });
      }
    }
    if (kpis.length >= 2 && kpis.length <= 8) {
      sections.push({ id: sid("kpi"), preset: "kpi_dashboard", span: 12, data: { kpis } });
    }

    // 2) Object map of {label: number} → donut/bar (small set)
    const numEntries = Object.entries(obj).filter(([_, v]) => isNumber(v));
    if (kpis.length === 0 && numEntries.length >= 2 && numEntries.length <= 12 && numEntries.length === Object.keys(obj).length) {
      const labels = numEntries.map(([k]) => prettify(k));
      const values = numEntries.map(([_, v]) => v as number);
      if (labels.length <= 6) {
        sections.push({ id: sid("donut"), preset: "donut_chart", span: 12, data: { segments: labels.map((l, i) => ({ label: l, value: values[i] })) } });
      } else {
        sections.push({ id: sid("bar"), preset: "bar_chart", span: 12, data: { labels, values } });
      }
    }

    // 3) Nested arrays → treat each as its own section
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v) && v.length > 0) {
        composeFromArray(v, sections, { ...hints, title: prettify(k) });
      }
    }
    return { title, density, sections };
  }

  return { title, density, sections };
}

function composeFromArray(arr: unknown[], sections: Section[], hints: Hints): void {
  if (arr.length === 0) return;

  // Array of primitives
  if (arr.every(x => looksNumeric(x))) {
    const values = arr.map(toNum);
    sections.push({
      id: sid("bar"),
      preset: "bar_chart",
      span: 12,
      title: hints.title,
      data: { labels: values.map((_, i) => `#${i + 1}`), values },
    });
    return;
  }

  // Array of objects
  if (arr.every(x => x && typeof x === "object" && !Array.isArray(x))) {
    const records = arr as Record<string, unknown>[];
    const allKeys = Array.from(records.reduce<Set<string>>((acc, r) => { Object.keys(r).forEach(k => acc.add(k)); return acc; }, new Set()));
    const labelKey = pickLabelKey(allKeys.filter(k => !looksNumeric(records[0]?.[k])));
    const dateKey = pickDateKey(allKeys);
    const valueKey = labelKey ? pickValueKey(records[0], [labelKey]) : pickValueKey(records[0], []);

    // Time-series → line chart + KPI of latest/delta
    if (dateKey && valueKey) {
      const labels = records.map(r => String(r[dateKey] ?? ""));
      const values = records.map(r => toNum(r[valueKey]));
      sections.push({
        id: sid("line"),
        preset: "line_chart",
        span: 12,
        title: hints.title,
        data: { labels, series: [{ name: prettify(valueKey), values }] },
      });
      if (values.length >= 2) {
        const last = values[values.length - 1];
        const prev = values[values.length - 2];
        const delta = prev !== 0 ? ((last - prev) / Math.abs(prev)) * 100 : 0;
        sections.push({
          id: sid("kpi"),
          preset: "kpi_dashboard",
          span: 12,
          data: {
            kpis: [
              { label: `Latest ${prettify(valueKey)}`, value: fmtNum(last), delta: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`, trend: delta >= 0 ? "up" : "down" },
              { label: "Data points", value: String(values.length) },
            ],
          },
        });
      }
      return;
    }

    // Categorical → bar chart
    if (labelKey && valueKey && records.length <= 20) {
      const labels = records.map(r => String(r[labelKey] ?? ""));
      const values = records.map(r => toNum(r[valueKey]));
      const span = records.length <= 6 ? 6 : 12;
      // small set → donut, larger → bar
      if (records.length <= 6) {
        sections.push({
          id: sid("donut"),
          preset: "donut_chart",
          span,
          title: hints.title,
          data: { segments: labels.map((l, i) => ({ label: l, value: values[i] })) },
        });
      } else {
        sections.push({
          id: sid("bar"),
          preset: "bar_chart",
          span,
          title: hints.title,
          data: { labels, values },
        });
      }
    }

    // Always include a detail table when records have ≥2 fields
    if (allKeys.length >= 2) {
      const cols = allKeys.slice(0, 8).map(k => ({
        key: k,
        label: prettify(k),
        type: looksNumeric(records[0]?.[k]) ? "number" : "text",
      }));
      const rows = records.slice(0, 50).map(r => {
        const o: Record<string, unknown> = {};
        for (const c of cols) o[c.key] = r[c.key] ?? "";
        return o;
      });
      sections.push({
        id: sid("tbl"),
        preset: "data_table",
        span: 12,
        title: hints.title ? `${hints.title} — Details` : undefined,
        data: { columns: cols, rows },
      });
    }
    return;
  }

  // Mixed array: fall back to a simple table of {index, value}
  sections.push({
    id: sid("tbl"),
    preset: "data_table",
    span: 12,
    title: hints.title,
    data: {
      columns: [{ key: "i", label: "#", type: "number" }, { key: "v", label: "Value", type: "text" }],
      rows: arr.map((v, i) => ({ i: i + 1, v: typeof v === "object" ? JSON.stringify(v) : String(v) })),
    },
  });
}

function prettify(k: string): string {
  return k
    .replace(/[_\-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

let _sidCounter = 0;
function sid(prefix: string): string { _sidCounter = (_sidCounter + 1) % 100000; return `${prefix}_${Date.now().toString(36)}_${_sidCounter}`; }
