import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const NOTION_MCP_URL = "https://mcp.notion.com/mcp";
const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PORT = 53947;
const CALLBACK_PATH = "/notion-mcp/callback";
const CALLBACK_URL = `http://${CALLBACK_HOST}:${CALLBACK_PORT}${CALLBACK_PATH}`;
const CALL_TIMEOUT_MS = 30_000;
const MAX_RESULT_BYTES = 1_000_000;

const TOOL_POLICIES = Object.freeze({
  "notion-search": "read",
  "notion-fetch": "read",
  "notion-get-self": "read",
  "notion-get-users": "read",
  "notion-get-teams": "read",
  "notion-query-data-sources": "read",
  "notion-query-database-view": "read",
  "notion-create-pages": "write",
  "notion-update-page": "write",
  "notion-move-pages": "write",
  "notion-duplicate-page": "write",
  "notion-create-database": "write",
  "notion-update-data-source": "write",
  "notion-create-view": "write",
  "notion-update-view": "write",
  "notion-create-comment": "write",
  "notion-get-comments": "read",
});

export const notionToolPolicy = (name) => TOOL_POLICIES[String(name || "")] || null;

export function normalizeNotionToolName(name) {
  const remoteName = String(name || "").trim().toLowerCase().replace(/_/g, "-");
  if (!notionToolPolicy(remoteName)) return null;
  return remoteName.replace(/-/g, "_");
}

export function assertSafeNotionToolCall(name, args, approved) {
  const policy = notionToolPolicy(name);
  if (!policy) throw notionError("UNSUPPORTED_OPERATION", `Unsupported Notion MCP tool: ${name}`);
  if (containsForbiddenReplacement(args)) {
    throw notionError(
      "UNSUPPORTED_OPERATION",
      "Destructive full-content replacement is blocked because it can remove child pages or databases.",
    );
  }
  if (policy === "write" && approved !== true) {
    throw notionError("APPROVAL_REQUIRED", `Approval is required before ${name} can change Notion.`);
  }
  return policy;
}

export function createNotionMcpClient({ rootDir, safeStorage, shell, fetchImpl = globalThis.fetch, onAudit } = {}) {
  const secretPath = path.join(rootDir, "secrets", "notion-mcp.json");
  let state = "not_connected";
  let detail = null;
  let lastSuccessfulCall = null;
  let workspaceName = null;
  let grantedScope = null;
  let client = null;
  let transport = null;
  let connectPromise = null;
  const idempotentResults = new Map();

  const audit = (event, metadata = {}) => onAudit?.({ event, metadata });

  const readCredentials = () => {
    if (!safeStorage?.isEncryptionAvailable?.()) throw notionError("SECURE_STORAGE_UNAVAILABLE", "OS secure storage is unavailable.");
    try {
      const envelope = JSON.parse(fs.readFileSync(secretPath, "utf8"));
      const clear = safeStorage.decryptString(Buffer.from(String(envelope.payload || ""), "base64"));
      return JSON.parse(clear);
    } catch (error) {
      if (error?.code === "ENOENT") return {};
      throw notionError("CREDENTIALS_UNREADABLE", "Notion MCP credentials could not be decrypted.");
    }
  };

  const writeCredentials = (next) => {
    if (!safeStorage?.isEncryptionAvailable?.()) throw notionError("SECURE_STORAGE_UNAVAILABLE", "OS secure storage is unavailable.");
    fs.mkdirSync(path.dirname(secretPath), { recursive: true, mode: 0o700 });
    const clear = JSON.stringify(next || {});
    const payload = safeStorage.encryptString(clear).toString("base64");
    const temporaryPath = `${secretPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ version: 1, payload }), { mode: 0o600 });
    fs.renameSync(temporaryPath, secretPath);
  };

  const removeCredentials = () => {
    try { fs.unlinkSync(secretPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  };

  const status = () => ({
    state,
    connected: state === "connected",
    workspaceName,
    grantedScope,
    lastSuccessfulCall,
    error: detail,
    desktopOnly: true,
  });

  const createProvider = ({ interactive, oauthState, beginCallback }) => ({
    redirectUrl: CALLBACK_URL,
    clientMetadata: {
      client_name: "Sitku E.V",
      redirect_uris: [CALLBACK_URL],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    },
    state: () => oauthState,
    clientInformation: () => readCredentials().clientInformation,
    saveClientInformation: (value) => writeCredentials({ ...readCredentials(), clientInformation: value }),
    tokens: () => readCredentials().tokens,
    saveTokens: (value) => {
      writeCredentials({ ...readCredentials(), tokens: value });
      grantedScope = value?.scope || null;
    },
    redirectToAuthorization: async (url) => {
      if (!interactive) throw notionError("AUTH_REQUIRED", "Notion authorization is required.");
      beginCallback();
      await shell.openExternal(url.toString());
    },
    saveCodeVerifier: (value) => writeCredentials({ ...readCredentials(), codeVerifier: value }),
    codeVerifier: () => {
      const value = readCredentials().codeVerifier;
      if (!value) throw notionError("AUTH_REQUIRED", "Notion OAuth verifier is missing.");
      return value;
    },
    saveDiscoveryState: (value) => writeCredentials({ ...readCredentials(), discoveryState: value }),
    discoveryState: () => readCredentials().discoveryState,
    invalidateCredentials: (scope) => {
      const current = readCredentials();
      if (scope === "all") return removeCredentials();
      if (scope === "tokens") delete current.tokens;
      if (scope === "client") delete current.clientInformation;
      if (scope === "verifier") delete current.codeVerifier;
      if (scope === "discovery") delete current.discoveryState;
      writeCredentials(current);
    },
  });

  const openConnection = async ({ interactive = false } = {}) => {
    if (client && transport && state === "connected") return client;
    if (connectPromise) return connectPromise;
    connectPromise = (async () => {
      const oauthState = randomUUID();
      let callbackPromise = null;
      const provider = createProvider({
        interactive,
        oauthState,
        beginCallback: () => { callbackPromise ||= waitForOAuthCallback(oauthState); },
      });
      const nextClient = new Client({ name: "sitku-ev-notion", version: "1.0.0" }, { capabilities: {} });
      const nextTransport = new StreamableHTTPClientTransport(new URL(NOTION_MCP_URL), {
        authProvider: provider,
        fetch: fetchImpl,
        reconnectionOptions: { initialReconnectionDelay: 500, maxReconnectionDelay: 5_000, reconnectionDelayGrowFactor: 1.5, maxRetries: 2 },
      });
      try {
        await nextClient.connect(nextTransport);
      } catch (error) {
        if (!(error instanceof UnauthorizedError) || !interactive) throw error;
        if (!callbackPromise) throw notionError("AUTH_CALLBACK_UNAVAILABLE", "Notion did not start an authorization callback.");
        const { code } = await callbackPromise;
        await nextTransport.finishAuth(code);
        await nextTransport.close().catch(() => {});
        connectPromise = null;
        return openConnection({ interactive: false });
      }
      client = nextClient;
      transport = nextTransport;
      state = "connected";
      detail = null;
      audit("connected");
      return client;
    })().catch((error) => {
      state = mapConnectionState(error);
      detail = sanitizeError(error);
      audit("connection_failed", { code: error?.code || "NOTION_MCP_CONNECTION_FAILED" });
      throw error;
    }).finally(() => { connectPromise = null; });
    return connectPromise;
  };

  const connect = async () => {
    state = "authorizing";
    detail = null;
    await openConnection({ interactive: true });
    await refreshIdentity().catch(() => {});
    return status();
  };

  const restore = async () => {
    const credentials = readCredentials();
    if (!credentials?.tokens) return status();
    state = "refreshing";
    try {
      await openConnection({ interactive: false });
      await refreshIdentity().catch(() => {});
    } catch { /* status already carries the structured recovery state */ }
    return status();
  };

  const disconnect = async () => {
    await transport?.terminateSession?.().catch(() => {});
    await transport?.close?.().catch(() => {});
    client = null;
    transport = null;
    removeCredentials();
    state = "not_connected";
    detail = null;
    workspaceName = null;
    grantedScope = null;
    lastSuccessfulCall = null;
    idempotentResults.clear();
    audit("disconnected");
    return status();
  };

  const close = async () => {
    await transport?.close?.().catch(() => {});
    client = null;
    transport = null;
  };

  const listTools = async () => {
    const connectedClient = await openConnection({ interactive: false });
    const response = await connectedClient.listTools({}, { timeout: CALL_TIMEOUT_MS });
    const tools = response.tools
      .filter((tool) => notionToolPolicy(tool.name))
      .map((tool) => ({
        name: tool.name,
        normalizedName: normalizeNotionToolName(tool.name),
        description: tool.description || "",
        inputSchema: tool.inputSchema,
        policy: notionToolPolicy(tool.name),
      }));
    return { tools, unsupportedCount: response.tools.length - tools.length };
  };

  const callTool = async ({ name, arguments: args = {}, approved = false, idempotencyKey = "", executionId = "" } = {}) => {
    const policy = assertSafeNotionToolCall(name, args, approved);
    const key = String(idempotencyKey || "").trim();
    if (policy === "write" && !key) throw notionError("INVALID_INPUT", "A Notion write requires an idempotency key.");
    if (key && idempotentResults.has(key)) return idempotentResults.get(key);
    const connectedClient = await openConnection({ interactive: false });
    const discovered = await listTools();
    if (!discovered.tools.some((tool) => tool.name === name)) {
      throw notionError("UNSUPPORTED_OPERATION", `Notion MCP did not advertise ${name}.`);
    }
    const startedAt = Date.now();
    try {
      const raw = await connectedClient.callTool({ name, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS });
      const result = sanitizeToolResult(raw, { name, executionId });
      if (raw?.isError) throw notionError("REMOTE_TOOL_FAILED", result.summary || `${name} failed.`);
      lastSuccessfulCall = new Date().toISOString();
      detail = null;
      const response = { ...result, policy, requestId: executionId || randomUUID(), durationMs: Date.now() - startedAt };
      if (key) rememberIdempotent(idempotentResults, key, response);
      audit("tool_completed", { tool: name, policy, durationMs: response.durationMs });
      return response;
    } catch (error) {
      audit("tool_failed", { tool: name, policy, code: error?.code || "REMOTE_TOOL_FAILED" });
      throw normalizeRemoteError(error);
    }
  };

  const refreshIdentity = async () => {
    const tools = await listTools();
    const self = tools.tools.find((tool) => tool.name === "notion-get-self");
    if (!self) return;
    const result = await callTool({ name: self.name, arguments: {}, approved: false });
    workspaceName = result.workspaceName || result.title || null;
  };

  return { status, connect, restore, disconnect, listTools, callTool, close };
}

function waitForOAuthCallback(expectedState) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(notionError("AUTH_TIMEOUT", "Notion authorization timed out.")), 180_000);
    let server;
    const finish = (error, value) => {
      clearTimeout(timeout);
      server?.close?.();
      if (error) reject(error); else resolve(value);
    };
    server = http.createServer((request, response) => {
      const url = new URL(request.url || "/", CALLBACK_URL);
      if (url.pathname !== CALLBACK_PATH) {
        response.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const oauthError = url.searchParams.get("error");
      if (oauthError || !code || state !== expectedState) {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Sitku could not verify the Notion authorization. You can close this window.");
        finish(notionError("AUTH_INVALID_CALLBACK", oauthError || "OAuth state validation failed."));
        return;
      }
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Notion is connected to Sitku. You can close this window.");
      finish(null, { code });
    });
    server.once("error", (error) => finish(notionError("AUTH_CALLBACK_UNAVAILABLE", error.message)));
    server.listen(CALLBACK_PORT, CALLBACK_HOST);
  });
}

function containsForbiddenReplacement(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => {
    if (["allow_deleting_content", "erase_content", "replace_content", "delete_content"].includes(key) && child) return true;
    return containsForbiddenReplacement(child);
  });
}

function sanitizeToolResult(raw, { name, executionId }) {
  const serialized = JSON.stringify(raw ?? {});
  if (Buffer.byteLength(serialized) > MAX_RESULT_BYTES) throw notionError("RESULT_TOO_LARGE", "Notion MCP returned more data than Sitku can safely process.");
  const text = Array.isArray(raw?.content)
    ? raw.content.filter((item) => item?.type === "text").map((item) => String(item.text || "")).join("\n")
    : "";
  const parsed = tryJson(text);
  const values = parsed && typeof parsed === "object" ? parsed : raw?.structuredContent || {};
  const evidence = collectEvidence(values, text, name, executionId);
  return {
    data: values,
    summary: text.slice(0, 20_000),
    evidence,
    title: firstString(values, ["title", "name"]),
    workspaceName: firstString(values, ["workspace_name", "workspaceName", "name"]),
  };
}

function collectEvidence(value, text, tool, requestId) {
  const serialized = `${JSON.stringify(value || {})}\n${text || ""}`;
  const urls = [...new Set(serialized.match(/https:\/\/(?:www\.)?notion\.so\/[A-Za-z0-9_?=&/.-]+/g) || [])].slice(0, 20);
  const ids = [...new Set(serialized.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi) || [])].slice(0, 20);
  if (!urls.length && !ids.length) {
    return [{ id: `notion:${requestId || randomUUID()}`, type: "notion", tool, capturedAt: new Date().toISOString() }];
  }
  return [...urls.map((url, index) => ({ id: `notion:url:${index}:${requestId || "call"}`, type: "notion", tool, url, capturedAt: new Date().toISOString() })),
    ...ids.map((id) => ({ id: `notion:id:${id}`, type: "notion", tool, notionId: id, capturedAt: new Date().toISOString() }))];
}

function firstString(value, keys) {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  for (const child of Object.values(value)) {
    const result = firstString(child, keys);
    if (result) return result;
  }
  return null;
}

function tryJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function rememberIdempotent(cache, key, value) {
  cache.set(key, value);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
}

function mapConnectionState(error) {
  if (/AUTH|Unauthorized|401|403/i.test(`${error?.code || ""} ${error?.message || ""}`)) return "permission_required";
  return "error";
}

function sanitizeError(error) {
  return { code: error?.code || "NOTION_MCP_ERROR", message: String(error?.message || "Notion MCP failed.").slice(0, 300) };
}

function normalizeRemoteError(error) {
  const message = String(error?.message || error || "Notion MCP failed.");
  if (/401|403|unauthorized|forbidden/i.test(message)) return notionError("PERMISSION_DENIED", message);
  if (/429|rate.?limit/i.test(message)) return notionError("PROVIDER_QUOTA", message);
  if (/timeout/i.test(message)) return notionError("TOOL_TIMEOUT", message);
  return error?.code ? error : notionError("REMOTE_TOOL_FAILED", message);
}

function notionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
