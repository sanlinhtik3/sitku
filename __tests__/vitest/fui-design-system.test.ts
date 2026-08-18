import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FUI_HUD_THEME_META,
  FUI_LAYOUT,
  FUI_TOKENS,
  FuiBadge,
  FuiChartLegend,
  FuiMetricTile,
  FuiProgress,
  FuiSectionHeader,
  FuiStatus,
  FuiWidget,
} from "../../src/design-system/fui";

describe("FUI design-system primitives", () => {
  it("exposes one reusable theme, token, and layout contract", () => {
    expect(FUI_HUD_THEME_META).toMatchObject({ id: "fui-hud-001", family: "fui-hud" });
    expect(FUI_TOKENS.chartGrid).toBe("var(--fui-chart-grid)");
    expect(FUI_LAYOUT.metricGrid).toContain("xl:grid-cols-4");
  });

  it("renders a semantic section contract with an action slot", () => {
    const html = renderToStaticMarkup(createElement(FuiSectionHeader, {
      eyebrow: "System",
      title: "Data health",
      description: "Current workspace signal",
      action: createElement("button", null, "Review"),
    }));

    expect(html).toContain("fui-section-header");
    expect(html).toContain("Data health");
    expect(html).toContain("Review");
  });

  it("keeps status and badge meaning available without color", () => {
    const html = renderToStaticMarkup(createElement("div", null,
      createElement(FuiStatus, { status: "warning", label: "Needs review" }),
      createElement(FuiBadge, { tone: "danger" }, "Blocked"),
    ));

    expect(html).toContain('data-status="warning"');
    expect(html).toContain("Needs review");
    expect(html).toContain('data-fui-badge="danger"');
    expect(html).toContain("Blocked");
  });

  it("bounds progress values and exposes the accessible value", () => {
    const html = renderToStaticMarkup(createElement(FuiProgress, { value: 145, label: "Coverage", valueLabel: "Complete", detail: "Verified", tone: "success" }));
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('data-status="success"');
    expect(html).toContain("Complete");
    expect(html).toContain("Verified");
  });

  it("renders reusable CFO widget and chart legend contracts", () => {
    const html = renderToStaticMarkup(createElement(FuiWidget, {
      eyebrow: "This month",
      title: "Cash flow",
      description: "Income and expense",
      action: createElement(FuiChartLegend, { items: [
        { label: "Income", color: "var(--bb-positive)" },
        { label: "Net", color: "var(--bb-info)", dashed: true },
      ] }),
    }, createElement("div", null, "Chart")));

    expect(html).toContain("fui-widget");
    expect(html).toContain("fui-chart-legend");
    expect(html).toContain('data-dashed="true"');
    expect(html).toContain("Cash flow");
  });

  it("renders a compact metric tile with semantic status", () => {
    const html = renderToStaticMarkup(createElement(FuiMetricTile, {
      label: "Net",
      value: "THB 24K",
      detail: "This month",
      status: "success",
      statusLabel: "On target",
    }));

    expect(html).toContain("fui-metric-tile");
    expect(html).toContain("THB 24K");
    expect(html).toContain('data-status="success"');
    expect(html).toContain("On target");
  });

  it("keeps repeated measurement grids out of the product canvas", () => {
    const css = readFileSync(new URL("../../src/index.css", import.meta.url), "utf8");
    expect(css).not.toContain("--fui-grid");
    expect(css).not.toContain("linear-gradient(var(--fui-chart-grid)");
    expect(css).toContain('.recharts-cartesian-grid line { stroke: var(--fui-chart-grid); }');
    expect(css).toContain('.fui-panel[data-fui-panel="quiet"]');
  });

  it("honors light and dark personal copies and keeps the canvas decoration-free", () => {
    const css = readFileSync(new URL("../../src/index.css", import.meta.url), "utf8");
    expect(css).toContain('html[data-theme-family="fui-hud"][data-bb-theme="dark"] { color-scheme: dark; }');
    expect(css).toContain('html[data-theme-family="fui-hud"][data-bb-theme="light"] { color-scheme: light; }');
    expect(css).toContain('html[data-theme-family="fui-hud"] .bb-shell::before {\n  background-image: none;');
    expect(css).toContain(".ev-mobile-home");
    expect(css).not.toContain(".ev-mobile-home-grid");
  });

  it("shares semantic status tokens between edit and reading modes", () => {
    const editor = readFileSync(new URL("../../src/components/editor/cm/commands.ts", import.meta.url), "utf8");
    const reader = readFileSync(new URL("../../src/components/editor/NoteReader.tsx", import.meta.url), "utf8");
    for (const token of ["--bb-positive", "--bb-negative", "--bb-warning", "--bb-info"]) {
      expect(editor).toContain(token);
      expect(reader).toContain(token);
    }
    expect(editor).not.toContain('color: "#f4f4f4"');
    expect(reader).not.toContain('border-l-[#ef4444]');
  });

  it("keeps CFO chart meaning on semantic theme tokens", () => {
    const files = [
      "../../src/components/flowstate/intelligence/IncomeNetTimeline.tsx",
      "../../src/components/flowstate/ui/MonthlyTrendChart.tsx",
      "../../src/components/flowstate/ui/HistoryComparisonChart.tsx",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

    for (const token of ["--bb-positive", "--bb-negative", "--bb-info", "--fui-chart-grid"]) {
      expect(files).toContain(token);
    }
    expect(files).not.toContain('stroke="#22');
    expect(files).not.toContain('stroke="#fb');
  });
});
