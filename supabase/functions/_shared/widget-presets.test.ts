// Deno tests for the dashboard preset, validation, and golden composer.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { validateDashboard, generatePresetHtml, buildGoldenDashboard, suggestPresetHeight } from "./widget-presets.ts";

const goldenPayload = {
  title: "Q3 Overview",
  sections: [
    { id: "kpi", preset: "kpi_dashboard", span: 12, data: { kpis: [
      { label: "Revenue", value: "120k", delta: 12, trend: "up" },
      { label: "Users", value: "8.2k", delta: -2, trend: "down" },
      { label: "Churn", value: "1.4%" },
    ] } },
    { id: "line", preset: "line_chart", span: 8, data: {
      labels: ["Jan","Feb","Mar","Apr"],
      series: [{ name: "Revenue", values: [100, 110, 115, 120] }],
    } },
    { id: "donut", preset: "donut_chart", span: 4, data: {
      segments: [{label:"A",value:40},{label:"B",value:35},{label:"C",value:25}],
    } },
    { id: "tbl", preset: "data_table", span: 12, data: {
      columns: [{key:"name",label:"Name"},{key:"value",label:"Value",type:"number"}],
      rows: [{name:"Alpha",value:100},{name:"Bravo",value:80}],
    } },
  ],
};

Deno.test("validateDashboard accepts a valid 4-section payload", () => {
  const v = validateDashboard(goldenPayload);
  assertEquals(v.ok, true);
  assertEquals(v.errors.length, 0);
});

Deno.test("validateDashboard rejects a nested 'dashboard' section", () => {
  const v = validateDashboard({ sections: [{ preset: "dashboard", data: { sections: [] } }] });
  assertEquals(v.ok, false);
  assert(v.errors.some(e => /nested 'dashboard'/.test(e.reason)));
});

Deno.test("validateDashboard rejects unknown preset", () => {
  const v = validateDashboard({ sections: [{ preset: "frobnicate", data: {} }] });
  assertEquals(v.ok, false);
  assert(v.errors.some(e => /unknown preset/.test(e.reason)));
});

Deno.test("generatePresetHtml('dashboard') renders all sub-section markers", () => {
  const html = generatePresetHtml("dashboard", goldenPayload);
  // grid wrapper + per-cell markers
  assertStringIncludes(html, "bb-dash-grid");
  // 4 actual cell <div>s — count class= attributes, not CSS selector mentions
  const cellCount = (html.match(/class="bb-dash-cell"/g) || []).length;
  assertEquals(cellCount, 4);
  // KPI label
  assertStringIncludes(html, "Revenue");
  // SVG from a chart
  assertStringIncludes(html, "<svg");
  // Table thead
  assertStringIncludes(html, "<thead");
});

Deno.test("buildGoldenDashboard emits canonical 4-section ordering", () => {
  const out = buildGoldenDashboard({
    title: "T",
    kpis: [{ label: "A", value: 1 }, { label: "B", value: 2 }],
    lineLabels: ["x","y"],
    lineSeries: [{ name: "s", values: [1, 2] }],
    donutSegments: [{ label: "p", value: 1 }, { label: "q", value: 2 }],
    tableColumns: [{ key: "k", label: "K" }],
    tableRows: [{ k: "v" }],
  });
  assertEquals(out.sections.map(s => s.preset), ["kpi_dashboard", "line_chart", "donut_chart", "data_table"]);
  assertEquals(out.sections.map(s => s.span), [12, 8, 4, 12]);
});

Deno.test("buildGoldenDashboard auto-picks density by data point count", () => {
  // Few points → roomy
  const small = buildGoldenDashboard({
    kpis: [{ label: "A", value: 1 }, { label: "B", value: 2 }],
  });
  assertEquals(small.density, "roomy");

  // Many points → compact
  const big = buildGoldenDashboard({
    kpis: Array.from({ length: 4 }, (_, i) => ({ label: `K${i}`, value: i })),
    lineLabels: Array.from({ length: 12 }, (_, i) => String(i)),
    lineSeries: [{ name: "s", values: Array.from({ length: 12 }, (_, i) => i) }],
    tableColumns: [{ key: "k", label: "K" }],
    tableRows: Array.from({ length: 10 }, (_, i) => ({ k: i })),
  });
  assertEquals(big.density, "compact");
});

Deno.test("buildGoldenDashboard auto-detects focus from largest delta KPI", () => {
  const out = buildGoldenDashboard({
    kpis: [
      { label: "A", value: 100, delta: "+1.2%" },
      { label: "B", value: 200, delta: "-18.4%" }, // largest abs delta
      { label: "C", value: 300, delta: "+3.0%" },
    ],
  });
  assertEquals(out.focus, "kpi_1");
});

Deno.test("buildGoldenDashboard hero mode for single KPI", () => {
  const out = buildGoldenDashboard({
    kpis: [{ label: "Balance", value: "1.2M" }],
  });
  assertEquals(out.sections.length, 1);
  assertEquals(out.sections[0].data.hero, true);
  assertEquals(out.sections[0].span, 12);
});

Deno.test("suggestPresetHeight('dashboard') stays in [400, 4000]", () => {
  const h = suggestPresetHeight("dashboard", goldenPayload);
  assert(h >= 400 && h <= 4000, `expected reasonable height, got ${h}`);
});
