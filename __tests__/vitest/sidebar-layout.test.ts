import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebarHeader = readFileSync(new URL("../../src/features/notes/sidebar/SidebarHeader.tsx", import.meta.url), "utf8");
const appNav = readFileSync(new URL("../../src/features/notes/sidebar/AppNav.tsx", import.meta.url), "utf8");
const noteTree = readFileSync(new URL("../../src/features/notes/sidebar/NoteTree.tsx", import.meta.url), "utf8");

describe("sidebar layout contract", () => {
  it("keeps the header search-first without duplicate creation or tree controls", () => {
    expect(sidebarHeader).toContain('aria-label="Search notes"');
    expect(sidebarHeader).toContain("sidebar-vault-row");
    expect(sidebarHeader).not.toContain('aria-label="New note"');
    expect(sidebarHeader).not.toContain('aria-label="New folder"');
    expect(sidebarHeader).not.toContain('title="Expand all"');
    expect(sidebarHeader).not.toContain('title="Collapse all"');
  });

  it("keeps creation discoverable from repository context menus", () => {
    expect(noteTree).toContain("New note");
    expect(noteTree).toContain("New folder");
  });

  it("uses one flat navigation region for Sitku spaces", () => {
    expect(appNav).toContain('aria-label="Sitku spaces"');
    expect(appNav).toContain("sidebar-app-nav");
    expect(appNav).not.toContain("NAV_TILE");
  });
});
