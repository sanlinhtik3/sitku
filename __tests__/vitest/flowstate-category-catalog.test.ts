import { describe, expect, it } from "vitest";
import {
  CATEGORY_GROUP_ORDER,
  SYSTEM_CATEGORY_CATALOG,
  SYSTEM_CATEGORY_CATALOG_VERSION,
  categorySearchText,
  isLegacyBroadSystemCategory,
} from "@/lib/flowstate/categoryCatalog";

describe("Personal CFO system category catalog", () => {
  it("uses stable unique ids and slugs", () => {
    expect(SYSTEM_CATEGORY_CATALOG_VERSION).toBeGreaterThan(1);
    expect(new Set(SYSTEM_CATEGORY_CATALOG.map((category) => category.id)).size)
      .toBe(SYSTEM_CATEGORY_CATALOG.length);
    expect(new Set(SYSTEM_CATEGORY_CATALOG.map((category) => `${category.type}:${category.slug}`)).size)
      .toBe(SYSTEM_CATEGORY_CATALOG.length);
    expect(SYSTEM_CATEGORY_CATALOG.every((category) => category.id.startsWith("flowstate-system-"))).toBe(true);
  });

  it("replaces ambiguous recording choices with common specific categories", () => {
    const names = new Set(SYSTEM_CATEGORY_CATALOG.map((category) => category.name));
    expect(names.has("Electricity Bill")).toBe(true);
    expect(names.has("Water Bill")).toBe(true);
    expect(names.has("Home / Apartment Rent")).toBe(true);
    expect(names.has("Office / Shop Rent")).toBe(true);
    expect(names.has("Groceries & Market")).toBe(true);
    expect(names.has("Restaurant & Dining")).toBe(true);
    expect(names.has("Snacks")).toBe(true);
  });

  it("provides icon, bilingual group and search metadata for every category", () => {
    expect(CATEGORY_GROUP_ORDER.length).toBeGreaterThanOrEqual(10);
    for (const category of SYSTEM_CATEGORY_CATALOG) {
      expect(category.icon).not.toBe("");
      expect(category.group).not.toBe("");
      expect(category.group_my).not.toBe("");
      expect(category.name_my).not.toBe("");
      expect(category.sort_order).toBeGreaterThan(0);
    }

    const electricity = SYSTEM_CATEGORY_CATALOG.find((category) => category.slug === "electricity");
    expect(categorySearchText(electricity!)).toContain("မီတာခ");
    expect(categorySearchText(electricity!)).toContain("meter");
  });

  it("keeps legacy broad categories in storage while excluding them from new choices", () => {
    expect(isLegacyBroadSystemCategory({
      id: "legacy-food-id",
      is_system: true,
      name: "Food",
    } as any)).toBe(true);
    expect(isLegacyBroadSystemCategory(SYSTEM_CATEGORY_CATALOG[0])).toBe(false);
    expect(isLegacyBroadSystemCategory({
      id: "custom-food-id",
      is_system: false,
      name: "Food",
    } as any)).toBe(false);
  });
});
