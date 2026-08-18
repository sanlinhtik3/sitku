// App-hosted MCP server over HTTP (MCP "Streamable HTTP" transport), started by the desktop app so
// agentic AIs can connect by URL — no terminal, no manual `node`. Shares the exact tool logic with
// the standalone stdio server via mcp/sitku-mcp-core.mjs.
//
// Security: binds 127.0.0.1 ONLY, rejects cross-origin requests (DNS-rebinding guard), and delegates
// auth to `authenticate(token)` — the MCP manager owns per-client tokens + activity so individual
// AIs can be listed and revoked. App-hosted domain tools use the renderer bridge.

import http from "node:http";
import { createSitkuCore } from "../mcp/sitku-mcp-core.mjs";

const HOST = "127.0.0.1";

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("payload too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Allow requests with no Origin (native MCP clients) or a localhost Origin only — blocks a malicious
// web page from reaching the local server via the user's browser (DNS rebinding).
function originAllowed(origin) {
  if (!origin) return true;
  try { const h = new URL(origin).hostname; return h === "127.0.0.1" || h === "localhost" || h === "::1"; }
  catch { return false; }
}

/**
 * @param {object} opts
 * @param {() => string} opts.getVault             current active vault path
 * @param {number} [opts.port]                     preferred port (auto-increments if taken)
 * @param {(token:string) => (object|null)} opts.authenticate  returns the client record (records
 *                                                  activity as a side effect) or null to reject
 * @param {Array} [opts.extraTools]  app-hosted tools (finance/consultant/team) merged into the core
 * @returns {Promise<{url:string, port:number, close:()=>Promise<void>}>}
 */
export function startMcpHttpServer({ getVault, port = 7429, authenticate, extraTools, notes, actionGateway } = {}) {
  const core = createSitkuCore(getVault, { extraTools, notes, actionGateway });

  const server = http.createServer(async (req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };

    if (!originAllowed(req.headers.origin)) return send(403, { error: "forbidden origin" });
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, `http://${HOST}`);
    if (url.pathname !== "/mcp") return send(404, { error: "not found" });

    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const client = authenticate ? authenticate(bearer) : {};
    if (!client) return send(401, { error: "unauthorized" });

    if (req.method === "GET") return send(405, { error: "use POST for MCP messages" }); // no server-initiated SSE needed
    if (req.method !== "POST") return send(405, { error: "method not allowed" });

    let payload;
    try { payload = JSON.parse(await readBody(req)); }
    catch { return send(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }

    try {
      if (Array.isArray(payload)) {
        const out = (await Promise.all(payload.map((m) => core.dispatch(m, { client })))).filter(Boolean);
        return out.length ? send(200, out) : (res.writeHead(202), res.end());
      }
      const out = await core.dispatch(payload, { client });
      return out ? send(200, out) : (res.writeHead(202), res.end());
    } catch (e) {
      return send(500, { jsonrpc: "2.0", id: (payload && payload.id) ?? null, error: { code: -32603, message: String(e && e.message || e) } });
    }
  });

  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryListen = (p) => {
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE" && attempts++ < 20) tryListen(p + 1);
        else reject(err);
      });
      server.listen(p, HOST, () => resolve({
        url: `http://${HOST}:${server.address().port}/mcp`,
        port: server.address().port,
        close: () => new Promise((r) => server.close(() => r())),
      }));
    };
    tryListen(port);
  });
}
