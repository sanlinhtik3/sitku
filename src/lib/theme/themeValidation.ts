import type { CustomTheme, CustomThemeColors } from "./themeEngine";

const REQUIRED_COLORS: (keyof CustomThemeColors)[] = [
  "core.background", "core.foreground", "card.background", "card.foreground",
  "popover.background", "popover.foreground", "primary.main", "primary.foreground",
  "secondary.main", "secondary.foreground", "muted.main", "muted.foreground",
  "accent.main", "accent.foreground", "destructive.main", "destructive.foreground",
  "core.border", "core.input", "core.ring", "chart.1", "chart.2", "chart.3",
  "chart.4", "chart.5",
];

const OPTIONAL_COLORS: (keyof CustomThemeColors)[] = [
  "semantic.positive", "semantic.negative", "semantic.warning", "semantic.info",
  "sidebar.background", "sidebar.foreground", "sidebar.primary", "sidebar.primary.foreground",
  "sidebar.accent", "sidebar.accent.foreground", "sidebar.border", "sidebar.ring",
];

const HEX = /^#[0-9a-f]{6}$/i;
const RADIUS = /^(?:0|0?\.\d+|1(?:\.\d+)?|2(?:\.0+)?)rem$/;
const cleanText = (value: unknown, fallback: string, max: number) =>
  (typeof value === "string" ? value.trim() : "").slice(0, max) || fallback;

export class ThemeValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ThemeValidationError"; }
}

export function parseCustomTheme(input: unknown): CustomTheme {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ThemeValidationError("Theme JSON must be an object.");
  const raw = input as Record<string, unknown>;
  if (raw.type !== "dark" && raw.type !== "light") throw new ThemeValidationError('Theme type must be "dark" or "light".');
  if (!raw.colors || typeof raw.colors !== "object" || Array.isArray(raw.colors)) throw new ThemeValidationError("Theme colors are missing.");

  const source = raw.colors as Record<string, unknown>;
  const colors = {} as CustomThemeColors;
  for (const key of REQUIRED_COLORS) {
    const value = source[key];
    if (typeof value !== "string" || !HEX.test(value)) throw new ThemeValidationError(`${key} must be a 6-digit hex color.`);
    colors[key] = value.toLowerCase();
  }
  for (const key of OPTIONAL_COLORS) {
    const value = source[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !HEX.test(value)) throw new ThemeValidationError(`${key} must be a 6-digit hex color.`);
    colors[key] = value.toLowerCase();
  }
  if (source["core.radius"] !== undefined) {
    const radius = String(source["core.radius"]).trim();
    if (!RADIUS.test(radius)) throw new ThemeValidationError("core.radius must be between 0rem and 2rem.");
    colors["core.radius"] = radius;
  }

  const borderInput = raw.sidebarBorders && typeof raw.sidebarBorders === "object" && !Array.isArray(raw.sidebarBorders)
    ? raw.sidebarBorders as Record<string, unknown>
    : null;
  const borders = borderInput ? {
    top: borderInput.top !== false,
    right: borderInput.right !== false,
    bottom: borderInput.bottom !== false,
    left: borderInput.left !== false,
  } : undefined;

  return {
    id: cleanText(raw.id, `custom-${Date.now()}`, 80).replace(/[^a-z0-9_-]/gi, "-"),
    name: cleanText(raw.name, "Imported Theme", 60),
    author: cleanText(raw.author, "Unknown", 60),
    type: raw.type,
    family: raw.family === "fui-hud" ? "fui-hud" : "standard",
    flat: raw.flat === true,
    shadow: raw.shadow !== false,
    sidebarBorders: borders,
    ignoreContrast: raw.ignoreContrast === true,
    colors,
  };
}

export function parseThemeJson(json: string): CustomTheme {
  if (json.length > 256_000) throw new ThemeValidationError("Theme file is too large.");
  try { return parseCustomTheme(JSON.parse(json)); }
  catch (error) {
    if (error instanceof ThemeValidationError) throw error;
    throw new ThemeValidationError("Theme file is not valid JSON.");
  }
}
