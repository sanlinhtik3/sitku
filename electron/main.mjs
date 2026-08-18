import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, safeStorage, session, shell } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createLocalRuntime, SystemStorage } from "./local-runtime.mjs";
import { createMcpManager } from "./mcp-manager.mjs";
import { createEvProvider } from "./ev-provider.mjs";
import { createTavilyProvider } from "./tavily-provider.mjs";
import { createNotionMcpClient } from "./notion-mcp-client.mjs";
import { createEvTerminalService } from "./ev-terminal.mjs";
import { LocalObservabilityService } from "./observability.mjs";
import { DATA_TOOLS, setWebContentsGetter, handleReply } from "./mcp-data-bridge.mjs";
import { createMacNativeChromeBridge } from "./native/macos/bridge.mjs";
import electronUpdater from "electron-updater";

// electron-updater is CommonJS — grab autoUpdater off the default export.
const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const appName = "Sitku Agent";
let evTerminalService = null;
let observability = null;
const getObservability = () => {
  if (!observability) {
    observability = new LocalObservabilityService({ rootDir: app.getPath("userData") });
  }
  return observability;
};
const getEvTerminalService = () => {
  if (!evTerminalService) {
    evTerminalService = createEvTerminalService({
      homeDir: app.getPath("home"),
      auditPath: path.join(app.getPath("userData"), "ev-terminal-audit.jsonl"),
    });
  }
  return evTerminalService;
};
const DEFAULT_SYSTEM_FONTS = [
  "SF Pro Text",
  "SF Pro Display",
  "New York",
  "Helvetica Neue",
  "Arial",
  "Avenir Next",
  "Menlo",
  "SF Mono",
  "Monaco",
  "Myanmar Sangam MN",
  "Noto Sans Myanmar",
  "Pyidaungsu",
  "Z06-Walone",
  "Inter",
];
const FONT_NAME_KEYS = new Set([
  "_name",
  "name",
  "family",
  "font_family",
  "display_name",
  "fullname",
  "full_name",
  "postscript_name",
]);

app.setName(appName);
const ownsAppInstanceLock = app.requestSingleInstanceLock();
if (!ownsAppInstanceLock) app.quit();

let mainWindow = null;
let isQuitting = false;
let runtime = null;
const activeStreams = new Map();
const activeJarvisStreams = new Map();
const activeJarvisRequests = new Map();
const activeTavilyRequests = new Map();
let evProvider = null;
let tavilyProvider = null;
let cachedSystemFonts = null;
let nativeContextMenus = true;
const nativeChrome = createMacNativeChromeBridge();

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

function normalizeFontName(value) {
  if (typeof value !== "string") return null;
  const fontName = value.trim().replace(/\s+/g, " ");
  if (!fontName || fontName.length > 96) return null;
  if (fontName.startsWith(".")) return null;
  if (/[\\/]/.test(fontName)) return null;
  if (/\.(ttf|ttc|otf|dfont|woff2?)$/i.test(fontName)) return null;
  if (/^(yes|no|enabled|disabled|regular|normal)$/i.test(fontName)) return null;
  return fontName;
}

function addFontName(fonts, value) {
  const fontName = normalizeFontName(value);
  if (fontName) fonts.add(fontName);
}

function collectFontNames(value, fonts, key = "") {
  if (Array.isArray(value)) {
    value.forEach((item) => collectFontNames(item, fonts, key));
    return;
  }
  if (!value || typeof value !== "object") {
    if (FONT_NAME_KEYS.has(key.toLowerCase())) addFontName(fonts, value);
    return;
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    const normalizedKey = childKey.toLowerCase();
    if (FONT_NAME_KEYS.has(normalizedKey)) addFontName(fonts, childValue);
    collectFontNames(childValue, fonts, normalizedKey);
  }
}

async function addFontsFromDirectories(fonts) {
  const directories = [
    "/System/Library/Fonts",
    "/System/Library/Fonts/Supplemental",
    "/Library/Fonts",
    path.join(os.homedir(), "Library/Fonts"),
  ];
  for (const directory of directories) {
    try {
      const entries = await fs.promises.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!/\.(ttf|ttc|otf|dfont)$/i.test(entry.name)) continue;
        addFontName(fonts, entry.name.replace(/\.(ttf|ttc|otf|dfont)$/i, ""));
      }
    } catch {
      // Some system font folders are not present on every OS version.
    }
  }
}

async function addMacSystemProfilerFonts(fonts) {
  const { stdout } = await execFileAsync("/usr/sbin/system_profiler", ["SPFontsDataType", "-json"], {
    maxBuffer: 24 * 1024 * 1024,
    timeout: 15000,
  });
  const parsed = JSON.parse(stdout);
  collectFontNames(parsed.SPFontsDataType, fonts);
}

async function addFontConfigFonts(fonts) {
  const { stdout } = await execFileAsync("fc-list", [":", "family"], {
    maxBuffer: 12 * 1024 * 1024,
    timeout: 10000,
  });
  stdout.split("\n").forEach((line) => {
    line.split(",").forEach((font) => addFontName(fonts, font));
  });
}

async function addWindowsFonts(fonts) {
  const command = "Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts' | ConvertTo-Json";
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", command], {
    maxBuffer: 12 * 1024 * 1024,
    timeout: 10000,
  });
  const parsed = JSON.parse(stdout);
  collectFontNames(parsed, fonts);
}

async function listSystemFonts() {
  if (cachedSystemFonts) return cachedSystemFonts;
  const fonts = new Set(DEFAULT_SYSTEM_FONTS);

  try {
    if (process.platform === "darwin") {
      await addMacSystemProfilerFonts(fonts);
      await addFontsFromDirectories(fonts);
    } else if (process.platform === "win32") {
      await addWindowsFonts(fonts);
    } else {
      await addFontConfigFonts(fonts);
    }
  } catch (error) {
    console.warn("[BeeBot] Falling back to default font list", error);
    if (process.platform === "darwin") await addFontsFromDirectories(fonts);
  }

  cachedSystemFonts = [...fonts].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return cachedSystemFonts;
}

function getRuntime() {
  if (!runtime) {
    // Hidden, user-owned storage root: ~/.sitku (migrated from .cute-agent).
    // App data, config, and cache all live here, split by concern.
    const homeDir = app.getPath("home");
    const oldDir = path.join(homeDir, ".cute-agent");
    const rootDir = path.join(homeDir, ".sitku");
    if (!fs.existsSync(rootDir) && fs.existsSync(oldDir)) {
      try { fs.renameSync(oldDir, rootDir); } catch (error) { console.warn("[Sitku] Failed to rename .cute-agent", error); }
    }
    fs.mkdirSync(rootDir, { recursive: true });
    const storage = new SystemStorage(rootDir);
    runtime = createLocalRuntime({
      storage,
      dbPath: path.join(rootDir, "sitku-agent.sqlite"),
      settingsPath: path.join(rootDir, "app.json"), // legacy fallback path
      desktop: {
        async chooseExistingVault() {
          const result = await dialog.showOpenDialog(mainWindow, {
            title: "Open Sitku Vault",
            properties: ["openDirectory"],
          });
          return result.canceled ? null : result.filePaths[0] || null;
        },
        async chooseVaultParent() {
          const result = await dialog.showOpenDialog(mainWindow, {
            title: "Choose Vault Location",
            properties: ["openDirectory", "createDirectory"],
          });
          return result.canceled ? null : result.filePaths[0] || null;
        },
        async revealPath(targetPath) {
          // showItemInFolder: opens Finder/Explorer and HIGHLIGHTS the file
          // (the actual "Reveal in Finder" UX). openPath would LAUNCH the file
          // in its default app (e.g. open a .md in the editor) — wrong vibe.
          shell.showItemInFolder(targetPath);
        },
      },
    });
  }
  return runtime;
}

function getEvProvider() {
  if (!evProvider) {
    const rootDir = path.join(app.getPath("home"), ".sitku");
    fs.mkdirSync(rootDir, { recursive: true });
    evProvider = createEvProvider({ rootDir, safeStorage });
  }
  return evProvider;
}

function getTavilyProvider() {
  if (!tavilyProvider) {
    const rootDir = path.join(app.getPath("home"), ".sitku");
    fs.mkdirSync(rootDir, { recursive: true });
    tavilyProvider = createTavilyProvider({
      rootDir,
      safeStorage,
      auditPath: path.join(app.getPath("userData"), "tavily-audit.jsonl"),
    });
  }
  return tavilyProvider;
}

// ── App-hosted MCP server (agentic AI over HTTP on localhost) ──
let mcp = null; // MCP manager: on/off + per-client tokens + activity (see mcp-manager.mjs)
let notionMcp = null;

function getNotionMcp() {
  if (!notionMcp) {
    notionMcp = createNotionMcpClient({
      rootDir: path.join(app.getPath("home"), ".sitku"),
      safeStorage,
      shell,
      onAudit: ({ event, metadata }) => getObservability().record({
        domain: "notion",
        event,
        status: /failed/.test(event) ? "failed" : "completed",
        metadata,
      }),
    });
  }
  return notionMcp;
}

/** Active vault path, resolved exactly like the standalone stdio server (mcp/sitku-mcp.mjs) so
 *  both target the same notes. Re-read each call so switching vaults in the app is picked up live. */
function getActiveVaultPath() {
  const rootDir = path.join(app.getPath("home"), ".sitku");
  try {
    const j = JSON.parse(fs.readFileSync(path.join(rootDir, "workspace.json"), "utf8"));
    const p = j["workspace.vaultPath"] || j.vaultPath;
    if (p) return path.resolve(String(p));
  } catch { /* no workspace.json yet → app default */ }
  return path.join(rootDir, "vault");
}

function createWindow() {
  const initialDark = nativeTheme.shouldUseDarkColors;
  mainWindow = new BrowserWindow({
    show: false,
    width: 1320,
    height: 900,
    minWidth: 640,
    minHeight: 600,
    title: "Sitku Agent",
    // Match the workspace canvas so there's no white flash on cold launch /
    // dark→light transitions. Updated live via the nativeTheme listener below.
    backgroundColor: initialDark ? "#0a0a0b" : "#ffffff",
    // macOS Sequoia vibrancy. `under-window` (Electron ≥ 23) attaches an
    // NSVisualEffectView behind the web contents so the wallpaper bleeds
    // through any translucent CSS surfaces. Less buggy with resize than the
    // legacy `sidebar` material. Gated by macOS — on other OSes Electron
    // ignores the option, and the CSS .bb-glass fallback (gradient mesh)
    // still gives a comparable look.
    vibrancy: process.platform === "darwin" ? "under-window" : undefined,
    // Let macOS naturally soften vibrancy when the window is inactive instead
    // of leaving a visually "focused" window behind another app.
    visualEffectState: "followWindow",
    resizable: true,
    movable: true,
    maximizable: true,
    minimizable: true,
    fullscreenable: true,
    closable: true,
    roundedCorners: true,
    acceptFirstMouse: true,
    titleBarStyle: "hiddenInset",
    // Keep macOS in charge of traffic-light geometry. A custom fixed position
    // drifted across display scales and shell treatments; hiddenInset matches
    // native productivity apps and remains correct through OS updates.
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      scrollBounce: process.platform === "darwin",
    },
  });

  const attachNativeChrome = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const attached = nativeChrome.attach(mainWindow);
    if (process.platform === "darwin") {
      // AppKit attachment can update the titlebar style mask. Reset any custom
      // button position afterwards so the system hiddenInset layout wins.
      mainWindow.setWindowButtonPosition?.(null);
    }
    return attached;
  };
  attachNativeChrome();

  const publishWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("beebot:window-state", {
      active: mainWindow.isFocused(),
      fullscreen: mainWindow.isFullScreen(),
      maximized: mainWindow.isMaximized(),
    });
  };
  mainWindow.once("ready-to-show", () => {
    attachNativeChrome();
    mainWindow.show();
    publishWindowState();
  });
  for (const event of ["focus", "blur", "enter-full-screen", "leave-full-screen", "maximize", "unmaximize"]) {
    mainWindow.on(event, publishWindowState);
  }

  mainWindow.on("close", (e) => {
    if (process.platform === "darwin" && !isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Live theme follow: when macOS toggles dark/light, swap the chrome
  // background so the area outside the React shell (during reload / transitions)
  // never mismatches the in-app theme.
  const syncChromeTheme = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#0a0a0b" : "#ffffff");
    }
  };
  nativeTheme.on("updated", syncChromeTheme);
  mainWindow.once("closed", () => {
    nativeTheme.off("updated", syncChromeTheme);
    nativeChrome.detach();
  });

  // Open only http(s) links externally; block file:/custom-scheme/javascript: URLs.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // Never let the renderer navigate the window away from the bundled app. An external
  // http(s) link opens in the browser instead; anything else is dropped.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file://")) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  // console-message: new API passes a single Event object (the old positional
  // args were deprecated in Electron 30+). Fall back to the legacy fields if a
  // future Electron reverts the shape — non-fatal either way.
  mainWindow.webContents.on("console-message", (event) => {
    const levels = ["log", "warn", "error", "debug", "info"];
    const { level, message, sourceId, line } = event;
    console.log(`[Renderer:${levels[level] ?? level}] ${message} (${sourceId}:${line})`);
    const rendererLevel = levels[level] ?? "info";
    if (rendererLevel === "warn" || rendererLevel === "error") {
      getObservability().record({
        level: rendererLevel,
        domain: "renderer",
        event: "console",
        status: rendererLevel === "error" ? "failed" : "running",
        metadata: { sourceId, line },
      });
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`[Renderer] Failed to load ${validatedUrl}: ${errorCode} ${errorDescription}`);
    getObservability().record({
      level: "error",
      domain: "renderer",
      event: "load_failed",
      status: "failed",
      errorCode: String(errorCode),
      recovery: "Reload Sitku. If the failure persists, run npm run logs:doctor.",
      metadata: { sourceId: validatedUrl, errorName: errorDescription },
    });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[Renderer] Process gone", details);
    getObservability().record({
      level: "error",
      domain: "renderer",
      event: "process_gone",
      status: "interrupted",
      errorCode: "RENDERER_PROCESS_GONE",
      recovery: "Reopen Sitku and inspect recent errors before retrying the action.",
      metadata: details,
    });
  });

  // Chromium does not provide the native macOS text menu automatically. Keep
  // spelling suggestions and edit commands native across editors and forms.
  mainWindow.webContents.on("context-menu", (_event, params) => {
    if (!nativeContextMenus) return;
    const items = [];
    const suggestions = (params.dictionarySuggestions || []).slice(0, 5);
    const format = (command) => () => mainWindow?.webContents.send("beebot:desktop-command", `format:${command}`);

    if (params.misspelledWord) {
      if (suggestions.length) {
        for (const suggestion of suggestions) {
          items.push({
            label: suggestion,
            click: () => mainWindow?.webContents.replaceMisspelling(suggestion),
          });
        }
      } else {
        items.push({ label: "No Guesses Found", enabled: false });
      }
      items.push({
        label: "Learn Spelling",
        click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      items.push({ type: "separator" });
    }

    if (params.isEditable) {
      items.push(
        { role: "undo", enabled: params.editFlags.canUndo },
        { role: "redo", enabled: params.editFlags.canRedo },
        { type: "separator" },
        { role: "cut", enabled: params.editFlags.canCut },
        { role: "copy", enabled: params.editFlags.canCopy },
        { role: "paste", enabled: params.editFlags.canPaste },
        ...(process.platform === "darwin" ? [{ role: "pasteAndMatchStyle" }] : []),
        { role: "selectAll", enabled: params.editFlags.canSelectAll },
      );

      // formControlType "none" identifies CodeMirror's contenteditable surface,
      // keeping note formatting out of ordinary inputs and settings fields.
      if (params.formControlType === "none") {
        items.push(
          { type: "separator" },
          {
            label: "Formatting",
            submenu: [
              { label: "Bold", click: format("bold") },
              { label: "Italic", click: format("italic") },
              { label: "Strikethrough", click: format("strikethrough") },
              { label: "Highlight", click: format("highlight") },
              { label: "Inline Code", click: format("inline-code") },
              { label: "Link…", click: format("link") },
              { type: "separator" },
              { label: "Clear Formatting", click: format("clear") },
            ],
          },
          {
            label: "Paragraph",
            submenu: [
              { label: "Body", click: format("body") },
              {
                label: "Heading",
                submenu: [1, 2, 3, 4, 5, 6].map((level) => ({
                  label: `Heading ${level}`,
                  click: format(`heading-${level}`),
                })),
              },
              { type: "separator" },
              { label: "Bulleted List", click: format("bullet-list") },
              { label: "Numbered List", click: format("numbered-list") },
              { label: "Task List", click: format("task-list") },
              { label: "Quote", click: format("quote") },
            ],
          },
          {
            label: "Insert",
            submenu: [
              { label: "Callout", click: format("callout") },
              { label: "Table", click: format("table") },
              { label: "Code Block", click: format("code-block") },
              { label: "Inline Math", click: format("math") },
              { label: "Math Block", click: format("math-block") },
              { label: "Footnote", click: format("footnote") },
              { label: "Comment", click: format("comment") },
              { label: "Divider", click: format("horizontal-rule") },
            ],
          },
        );
      }
    } else if (params.selectionText) {
      items.push({ role: "copy" });
    }

    if (process.platform === "darwin" && params.selectionText) {
      items.push(
        { type: "separator" },
        {
          label: `Look Up “${params.selectionText.trim().slice(0, 42)}${params.selectionText.trim().length > 42 ? "…" : ""}”`,
          click: () => mainWindow?.webContents.showDefinitionForSelection(),
        },
        { label: "Speech", submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }] },
      );
    }

    if (/^https?:\/\//i.test(params.linkURL || "")) {
      if (items.length) items.push({ type: "separator" });
      items.push({ label: "Open Link in Browser", click: () => shell.openExternal(params.linkURL) });
      items.push({ label: "Copy Link", click: () => clipboard.writeText(params.linkURL) });
    }

    if (items.length) Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });

  const devUrl = process.env.SITKU_RENDERER_URL || process.env.PUTUTU_RENDERER_URL || process.env.BEEBOT_RENDERER_URL;
  if (devUrl) {
    mainWindow.loadURL(`${devUrl}/#/sitku`);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "/sitku" });
  }
}

ipcMain.handle("beebot:runtime-invoke", async (_event, request) => {
  const startedAt = Date.now();
  const domain = String(request?.domain || "runtime");
  const method = String(request?.method || "invoke");
  const input = request?.args?.[0];
  const turnId = input && typeof input === "object" && typeof input.turnId === "string" ? input.turnId : undefined;
  const traceId = input && typeof input === "object" && typeof input.traceId === "string" ? input.traceId : turnId;
  const important = domain === "jarvis"
    || domain === "evMemory"
    || (domain === "notes" && ["writeNote", "deleteNote", "createFolder", "deleteFolder", "renamePath"].includes(method));
  // Journal writes are useful in the local database but are not useful terminal
  // activity. The live E.V engine emits its own high-signal phase/tool events.
  const quietJournalMethod = domain === "jarvis" && ["begin", "update", "listRecent", "recoverInterrupted"].includes(method);

  if (important) {
    getObservability().record({ level: quietJournalMethod ? "debug" : "info", domain, event: `${method}.started`, traceId, turnId, status: "started" });
  }
  try {
    const result = await getRuntime().invoke(request);
    if (important) {
      getObservability().record({
        level: quietJournalMethod ? "debug" : "info",
        domain,
        event: `${method}.completed`,
        traceId,
        turnId,
        status: "completed",
        durationMs: Date.now() - startedAt,
      });
    }
    return result;
  } catch (error) {
    getObservability().record({
      level: "error",
      domain,
      event: `${method}.failed`,
      traceId,
      turnId,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorCode: "RUNTIME_INVOKE_FAILED",
      recovery: "Resolve the reported runtime error, then retry the action.",
      metadata: { errorName: error instanceof Error ? error.name : "Error" },
    });
    throw error;
  }
});

const RENDERER_LOG_DOMAINS = new Set(["ev"]);
ipcMain.on("beebot:observability-record", (_event, input = {}) => {
  if (!input || typeof input !== "object" || !RENDERER_LOG_DOMAINS.has(input.domain)) return;
  getObservability().record({
    level: input.level === "error" || input.level === "warn" ? input.level : "info",
    domain: input.domain,
    event: input.event,
    traceId: input.traceId,
    turnId: input.turnId,
    actionId: input.actionId,
    status: input.status,
    durationMs: input.durationMs,
    errorCode: input.errorCode,
    recovery: input.recovery,
    metadata: input.metadata,
  });
});

ipcMain.handle("beebot:jarvis-key-status", () => ({ hasKey: getEvProvider().hasKey() }));
ipcMain.handle("beebot:jarvis-key-set", (_event, key) => getEvProvider().setKey(key));
ipcMain.handle("beebot:ev-live-token", (_event, model, translation) => getEvProvider().createLiveToken(model, translation));
ipcMain.handle("beebot:tavily-key-status", () => ({ hasKey: getTavilyProvider().hasKey() }));
ipcMain.handle("beebot:tavily-key-set", (_event, key) => getTavilyProvider().setKey(key));
ipcMain.handle("beebot:tavily-test", (_event, request = {}) => getTavilyProvider().test(request));
ipcMain.handle("beebot:tavily-search", async (_event, request = {}) => {
  const requestId = String(request?.requestId || "");
  const controller = new AbortController();
  if (requestId) activeTavilyRequests.set(requestId, controller);
  const startedAt = Date.now();
  const searchMetadata = {
    searchDepth: String(request?.searchDepth || "basic"),
    maxResults: Math.max(1, Math.min(10, Number(request?.maxResults) || 5)),
    topic: String(request?.topic || "general"),
    timeRange: request?.timeRange ? String(request.timeRange) : undefined,
  };
  getObservability().record({
    domain: "tavily",
    event: "search.started",
    traceId: requestId,
    status: "started",
    metadata: searchMetadata,
  });
  try {
    const result = await getTavilyProvider().search({ ...request, signal: controller.signal });
    getObservability().record({
      level: result?.ok === false ? "error" : "info",
      domain: "tavily",
      event: result?.ok === false ? "search.failed" : "search.completed",
      traceId: requestId,
      status: result?.ok === false ? "failed" : "completed",
      durationMs: Date.now() - startedAt,
      errorCode: result?.ok === false ? String(result?.error?.code || "TAVILY_SEARCH_FAILED") : undefined,
      metadata: searchMetadata,
    });
    return result;
  } catch (error) {
    const tavilyErrorCode = String(error?.message || "").match(/^(TAVILY_[A-Z_]+)/)?.[1]
      || (error?.name === "AbortError" ? "CANCELLED" : "TAVILY_SEARCH_FAILED");
    getObservability().record({
      level: "error",
      domain: "tavily",
      event: "search.failed",
      traceId: requestId,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorCode: tavilyErrorCode,
      metadata: searchMetadata,
      recovery: error?.name === "AbortError"
        ? "Start a new search when ready."
        : /AUTH|KEY/.test(tavilyErrorCode)
          ? "Check the Tavily API key in Settings."
          : /RATE|CREDITS/.test(tavilyErrorCode)
            ? "Wait for the rate limit or check Tavily credits."
            : "The provider was retried automatically. Check the connection and retry.",
    });
    throw error;
  } finally {
    if (requestId) activeTavilyRequests.delete(requestId);
  }
});
ipcMain.handle("beebot:tavily-search-cancel", (_event, requestId) => {
  activeTavilyRequests.get(String(requestId || ""))?.abort();
  activeTavilyRequests.delete(String(requestId || ""));
  return { ok: true };
});
ipcMain.handle("beebot:notion-mcp-status", () => getNotionMcp().status());
ipcMain.handle("beebot:notion-mcp-connect", () => getNotionMcp().connect());
ipcMain.handle("beebot:notion-mcp-disconnect", () => getNotionMcp().disconnect());
ipcMain.handle("beebot:notion-mcp-list-tools", () => getNotionMcp().listTools());
ipcMain.handle("beebot:notion-mcp-call-tool", async (_event, input = {}) => {
  const startedAt = Date.now();
  const tool = String(input?.name || "");
  const executionId = String(input?.executionId || "");
  getObservability().record({ domain: "notion", event: "tool.started", traceId: executionId, actionId: tool, status: "started" });
  try {
    const result = await getNotionMcp().callTool(input);
    getObservability().record({
      domain: "notion",
      event: "tool.completed",
      traceId: executionId,
      actionId: tool,
      status: "completed",
      durationMs: Date.now() - startedAt,
      metadata: { policy: result.policy },
    });
    return { ok: true, ...result };
  } catch (error) {
    getObservability().record({
      level: "error",
      domain: "notion",
      event: "tool.failed",
      traceId: executionId,
      actionId: tool,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorCode: error?.code || "NOTION_MCP_ERROR",
      recovery: /AUTH|401|403/i.test(`${error?.code || ""} ${error?.message || ""}`)
        ? "Reconnect Notion MCP in Settings."
        : "Check the Notion connection and retry.",
    });
    return { ok: false, error: { code: error?.code || "NOTION_MCP_ERROR", message: String(error?.message || error).slice(0, 300) } };
  }
});
ipcMain.handle("beebot:ev-terminal-plan", async (_event, input) => {
  const result = await getEvTerminalService().plan(input);
  const traceId = String(input?.traceId || input?.turnId || result?.plan?.planId || "");
  getObservability().record({
    level: result?.ok ? "info" : "error",
    domain: "terminal",
    event: result?.ok ? "plan.completed" : "plan.failed",
    traceId,
    turnId: input?.turnId,
    actionId: result?.plan?.planId,
    status: result?.ok ? (result?.plan?.requiresConfirmation ? "awaiting_approval" : "completed") : "failed",
    errorCode: result?.error?.code,
    recovery: result?.recovery,
    metadata: result?.ok ? { risk: result.plan.risk } : {},
  });
  return result;
});
ipcMain.handle("beebot:ev-terminal-execute", async (_event, input) => {
  const startedAt = Date.now();
  const traceId = String(input?.traceId || input?.turnId || input?.executionId || input?.planId || "");
  getObservability().record({ domain: "terminal", event: "execute.started", traceId, turnId: input?.turnId, actionId: input?.executionId || input?.planId, status: "running" });
  const result = await getEvTerminalService().execute(input);
  getObservability().record({
    level: result?.ok ? "info" : "error",
    domain: "terminal",
    event: result?.ok ? "execute.completed" : "execute.failed",
    traceId,
    turnId: input?.turnId,
    actionId: result?.executionId || input?.executionId || input?.planId,
    status: result?.ok ? "completed" : "failed",
    durationMs: result?.durationMs ?? Date.now() - startedAt,
    errorCode: result?.error?.code,
    recovery: result?.recovery,
    metadata: { verified: result?.verified, exitCode: result?.exitCode, risk: result?.risk },
  });
  return result;
});
ipcMain.handle("beebot:ev-terminal-cancel", (_event, executionId) => {
  const result = getEvTerminalService().cancel(executionId);
  getObservability().record({
    level: result?.ok ? "info" : "warn",
    domain: "terminal",
    event: result?.ok ? "execute.cancelled" : "cancel.failed",
    traceId: String(executionId || ""),
    actionId: executionId,
    status: result?.ok ? "cancelled" : "failed",
    errorCode: result?.error?.code,
  });
  return result;
});

ipcMain.handle("beebot:jarvis-gemini", async (_event, request) => {
  const requestId = String(request?.requestId || "");
  const controller = new AbortController();
  if (requestId) activeJarvisRequests.set(requestId, controller);
  try {
    const response = await getEvProvider().request({ ...request, signal: controller.signal });
    return { ok: response.ok, status: response.status, body: await response.text() };
  } catch (error) {
    return { ok: false, status: 500, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (requestId) activeJarvisRequests.delete(requestId);
  }
});

ipcMain.handle("beebot:jarvis-gemini-cancel", (_event, requestId) => {
  activeJarvisRequests.get(String(requestId || ""))?.abort();
  activeJarvisRequests.delete(String(requestId || ""));
  return { ok: true };
});

ipcMain.handle("beebot:jarvis-stream-start", async (event, request = {}) => {
  const streamId = String(request.streamId || "");
  if (!streamId) return { ok: false, status: 400, error: "stream id required" };
  const controller = new AbortController();
  activeJarvisStreams.set(streamId, controller);
  try {
    const response = await getEvProvider().request({ ...request, stream: true, signal: controller.signal });
    if (!response.ok || !response.body) {
      activeJarvisStreams.delete(streamId);
      return { ok: false, status: response.status, error: await response.text() };
    }
    queueMicrotask(async () => {
      try {
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done || controller.signal.aborted) break;
          if (!event.sender.isDestroyed()) event.sender.send(`beebot:jarvis-stream:${streamId}:chunk`, Buffer.from(value));
        }
        if (!event.sender.isDestroyed()) event.sender.send(`beebot:jarvis-stream:${streamId}:done`);
      } catch (error) {
        if (!controller.signal.aborted && !event.sender.isDestroyed()) {
          event.sender.send(`beebot:jarvis-stream:${streamId}:error`, error instanceof Error ? error.message : String(error));
        }
      } finally {
        activeJarvisStreams.delete(streamId);
      }
    });
    return { ok: true, status: response.status };
  } catch (error) {
    activeJarvisStreams.delete(streamId);
    return { ok: false, status: 500, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("beebot:jarvis-stream-cancel", (_event, streamId) => {
  activeJarvisStreams.get(String(streamId || ""))?.abort();
  activeJarvisStreams.delete(String(streamId || ""));
  return { ok: true };
});

// Keep the native NSWindow backing surface in lockstep with custom themes.
// This removes the black/white flash during launch, theme previews, and resize.
ipcMain.on("beebot:set-window-background", (_event, color) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return;
  mainWindow.setBackgroundColor(color);
});

ipcMain.on("beebot:set-native-context-menus", (_event, enabled) => {
  nativeContextMenus = Boolean(enabled);
});

ipcMain.handle("beebot:native-chrome-status", () => nativeChrome.status());

ipcMain.on("beebot:set-native-appearance", (_event, mode) => {
  nativeChrome.setAppearance(mode);
});

ipcMain.on("beebot:native-haptic", (_event, kind) => {
  nativeChrome.performHaptic(kind);
});

ipcMain.on("beebot:set-document-state", (_event, state = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const notePath = typeof state.path === "string" ? state.path.trim() : "";
  if (!notePath) {
    mainWindow.setRepresentedFilename?.("");
    mainWindow.setDocumentEdited?.(false);
    mainWindow.setTitle("Sitku Agent");
    return;
  }
  if (path.isAbsolute(notePath)) return;
  const vault = path.resolve(getActiveVaultPath());
  const represented = path.resolve(vault, notePath);
  if (represented !== vault && !represented.startsWith(`${vault}${path.sep}`)) return;
  mainWindow.setRepresentedFilename?.(represented);
  mainWindow.setDocumentEdited?.(Boolean(state.edited));
  mainWindow.setTitle(`${path.basename(notePath, path.extname(notePath))} — Sitku`);
});

ipcMain.on("beebot:notes-emergency-save", (event, request = {}) => {
  try {
    event.returnValue = getRuntime().invoke({
      domain: "notes",
      method: "emergencySaveSync",
      args: [request.path, request.content, request.expectedHash],
    });
  } catch (error) {
    console.error("[notes] emergency journal failed", error);
    event.returnValue = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("beebot:list-fonts", async () => {
  return listSystemFonts();
});

ipcMain.handle("beebot:runtime-subscribe", async (event, request) => {
  const subscription = getRuntime().subscribe(request, (payload) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send(`beebot:runtime-event:${request.subscriptionId}`, payload);
    }
  });
  return { ok: true, subscriptionId: subscription.id };
});

ipcMain.handle("beebot:runtime-unsubscribe", async (_event, request) => {
  getRuntime().unsubscribe(request.subscriptionId);
  return { ok: true };
});

ipcMain.handle("beebot:runtime-stream-start", async (event, request) => {
  const { streamId } = request;
  const abortController = new AbortController();
  if (request.args?.[0]) request.args[0].signal = abortController.signal;
  try {
    const response = await getRuntime().invoke(request);
    activeStreams.set(streamId, { cancelled: false, abortController });

    queueMicrotask(async () => {
      try {
        for await (const chunk of response.readChunks()) {
          if (activeStreams.get(streamId)?.cancelled) break;
          if (!event.sender.isDestroyed()) {
            event.sender.send(`beebot:runtime-stream:${streamId}:chunk`, Buffer.from(chunk).toString("utf8"));
          }
        }
        if (!event.sender.isDestroyed()) {
          event.sender.send(`beebot:runtime-stream:${streamId}:done`);
        }
      } catch (error) {
        if (!event.sender.isDestroyed()) {
          event.sender.send(`beebot:runtime-stream:${streamId}:error`, {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        activeStreams.delete(streamId);
      }
    });

    return { ok: response.ok, status: response.status };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: {
        type: "provider_error",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
});

ipcMain.handle("beebot:runtime-stream-cancel", async (_event, request) => {
  const stream = activeStreams.get(request.streamId);
  if (stream) {
    stream.cancelled = true;
    stream.abortController?.abort();
  }
  return { ok: true };
});

app.whenReady().then(() => {
  if (!ownsAppInstanceLock) return;
  getObservability().record({
    domain: "app",
    event: "started",
    status: "started",
    metadata: { version: app.getVersion(), packaged: app.isPackaged, platform: process.platform },
  });
  // Content-Security-Policy for the production build. Dev (Vite HMR) needs
  // unsafe-eval + ws://, so we only enforce the strict policy when loading
  // the bundled dist/ files. Silences the "Insecure Content-Security-Policy"
  // Electron warning and genuinely hardens the renderer against XSS injection.
  const isDev = Boolean(
    process.env.SITKU_RENDERER_URL
    || process.env.PUTUTU_RENDERER_URL
    || process.env.BEEBOT_RENDERER_URL,
  );
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'sha256-LjLNEte3KaLUwI1U2BKwRgLOofcg35zFDQOu2+edC2Y=' blob:; " +
              "worker-src 'self' blob:; " +
              "style-src 'self' 'unsafe-inline' https:; " +
              "img-src 'self' data: blob: https:; " +
              "font-src 'self' data: https:; " +
              "connect-src 'self' http: https: wss: ws:; " +
              "media-src 'self' blob:; " +
              // frame-src blob: lets the native PDF viewer render pasted-PDF attachments.
              "frame-src 'self' blob:; " +
              "object-src 'none'; base-uri 'self'",
          ],
        },
      });
    });
  }

  // Allow-list for web permissions the renderer may request. A local note app needs almost
  // none — except local-fonts (font manager) and now 'media' (microphone) for the JARVIS
  // voice assistant. Without 'media' here, getUserMedia({audio:true}) is silently denied and
  // JARVIS can never ask for the mic. ponytail: keep this tight; grow only for real features.
  const ALLOWED_PERMISSIONS = new Set(["local-fonts", "media"]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));

  getRuntime();
  // Phase 2 finance/consultant tools round-trip to the renderer (IndexedDB) — give the bridge a live
  // getter for the window's webContents, and route replies back to it.
  setWebContentsGetter(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null));
  const mcpNotes = {
    listNotes: (input) => getRuntime().invoke({ domain: "notes", method: "listNotes", args: [input || {}] }),
    readNote: (notePath) => getRuntime().invoke({ domain: "notes", method: "readNote", args: [notePath] }),
    writeNote: (input) => getRuntime().invoke({ domain: "notes", method: "writeNote", args: [input] }),
    search: (query, limit) => getRuntime().invoke({ domain: "search", method: "search", args: [query, limit] }),
  };
  mcp = createMcpManager({
    rootDir: path.join(app.getPath("home"), ".sitku"),
    getVault: getActiveVaultPath,
    extraTools: DATA_TOOLS,
    notes: mcpNotes,
  });
  void mcp.init(); // app-hosted MCP endpoint for agentic AIs (auto-starts if enabled)
  void getNotionMcp().restore();
  createWindow();
  buildAppMenu();
  initAutoUpdater();

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Application menu. Standard role-based items (copy/paste/quit handled by
// Electron) plus a Settings/Preferences item that tells the renderer to open
// the in-app Settings dialog — ⌘, on macOS, Ctrl+, elsewhere.
function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const openSettings = () => mainWindow?.webContents.send("beebot:open-settings");
  const sendCommand = (command) => mainWindow?.webContents.send("beebot:desktop-command", command);
  const settingsItem = { label: "Settings…", accelerator: "CmdOrCtrl+,", click: openSettings };
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            settingsItem,
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" }, { role: "hideOthers" }, { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        }]
      : []),
    {
      label: "File",
      submenu: [
        ...(isMac ? [] : [settingsItem, { type: "separator" }]),
        { label: "New Note", accelerator: "CmdOrCtrl+N", click: () => sendCommand("new-note") },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => sendCommand("save-note") },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac
          ? [
              { role: "pasteAndMatchStyle" },
              { role: "delete" },
              { role: "selectAll" },
              { type: "separator" },
              {
                label: "Speech",
                submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
              },
            ]
          : [{ role: "delete" }, { type: "separator" }, { role: "selectAll" }]),
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Command Palette…", accelerator: "CmdOrCtrl+P", click: () => sendCommand("command-palette") },
        { label: "Search Notes…", accelerator: "CmdOrCtrl+Shift+F", click: () => sendCommand("search-notes") },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" }, { role: "front" }, { type: "separator" }, { role: "window" }]
          : [{ role: "close" }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Auto-update via the GitHub Releases feed (see package.json "build.publish").
// Only runs in a packaged build; in dev there's no update feed. autoDownload is
// on by default, so we just check, then tell the renderer once it's downloaded or streaming progress.
function initAutoUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("beebot:update-status", { status: "available", version: info?.version });
  });
  autoUpdater.on("download-progress", (progressObj) => {
    mainWindow?.webContents.send("beebot:update-progress", {
      percent: Math.round(progressObj.percent || 0),
      transferred: progressObj.transferred,
      total: progressObj.total,
      bytesPerSecond: progressObj.bytesPerSecond,
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    mainWindow?.webContents.send("beebot:update-downloaded", { version: info?.version });
  });
  autoUpdater.on("error", (err) => {
    console.error("[BeeBot AutoUpdate]", err);
    mainWindow?.webContents.send("beebot:update-error", { message: err?.message || "Download failed" });
  });
  autoUpdater.checkForUpdates().catch((err) => console.error("[BeeBot AutoUpdate] check failed", err));
}

ipcMain.handle("beebot:install-update", () => autoUpdater.quitAndInstall());
ipcMain.handle("beebot:check-for-updates", () => autoUpdater.checkForUpdates().catch((err) => {
  console.error("[BeeBot AutoUpdate] check failed", err);
  throw err;
}));
ipcMain.handle("beebot:start-download", () => autoUpdater.downloadUpdate().catch((err) => {
  console.error("[BeeBot AutoUpdate] download failed", err);
  throw err;
}));

// Authoritative app version (from the packaged build), for the Settings → About
// version check. The renderer compares this against the latest GitHub Release.
ipcMain.handle("beebot:get-version", () => app.getVersion());

// MCP control plane for the Settings UI: status (on/off + client tokens + activity), toggle, and
// per-client add/revoke. Guarded so a call before init() can't crash the renderer.
ipcMain.handle("beebot:mcp-status", () => mcp ? mcp.status() : { running: false, enabled: false, clients: [] });
ipcMain.handle("beebot:mcp-set-enabled", (_e, on) => mcp ? mcp.setEnabled(!!on) : { running: false, enabled: false, clients: [] });
ipcMain.handle("beebot:mcp-add-client", (_e, name) => mcp ? mcp.addClient(typeof name === "string" ? name : "Client") : { clients: [] });
ipcMain.handle("beebot:mcp-revoke-client", (_e, id) => mcp ? mcp.revokeClient(String(id || "")) : { clients: [] });
ipcMain.handle("beebot:mcp-approve-action", (_e, id) => mcp ? mcp.approveAction(String(id || "")) : { clients: [], pending_actions: [] });
ipcMain.handle("beebot:mcp-reject-action", (_e, id) => mcp ? mcp.rejectAction(String(id || "")) : { clients: [], pending_actions: [] });
// Renderer's reply to a finance/consultant data request (Phase 2 bridge).
ipcMain.on("beebot:mcp-data-reply", (_e, payload) => handleReply(payload));

// Open the OS microphone-privacy pane (for the JARVIS "Enable mic" recovery flow). The renderer
// can't open custom-scheme URLs (the nav guard allows only http/https) — route through shell here.
// Scoped to the fixed mic-settings URL only; never an arbitrary URL from the renderer.
ipcMain.handle("beebot:open-mic-settings", () => {
  if (process.platform === "darwin") return shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone");
  if (process.platform === "win32") return shell.openExternal("ms-settings:privacy-microphone");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  runtime?.close?.();
  void mcp?.close?.();
  void notionMcp?.close?.();
  observability?.record({ domain: "app", event: "stopping", status: "completed" });
  void observability?.close?.();
});
