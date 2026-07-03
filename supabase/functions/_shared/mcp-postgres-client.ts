// ═══════════════════════════════════════════════════════════════════════════
// MCP Postgres Client — Phase 1.4 of docs/AGENTIC_AUDIT.md
//
// Speaks the MCP wire protocol (JSON-RPC 2.0) so we are MCP-compliant.
// Two transports supported:
//
//   1. REMOTE (preferred) — connects via SSE to an external MCP Postgres
//      server when MCP_POSTGRES_URL env var is set. This is the production
//      path that lights up DoD checkpoint MCP-1 ("MCP client connection").
//
//   2. LOCAL ADAPTER (fallback) — implements the MCP `tools/list` and
//      `tools/call` shape but executes against the Supabase service client
//      directly. Useful for local dev and zero-infra rollout; still proves
//      the MCP integration pattern (same call signature, same JSON shape).
//
// All requests are read-only — only `SELECT` allowed. The local adapter
// rejects anything else; the remote server is expected to enforce the same.
// ═══════════════════════════════════════════════════════════════════════════

export interface McpToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface McpPostgresClient {
  transport: "remote" | "local";
  callTool(name: string, args: Record<string, any>): Promise<McpToolCallResult>;
  close(): Promise<void>;
}

// ─── REMOTE TRANSPORT (SSE / JSON-RPC) ───────────────────────────────────
// Minimal MCP client over Server-Sent Events. Uses the JSON-RPC 2.0 frames
// that the MCP TypeScript SDK speaks. We hand-roll instead of pulling the
// SDK so the Deno cold-start cost stays small.
class RemoteMcpPostgresClient implements McpPostgresClient {
  transport: "remote" = "remote";
  private rpcId = 0;
  private pending = new Map<number, (v: any) => void>();
  private readerAborter = new AbortController();
  private sendUrl: string;

  constructor(private endpointUrl: string, private authToken?: string) {
    this.sendUrl = endpointUrl;
  }

  async init() {
    // Open SSE channel for server → client messages
    const headers: Record<string, string> = { accept: "text/event-stream" };
    if (this.authToken) headers.authorization = `Bearer ${this.authToken}`;
    const res = await fetch(this.endpointUrl, { method: "GET", headers, signal: this.readerAborter.signal });
    if (!res.ok || !res.body) throw new Error(`MCP SSE open failed: ${res.status}`);
    this.consumeSSE(res.body.getReader());

    // MCP `initialize` handshake
    await this.rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "beebot-mcp-postgres-client", version: "1.0.0" },
    });
    await this.rpc("notifications/initialized", {}, /* notification */ true);
  }

  private async consumeSSE(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const dec = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 2);
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const msg = JSON.parse(dataLine.slice(6));
            if (typeof msg.id === "number" && this.pending.has(msg.id)) {
              this.pending.get(msg.id)!(msg);
              this.pending.delete(msg.id);
            }
          } catch { /* malformed frame — ignore */ }
        }
      }
    } catch {
      // reader aborted on close()
    }
  }

  private async rpc(method: string, params: any, notification = false): Promise<any> {
    const id = notification ? undefined : ++this.rpcId;
    const body = JSON.stringify({ jsonrpc: "2.0", method, params, ...(id !== undefined ? { id } : {}) });
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.authToken) headers.authorization = `Bearer ${this.authToken}`;
    const sendPromise = fetch(this.sendUrl, { method: "POST", headers, body });
    if (notification) { await sendPromise; return null; }
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id!); reject(new Error(`MCP rpc ${method} timeout`)); }, 30_000);
      this.pending.set(id!, (msg) => {
        clearTimeout(timer);
        if (msg.error) reject(new Error(`MCP rpc ${method} error: ${msg.error.message}`));
        else resolve(msg.result);
      });
      sendPromise.catch((e) => { clearTimeout(timer); this.pending.delete(id!); reject(e); });
    });
  }

  async callTool(name: string, args: Record<string, any>): Promise<McpToolCallResult> {
    const result = await this.rpc("tools/call", { name, arguments: args });
    return result as McpToolCallResult;
  }

  async close(): Promise<void> {
    this.readerAborter.abort();
    this.pending.clear();
  }
}

// ─── LOCAL ADAPTER (MCP-shape, Supabase-backed) ──────────────────────────
// Speaks the same MCP `tools/call` envelope but executes against the
// supplied Supabase service client. Read-only.
class LocalMcpPostgresAdapter implements McpPostgresClient {
  transport: "local" = "local";

  constructor(private serviceClient: any) {}

  async callTool(name: string, args: Record<string, any>): Promise<McpToolCallResult> {
    if (name !== "query") {
      return { content: [{ type: "text", text: `Unsupported tool: ${name}` }], isError: true };
    }
    const sql = String(args?.sql ?? "").trim();
    if (!/^select\b/i.test(sql)) {
      return { content: [{ type: "text", text: "Only SELECT statements are permitted." }], isError: true };
    }
    // Length cap to prevent abuse
    if (sql.length > 5000) {
      return { content: [{ type: "text", text: "Query too long (max 5000 chars)." }], isError: true };
    }
    // Block dangerous constructs even in SELECT
    if (/\b(pg_sleep|copy|lo_)/i.test(sql)) {
      return { content: [{ type: "text", text: "Blocked SQL construct." }], isError: true };
    }
    try {
      // Use Supabase RPC `exec_readonly_sql` if present, else error.
      // Migrations may need to add it; see plan §risk.
      const { data, error } = await this.serviceClient.rpc("exec_readonly_sql", { p_sql: sql });
      if (error) return { content: [{ type: "text", text: `DB error: ${error.message}` }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Adapter error: ${e?.message ?? e}` }], isError: true };
    }
  }

  async close(): Promise<void> { /* nothing to close */ }
}

// ─── FACTORY ─────────────────────────────────────────────────────────────
export async function openMcpPostgresClient(opts: {
  serviceClient: any;            // Supabase service-role client (always passed)
  remoteUrl?: string | null;     // MCP_POSTGRES_URL env var
  authToken?: string | null;
}): Promise<McpPostgresClient> {
  if (opts.remoteUrl) {
    try {
      const client = new RemoteMcpPostgresClient(opts.remoteUrl, opts.authToken ?? undefined);
      await client.init();
      console.log(`[mcp-postgres] remote client connected → ${opts.remoteUrl}`);
      return client;
    } catch (e: any) {
      console.warn(`[mcp-postgres] remote connect failed: ${e?.message ?? e} — falling back to local adapter`);
    }
  }
  console.log(`[mcp-postgres] using local adapter (no remote URL configured)`);
  return new LocalMcpPostgresAdapter(opts.serviceClient);
}
