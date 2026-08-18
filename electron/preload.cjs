// CommonJS (.cjs) — a sandboxed preload (sandbox: true) cannot be ESM.
const { contextBridge, ipcRenderer } = require("electron");

const methods = {
  vault: ["getActiveVault", "listVaults", "createVault", "openVault", "switchVault", "revealActiveVault", "forgetVault"],
  notes: ["listEntries", "listNotes", "readNote", "writeNote", "deleteNote", "createFolder", "deleteFolder", "renamePath", "revealPath", "watchNotes", "listVersions", "getVersionContent"],
  conversations: [
    "listSessions",
    "createSession",
    "archiveSession",
    "renameSession",
    "updateSessionInstructions",
    "finalizeSessionSummary",
    "listMessages",
    "createMessage",
    "updateMessageContent",
    "deleteMessage",
    "countThreadReplies",
    "subscribeToSessionMessages",
    "subscribeToUserMessages",
  ],
  memories: ["listMemories", "upsertMemory", "deleteMemory", "recordMemoryAccess"],
  tasks: ["listTasks", "upsertTask", "deleteTask"],
  team: ["load", "save", "exportBackup", "importBackup", "putAttachment", "getAttachment", "deleteAttachment"],
  search: ["search", "rebuildNoteIndex", "rebuildEmbeddings"],
  settings: ["get", "set", "remove", "list"],
  skills: ["listSkills", "getSkill", "setSkillEnabled", "getSummary"],
  agentRuntime: ["warmup", "startStream", "continueStream", "cancelStream", "getStatus"],
  jarvis: ["begin", "update", "claimAction", "listRecent", "recoverInterrupted"],
  evMemory: ["openSession", "closeSession", "appendMessage", "listMessages", "listSummaries", "saveSummary", "getContext", "upsertMemory", "listLongTermMemories", "exportData", "importData"],
};

const subscriptionMethods = new Set([
  "watchNotes",
  "subscribeToSessionMessages",
  "subscribeToUserMessages",
]);

const streamMethods = new Set([
  "startStream",
  "continueStream",
]);

function sanitizeCloneable(obj) {
  if (!obj || typeof obj !== "object") return obj;
  try {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
      if (
        value instanceof AbortSignal ||
        (typeof value === "object" && value !== null && value.constructor && value.constructor.name === "AbortSignal")
      ) {
        return undefined;
      }
      if (typeof value === "function" || typeof value === "symbol") {
        return undefined;
      }
      return value;
    }));
  } catch {
    return Array.isArray(obj) ? [] : {};
  }
}

function createRuntimeStream(domain, method, args) {
  const rawInput = args[0] || {};
  const signal = rawInput.signal;
  const input = sanitizeCloneable(rawInput);
  delete input.signal;

  const streamId = `${domain}:${method}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const chunkChannel = `beebot:runtime-stream:${streamId}:chunk`;
  const doneChannel = `beebot:runtime-stream:${streamId}:done`;
  const errorChannel = `beebot:runtime-stream:${streamId}:error`;
  const encoder = new TextEncoder();

  const queue = [];
  let done = false;
  let failure = null;
  let notify = null;

  const wake = () => {
    notify?.();
    notify = null;
  };

  const cleanup = () => {
    ipcRenderer.removeListener(chunkChannel, onChunk);
    ipcRenderer.removeListener(doneChannel, onDone);
    ipcRenderer.removeListener(errorChannel, onError);
    signal?.removeEventListener?.("abort", onAbort);
  };

  const onAbort = () => {
    ipcRenderer.invoke("beebot:runtime-stream-cancel", { streamId }).catch(() => {});
  };

  const onChunk = (_event, chunk) => {
    queue.push(typeof chunk === "string" ? encoder.encode(chunk) : new Uint8Array(chunk));
    wake();
  };

  const onDone = () => {
    done = true;
    cleanup();
    wake();
  };

  const onError = (_event, error) => {
    failure = new Error(error?.message || String(error || "Local runtime stream failed"));
    done = true;
    cleanup();
    wake();
  };

  ipcRenderer.on(chunkChannel, onChunk);
  ipcRenderer.on(doneChannel, onDone);
  ipcRenderer.on(errorChannel, onError);
  signal?.addEventListener?.("abort", onAbort, { once: true });

  const started = ipcRenderer.invoke("beebot:runtime-stream-start", {
    streamId,
    domain,
    method,
    args: [input],
  });

  return {
    ok: true,
    status: 200,
    async json() {
      return {};
    },
    async *readChunks() {
      const initial = await started;
      if (!initial.ok) {
        yield encoder.encode(`data: ${JSON.stringify(initial.error || { type: "provider_error", message: "Local runtime failed" })}\n\n`);
        yield encoder.encode("data: [DONE]\n\n");
        return;
      }

      try {
        while (!done || queue.length > 0) {
          if (failure) throw failure;
          const next = queue.shift();
          if (next) {
            yield next;
            continue;
          }
          await new Promise((resolve) => { notify = resolve; });
        }
      } finally {
        cleanup();
      }
    },
  };
}

function createSubscription(domain, method, args) {
  const callback = args[args.length - 1];
  const callArgs = sanitizeCloneable(args.slice(0, -1));
  const subscriptionId = `${domain}:${method}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const channel = `beebot:runtime-event:${subscriptionId}`;

  const listener = (_event, payload) => {
    if (typeof callback === "function") callback(payload);
  };

  ipcRenderer.on(channel, listener);
  ipcRenderer.invoke("beebot:runtime-subscribe", { domain, method, args: callArgs, subscriptionId }).catch((error) => {
    ipcRenderer.removeListener(channel, listener);
    console.error("[BeeBot Local Runtime] subscribe failed", error);
  });

  return {
    unsubscribe() {
      ipcRenderer.removeListener(channel, listener);
      ipcRenderer.invoke("beebot:runtime-unsubscribe", { subscriptionId }).catch(() => {});
    },
  };
}

function createJarvisStream(request) {
  const signal = request?.signal;
  const input = sanitizeCloneable(request || {});
  delete input.signal;
  const streamId = `jarvis:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const prefix = `beebot:jarvis-stream:${streamId}`;
  const queue = [];
  let done = false;
  let failure = null;
  let wake = null;
  const notify = () => { wake?.(); wake = null; };
  const cleanup = () => {
    ipcRenderer.removeListener(`${prefix}:chunk`, onChunk);
    ipcRenderer.removeListener(`${prefix}:done`, onDone);
    ipcRenderer.removeListener(`${prefix}:error`, onError);
    signal?.removeEventListener?.("abort", onAbort);
  };
  const onChunk = (_event, chunk) => { queue.push(new Uint8Array(chunk)); notify(); };
  const onDone = () => { done = true; cleanup(); notify(); };
  const onError = (_event, error) => { failure = new Error(String(error || "Jarvis stream failed")); done = true; cleanup(); notify(); };
  const onAbort = () => { ipcRenderer.invoke("beebot:jarvis-stream-cancel", streamId).catch(() => {}); };
  ipcRenderer.on(`${prefix}:chunk`, onChunk);
  ipcRenderer.on(`${prefix}:done`, onDone);
  ipcRenderer.on(`${prefix}:error`, onError);
  signal?.addEventListener?.("abort", onAbort, { once: true });
  const started = ipcRenderer.invoke("beebot:jarvis-stream-start", { ...input, streamId });
  return {
    async *readChunks() {
      const initial = await started;
      if (!initial.ok) throw new Error(initial.error || `Jarvis stream failed (${initial.status})`);
      try {
        while (!done || queue.length) {
          if (failure) throw failure;
          const chunk = queue.shift();
          if (chunk) { yield chunk; continue; }
          await new Promise((resolve) => { wake = resolve; });
        }
      } finally {
        cleanup();
      }
    },
  };
}

function invokeJarvisGemini(request) {
  const signal = request?.signal;
  const input = sanitizeCloneable(request || {});
  delete input.signal;
  const requestId = `jarvis-request:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const cancel = () => { ipcRenderer.invoke("beebot:jarvis-gemini-cancel", requestId).catch(() => {}); };
  signal?.addEventListener?.("abort", cancel, { once: true });
  return ipcRenderer.invoke("beebot:jarvis-gemini", { ...input, requestId })
    .finally(() => signal?.removeEventListener?.("abort", cancel));
}

function invokeTavilySearch(request) {
  const signal = request?.signal;
  const input = sanitizeCloneable(request || {});
  delete input.signal;
  const requestId = `tavily:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const cancel = () => { ipcRenderer.invoke("beebot:tavily-search-cancel", requestId).catch(() => {}); };
  signal?.addEventListener?.("abort", cancel, { once: true });
  return ipcRenderer.invoke("beebot:tavily-search", { ...input, requestId })
    .finally(() => signal?.removeEventListener?.("abort", cancel));
}

function createDomain(domain) {
  return Object.fromEntries(methods[domain].map((method) => [
    method,
    (...args) => {
      if (subscriptionMethods.has(method)) return createSubscription(domain, method, args);
      if (domain === "agentRuntime" && streamMethods.has(method)) return createRuntimeStream(domain, method, args);
      return ipcRenderer.invoke("beebot:runtime-invoke", { domain, method, args: sanitizeCloneable(args) });
    },
  ]));
}

const notesDomain = createDomain("notes");
notesDomain.emergencySaveSync = (path, content, expectedHash) => ipcRenderer.sendSync(
  "beebot:notes-emergency-save",
  { path, content, expectedHash },
);

contextBridge.exposeInMainWorld("beebotLocalRuntime", {
  vault: createDomain("vault"),
  notes: notesDomain,
  conversations: createDomain("conversations"),
  memories: createDomain("memories"),
  tasks: createDomain("tasks"),
  team: createDomain("team"),
  search: createDomain("search"),
  settings: createDomain("settings"),
  skills: createDomain("skills"),
  agentRuntime: createDomain("agentRuntime"),
  jarvis: createDomain("jarvis"),
});

contextBridge.exposeInMainWorld("beebotDesktop", {
  platform: process.platform,
  titleBar: "hiddenInset",
  setWindowBackground: (color) => ipcRenderer.send("beebot:set-window-background", color),
  setNativeContextMenus: (enabled) => ipcRenderer.send("beebot:set-native-context-menus", enabled),
  nativeChromeStatus: () => ipcRenderer.invoke("beebot:native-chrome-status"),
  setNativeAppearance: (mode) => ipcRenderer.send("beebot:set-native-appearance", mode),
  performNativeHaptic: (kind) => ipcRenderer.send("beebot:native-haptic", kind),
  setDocumentState: (state) => ipcRenderer.send("beebot:set-document-state", state),
  onWindowState: (cb) => {
    const listener = (_event, state) => cb(state);
    ipcRenderer.on("beebot:window-state", listener);
    return () => ipcRenderer.removeListener("beebot:window-state", listener);
  },
  listFonts: () => ipcRenderer.invoke("beebot:list-fonts"),
  onUpdateReady: (cb) => {
    const listener = (_event, info) => cb(info);
    ipcRenderer.on("beebot:update-downloaded", listener);
    return () => ipcRenderer.removeListener("beebot:update-downloaded", listener);
  },
  onUpdateProgress: (cb) => {
    const listener = (_event, info) => cb(info);
    ipcRenderer.on("beebot:update-progress", listener);
    return () => ipcRenderer.removeListener("beebot:update-progress", listener);
  },
  onUpdateError: (cb) => {
    const listener = (_event, info) => cb(info);
    ipcRenderer.on("beebot:update-error", listener);
    return () => ipcRenderer.removeListener("beebot:update-error", listener);
  },
  onUpdateStatus: (cb) => {
    const listener = (_event, info) => cb(info);
    ipcRenderer.on("beebot:update-status", listener);
    return () => ipcRenderer.removeListener("beebot:update-status", listener);
  },
  checkForUpdates: () => ipcRenderer.invoke("beebot:check-for-updates"),
  startDownload: () => ipcRenderer.invoke("beebot:start-download"),
  installUpdate: () => ipcRenderer.invoke("beebot:install-update"),
  openMicSettings: () => ipcRenderer.invoke("beebot:open-mic-settings"),
  // One-way diagnostic events are accepted only through the main process allowlist.
  // They are deliberately not an RPC so logging can never slow live audio.
  recordObservability: (input) => ipcRenderer.send("beebot:observability-record", input),
  jarvisKeyStatus: () => ipcRenderer.invoke("beebot:jarvis-key-status"),
  jarvisSetKey: (key) => ipcRenderer.invoke("beebot:jarvis-key-set", key),
  evLiveToken: (model, translation) => ipcRenderer.invoke("beebot:ev-live-token", model, translation),
  tavilyKeyStatus: () => ipcRenderer.invoke("beebot:tavily-key-status"),
  tavilySetKey: (key) => ipcRenderer.invoke("beebot:tavily-key-set", key),
  tavilyTest: (key) => ipcRenderer.invoke("beebot:tavily-test", { key }),
  tavilySearch: (request) => invokeTavilySearch(request),
  notionMcpStatus: () => ipcRenderer.invoke("beebot:notion-mcp-status"),
  notionMcpConnect: () => ipcRenderer.invoke("beebot:notion-mcp-connect"),
  notionMcpDisconnect: () => ipcRenderer.invoke("beebot:notion-mcp-disconnect"),
  notionMcpListTools: () => ipcRenderer.invoke("beebot:notion-mcp-list-tools"),
  notionMcpCallTool: (input) => ipcRenderer.invoke("beebot:notion-mcp-call-tool", input),
  evTerminalPlan: (input) => ipcRenderer.invoke("beebot:ev-terminal-plan", input),
  evTerminalExecute: (input) => ipcRenderer.invoke("beebot:ev-terminal-execute", input),
  evTerminalCancel: (executionId) => ipcRenderer.invoke("beebot:ev-terminal-cancel", executionId),
  jarvisGemini: (request) => invokeJarvisGemini(request),
  jarvisGeminiStream: (request) => createJarvisStream(request),
  getVersion: () => ipcRenderer.invoke("beebot:get-version"),
  mcpStatus: () => ipcRenderer.invoke("beebot:mcp-status"),
  mcpSetEnabled: (on) => ipcRenderer.invoke("beebot:mcp-set-enabled", on),
  mcpAddClient: (name) => ipcRenderer.invoke("beebot:mcp-add-client", name),
  mcpRevokeClient: (id) => ipcRenderer.invoke("beebot:mcp-revoke-client", id),
  mcpApproveAction: (id) => ipcRenderer.invoke("beebot:mcp-approve-action", id),
  mcpRejectAction: (id) => ipcRenderer.invoke("beebot:mcp-reject-action", id),
  // Phase 2: main round-trips finance/consultant tool calls to the renderer (IndexedDB lives here).
  registerMcpDataHandler: (handler) => {
    ipcRenderer.removeAllListeners("beebot:mcp-data-request");
    ipcRenderer.on("beebot:mcp-data-request", async (_e, req) => {
      try {
        const result = await handler(req.op, req.args);
        ipcRenderer.send("beebot:mcp-data-reply", { id: req.id, ok: true, result });
      } catch (err) {
        ipcRenderer.send("beebot:mcp-data-reply", { id: req.id, ok: false, error: String((err && err.message) || err) });
      }
    });
  },
  onOpenSettings: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("beebot:open-settings", listener);
    return () => ipcRenderer.removeListener("beebot:open-settings", listener);
  },
  onDesktopCommand: (cb) => {
    const listener = (_event, command) => cb(command);
    ipcRenderer.on("beebot:desktop-command", listener);
    return () => ipcRenderer.removeListener("beebot:desktop-command", listener);
  },
});
