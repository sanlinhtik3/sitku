import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nativeCanvasColor } from "../../src/lib/desktopChrome";

describe("native desktop chrome", () => {
  it("normalizes theme canvas colors for Electron", () => {
    expect(nativeCanvasColor("#161925")).toBe("#161925");
    expect(nativeCanvasColor("#ABC")).toBe("#aabbcc");
    expect(nativeCanvasColor("rgb(22, 25, 37)")).toBe("#161925");
    expect(nativeCanvasColor("rgba(22, 25, 37, 0.8)")).toBe("#161925");
  });

  it("rejects values Electron should not receive", () => {
    expect(nativeCanvasColor("transparent")).toBeNull();
    expect(nativeCanvasColor("var(--bb-bg-0)")).toBeNull();
    expect(nativeCanvasColor("not-a-color")).toBeNull();
  });

  it("keeps fullscreen product rooms out of centered-dialog transforms", () => {
    const dialog = readFileSync(resolve("src/components/ui/dialog.tsx"), "utf8");
    const cfo = readFileSync(resolve("src/components/dashboard/FlowStateDialog.tsx"), "utf8");
    const css = readFileSync(resolve("src/index.css"), "utf8");

    expect(dialog).toContain('layout?: "centered" | "fullscreen"');
    expect(dialog).toContain("data-dialog-layout={layout}");
    expect(cfo).toContain('<DialogContent layout="fullscreen"');
    expect(css).toContain('.bb-dialog-surface[data-dialog-layout="centered"][data-state="open"]');
    expect(css).toContain('.bb-dialog-surface[data-dialog-layout="fullscreen"][data-state="open"]');
    expect(css).toContain("@keyframes bb-native-fullscreen-in { from { opacity: 0; } to { opacity: 1; } }");
    expect(css).toContain("from { opacity: 0; transform: translateY(5px) scale(.985); }");
    expect(css).not.toContain("transform: translate(-50%, calc(-50% + 5px))");
  });

  it("reserves native traffic-light space in both product room headers", () => {
    const cfo = readFileSync(resolve("src/components/dashboard/FlowStateDialog.tsx"), "utf8");
    const consultant = readFileSync(resolve("src/components/agent-chat/consultant/parts/WelcomeHeader.tsx"), "utf8");
    const css = readFileSync(resolve("src/index.css"), "utf8");

    for (const source of [cfo, consultant]) {
      expect(source).toContain("native-titlebar-safe");
      expect(source).toContain("native-titlebar-drag");
      expect(source).toContain("native-titlebar-interactive");
    }
    expect(css).toContain('html[data-desktop-shell="true"] .native-titlebar-safe');
    expect(css).toContain("calc(var(--titlebar-safe, 0px) + 12px");
    expect(css).toContain("-webkit-app-region: no-drag");
  });

  it("uses an edge-to-edge desktop workspace instead of nesting traffic lights in a floating card", () => {
    const sidebar = readFileSync(resolve("src/pages/workspace/SidebarNavigation.tsx"), "utf8");
    const editor = readFileSync(resolve("src/pages/workspace/NoteEditorPanel.tsx"), "utf8");

    expect(sidebar).toContain('isDesktopShell');
    expect(sidebar).toContain('"m-0 rounded-none border-solid shadow-none"');
    expect(sidebar).toContain('borderRightWidth: "var(--bb-sb-border-right, 0.5px)"');
    expect(sidebar).toContain('borderTopWidth: 0');
    expect(editor).toContain('isDesktopShell ? "flex-1" : "flex-1 mt-[10px]"');
  });

  it("reclaims the native traffic-light gutter only in true fullscreen", () => {
    const sidebar = readFileSync(resolve("src/features/notes/sidebar/SidebarHeader.tsx"), "utf8");
    const css = readFileSync(resolve("src/index.css"), "utf8");

    expect(sidebar).toContain("sidebar-native-titlebar-row");
    expect(css).toContain('[data-window-fullscreen="true"] .sidebar-native-titlebar-row');
    expect(css).toContain("height: 0 !important");
    expect(css).toContain('[data-window-fullscreen="true"] .sidebar-vault-row');
    expect(css).not.toContain('[data-window-maximized="true"] .sidebar-native-titlebar-row');
  });

  it("uses native window state and macOS document state", () => {
    const main = readFileSync(resolve("electron/main.mjs"), "utf8");
    const preload = readFileSync(resolve("electron/preload.cjs"), "utf8");
    const chrome = readFileSync(resolve("src/lib/desktopChrome.ts"), "utf8");
    const workspace = readFileSync(resolve("src/pages/KnowledgeWorkspacePage.tsx"), "utf8");

    expect(main).toContain("show: false");
    expect(main).toContain('titleBarStyle: "hiddenInset"');
    expect(main).not.toContain("trafficLightPosition:");
    expect(main).toContain("setWindowButtonPosition?.(null)");
    expect(main).toContain('mainWindow.once("ready-to-show"');
    expect(main).toContain('mainWindow.setDocumentEdited?.(Boolean(state.edited))');
    expect(main).toContain("mainWindow.setRepresentedFilename?.(represented)");
    expect(preload).toContain("onWindowState:");
    expect(preload).toContain("setDocumentState:");
    expect(chrome).toContain("window.beebotDesktop.onWindowState?.(syncWindowState)");
    expect(workspace).toContain("window.beebotDesktop?.setDocumentState?.({ path: activePath, edited: isDirty })");
  });

  it("attaches the optional SwiftUI/AppKit chrome bridge with an Electron fallback", () => {
    const main = readFileSync(resolve("electron/main.mjs"), "utf8");
    const preload = readFileSync(resolve("electron/preload.cjs"), "utf8");
    const bridge = readFileSync(resolve("electron/native/macos/bridge.mjs"), "utf8");
    const swift = readFileSync(resolve("electron/native/macos/SitkuNativeChrome.swift"), "utf8");
    const build = readFileSync(resolve("electron/scripts/build-renderer.mjs"), "utf8");

    expect(main).toContain("createMacNativeChromeBridge");
    expect(main).toContain("nativeChrome.attach(mainWindow)");
    expect(main).toContain('ipcMain.handle("beebot:native-chrome-status"');
    expect(main).toContain("app.requestSingleInstanceLock()");
    expect(preload).toContain("nativeChromeStatus:");
    expect(preload).toContain("performNativeHaptic:");
    expect(bridge).toContain('if (process.platform !== "darwin") return unavailable("macOS only")');
    expect(bridge).toContain("window.getNativeWindowHandle()");
    expect(swift).toContain("NSHostingView");
    expect(swift).toContain("NSVisualEffectView");
    expect(swift).toContain("NSHapticFeedbackManager");
    expect(build).toContain("build-native-macos.mjs");
  });

  it("routes native menus through the active workspace", () => {
    const main = readFileSync(resolve("electron/main.mjs"), "utf8");
    const preload = readFileSync(resolve("electron/preload.cjs"), "utf8");
    const workspace = readFileSync(resolve("src/pages/KnowledgeWorkspacePage.tsx"), "utf8");
    const editor = readFileSync(resolve("src/pages/workspace/NoteEditorPanel.tsx"), "utf8");

    expect(main).toContain('mainWindow.webContents.on("context-menu"');
    expect(main).toContain("showDefinitionForSelection()");
    expect(main).toContain('label: "Formatting"');
    expect(main).toContain('label: "Paragraph"');
    expect(main).toContain('label: "Insert"');
    expect(main).toContain('params.formControlType === "none"');
    expect(main).toContain('`format:${command}`');
    expect(main).toContain('mainWindow?.webContents.send("beebot:desktop-command", command)');
    expect(main).toContain('label: "New Note", accelerator: "CmdOrCtrl+N"');
    expect(main).toContain('label: "Save", accelerator: "CmdOrCtrl+S"');
    expect(preload).toContain("onDesktopCommand:");
    expect(preload).toContain("setNativeContextMenus:");
    expect(workspace).toContain("window.beebotDesktop?.onDesktopCommand?.((command)");
    expect(workspace).toContain("window.beebotDesktop?.setNativeContextMenus?.(appearanceSettings.nativeMenus)");
    expect(editor).toContain("disabled={Boolean(window.beebotDesktop && appearanceSettings.nativeMenus)}");
    expect(editor).toContain('command.startsWith("format:")');
    expect(editor).not.toContain("EditorFormattingBar");
  });

  it("uses San Francisco for the default macOS interface without overriding custom fonts", () => {
    const workspace = readFileSync(resolve("src/pages/KnowledgeWorkspacePage.tsx"), "utf8");
    expect(workspace).toContain('interfaceFonts: ["SF Pro Text", "-apple-system", "Helvetica Neue", "Arial"]');
    expect(workspace).toContain("usesLegacyDefault");
  });

  it("does not register the web PWA service worker inside Electron", () => {
    const prompt = readFileSync(resolve("src/components/PWAUpdatePrompt.tsx"), "utf8");

    expect(prompt).toContain("window.location.protocol === 'file:'");
    expect(prompt).toContain("beebotDesktop");
    expect(prompt).toContain("isDesktopRuntime ? null : <PWAUpdateRegistration />");
  });

  it("allows local and remote HTTP/WebSocket connections in Content-Security-Policy", () => {
    const mainMjs = readFileSync(resolve("electron/main.mjs"), "utf8");
    expect(mainMjs).toContain("connect-src 'self' http: https: wss: ws:;");
  });

  it("sanitizes objects passed over IPC to prevent cloning errors in Electron preload", () => {
    const preloadCjs = readFileSync(resolve("electron/preload.cjs"), "utf8");
    expect(preloadCjs).toContain("function sanitizeCloneable(obj)");
    expect(preloadCjs).toContain("sanitizeCloneable(rawInput)");
  });
});
