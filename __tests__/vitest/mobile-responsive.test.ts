import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { nativePlatform, nativeViewTransition } from "../../src/lib/nativeExperience";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("mobile workspace contract", () => {
  it("falls back safely when native browser capabilities are unavailable", () => {
    let updated = false;
    expect(nativePlatform()).toBe("web");
    nativeViewTransition("forward", () => { updated = true; });
    expect(updated).toBe(true);
  });

  it("uses a viewport-bound settings surface with mobile navigation", () => {
    const modals = read("src/pages/workspace/WorkspaceModals.tsx");
    const css = read("src/index.css");

    expect(modals).toContain("settings-dialog");
    expect(modals).toContain("settings-mobile-header");
    expect(modals).toContain("settings-mobile-tabs");
    expect(modals).toContain('aria-label="Close settings"');
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("height: 100dvh !important");
    expect(css).toContain("translate: none !important");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain('.settings-scroll > [data-radix-scroll-area-viewport]');
    expect(css).toContain("display: block !important");
    expect(css).toContain("--settings-mobile-page-title: 22px");
    expect(css).toContain("--settings-mobile-section-title: 15px");
    expect(css).toContain("--settings-mobile-body: 13px");
    expect(css).toContain("--settings-mobile-caption: 11px");
    expect(css).toContain(".settings-page input");
    expect(css).toContain("font-size: 16px");
    expect(modals).toContain("viewport.scrollLeft = 0");
    expect(modals).toContain('width: "100dvw"');
  });

  it("opens on a full-screen E.V dashboard without persistent bottom navigation", () => {
    const layout = read("src/pages/workspace/WorkspaceLayout.tsx");
    const dashboard = read("src/features/ev-voice/ui/EvMobileDashboard.tsx");
    const jarvis = read("src/features/jarvis/ui/Jarvis.tsx");
    const css = read("src/index.css");

    expect(layout).toContain("EvMobileDashboard");
    expect(layout).not.toContain("mobile-tab-bar");
    expect(layout).not.toContain("mobile-tab-item");
    expect(dashboard).toContain('aria-label="E.V home dashboard"');
    expect(dashboard).toContain("EvSpeechOrb");
    expect(dashboard).not.toContain("ev-mobile-orb-launcher");
    expect(dashboard).toContain("Personal CFO");
    expect(dashboard).toContain("Consultant");
    expect(dashboard).not.toContain("Recent notes");
    expect(dashboard).not.toContain("Search workspace");
    expect(dashboard).not.toContain('label="New note"');
    expect(dashboard.match(/label="Notes"/g)).toHaveLength(1);
    expect(jarvis).toContain("jarvis-launcher");
    expect(jarvis).toContain('window.addEventListener("beebot:ev-open"');
    expect(css).toContain("safe-area-inset-bottom");
    expect(css).toContain(".ev-mobile-home");
    expect(css).toContain('body:has(.bb-shell[data-mobile-view="home"]) .jarvis-launcher');
    expect(css).toContain("body:has(.settings-dialog) .jarvis-launcher");
    expect(css).toContain('body:has(.bb-shell[data-keyboard-open="true"]) .jarvis-launcher');
    expect(css).toContain('body:has(.bb-shell[data-mobile-view="agent"]) .jarvis-launcher');
    expect(css).not.toContain(".mobile-tab-bar");
    expect(css).toContain('data-dialog-layout="centered"');
    expect(css).toContain("bb-native-sheet-in");
  });

  it("keeps the complete desktop E.V action console available on phones", () => {
    const consoleSource = read("src/features/jarvis/ui/Jarvis.tsx");
    const css = read("src/index.css");

    expect(consoleSource).toContain("E.V response");
    expect(consoleSource).toContain("Action journal");
    expect(consoleSource).toContain("Action approval");
    expect(consoleSource).toContain("အတည်ပြု · Approve");
    expect(consoleSource).toContain("ငြင်းပယ် · Deny");
    expect(css).not.toMatch(/\.ev-voice-header-readouts\s*>\s*span\s*\{\s*display:\s*none/);
    expect(css).not.toMatch(/\.ev-voice-core-readouts\s*\{\s*display:\s*none/);
    expect(css).not.toMatch(/\.ev-voice-session-bar\s*>\s*span:nth-child\(2\)\s*\{\s*display:\s*none/);
    expect(css).toContain(".ev-voice-confirm-dialog {");
    expect(css).toContain("position: fixed;");
  });

  it("removes desktop chrome and protects editor content on phones", () => {
    const sidebar = read("src/features/notes/sidebar/SidebarHeader.tsx");
    const editor = read("src/pages/workspace/NoteEditorPanel.tsx");
    const css = read("src/index.css");

    expect(sidebar).toContain("mobile-window-controls");
    expect(sidebar).toContain("sidebar-mobile-home");
    expect(sidebar).toContain("Open E.V home");
    expect(css).toContain(".mobile-window-controls");
    expect(css).toContain("display: none !important");
    expect(editor).toContain("mx-auto w-full px-4 pt-5");
    expect(editor).toContain('editorMode === "edit" ? "overflow-hidden" : "overflow-y-auto"');
    expect(editor).toContain('editorMode === "edit" ? "flex h-full min-h-0 flex-col pb-0" : "pb-28 sm:pb-24"');
    expect(editor).toContain("bb-mobile-editor-scroll");
    expect(editor).toContain("bb-mobile-editor-toolbar");
    expect(editor).toContain("bb-mobile-segmented");
    expect(editor).toContain('viewTransitionName: "bb-mobile-scene"');
  });

  it("enables native macOS scroll physics without changing other platforms", () => {
    const electron = read("electron/main.mjs");
    expect(electron).toContain('scrollBounce: process.platform === "darwin"');
  });
});
