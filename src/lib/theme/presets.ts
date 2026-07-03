// Curated, contrast-safe starting palettes for the theme editor. These are the "recommended
// colors" guardrail — a user starts from a harmonious base instead of arbitrary hex that can
// produce unreadable or clashing UIs. Each preset is a full, ready-to-apply theme.

import type { CustomTheme, CustomThemeColors } from "./themeEngine";

export type ThemePreset = Pick<CustomTheme, "name" | "type" | "flat" | "shadow" | "colors">;

interface Spec {
  name: string;
  type: "dark" | "light";
  flat?: boolean;
  shadow?: boolean;
  bg: string;        // core background
  fg: string;        // primary text
  surface: string;   // card / hover / muted / accent surface
  primary: string;   // brand accent
  onPrimary: string; // text on the accent
  mutedFg: string;   // secondary text
  border: string;
  radius: string;    // e.g. "0rem" | "0.5rem"
  charts: [string, string, string, string, string];
}

function make(s: Spec): ThemePreset {
  const colors: CustomThemeColors = {
    "core.background": s.bg,
    "core.foreground": s.fg,
    "card.background": s.flat ? s.bg : s.surface,
    "card.foreground": s.fg,
    "popover.background": s.surface,
    "popover.foreground": s.fg,
    "primary.main": s.primary,
    "primary.foreground": s.onPrimary,
    "secondary.main": s.surface,
    "secondary.foreground": s.fg,
    "muted.main": s.surface,
    "muted.foreground": s.mutedFg,
    "accent.main": s.surface,
    "accent.foreground": s.fg,
    "destructive.main": "#ef4444",
    "destructive.foreground": "#ffffff",
    "core.border": s.border,
    "core.input": s.border,
    "core.ring": s.primary,
    "core.radius": s.radius,
    "chart.1": s.charts[0],
    "chart.2": s.charts[1],
    "chart.3": s.charts[2],
    "chart.4": s.charts[3],
    "chart.5": s.charts[4],
  };
  return { name: s.name, type: s.type, flat: s.flat, shadow: s.shadow, colors };
}

export const THEME_PRESETS: ThemePreset[] = [
  make({
    name: "Flat Dark", type: "dark", flat: true, shadow: false,
    bg: "#161925", fg: "#e2e8f0", surface: "#1e2233", primary: "#f59e0b", onPrimary: "#111827",
    mutedFg: "#9ca3af", border: "#161925", radius: "0rem",
    charts: ["#f59e0b", "#ef4444", "#10b981", "#3b82f6", "#14b8a6"],
  }),
  make({
    name: "Midnight", type: "dark", shadow: true,
    bg: "#0f172a", fg: "#e2e8f0", surface: "#1e293b", primary: "#6366f1", onPrimary: "#ffffff",
    mutedFg: "#94a3b8", border: "#1e293b", radius: "0.75rem",
    charts: ["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#06b6d4"],
  }),
  make({
    name: "Graphite", type: "dark", shadow: true,
    bg: "#171717", fg: "#e5e5e5", surface: "#262626", primary: "#60a5fa", onPrimary: "#0a0a0a",
    mutedFg: "#a3a3a3", border: "#2a2a2a", radius: "0.5rem",
    charts: ["#60a5fa", "#f87171", "#4ade80", "#fbbf24", "#22d3ee"],
  }),
  make({
    name: "Nord", type: "dark", shadow: true,
    bg: "#2e3440", fg: "#d8dee9", surface: "#3b4252", primary: "#88c0d0", onPrimary: "#2e3440",
    mutedFg: "#81a1c1", border: "#434c5e", radius: "0.5rem",
    charts: ["#88c0d0", "#bf616a", "#a3be8c", "#ebcb8b", "#b48ead"],
  }),
  make({
    name: "Solarized", type: "dark", shadow: true,
    bg: "#002b36", fg: "#93a1a1", surface: "#073642", primary: "#268bd2", onPrimary: "#fdf6e3",
    mutedFg: "#657b83", border: "#073642", radius: "0.5rem",
    charts: ["#268bd2", "#dc322f", "#859900", "#b58900", "#2aa198"],
  }),
  make({
    name: "Paper", type: "light", shadow: true,
    bg: "#fbfbf9", fg: "#1a1a1a", surface: "#f1f0ec", primary: "#2563eb", onPrimary: "#ffffff",
    mutedFg: "#6b7280", border: "#e5e3dd", radius: "0.5rem",
    charts: ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#0891b2"],
  }),
];
