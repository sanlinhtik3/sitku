// MCP manager — the "fully operating" control plane for the app-hosted MCP server.
//
// Owns: the on/off state, the list of per-client access tokens (one per agentic AI), and each
// client's activity (last used, request count). The HTTP server (mcp-http-server.mjs) delegates
// every request's auth to this manager, so individual AIs can be seen and revoked. State persists
// in ~/.sitku/mcp.json.
//
// Threat model: local, single-user. Tokens are user-owned (already on disk in ~/.sitku); their value
// is per-client REVOCATION + activity visibility, not secrecy from the machine owner.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { startMcpHttpServer } from "./mcp-http-server.mjs";
import { createMcpActionGateway } from "./mcp-action-gateway.mjs";

const now = () => new Date().toISOString();

export function createMcpManager({ rootDir, getVault, extraTools, notes }) {
  const cfgPath = path.join(rootDir, "mcp.json");
  let cfg = load();
  let server = null;
  let flushTimer = null;
  let dirty = false;
  const actions = createMcpActionGateway({ rootDir });

  function load() {
    try {
      const j = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      return {
        enabled: j.enabled !== false,
        port: Number(j.port) || 7429,
        clients: Array.isArray(j.clients) ? j.clients.filter((c) => c && c.token).map((c) => ({ ...c, scopes: Array.isArray(c.scopes) ? c.scopes : ["*"] })) : [],
      };
    } catch { return { enabled: true, port: 7429, clients: [] }; }
  }

  function persist() {
    dirty = false;
    const out = {
      enabled: cfg.enabled,
      port: server ? server.port : cfg.port,
      url: server ? server.url : null,
      clients: cfg.clients,
      updated_at: now(),
    };
    const tempPath = `${cfgPath}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(rootDir, { recursive: true });
      fs.writeFileSync(tempPath, JSON.stringify(out, null, 2), "utf8");
      fs.renameSync(tempPath, cfgPath);
    }
    catch (e) { console.warn("[Sitku] mcp.json write failed:", e && e.message); }
    finally { try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* best effort */ } }
  }

  // Activity updates are frequent — coalesce to one write every 8s instead of per-request.
  function scheduleFlush() {
    dirty = true;
    if (flushTimer) return;
    flushTimer = setTimeout(() => { flushTimer = null; if (dirty) persist(); }, 8000);
  }

  // Called by the HTTP server on every request. Returns the client (recording activity) or null.
  function authenticate(token) {
    if (!token) return null;
    const c = cfg.clients.find((x) => x.token === token);
    if (!c) return null;
    c.last_used_at = now();
    c.requests = (c.requests || 0) + 1;
    scheduleFlush();
    return c;
  }

  function newClient(name) {
    return {
      id: "cl_" + crypto.randomBytes(4).toString("hex"),
      name: String(name || "Client").trim().slice(0, 60) || "Client",
      token: crypto.randomBytes(24).toString("hex"),
      created_at: now(),
      last_used_at: null,
      requests: 0,
      scopes: ["*"],
    };
  }

  async function start() {
    if (server || !cfg.enabled) return;
    if (cfg.clients.length === 0) cfg.clients.push(newClient("Default")); // usable out of the box
    server = await startMcpHttpServer({ getVault, port: cfg.port, authenticate, extraTools, notes, actionGateway: actions });
    cfg.port = server.port;
    persist();
    console.log(`[Sitku] MCP server ready → ${server.url} (${cfg.clients.length} client token(s))`);
  }

  async function stop() {
    if (server) { try { await server.close(); } catch { /* noop */ } server = null; }
  }

  function status() {
    return {
      running: !!server,
      enabled: cfg.enabled,
      url: server ? server.url : null,
      port: server ? server.port : cfg.port,
      // Full token included ON PURPOSE (local, user-owned) so the UI can always show connect commands.
      clients: cfg.clients.map((c) => ({
        id: c.id, name: c.name, token: c.token,
        created_at: c.created_at, last_used_at: c.last_used_at, requests: c.requests || 0,
        scopes: c.scopes || ["*"],
      })),
      pending_actions: actions.list(),
    };
  }

  return {
    async init() { if (cfg.enabled) await start(); else persist(); },
    status,
    async setEnabled(on) {
      cfg.enabled = !!on;
      if (cfg.enabled) await start(); else await stop();
      persist();
      return status();
    },
    async addClient(name) {
      const c = newClient(name);
      cfg.clients.push(c);
      if (cfg.enabled && !server) await start();
      persist();
      return status();
    },
    revokeClient(id) {
      cfg.clients = cfg.clients.filter((c) => c.id !== id);
      persist();
      return status();
    },
    async approveAction(id) { await actions.approve(String(id || "")); return status(); },
    rejectAction(id) { actions.reject(String(id || "")); return status(); },
    async close() {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      if (dirty) persist();
      await stop();
    },
  };
}
