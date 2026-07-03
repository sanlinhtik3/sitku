// Deno tests for the data-composer's golden 3-row layout output.
import { assert, assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { composeDashboard } from "./data-composer.ts";

Deno.test("composeDashboard builds golden layout from mixed input", () => {
  const input = {
    revenue: 120000,
    users: 8200,
    churn: 1.4,
    daily: [
      { date: "2025-04-01", value: 100 },
      { date: "2025-04-02", value: 115 },
      { date: "2025-04-03", value: 120 },
      { date: "2025-04-04", value: 125 },
    ],
    rows: [
      { name: "Alpha", revenue: 50000 },
      { name: "Bravo", revenue: 30000 },
      { name: "Charlie", revenue: 20000 },
    ],
  };
  const out = composeDashboard(input, { title: "April Overview", focus: "metrics" });
  const presets = out.sections.map(s => s.preset);
  // Must include KPI, line chart, and data_table from the golden layout.
  assert(presets.includes("kpi_dashboard"), `missing kpi_dashboard in ${presets}`);
  assert(presets.includes("line_chart"), `missing line_chart in ${presets}`);
  assert(presets.includes("data_table"), `missing data_table in ${presets}`);
  assertEquals(out.title, "April Overview");
});

Deno.test("composeDashboard from bare array → at least one section", () => {
  const out = composeDashboard([
    { label: "A", value: 10 },
    { label: "B", value: 20 },
    { label: "C", value: 30 },
  ]);
  assert(out.sections.length >= 1);
});

Deno.test("composeDashboard handles empty/garbage gracefully", () => {
  const out = composeDashboard(null);
  assertEquals(out.sections.length, 0);
});
