import { beforeEach, describe, expect, it } from "vitest";
import { contrastRatio, deriveBbVars } from "../../src/lib/theme/deriveRamp";
import { applyThemeVariables, applyTypographyVariables, BUILT_IN_THEMES, FLAT_DARK_THEME, FUI_HUD_THEME, isBuiltInThemeId, type CustomTheme } from "../../src/lib/theme/themeEngine";
import { parseCustomTheme, parseThemeJson, ThemeValidationError } from "../../src/lib/theme/themeValidation";
import { themeStore } from "../../src/repositories/local/themeStore";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

class MemoryStyle {
  private values = new Map<string, string>();
  setProperty(name: string, value: string) { this.values.set(name, value); }
  removeProperty(name: string) { this.values.delete(name); }
  getPropertyValue(name: string) { return this.values.get(name) ?? ""; }
}

class MemoryRoot {
  style = new MemoryStyle();
  private attributes = new Map<string, string>();
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  hasAttribute(name: string) { return this.attributes.has(name); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
}

function theme(overrides: Partial<CustomTheme> = {}): CustomTheme {
  return {
    ...FLAT_DARK_THEME,
    id: "custom-test",
    name: "Test Theme",
    colors: { ...FLAT_DARK_THEME.colors },
    ...overrides,
  };
}

describe("custom theme contract", () => {
  it("rejects malformed imports before they reach storage or CSS", () => {
    expect(() => parseThemeJson("not-json")).toThrow(ThemeValidationError);
    expect(() => parseCustomTheme({ ...theme(), colors: { ...theme().colors, "core.background": "red" } }))
      .toThrow("core.background must be a 6-digit hex color");
  });

  it("normalizes trusted theme fields and strips unknown data", () => {
    const parsed = parseCustomTheme({ ...theme(), name: "  My Theme  ", unknown: "ignored" });
    expect(parsed.name).toBe("My Theme");
    expect(parsed.colors["core.background"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(parsed).not.toHaveProperty("unknown");
  });

  it("uses explicit card and muted surfaces across the app ramp", () => {
    const input = theme({
      flat: false,
      colors: {
        ...theme().colors,
        "card.background": "#123456",
        "muted.main": "#234567",
        "core.radius": "0.75rem",
      },
    });
    const vars = deriveBbVars(input);
    expect(vars["--bb-bg-2"]).toBe("#123456");
    expect(vars["--bb-bg-3"]).toBe("#234567");
    expect(vars["--bb-radius"]).toBe("0.75rem");
    expect(vars["--bb-radius-panel"]).toBe("0.75rem");
    expect(vars["--bb-radius-control"]).toBe("0.75rem");
    expect(vars["--radius-sm"]).toBe("0.75rem");
    expect(vars["--radius-3xl"]).toBe("0.75rem");
  });

  it.each(["0rem", "0.25rem", "0.5rem", "1rem"])("applies %s exactly to every UI radius token", (radius) => {
    const vars = deriveBbVars(theme({ colors: { ...theme().colors, "core.radius": radius } }));
    for (const token of [
      "--bb-radius", "--bb-radius-panel", "--bb-radius-control",
      "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl", "--radius-2xl", "--radius-3xl",
    ]) expect(vars[token]).toBe(radius);
  });

  it("compiles flat mode as one canvas with dividers and no elevation", () => {
    const input = theme({
      flat: true,
      shadow: true,
      colors: {
        ...theme().colors,
        "core.background": "#101010",
        "card.background": "#242424",
        "core.border": "#101010",
        "secondary.main": "#202020",
        "accent.main": "#303030",
      },
    });
    const vars = deriveBbVars(input);

    expect(vars["--bb-bg-0"]).toBe("#101010");
    expect(vars["--bb-bg-1"]).toBe("#101010");
    expect(vars["--bb-bg-2"]).toBe("#101010");
    expect(vars["--bb-bg-3"]).toBe("#202020");
    expect(vars["--bb-glass-surface"]).toBe("#101010");
    expect(vars["--bb-shadow"]).toBe("none");
    expect(contrastRatio(vars["--bb-border"], "#101010")).toBeGreaterThanOrEqual(1.15);
  });

  it("protects readable text unless the user explicitly disables the guard", () => {
    const input = theme({
      colors: {
        ...theme().colors,
        "core.background": "#ffffff",
        "core.foreground": "#eeeeee",
      },
      type: "light",
    });
    const protectedText = deriveBbVars(input)["--bb-text-1"];
    expect(contrastRatio(protectedText, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(deriveBbVars(input, { ignoreContrast: true })["--bb-text-1"]).toBe("#eeeeee");
  });

  it("keeps semantic status meaning independent from chart series order", () => {
    const input = theme({
      colors: {
        ...theme().colors,
        "chart.1": "#111111",
        "chart.2": "#222222",
        "chart.3": "#333333",
        "chart.4": "#444444",
        "semantic.positive": "#10b981",
        "semantic.negative": "#ef4444",
        "semantic.warning": "#f59e0b",
        "semantic.info": "#3b82f6",
      },
    });
    const vars = deriveBbVars(input);
    expect(vars["--bb-positive"]).toBe("#10b981");
    expect(vars["--bb-negative"]).toBe("#ef4444");
    expect(vars["--bb-warning"]).toBe("#f59e0b");
    expect(vars["--bb-info"]).toBe("#3b82f6");
  });

  it("maps sidebar edges and legacy product aliases through one compiler", () => {
    const root = new MemoryRoot();
    const previousDocument = (globalThis as { document?: unknown }).document;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { documentElement: root },
    });

    try {
      applyThemeVariables(theme({
        sidebarBorders: { top: false, right: true, bottom: false, left: true },
        colors: { ...theme().colors, "primary.main": "#123456" },
      }));

      expect(root.style.getPropertyValue("--bb-accent")).toBe("#123456");
      expect(root.style.getPropertyValue("--flow-accent")).toBe("#123456");
      expect(root.style.getPropertyValue("--consultant-ac")).toBe("#123456");
      expect(root.style.getPropertyValue("--color-accent")).toBe("#123456");
      expect(root.style.getPropertyValue("--color-border")).toBe("var(--bb-border)");
      expect(root.style.getPropertyValue("--bb-sb-border-top")).toBe("0");
      expect(root.style.getPropertyValue("--bb-sb-border-right")).toBe("0.5px");
      expect(root.style.getPropertyValue("--bb-sb-border-bottom")).toBe("0");
      expect(root.style.getPropertyValue("--bb-sb-border-left")).toBe("0.5px");
      expect(root.hasAttribute("data-custom-theme")).toBe(true);

      applyThemeVariables(null);
      expect(root.style.getPropertyValue("--bb-accent")).toBe("");
      expect(root.style.getPropertyValue("--flow-accent")).toBe("");
      expect(root.style.getPropertyValue("--color-accent")).toBe("");
      expect(root.style.getPropertyValue("--bb-sb-border-top")).toBe("");
      expect(root.hasAttribute("data-custom-theme")).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previousDocument,
      });
    }
  });

  it("registers the FUI theme as an isolated built-in family", () => {
    expect(BUILT_IN_THEMES.map((item) => item.id)).toContain(FUI_HUD_THEME.id);
    expect(isBuiltInThemeId(FUI_HUD_THEME.id)).toBe(true);
    expect(FUI_HUD_THEME.family).toBe("fui-hud");
    expect(FUI_HUD_THEME.colors["semantic.negative"]).toBe("#ff6b76");
    expect(FUI_HUD_THEME.colors["semantic.warning"]).toBe("#e5c66a");
    expect(FUI_HUD_THEME.colors["semantic.info"]).toBe("#58b9dc");
    expect(contrastRatio(FUI_HUD_THEME.colors["core.foreground"], FUI_HUD_THEME.colors["core.background"])).toBeGreaterThanOrEqual(4.5);
  });

  it("applies and clears the FUI family marker atomically", () => {
    const root = new MemoryRoot();
    const previousDocument = (globalThis as { document?: unknown }).document;
    Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: root } });
    try {
      applyThemeVariables(FUI_HUD_THEME);
      expect(root.getAttribute("data-custom-theme")).toBe(FUI_HUD_THEME.id);
      expect(root.getAttribute("data-theme-family")).toBe("fui-hud");
      applyThemeVariables(null);
      expect(root.hasAttribute("data-theme-family")).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
    }
  });

  it("publishes and clears one typography contract for workspace portals", () => {
    const root = new MemoryRoot();
    const previousDocument = (globalThis as { document?: unknown }).document;
    Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: root } });
    try {
      applyTypographyVariables({
        interfaceFont: '"SF Pro Text", system-ui',
        textFont: '"Noto Sans Myanmar", sans-serif',
        monospaceFont: '"SF Mono", monospace',
      });
      expect(root.style.getPropertyValue("--beebot-interface-font")).toBe('"SF Pro Text", system-ui');
      expect(root.style.getPropertyValue("--beebot-text-font")).toBe('"Noto Sans Myanmar", sans-serif');
      expect(root.style.getPropertyValue("--beebot-mono-font")).toBe('"SF Mono", monospace');

      applyTypographyVariables(null);
      expect(root.style.getPropertyValue("--beebot-interface-font")).toBe("");
      expect(root.style.getPropertyValue("--beebot-text-font")).toBe("");
      expect(root.style.getPropertyValue("--beebot-mono-font")).toBe("");
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
    }
  });
});

describe("theme save lifecycle", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it("updates a personal theme without creating a duplicate", () => {
    const original = themeStore.createTheme(theme({ id: "custom-original", name: "Personal" }));
    themeStore.updateTheme({ ...original, colors: { ...original.colors, "primary.main": "#123456" } });

    expect(themeStore.getThemes().filter((item) => item.id === original.id)).toHaveLength(1);
    expect(themeStore.getTheme(original.id)?.colors["primary.main"]).toBe("#123456");
  });

  it("saves a separate theme with a new ID and a clear copy name", () => {
    const original = themeStore.createTheme(theme({ id: "custom-original", name: "Personal" }));
    const copy = themeStore.saveThemeCopy(original);

    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe("Personal Copy");
    expect(themeStore.getTheme(original.id)).not.toBeNull();
    expect(themeStore.getTheme(copy.id)).not.toBeNull();
  });

  it("keeps the FUI visual family on a personal copy and protects the built-in", () => {
    expect(() => themeStore.updateTheme(FUI_HUD_THEME)).toThrow("Built-in themes must be saved as a copy");
    const copy = themeStore.saveThemeCopy(FUI_HUD_THEME);
    expect(copy.id).not.toBe(FUI_HUD_THEME.id);
    expect(copy.family).toBe("fui-hud");
  });
});
