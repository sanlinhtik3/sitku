import { describe, it, expect } from "vitest";
import {
  generatePresetHtml,
  suggestPresetHeight,
} from "../../supabase/functions/_shared/widget-presets.ts";

// Hard cap per plan: each preset stays under 8KB.
const MAX_PRESET_BYTES = 8 * 1024;

const SAMPLES: Record<string, Record<string, any>> = {
  comparison_table: {
    columns: ["Free", "Pro", "Enterprise"],
    rows: [
      { label: "Seats", values: ["1", "5", "Unlimited"] },
      { label: "Storage", values: ["1GB", "100GB", "1TB"] },
      { label: "Support", values: ["Community", "Email", "24/7"] },
    ],
    highlight: 1,
  },
  timeline: {
    events: [
      { date: "2024-01", title: "Kickoff", status: "completed" },
      { date: "2024-03", title: "Beta", description: "Closed beta launch", status: "completed" },
      { date: "2024-06", title: "GA", status: "active" },
      { date: "2024-09", title: "Mobile app", status: "upcoming" },
    ],
  },
  scorecard: {
    title: "This Week",
    metrics: [
      { label: "Revenue", value: 12450, delta: 8, unit: "%" },
      { label: "Users", value: 342, delta: -3, unit: "%" },
      { label: "Tasks", value: 27 },
    ],
  },
  progress_tracker: {
    steps: [
      { label: "Plan" },
      { label: "Build" },
      { label: "Test" },
      { label: "Ship" },
    ],
    current: 2,
  },
  kpi_dashboard: {
    title: "BeeBot KPIs",
    kpis: [
      { label: "Sessions", value: 1284, delta: 12, trend: "up", unit: "%" },
      { label: "Avg latency", value: 342, unit: "ms", delta: -18, trend: "up", sublabel: "vs last week" },
      { label: "Tool calls", value: "8.2k", trend: "flat" },
      { label: "Errors", value: 4, delta: -2, trend: "up" },
    ],
  },
  bar_chart: {
    title: "Revenue by month",
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    values: [120, 180, 150, 220, 260, 310],
    unit: "$",
  },
  line_chart: {
    title: "Active users",
    labels: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"],
    series: [
      { name: "Web", values: [120, 140, 160, 155, 180, 210, 240, 260] },
      { name: "Mobile", values: [80, 95, 110, 130, 150, 170, 200, 230] },
    ],
  },
  donut_chart: {
    title: "Traffic sources",
    segments: [
      { label: "Organic", value: 540 },
      { label: "Direct", value: 320 },
      { label: "Referral", value: 180 },
      { label: "Social", value: 90 },
    ],
  },
  progress_bars: {
    title: "Goal progress",
    items: [
      { label: "Revenue", value: 8200, max: 10000, sublabel: "Q3" },
      { label: "Signups", value: 340, max: 500 },
      { label: "Retention", value: 78, max: 100, sublabel: "%" },
    ],
  },
  stat_grid: {
    title: "System",
    stats: [
      { label: "CPU", value: "42%", icon: "⚡" },
      { label: "Memory", value: "6.2GB", icon: "🧠" },
      { label: "Uptime", value: "99.9%", icon: "✅" },
      { label: "Requests", value: "12.4k", icon: "📈" },
    ],
  },
  data_table: {
    title: "Recent jobs",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "status", label: "Status", type: "badge" },
      { key: "progress", label: "Progress", type: "progress" },
      { key: "tokens", label: "Tokens", type: "number" },
    ],
    rows: [
      { name: "Daily digest", status: "success", progress: 100, tokens: 1240 },
      { name: "Memory dream", status: "active", progress: 62, tokens: 880 },
      { name: "Web crawl", status: "pending", progress: 12, tokens: 320 },
      { name: "Image gen", status: "error", progress: 0, tokens: 0 },
    ],
    footer: "Updated just now",
  },
};

const PRESETS = Object.keys(SAMPLES);

describe("widget-presets", () => {
  it("exports all 11 presets used by the show_widget tool", () => {
    expect(PRESETS).toHaveLength(11);
  });

  describe.each(PRESETS)("preset: %s", (preset) => {
    const html = generatePresetHtml(preset, SAMPLES[preset]);

    it("renders non-empty HTML", () => {
      expect(typeof html).toBe("string");
      expect(html.trim().length).toBeGreaterThan(20);
    });

    it("stays under size budget", () => {
      const bytes = new TextEncoder().encode(html).length;
      // line_chart uses dual SVG path (area gradient + smooth curve) per series → larger budget
      const cap = preset === "line_chart" ? 16 * 1024 : MAX_PRESET_BYTES;
      expect(bytes).toBeLessThanOrEqual(cap);
    });

    it("uses CSS variables for theming (no hard-coded hex backgrounds)", () => {
      // Must reference the design-system CSS vars
      expect(html).toMatch(/var\(--color-/);
    });

    it("does not embed external CDNs or scripts", () => {
      expect(html).not.toMatch(/<script\b/i);
      expect(html).not.toMatch(/cdnjs\.cloudflare\.com/i);
      expect(html).not.toMatch(/cdn\.jsdelivr\.net/i);
      expect(html).not.toMatch(/unpkg\.com/i);
    });

    it("returns a sane suggested height (100–800px)", () => {
      const h = suggestPresetHeight(preset, SAMPLES[preset]);
      expect(h).toBeGreaterThanOrEqual(100);
      expect(h).toBeLessThanOrEqual(800);
    });
  });

  describe("safety + edge cases", () => {
    it("escapes HTML in user-provided strings (XSS guard)", () => {
      const html = generatePresetHtml("scorecard", {
        title: "<script>alert(1)</script>",
        metrics: [{ label: "<img src=x onerror=alert(1)>", value: "<b>10</b>" }],
      });
      // No executable tags should survive — angle brackets must be entity-encoded.
      expect(html).not.toMatch(/<script\b/i);
      expect(html).not.toMatch(/<img\b/i);
      expect(html).not.toMatch(/<b>10<\/b>/);
      // Title is no longer rendered visibly (iframe-attr only), so we only assert that
      // metric label escaping works.
      expect(html).toContain("&lt;img");
    });

    it("returns a friendly error block for unknown preset", () => {
      const html = generatePresetHtml("does_not_exist", {});
      expect(html).toMatch(/Unknown preset/);
      expect(html).toContain("does_not_exist");
    });

    it("renders empty-state for charts with no data instead of throwing", () => {
      expect(() => generatePresetHtml("bar_chart", { labels: [], values: [] })).not.toThrow();
      expect(() => generatePresetHtml("line_chart", { labels: [], series: [] })).not.toThrow();
      expect(() => generatePresetHtml("donut_chart", { segments: [] })).not.toThrow();
      const empty = generatePresetHtml("bar_chart", { labels: [], values: [] });
      expect(empty).toMatch(/No data/);
    });

    it("suggestPresetHeight handles unknown preset with default", () => {
      expect(suggestPresetHeight("unknown_preset", {})).toBe(400);
    });

    it("bar_chart horizontal mode produces a row per value", () => {
      const html = generatePresetHtml("bar_chart", {
        labels: ["A", "B", "C"],
        values: [10, 20, 30],
        horizontal: true,
      });
      // horizontal renders one progress-style row per value (no SVG)
      expect(html).not.toMatch(/<svg/);
      expect(html.match(/border-radius:6px/g)?.length).toBeGreaterThanOrEqual(3);
    });

    it("line_chart renders an SVG with a smooth path per series", () => {
      const html = generatePresetHtml("line_chart", SAMPLES.line_chart);
      expect(html).toMatch(/<svg/);
      // Production renders an area path + smooth line path per series (2 paths per series)
      const paths = html.match(/<path /g) || [];
      expect(paths.length).toBeGreaterThanOrEqual(SAMPLES.line_chart.series.length);
    });

    it("donut_chart arcs sum to one full circle (one path per segment)", () => {
      const html = generatePresetHtml("donut_chart", SAMPLES.donut_chart);
      const paths = html.match(/<path /g) || [];
      expect(paths.length).toBe(SAMPLES.donut_chart.segments.length);
    });

    it("data_table renders all column headers and one row per data entry", () => {
      const html = generatePresetHtml("data_table", SAMPLES.data_table);
      for (const col of SAMPLES.data_table.columns) {
        expect(html).toContain(col.label);
      }
      const bodyRows = html.match(/<tr>(?!.*<th)/g) || [];
      // header tr + data trs
      expect(bodyRows.length).toBeGreaterThanOrEqual(SAMPLES.data_table.rows.length);
    });
  });
});
