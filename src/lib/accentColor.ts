// ── Accent color → single source of truth for the whole app theme ───────────
// The user's chosen accent (Appearance → Accent color) must drive ALL brand /
// primary / active chrome — shadcn `--primary`, focus `--ring`, sidebar, etc. —
// not just the `--bb-accent` family. Previously `--primary` was a hardcoded green
// that nothing updated (toggles stayed green while the accent was yellow), and the
// accent was set on a workspace <div> so portaled dialogs never saw it.
//
// `applyAccent` writes every accent-derived token onto `document.documentElement`
// so it cascades everywhere, including Radix portals (FlowState / Consultant).
// Semantic colors (income green / expense red / warning / danger) are intentionally
// NOT touched — they convey data meaning, like Apple's system colors.

export interface Hsl { h: number; s: number; l: number; }

/** Parse "#rgb" / "#rrggbb" → {r,g,b} 0–255. Falls back to the default accent. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = (hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) h = "f4d35e"; // default accent
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function hexToHsl(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case rn: h = ((gn - bn) / d) % 6; break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** WCAG relative luminance (0 dark – 1 light) — used to pick readable foreground. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function rgba(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Bind every accent-derived CSS variable to `hex` on :root. Idempotent — safe to
 * call on mount and on every accent change.
 */
export function applyAccent(hex: string): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const { h, s, l } = hexToHsl(hex);
  const hsl = `${h} ${s}% ${l}%`;
  // Readable text/icon color to place ON the accent (e.g. a primary button fill).
  const fg = relativeLuminance(hex) > 0.45 ? "222 47% 11%" : "0 0% 100%";

  // bb-* family (hex-based, used as var(--bb-accent))
  root.style.setProperty("--boot-accent", hex);
  try { localStorage.setItem("boot-accent", hex); } catch {}
  root.style.setProperty("--bb-accent", hex);
  root.style.setProperty("--beebot-accent", hex);
  root.style.setProperty("--bb-accent-soft", rgba(hex, 0.28));

  // shadcn / app primary family (HSL components, used as hsl(var(--primary)))
  root.style.setProperty("--primary", hsl);
  root.style.setProperty("--primary-foreground", fg);
  root.style.setProperty("--ring", hsl);
  root.style.setProperty("--accent", hsl);
  root.style.setProperty("--accent-foreground", fg);
  root.style.setProperty("--sidebar-primary", hsl);
  root.style.setProperty("--sidebar-primary-foreground", fg);
  root.style.setProperty("--sidebar-ring", hsl);

  // gradient + glow helpers some components reference
  root.style.setProperty("--gradient-primary", `linear-gradient(135deg, hsl(${h} ${s}% ${l}%) 0%, hsl(${h} ${Math.max(s - 7, 0)}% ${Math.max(l - 6, 0)}%) 100%)`);
  root.style.setProperty("--gradient-accent", `linear-gradient(135deg, hsl(${h} ${s}% ${l}%) 0%, hsl(${h} ${Math.max(s - 7, 0)}% ${Math.max(l - 6, 0)}%) 100%)`);
  root.style.setProperty("--shadow-glow", `0 0 40px hsl(${h} ${s}% ${l}% / 0.2)`);
  root.style.setProperty("--accent-glow", `${h} ${s}% ${l}% / 0.15`);
}
