/** Stable public identity for the built-in theme and all personal copies. */
export const FUI_HUD_THEME_META = {
  id: "fui-hud-001",
  family: "fui-hud",
  name: "FUI HUD",
  author: "Sitku",
} as const;

/** Semantic variables exposed by the FUI family. */
export const FUI_TOKENS = {
  canvas: "var(--fui-canvas)",
  surface: "var(--fui-surface)",
  surfaceRaised: "var(--fui-surface-raised)",
  panelFill: "var(--fui-panel-fill)",
  line: "var(--fui-line)",
  lineStrong: "var(--fui-line-strong)",
  chartGrid: "var(--fui-chart-grid)",
  signal: "var(--fui-signal)",
  signalCool: "var(--fui-signal-cool)",
  radiusControl: "var(--fui-radius-control)",
  radiusPanel: "var(--fui-radius-panel)",
  space1: "var(--fui-space-1)",
  space2: "var(--fui-space-2)",
  space3: "var(--fui-space-3)",
  space4: "var(--fui-space-4)",
  motionFast: "var(--fui-motion-fast)",
  motionNormal: "var(--fui-motion-normal)",
  ease: "var(--fui-ease)",
} as const;

export type FuiToken = keyof typeof FUI_TOKENS;

export const FUI_STATUS_TONES = ["info", "success", "warning", "danger", "offline"] as const;
export type FuiStatusTone = (typeof FUI_STATUS_TONES)[number];

export const FUI_PANEL_TONES = ["primary", "secondary", "quiet"] as const;
export type FuiPanelTone = (typeof FUI_PANEL_TONES)[number];

/** Shared responsive recipes. These describe layout only, never product data. */
export const FUI_LAYOUT = {
  metricGrid: "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4",
  dashboardGrid: "grid grid-cols-1 gap-4 lg:grid-cols-12",
  toolbar: "flex min-h-11 flex-wrap items-center justify-between gap-2",
  compactStack: "flex min-w-0 flex-col gap-2",
} as const;
