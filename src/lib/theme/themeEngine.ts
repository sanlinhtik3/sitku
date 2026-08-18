import { hexToHsl } from "@/lib/accentColor";
import { FUI_HUD_THEME_META } from "@/design-system/fui/theme";
import { deriveBbVars, BB_RAMP_VARS, ensureContrast } from "./deriveRamp";

export interface CustomThemeColors {
  "core.background": string;
  "core.foreground": string;
  "card.background": string;
  "card.foreground": string;
  "popover.background": string;
  "popover.foreground": string;
  "primary.main": string;
  "primary.foreground": string;
  "secondary.main": string;
  "secondary.foreground": string;
  "muted.main": string;
  "muted.foreground": string;
  "accent.main": string;
  "accent.foreground": string;
  "destructive.main": string;
  "destructive.foreground": string;
  "core.border": string;
  "core.input": string;
  "core.ring": string;
  "core.radius"?: string;
  "chart.1": string;
  "chart.2": string;
  "chart.3": string;
  "chart.4": string;
  "chart.5": string;
  "semantic.positive"?: string;
  "semantic.negative"?: string;
  "semantic.warning"?: string;
  "semantic.info"?: string;
  "sidebar.background"?: string;
  "sidebar.foreground"?: string;
  "sidebar.primary"?: string;
  "sidebar.primary.foreground"?: string;
  "sidebar.accent"?: string;
  "sidebar.accent.foreground"?: string;
  "sidebar.border"?: string;
  "sidebar.ring"?: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  author: string;
  type: "dark" | "light";
  /** Visual language retained by personal copies of a built-in theme. */
  family?: "standard" | "fui-hud";
  /** Flat mode: shared canvas, divider hierarchy, and hover/active-only fills. */
  flat?: boolean;
  /** Drop shadows on elevated chrome surfaces. Flat mode always disables them. */
  shadow?: boolean;
  /** Per-edge sidebar border visibility. Omitted edges default to shown. */
  sidebarBorders?: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean };
  /** Advanced escape hatch: skip the WCAG contrast clamp on the derived text ramp. */
  ignoreContrast?: boolean;
  colors: CustomThemeColors;
}

// Flat Dark Theme based on the UI reference
export const FLAT_DARK_THEME: CustomTheme = {
  id: "flat-dark-001",
  name: "Flat Dark",
  author: "System",
  type: "dark",
  flat: true,
  shadow: false,
  colors: {
    "core.background": "#161925", // Even darker, matching the image perfectly
    "core.foreground": "#E2E8F0",
    "card.background": "#161925", // Exactly same as background (No card bg)
    "card.foreground": "#F8FAFC",
    "popover.background": "#161925",
    "popover.foreground": "#F8FAFC",
    "primary.main": "#F59E0B", // Bright Amber/Orange
    "primary.foreground": "#111827",
    "secondary.main": "#1E2233", // Slightly lighter ONLY for hover states
    "secondary.foreground": "#E2E8F0",
    "muted.main": "#161925", // Same as background
    "muted.foreground": "#9CA3AF",
    "accent.main": "#1E2233", // Used for hover/focus backgrounds
    "accent.foreground": "#F8FAFC",
    "destructive.main": "#EF4444",
    "destructive.foreground": "#FFFFFF",
    "core.border": "#161925", // Invisible border matching bg
    "core.input": "#161925", // Invisible input bg
    "core.ring": "#F59E0B",
    "core.radius": "0rem", // No border radius
    "chart.1": "#F59E0B", // Amber
    "chart.2": "#EF4444", // Red
    "chart.3": "#10B981", // Green
    "chart.4": "#3B82F6", // Blue
    "chart.5": "#14B8A6", // Teal
    "semantic.positive": "#10B981",
    "semantic.negative": "#EF4444",
    "semantic.warning": "#F59E0B",
    "semantic.info": "#3B82F6",
    "sidebar.background": "#161925",
    "sidebar.foreground": "#E2E8F0",
    "sidebar.primary": "#F59E0B",
    "sidebar.primary.foreground": "#111827",
    "sidebar.accent": "#1E2233", // Hover state for sidebar
    "sidebar.accent.foreground": "#F8FAFC",
    "sidebar.border": "#161925", // No visible border
    "sidebar.ring": "#F59E0B",
  },
};

/**
 * Calm tactical theme derived from the supplied FUI reference kit. The palette
 * is intentionally restrained: neutral surfaces carry the UI while cyan/mint
 * are reserved for focus, progress, and high-signal data.
 */
export const FUI_HUD_THEME: CustomTheme = {
  id: FUI_HUD_THEME_META.id,
  name: FUI_HUD_THEME_META.name,
  author: FUI_HUD_THEME_META.author,
  type: "dark",
  family: FUI_HUD_THEME_META.family,
  flat: true,
  shadow: false,
  sidebarBorders: { top: true, right: true, bottom: true, left: true },
  colors: {
    "core.background": "#070b0d",
    "core.foreground": "#e8f2f0",
    "card.background": "#0b1215",
    "card.foreground": "#edf7f4",
    "popover.background": "#0d1518",
    "popover.foreground": "#edf7f4",
    "primary.main": "#75d8c2",
    "primary.foreground": "#04110e",
    "secondary.main": "#101b1f",
    "secondary.foreground": "#d5e4e1",
    "muted.main": "#0d171a",
    "muted.foreground": "#829b98",
    "accent.main": "#102328",
    "accent.foreground": "#c8f4eb",
    "destructive.main": "#ff6b76",
    "destructive.foreground": "#190407",
    "core.border": "#1d3439",
    "core.input": "#193036",
    "core.ring": "#75d8c2",
    "core.radius": "0.25rem",
    "chart.1": "#75d8c2",
    "chart.2": "#58b9dc",
    "chart.3": "#73e2a7",
    "chart.4": "#e5c66a",
    "chart.5": "#ff6b76",
    "semantic.positive": "#73e2a7",
    "semantic.negative": "#ff6b76",
    "semantic.warning": "#e5c66a",
    "semantic.info": "#58b9dc",
    "sidebar.background": "#080d0f",
    "sidebar.foreground": "#dbe9e6",
    "sidebar.primary": "#75d8c2",
    "sidebar.primary.foreground": "#04110e",
    "sidebar.accent": "#102126",
    "sidebar.accent.foreground": "#dffaf4",
    "sidebar.border": "#1b3035",
    "sidebar.ring": "#75d8c2",
  },
};

export const BUILT_IN_THEMES: readonly CustomTheme[] = [FLAT_DARK_THEME, FUI_HUD_THEME];
export const isBuiltInThemeId = (id: string | null | undefined) =>
  Boolean(id && BUILT_IN_THEMES.some((theme) => theme.id === id));

export interface ThemeTypography {
  interfaceFont: string;
  textFont: string;
  monospaceFont: string;
}

const TYPOGRAPHY_MAPPING: Record<keyof ThemeTypography, string> = {
  interfaceFont: "--beebot-interface-font",
  textFont: "--beebot-text-font",
  monospaceFont: "--beebot-mono-font",
};

/**
 * Publish Appearance typography at the document root so body-level portals
 * (including E.V) use the same font contract as the workspace shell.
 */
export function applyTypographyVariables(typography: ThemeTypography | null) {
  if (typeof document === "undefined") return;
  const style = document.documentElement.style;
  for (const [key, cssVariable] of Object.entries(TYPOGRAPHY_MAPPING)) {
    const value = typography?.[key as keyof ThemeTypography]?.trim();
    if (value) style.setProperty(cssVariable, value);
    else style.removeProperty(cssVariable);
  }
}

// Map semantic JSON keys to shadcn CSS variables
const COLOR_MAPPING: Partial<Record<keyof CustomThemeColors, string>> = {
  "core.background": "--background",
  "core.foreground": "--foreground",
  "card.background": "--card",
  "card.foreground": "--card-foreground",
  "popover.background": "--popover",
  "popover.foreground": "--popover-foreground",
  "primary.main": "--primary",
  "primary.foreground": "--primary-foreground",
  "secondary.main": "--secondary",
  "secondary.foreground": "--secondary-foreground",
  "muted.main": "--muted",
  "muted.foreground": "--muted-foreground",
  "accent.main": "--accent",
  "accent.foreground": "--accent-foreground",
  "destructive.main": "--destructive",
  "destructive.foreground": "--destructive-foreground",
  "core.border": "--border",
  "core.input": "--input",
  "core.ring": "--ring",
  "core.radius": "--radius",
  "chart.1": "--chart-1",
  "chart.2": "--chart-2",
  "chart.3": "--chart-3",
  "chart.4": "--chart-4",
  "chart.5": "--chart-5",
  "sidebar.background": "--sidebar-background",
  "sidebar.foreground": "--sidebar-foreground",
  "sidebar.primary": "--sidebar-primary",
  "sidebar.primary.foreground": "--sidebar-primary-foreground",
  "sidebar.accent": "--sidebar-accent",
  "sidebar.accent.foreground": "--sidebar-accent-foreground",
  "sidebar.border": "--sidebar-border",
  "sidebar.ring": "--sidebar-ring",
};

// Extra accent/gradient/glow vars this engine injects when a theme is applied — listed so
// the reset path can strip them (Default-theme protection).
const ENGINE_EXTRA_VARS = [
  "--bb-accent", "--beebot-accent", "--bb-accent-soft",
  "--gradient-primary", "--gradient-accent", "--shadow-glow", "--shadow-card", "--accent-glow",
  "--flow-accent", "--consultant-ac", "--glow-color",
  "--sidebar-border-glow", "--sidebar-border-line", "--sidebar-outer-glow", "--corner-light-teal",
  "--glass-border-active",
  "--color-accent", "--color-border", "--color-bg-primary", "--color-bg-secondary",
  "--color-text-primary", "--color-text-secondary", "--color-success", "--color-danger",
  "--color-warning", "--color-info",
];

/** Convert a hex string to "H S% L%" format for Shadcn variables */
function hexToShadcnHsl(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  return `${h} ${s}% ${l}%`;
}

/**
 * The Compiler: Compiles a CustomTheme + UserOverrides into CSS Variables
 * and applies them to the document root.
 */
export function applyThemeVariables(
  theme: CustomTheme | null,
  overrides?: Partial<CustomThemeColors>
) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  const clearCompiledVariables = () => {
    Object.values(COLOR_MAPPING).forEach((cssVar) => { if (cssVar) root.style.removeProperty(cssVar); });
    BB_RAMP_VARS.forEach((cssVar) => root.style.removeProperty(cssVar));
    ENGINE_EXTRA_VARS.forEach((cssVar) => root.style.removeProperty(cssVar));
  };

  // If no custom theme is provided, we remove the injected custom variables
  // so the default CSS (from index.css) takes over.
  if (!theme) {
    clearCompiledVariables();
    // Strip the workspace --bb-* family AND the accent/gradient/glow helpers this engine
    // injects, or System Default keeps residue from a previewed custom theme. This is the
    // Default-theme protection guarantee. (applyAccent re-sets the accent + gradient-primary
    // afterwards on the System-Default path; the glow/gradient-accent vars fall back to index.css.)
    // Also remove the custom theme marker
    root.removeAttribute("data-custom-theme");
    root.removeAttribute("data-bb-surface");
    root.removeAttribute("data-theme-family");
    return;
  }

  clearCompiledVariables();
  const safeOverrides = Object.fromEntries(Object.entries(overrides || {}).filter(([key, value]) =>
    key === "core.radius" ? typeof value === "string" && /^(?:0|0?\.\d+|1(?:\.\d+)?|2(?:\.0+)?)rem$/.test(value) : typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
  ));
  const finalColors: CustomThemeColors = { ...theme.colors, ...safeOverrides };
  finalColors["sidebar.background"] ||= finalColors["core.background"];
  finalColors["sidebar.foreground"] ||= finalColors["core.foreground"];
  finalColors["sidebar.primary"] ||= finalColors["primary.main"];
  finalColors["sidebar.primary.foreground"] ||= finalColors["primary.foreground"];
  finalColors["sidebar.accent"] ||= finalColors["secondary.main"];
  finalColors["sidebar.accent.foreground"] ||= finalColors["secondary.foreground"];
  finalColors["sidebar.border"] ||= finalColors["core.border"];
  finalColors["sidebar.ring"] ||= finalColors["core.ring"];
  if (!theme.ignoreContrast) {
    finalColors["core.foreground"] = ensureContrast(finalColors["core.foreground"], finalColors["core.background"], 4.5);
    finalColors["card.foreground"] = ensureContrast(finalColors["card.foreground"], finalColors["card.background"], 4.5);
    finalColors["popover.foreground"] = ensureContrast(finalColors["popover.foreground"], finalColors["popover.background"], 4.5);
    finalColors["primary.foreground"] = ensureContrast(finalColors["primary.foreground"], finalColors["primary.main"], 4.5);
    finalColors["sidebar.foreground"] = ensureContrast(finalColors["sidebar.foreground"], finalColors["sidebar.background"], 4.5);
  }

  // Set the type (dark/light) to let Tailwind know which base classes to use
  root.setAttribute("data-bb-theme", theme.type);
  root.setAttribute("data-custom-theme", theme.id);
  root.setAttribute("data-bb-surface", theme.flat ? "flat" : "elevated");
  root.setAttribute("data-theme-family", theme.family ?? "standard");

  // Compile and inject variables
  for (const [semanticKey, value] of Object.entries(finalColors)) {
    if (!value) continue;
    const cssVar = COLOR_MAPPING[semanticKey as keyof CustomThemeColors];
    if (cssVar) {
      if (semanticKey === "core.radius") {
        // Radius doesn't need HSL conversion
        root.style.setProperty(cssVar, value);
      } else {
        const hslValue = hexToShadcnHsl(value);
        root.style.setProperty(cssVar, hslValue);
      }
    }
  }

  // We also need to inject some specific bb- variables that the app uses for glow/gradients
  const primaryHex = finalColors["primary.main"] || "#f4d35e";
  const { h, s, l } = hexToHsl(primaryHex);
  root.style.setProperty("--bb-accent", primaryHex);
  root.style.setProperty("--beebot-accent", primaryHex);
  root.style.setProperty(
    "--bb-accent-soft",
    `rgba(${parseInt(primaryHex.slice(1, 3), 16) || 0}, ${parseInt(
      primaryHex.slice(3, 5),
      16
    ) || 0}, ${parseInt(primaryHex.slice(5, 7), 16) || 0}, 0.28)`
  );
  root.style.setProperty(
    "--gradient-primary",
    `linear-gradient(135deg, hsl(${h} ${s}% ${l}%) 0%, hsl(${h} ${Math.max(
      s - 7,
      0
    )}% ${Math.max(l - 6, 0)}%) 100%)`
  );
  root.style.setProperty(
    "--gradient-accent",
    `linear-gradient(135deg, hsl(${h} ${s}% ${l}%) 0%, hsl(${h} ${Math.max(
      s - 7,
      0
    )}% ${Math.max(l - 6, 0)}%) 100%)`
  );
  root.style.setProperty("--shadow-glow", `0 0 40px hsl(${h} ${s}% ${l}% / 0.2)`);
  root.style.setProperty("--accent-glow", `${h} ${s}% ${l}% / 0.15`);

  // Workspace `--bb-*` family — repaint the shell (sidebar / editor / tabs / glass) so the
  // theme reaches the WHOLE app, not just shadcn surfaces. WCAG-clamped (unless ignoreContrast).
  const bbVars = deriveBbVars(
    { ...theme, colors: finalColors },
    { ignoreContrast: theme.ignoreContrast },
  );
  for (const [cssVar, value] of Object.entries(bbVars)) {
    root.style.setProperty(cssVar, value);
  }

  // Compatibility aliases used by legacy CFO/Consultant widgets and generated
  // dashboard markup. The compiler remains the single source of truth.
  root.style.setProperty("--flow-accent", primaryHex);
  root.style.setProperty("--consultant-ac", primaryHex);
  root.style.setProperty("--glow-color", `${h} ${s}% ${l}%`);
  root.style.setProperty("--sidebar-border-glow", `color-mix(in oklab, ${primaryHex} 14%, transparent)`);
  root.style.setProperty("--sidebar-border-line", `color-mix(in oklab, ${primaryHex} 8%, transparent)`);
  root.style.setProperty("--sidebar-outer-glow", `color-mix(in oklab, ${primaryHex} 4%, transparent)`);
  root.style.setProperty("--corner-light-teal", `color-mix(in oklab, ${primaryHex} 7%, transparent)`);
  root.style.setProperty("--glass-border-active", `${h} ${s}% ${l}% / 0.25`);
  root.style.setProperty("--color-accent", primaryHex);
  root.style.setProperty("--color-border", "var(--bb-border)");
  root.style.setProperty("--color-bg-primary", "var(--bb-bg-0)");
  root.style.setProperty("--color-bg-secondary", "var(--bb-bg-2)");
  root.style.setProperty("--color-text-primary", "var(--bb-text-1)");
  root.style.setProperty("--color-text-secondary", "var(--bb-text-3)");
  root.style.setProperty("--color-success", "var(--bb-positive)");
  root.style.setProperty("--color-danger", "var(--bb-negative)");
  root.style.setProperty("--color-warning", "var(--bb-warning)");
  root.style.setProperty("--color-info", "var(--bb-info)");
}
