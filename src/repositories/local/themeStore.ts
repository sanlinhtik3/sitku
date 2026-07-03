import { CustomTheme, CustomThemeColors, FLAT_DARK_THEME } from "@/lib/theme/themeEngine";

const THEMES_KEY = "workspace.custom_themes";
const OVERRIDES_KEY = "workspace.theme_overrides";
const REMOVED_KEY = "workspace.removed_system_themes";

class ThemeStore {
  /**
   * Get all installed themes (Default Custom Themes + User Imported Themes)
   */
  /** IDs of seeded "system" themes the user has uninstalled (kept hidden across reloads). */
  getRemovedSystemThemeIds(): string[] {
    try {
      const stored = localStorage.getItem(REMOVED_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  getThemes(): CustomTheme[] {
    try {
      const stored = localStorage.getItem(THEMES_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      // Seeded system themes are available unless the user uninstalled them.
      const removed = this.getRemovedSystemThemeIds();
      const systemThemes = [FLAT_DARK_THEME].filter((sys) => !removed.includes(sys.id));

      const customThemes = parsed.filter(
        (t: CustomTheme) => t.id !== FLAT_DARK_THEME.id
      );

      return [...systemThemes, ...customThemes];
    } catch (e) {
      console.error("[ThemeStore] Failed to parse themes", e);
      return [FLAT_DARK_THEME];
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
  saveTheme(theme: CustomTheme): void {
    const themes = this.getThemes();
    const existingIndex = themes.findIndex((t) => t.id === theme.id);
    
    if (existingIndex >= 0) {
      themes[existingIndex] = theme;
    } else {
      themes.push(theme);
    }
    
    localStorage.setItem(THEMES_KEY, JSON.stringify(themes));
  }

  /**
   * Delete/uninstall a theme. Seeded system themes (e.g. Flat Dark) can't be erased from
   * code, so they're recorded as "removed" and hidden by getThemes() across reloads.
   */
  deleteTheme(id: string): void {
    if (id === FLAT_DARK_THEME.id) {
      const removed = this.getRemovedSystemThemeIds();
      if (!removed.includes(id)) {
        localStorage.setItem(REMOVED_KEY, JSON.stringify([...removed, id]));
      }
      return;
    }

    const stored = localStorage.getItem(THEMES_KEY);
    const parsed: CustomTheme[] = stored ? JSON.parse(stored) : [];
    const filtered = parsed.filter((t) => t.id !== id);
    localStorage.setItem(THEMES_KEY, JSON.stringify(filtered));
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
