import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, session, shell } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createLocalRuntime, SystemStorage } from "./local-runtime.mjs";
import electronUpdater from "electron-updater";

// electron-updater is CommonJS — grab autoUpdater off the default export.
const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const appName = "Sitku Agent";
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

// BeeBot is local-first: do not ask macOS Keychain for Chromium's "Safe Store".
// Secrets/settings are owned by the local runtime JSON + SQLite stores instead.
if (process.platform === "darwin") {
  app.commandLine.appendSwitch("use-mock-keychain");
}
app.commandLine.appendSwitch("password-store", "basic");

let mainWindow = null;
let runtime = null;
const activeStreams = new Map();
let cachedSystemFonts = null;

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

function createWindow() {
  const initialDark = nativeTheme.shouldUseDarkColors;
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 640,
    minHeight: 600,
    title: "Sitku Agent",
    // Match the workspace canvas so there's no white flash on cold launch /
    // dark→light transitions. Updated live via the nativeTheme listener below.
    backgroundColor: initialDark ? "#000000" : "#ffffff",
    // macOS Sequoia vibrancy. `under-window` (Electron ≥ 23) attaches an
    // NSVisualEffectView behind the web contents so the wallpaper bleeds
    // through any translucent CSS surfaces. Less buggy with resize than the
    // legacy `sidebar` material. Gated by macOS — on other OSes Electron
    // ignores the option, and the CSS .bb-glass fallback (gradient mesh)
    // still gives a comparable look.
    vibrancy: process.platform === "darwin" ? "under-window" : undefined,
    visualEffectState: "active",
    resizable: true,
    movable: true,
    maximizable: true,
    minimizable: true,
    fullscreenable: true,
    closable: true,
    roundedCorners: true,
    acceptFirstMouse: true,
    titleBarStyle: "hiddenInset",
    // The floating sidebar card starts at ~x:8 (ml-2) with rounded top corner;
    // place the native traffic lights just inside its top-left so they sit
    // INSIDE the floating sidebar (Telegram / Finder pattern), not over the
    // window chrome.
    trafficLightPosition: { x: 22, y: 26 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Live theme follow: when macOS toggles dark/light, swap the chrome
  // background so the area outside the React shell (during reload / transitions)
  // never mismatches the in-app theme.
  const syncChromeTheme = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#000000" : "#ffffff");
    }
  };
  nativeTheme.on("updated", syncChromeTheme);
  mainWindow.once("closed", () => nativeTheme.off("updated", syncChromeTheme));

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
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`[Renderer] Failed to load ${validatedUrl}: ${errorCode} ${errorDescription}`);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[Renderer] Process gone", details);
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
  return getRuntime().invoke(request);
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
  // Content-Security-Policy for the production build. Dev (Vite HMR) needs
  // unsafe-eval + ws://, so we only enforce the strict policy when loading
  // the bundled dist/ files. Silences the "Insecure Content-Security-Policy"
  // Electron warning and genuinely hardens the renderer against XSS injection.
  const isDev = Boolean(process.env.BEEBOT_RENDERER_URL);
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; " +
              "script-src 'self'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob: https:; " +
              "font-src 'self' data:; " +
              "connect-src 'self' https:; " +
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
  createWindow();
  buildAppMenu();
  initAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Application menu. Standard role-based items (copy/paste/quit handled by
// Electron) plus a Settings/Preferences item that tells the renderer to open
// the in-app Settings dialog — ⌘, on macOS, Ctrl+, elsewhere.
function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const openSettings = () => mainWindow?.webContents.send("beebot:open-settings");
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
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" },
        ...(isMac
          ? [{ role: "pasteAndMatchStyle" }, { role: "delete" }, { role: "selectAll" }]
          : [{ role: "delete" }, { type: "separator" }, { role: "selectAll" }]),
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" }, { role: "zoom" },
        ...(isMac ? [{ type: "separator" }, { role: "front" }] : [{ role: "close" }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Auto-update via the GitHub Releases feed (see package.json "build.publish").
// Only runs in a packaged build; in dev there's no update feed. autoDownload is
// on by default, so we just check, then tell the renderer once it's downloaded.
function initAutoUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.on("update-downloaded", (info) => {
    mainWindow?.webContents.send("beebot:update-downloaded", { version: info?.version });
  });
  autoUpdater.on("error", (err) => console.error("[BeeBot AutoUpdate]", err));
  autoUpdater.checkForUpdates().catch((err) => console.error("[BeeBot AutoUpdate] check failed", err));
}

ipcMain.handle("beebot:install-update", () => autoUpdater.quitAndInstall());

// Authoritative app version (from the packaged build), for the Settings → About
// version check. The renderer compares this against the latest GitHub Release.
ipcMain.handle("beebot:get-version", () => app.getVersion());

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
  runtime?.close?.();
});
