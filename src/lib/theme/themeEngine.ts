import { hexToHsl } from "@/lib/accentColor";
import { deriveBbVars, BB_RAMP_VARS } from "./deriveRamp";

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
  /** Flat mode: collapse the elevation ramp so only hover/active show a background. */
  flat?: boolean;
  /** Drop shadows on chrome surfaces. Defaults to true; flat themes default to false. */
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

// Map semantic JSON keys to shadcn CSS variables
const COLOR_MAPPING: Record<keyof CustomThemeColors, string> = {
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
  "--gradient-primary", "--gradient-accent", "--shadow-glow", "--accent-glow",
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

  // If no custom theme is provided, we remove the injected custom variables
  // so the default CSS (from index.css) takes over.
  if (!theme) {
    Object.values(COLOR_MAPPING).forEach((cssVar) => {
      root.style.removeProperty(cssVar);
    });
    // Strip the workspace --bb-* family AND the accent/gradient/glow helpers this engine
    // injects, or System Default keeps residue from a previewed custom theme. This is the
    // Default-theme protection guarantee. (applyAccent re-sets the accent + gradient-primary
    // afterwards on the System-Default path; the glow/gradient-accent vars fall back to index.css.)
    BB_RAMP_VARS.forEach((cssVar) => root.style.removeProperty(cssVar));
    ENGINE_EXTRA_VARS.forEach((cssVar) => root.style.removeProperty(cssVar));
    // Also remove the custom theme marker
    root.removeAttribute("data-custom-theme");
    return;
  }

  // Merge theme colors with user overrides
  const finalColors: Partial<CustomThemeColors> = { ...theme.colors, ...overrides };

  // Set the type (dark/light) to let Tailwind know which base classes to use
  root.setAttribute("data-bb-theme", theme.type);
  root.setAttribute("data-custom-theme", theme.id);

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
    { ...theme, colors: finalColors as CustomThemeColors },
    { ignoreContrast: theme.ignoreContrast },
  );
  for (const [cssVar, value] of Object.entries(bbVars)) {
    root.style.setProperty(cssVar, value);
  }
}
