import { BUILT_IN_THEMES, isBuiltInThemeId, type CustomTheme, type CustomThemeColors } from "@/lib/theme/themeEngine";
import { parseCustomTheme } from "@/lib/theme/themeValidation";

const THEMES_KEY = "workspace.custom_themes";
const OVERRIDES_KEY = "workspace.theme_overrides";
const REMOVED_KEY = "workspace.removed_system_themes";

class ThemeStore {
  private getStoredThemes(): CustomTheme[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(THEMES_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((theme) => {
        try {
          const valid = parseCustomTheme(theme);
          return isBuiltInThemeId(valid.id) ? [] : [valid];
        } catch (error) {
          console.warn("[ThemeStore] Ignored invalid stored theme", error);
          return [];
        }
      });
    } catch { return []; }
  }

  /**
   * Get all installed themes (Default Custom Themes + User Imported Themes)
   */
  /** IDs of seeded "system" themes the user has uninstalled (kept hidden across reloads). */
  getRemovedSystemThemeIds(): string[] {
    try {
      const stored = localStorage.getItem(REMOVED_KEY);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  }

  getThemes(): CustomTheme[] {
    try {
      // Seeded system themes are available unless the user uninstalled them.
      const removed = this.getRemovedSystemThemeIds();
      const systemThemes = BUILT_IN_THEMES.filter((sys) => !removed.includes(sys.id));
      return [...systemThemes, ...this.getStoredThemes()];
    } catch (e) {
      console.error("[ThemeStore] Failed to parse themes", e);
      return [...BUILT_IN_THEMES];
    }
  }

  /**
   * Get a specific theme by ID
   */
  getTheme(id: string): CustomTheme | null {
    const themes = this.getThemes();
    return themes.find((t) => t.id === id) || null;
  }

  /**
   * Save or update a custom theme
   */
  saveTheme(theme: CustomTheme): CustomTheme {
    const valid = parseCustomTheme(theme);
    if (isBuiltInThemeId(valid.id)) throw new Error("Built-in themes must be saved as a copy.");
    const themes = this.getStoredThemes();
    const existingIndex = themes.findIndex((t) => t.id === valid.id);
    
    if (existingIndex >= 0) {
      themes[existingIndex] = valid;
    } else {
      if (themes.length >= 50) throw new Error("Theme limit reached. Remove one before adding another.");
      themes.push(valid);
    }
    try { localStorage.setItem(THEMES_KEY, JSON.stringify(themes)); }
    catch { throw new Error("Theme could not be saved. Browser storage may be full or unavailable."); }
    return valid;
  }

  createTheme(theme: CustomTheme): CustomTheme {
    const valid = parseCustomTheme(theme);
    if (this.getThemes().some((item) => item.id === valid.id)) {
      throw new Error("A theme with this ID already exists.");
    }
    return this.saveTheme(valid);
  }

  updateTheme(theme: CustomTheme): CustomTheme {
    const valid = parseCustomTheme(theme);
    if (isBuiltInThemeId(valid.id)) throw new Error("Built-in themes must be saved as a copy.");
    if (!this.getStoredThemes().some((item) => item.id === valid.id)) {
      throw new Error("Theme no longer exists. Save it as a new theme instead.");
    }
    return this.saveTheme(valid);
  }

  saveThemeCopy(theme: CustomTheme): CustomTheme {
    const valid = parseCustomTheme(theme);
    const names = new Set(this.getThemes().map((item) => item.name.toLocaleLowerCase()));
    const baseName = valid.name.trim();
    let copyName = baseName;
    if (names.has(copyName.toLocaleLowerCase())) {
      copyName = `${baseName} Copy`;
      let suffix = 2;
      while (names.has(copyName.toLocaleLowerCase())) copyName = `${baseName} Copy ${suffix++}`;
    }
    return this.createTheme({ ...valid, id: `custom-${crypto.randomUUID()}`, name: copyName });
  }

  importTheme(theme: CustomTheme): CustomTheme {
    const valid = parseCustomTheme(theme);
    const ids = new Set(this.getThemes().map((item) => item.id));
    const imported = ids.has(valid.id)
      ? { ...valid, id: `custom-${Date.now()}`, name: `${valid.name} Copy` }
      : valid;
    return this.saveTheme(imported);
  }

  /**
   * Delete/uninstall a theme. Seeded system themes (e.g. Flat Dark) can't be erased from
   * code, so they're recorded as "removed" and hidden by getThemes() across reloads.
   */
  deleteTheme(id: string): void {
    try {
      if (isBuiltInThemeId(id)) {
        const removed = this.getRemovedSystemThemeIds();
        if (!removed.includes(id)) localStorage.setItem(REMOVED_KEY, JSON.stringify([...removed, id]));
        return;
      }
      const filtered = this.getStoredThemes().filter((t) => t.id !== id);
      localStorage.setItem(THEMES_KEY, JSON.stringify(filtered));
    } catch {
      throw new Error("Theme could not be removed. Browser storage may be unavailable.");
    }
  }

  /**
   * Get user's color customizations (overrides)
   */
  getUserOverrides(): Partial<CustomThemeColors> {
    try {
      const stored = localStorage.getItem(OVERRIDES_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error("[ThemeStore] Failed to parse overrides", e);
      return {};
    }
  }

  /**
   * Save user's color customizations
   */
  saveUserOverrides(overrides: Partial<CustomThemeColors>): void {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  }

  /**
   * Clear all user overrides
   */
  clearUserOverrides(): void {
    localStorage.removeItem(OVERRIDES_KEY);
  }
}

export const themeStore = new ThemeStore();
