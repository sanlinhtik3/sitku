// CommonJS (.cjs) — a sandboxed preload (sandbox: true) cannot be ESM.
const { contextBridge, ipcRenderer } = require("electron");

const methods = {
  vault: ["getActiveVault", "listVaults", "createVault", "openVault", "switchVault", "revealActiveVault"],
  notes: ["listEntries", "listNotes", "readNote", "writeNote", "deleteNote", "createFolder", "deleteFolder", "renamePath", "revealPath", "watchNotes"],
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
  search: ["search", "rebuildNoteIndex", "rebuildEmbeddings"],
  settings: ["get", "set", "remove", "list"],
  skills: ["listSkills", "getSkill", "setSkillEnabled", "getSummary"],
  agentRuntime: ["warmup", "startStream", "continueStream", "cancelStream", "getStatus"],
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

function createRuntimeStream(domain, method, args) {
  const input = { ...(args[0] || {}) };
  const signal = input.signal;
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
  const callArgs = args.slice(0, -1);
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

function createDomain(domain) {
  return Object.fromEntries(methods[domain].map((method) => [
    method,
    (...args) => {
      if (subscriptionMethods.has(method)) return createSubscription(domain, method, args);
      if (domain === "agentRuntime" && streamMethods.has(method)) return createRuntimeStream(domain, method, args);
      return ipcRenderer.invoke("beebot:runtime-invoke", { domain, method, args });
    },
  ]));
}

contextBridge.exposeInMainWorld("beebotLocalRuntime", {
  vault: createDomain("vault"),
  notes: createDomain("notes"),
  conversations: createDomain("conversations"),
  memories: createDomain("memories"),
  tasks: createDomain("tasks"),
  search: createDomain("search"),
  settings: createDomain("settings"),
  skills: createDomain("skills"),
  agentRuntime: createDomain("agentRuntime"),
});

contextBridge.exposeInMainWorld("beebotDesktop", {
  platform: process.platform,
  titleBar: "hiddenInset",
  listFonts: () => ipcRenderer.invoke("beebot:list-fonts"),
  onUpdateReady: (cb) => {
    const listener = (_event, info) => cb(info);
    ipcRenderer.on("beebot:update-downloaded", listener);
    return () => ipcRenderer.removeListener("beebot:update-downloaded", listener);
  },
  installUpdate: () => ipcRenderer.invoke("beebot:install-update"),
  openMicSettings: () => ipcRenderer.invoke("beebot:open-mic-settings"),
  getVersion: () => ipcRenderer.invoke("beebot:get-version"),
  onOpenSettings: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("beebot:open-settings", listener);
    return () => ipcRenderer.removeListener("beebot:open-settings", listener);
  },
});
