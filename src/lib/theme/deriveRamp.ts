// Derive the workspace `--bb-*` token family from a CustomTheme's core colors.
//
// The custom-theme engine compiles the shadcn `--*` family, but the workspace shell
// (sidebar / editor / tabs / glass) runs on `--bb-bg-0..4`, `--bb-text-1..4`,
// `--bb-border(-strong)`, `--bb-glass-*`. This module generates that family so a theme
// repaints the WHOLE app. The text ramp is WCAG-clamped so customization can't make the
// app illegible (unless `ignoreContrast` is set — the Advanced escape hatch).

import { hexToHsl, relativeLuminance } from "@/lib/accentColor";
import type { CustomTheme } from "./themeEngine";

// ── small color utils (local; accentColor keeps its rgb helpers private) ──
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = (hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) h = "161925";
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
function hslToHex(h: number, s: number, l: number): string {
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
/** Shift a hex's HSL lightness by `deltaL` (percentage points), clamped to [0,100]. */
function shiftL(hex: string, deltaL: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, clamp(l + deltaL, 0, 100));
}
/** WCAG contrast ratio between two hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
/**
 * Nudge `text` away from `bg` (toward and past `fg`'s lightness direction) until it meets
 * the target contrast ratio. Keeps customization legible; no-op if already compliant.
 */
export function ensureContrast(text: string, bg: string, ratio: number, fgL = hexToHsl(text).l): string {
  if (contrastRatio(text, bg) >= ratio) return text;
  const bgL = hexToHsl(bg).l;
  const dir = fgL >= bgL ? 1 : -1; // move toward the high-contrast end
  let out = text;
  for (let i = 0; i < 100 && contrastRatio(out, bg) < ratio; i++) {
    out = shiftL(out, dir * 1);
    const l = hexToHsl(out).l;
    if (l <= 0 || l >= 100) break;
  }
  return out;
}

// The exact set of bb-* vars this module writes — the engine reuses it to fully strip
// residue on reset (Default-theme protection). Keep in sync with the keys returned below.
export const BB_RAMP_VARS = [
  "--bb-bg-0", "--bb-bg-1", "--bb-bg-2", "--bb-bg-3", "--bb-bg-4",
  "--bb-text-1", "--bb-text-2", "--bb-text-3", "--bb-text-4",
  "--bb-border", "--bb-border-strong",
  "--bb-glass-surface", "--bb-glass-surface-strong", "--bb-glass-border",
  "--bb-sidebar-bg", "--bb-sidebar-text", "--bb-sidebar-hover", "--bb-sidebar-border",
  "--bb-positive", "--bb-negative", "--bb-warning", "--bb-info",
  // Chrome controls (radius / shadow / per-edge sidebar borders). Defaults live in index.css
  // so System Default is unchanged; a theme overrides them, and reset strips them.
  "--bb-radius", "--bb-radius-panel", "--bb-radius-control", "--bb-shadow", "--bb-shadow-panel",
  "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl", "--radius-2xl", "--radius-3xl",
  "--bb-sb-border-top", "--bb-sb-border-right", "--bb-sb-border-bottom", "--bb-sb-border-left",
] as const;

interface DeriveOpts { ignoreContrast?: boolean }

/** Build the `--bb-*` workspace ramp for a theme. Returns a CSS-var → value map. */
export function deriveBbVars(theme: CustomTheme, opts: DeriveOpts = {}): Record<string, string> {
  const c = theme.colors;
  const base = c["core.background"] || "#161925";
  const fg = c["core.foreground"] || "#e2e8f0";
  const surface = c["card.background"] || base;
  const raised = c["muted.main"] || surface;
  const borderC = c["core.border"] || base;
  const hover = c["secondary.main"] || raised;
  const active = c["accent.main"] || hover;
  const isDark = theme.type ? theme.type === "dark" : relativeLuminance(base) < 0.4;
  const dir = isDark ? 1 : -1; // elevation lightens dark themes, darkens light themes
  const flat = Boolean(theme.flat);

  // ── Background elevation ramp ──
  // Flat uses one shared canvas. Hover and active colors still provide interaction
  // feedback, but cards no longer create a second elevation layer.
  const bg: Record<string, string> = flat
    ? {
        "--bb-bg-0": base,
        "--bb-bg-1": base,
        "--bb-bg-2": base,
        "--bb-bg-3": hover,
        "--bb-bg-4": active,
      }
    : {
        "--bb-bg-0": shiftL(base, -dir * 5),
        "--bb-bg-1": base,
        "--bb-bg-2": surface,
        "--bb-bg-3": raised,
        "--bb-bg-4": active,
      };

  // ── Text ramp (WCAG-clamped against bg-1) ──
  const fgL = hexToHsl(fg).l;
  let t1 = fg;
  let t2 = shiftL(fg, -dir * 12);
  let t3 = shiftL(fg, -dir * 28);
  let t4 = shiftL(fg, -dir * 42);
  if (!opts.ignoreContrast) {
    t1 = ensureContrast(t1, base, 4.5, fgL);
    t2 = ensureContrast(t2, base, 4.5, fgL);
    t3 = ensureContrast(t3, base, 4.5, fgL);
    t4 = ensureContrast(t4, base, 3.0, fgL);
  }

  // ── Borders ──
  const border = flat && contrastRatio(borderC, base) < 1.15 ? shiftL(base, dir * 8) : borderC;
  const borderStrong = shiftL(border, dir * 5);

  // ── Glass ──
  const glassSurface = flat ? base : rgba(surface, 0.72);
  const glassSurfaceStrong = flat ? base : rgba(raised, 0.88);
  const glassBorder = flat ? border : isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)";

  // ── Chrome controls (radius / shadow / per-edge sidebar borders) ──
  const radius = c["core.radius"] || "0rem";
  const radiusValue = clamp(parseFloat(radius) || 0, 0, 2);
  const rem = (value: number) => `${Number(value.toFixed(3))}rem`;
  const exactRadius = rem(radiusValue);
  // Flat is a no-elevation contract; elevated themes retain the user's shadow choice.
  const shadow = flat || theme.shadow === false
    ? "none"
    : "0 14px 42px -14px rgba(0,0,0,0.55)";
  const sb = theme.sidebarBorders ?? {};
  const edge = (on: boolean | undefined) => (on === false ? "0" : "0.5px");

  return {
    ...bg,
    "--bb-text-1": t1,
    "--bb-text-2": t2,
    "--bb-text-3": t3,
    "--bb-text-4": t4,
    "--bb-border": border,
    "--bb-border-strong": borderStrong,
    "--bb-glass-surface": glassSurface,
    "--bb-glass-surface-strong": glassSurfaceStrong,
    "--bb-glass-border": glassBorder,
    "--bb-sidebar-bg": c["sidebar.background"] || base,
    "--bb-sidebar-text": c["sidebar.foreground"] || t1,
    "--bb-sidebar-hover": c["sidebar.accent"] || hover,
    "--bb-sidebar-border": c["sidebar.border"] || border,
    // Status meaning is independent from chart series order. Optional semantic
    // colors preserve compatibility with imported themes created before this contract.
    "--bb-positive": c["semantic.positive"] || c["chart.3"] || "#10b981",
    "--bb-negative": c["semantic.negative"] || c["chart.2"] || "#ef4444",
    "--bb-warning": c["semantic.warning"] || c["chart.1"] || "#f59e0b",
    "--bb-info": c["semantic.info"] || c["chart.4"] || "#3b82f6",
    "--bb-radius": exactRadius,
    "--bb-radius-panel": exactRadius,
    "--bb-radius-control": exactRadius,
    "--bb-shadow": shadow,
    "--bb-shadow-panel": shadow,
    "--radius-sm": exactRadius,
    "--radius-md": exactRadius,
    "--radius-lg": exactRadius,
    "--radius-xl": exactRadius,
    "--radius-2xl": exactRadius,
    "--radius-3xl": exactRadius,
    "--bb-sb-border-top": edge(sb.top),
    "--bb-sb-border-right": edge(sb.right),
    "--bb-sb-border-bottom": edge(sb.bottom),
    "--bb-sb-border-left": edge(sb.left),
  };
}
