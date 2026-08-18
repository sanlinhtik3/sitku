// Sitku MCP — transport-agnostic core. The tool logic + JSON-RPC dispatch live here so BOTH the
// standalone stdio server (mcp/sitku-mcp.mjs, for external clients like Claude Desktop) AND the
// in-app HTTP server (electron/mcp-http-server.mjs, started by the desktop app) run identical code.
//
// `createSitkuCore(getVault)` — getVault() returns the CURRENT vault path each call, so switching
// vaults in the app is picked up live. The app-hosted transport also injects renderer-backed
// Personal CFO, Agent Consultant, and Team tools; standalone stdio remains notes-only.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const SERVER_NAME = "sitku-notes";
export const SERVER_VERSION = "1.0.0";
export const DEFAULT_PROTOCOL = "2025-11-25";

// opts.extraTools: additional tools (e.g. the app-hosted finance/consultant tools backed by an
// IPC bridge). Each is { name, description, inputSchema, run } where run may be async. The stdio
// server passes none (notes-only); the app-hosted HTTP server injects them.
export function createSitkuCore(getVault, opts = {}) {
  const vault = () => path.resolve(String(getVault() || ""));
  const noteApi = opts.notes;
  const sha256 = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");

  function atomicWrite(abs, content) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const temp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}.${Date.now()}.tmp`);
    try { fs.writeFileSync(temp, content, "utf8"); fs.renameSync(temp, abs); }
    finally { try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch { /* best effort */ } }
  }

  /* ── path safety (mirrors electron/local-runtime.mjs normalizeNotePath/ensureInsideVault) ── */
  function safeNotePath(input) {
    const raw = String(input || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (!raw) throw new Error("Note path is required.");
    const withExt = raw.toLowerCase().endsWith(".md") ? raw : `${raw}.md`;
    const normalized = path.posix.normalize(withExt);
    if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../") || path.posix.isAbsolute(normalized)) {
      throw new Error("Note path must stay inside the vault.");
    }
    const root = vault();
    const abs = path.resolve(root, normalized);
    if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error("Resolved path escaped the vault.");
    return { rel: normalized, abs };
  }

  function walkNotes(dir = vault(), out = []) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue; // skip .sitku/.git/hidden
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkNotes(full, out);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(path.relative(vault(), full).split(path.sep).join("/"));
    }
    return out;
  }

  function parseNote(raw, rel) {
    let frontmatter = "", body = raw;
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
    if (m) { frontmatter = m[1]; body = raw.slice(m[0].length); }
    let title = "";
    const fmTitle = /^title:\s*(.+)$/m.exec(frontmatter);
    if (fmTitle) title = fmTitle[1].trim().replace(/^["']|["']$/g, "");
    if (!title) { const h1 = /^#\s+(.+)$/m.exec(body); if (h1) title = h1[1].trim(); }
    if (!title) title = path.posix.basename(rel).replace(/\.md$/i, "");
    return { frontmatter, body, title };
  }

  function readNoteFile(rel) {
    const { abs } = safeNotePath(rel);
    const raw = fs.readFileSync(abs, "utf8");
    const stat = fs.statSync(abs);
    const { frontmatter, body, title } = parseNote(raw, rel);
    return { path: rel, title, frontmatter: frontmatter || null, content: body, modified: stat.mtime.toISOString(), bytes: stat.size };
  }

  const sanitizeFilename = (s) => String(s || "").replace(/[\\/:*?"<>|]/g, "").trim();

  async function listViaRepository(input = {}) {
    if (!noteApi?.listNotes) return null;
    return await noteApi.listNotes(input);
  }

  async function readViaRepository(query) {
    if (!noteApi?.readNote) return null;
    try {
      const exact = await noteApi.readNote(safeNotePath(query).rel);
      if (exact) return exact;
    } catch { /* title lookup below */ }
    const matches = await listViaRepository({ query, limit: 100 });
    const lc = String(query).toLowerCase();
    const hit = matches?.find((n) => String(n.title || "").toLowerCase() === lc)
      || matches?.find((n) => String(n.title || "").toLowerCase().includes(lc));
    return hit ? await noteApi.readNote(hit.path) : null;
  }

  /* ── tools ── */
  const TOOLS = [
    {
      name: "get_vault_info",
      description: "Return the active Sitku vault path and note count. Call this first to confirm which vault the agent is operating on.",
      inputSchema: { type: "object", properties: {} },
      run: async () => {
        const notes = await listViaRepository({ limit: 1_000_000 });
        return { vault: vault(), note_count: notes ? notes.length : walkNotes().length };
      },
    },
    {
      name: "list_notes",
      description: "List notes in the vault (path + title + modified time). Optionally restrict to a folder prefix.",
      inputSchema: {
        type: "object",
        properties: {
          folder: { type: "string", description: "Only list notes under this folder prefix (e.g. 'Projects')." },
          limit: { type: "number", description: "Max notes to return (default 200)." },
        },
      },
      run: async ({ folder, limit } = {}) => {
        const cap = Number(limit) > 0 ? Math.min(Number(limit), 500) : 200;
        const repositoryNotes = await listViaRepository({ folder, limit: cap, sortBy: "mtime", sortOrder: "desc" });
        if (repositoryNotes) {
          return {
            total: repositoryNotes.length,
            returned: repositoryNotes.length,
            notes: repositoryNotes.map((note) => ({ path: note.path, title: note.title, modified: note.mtimeMs ? new Date(note.mtimeMs).toISOString() : null, content_hash: note.contentHash || null })),
          };
        }
        let rels = walkNotes();
        if (folder) {
          const pref = String(folder).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") + "/";
          rels = rels.filter((r) => r.toLowerCase().startsWith(pref.toLowerCase()));
        }
        const notes = rels.slice(0, cap).map((rel) => {
          try {
            const raw = fs.readFileSync(path.resolve(vault(), rel), "utf8");
            const stat = fs.statSync(path.resolve(vault(), rel));
            return { path: rel, title: parseNote(raw, rel).title, modified: stat.mtime.toISOString() };
          } catch { return { path: rel, title: path.posix.basename(rel).replace(/\.md$/i, ""), modified: null }; }
        });
        return { total: rels.length, returned: notes.length, notes };
      },
    },
    {
      name: "search_notes",
      description: "Full-text search across every note's title and body (case-insensitive). Returns matches with a snippet around the first hit. Use this to answer questions about what is in the vault before replying.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Text to search for." }, limit: { type: "number", description: "Max results (default 20)." } },
        required: ["query"],
      },
      run: async ({ query, limit } = {}) => {
        const q = String(query || "").trim();
        if (!q) throw new Error("query is required.");
        const cap = Number(limit) > 0 ? Math.min(Number(limit), 100) : 20;
        if (noteApi?.search) {
          const results = await noteApi.search(q, cap);
          return { query: q, matches: results.length, results: results.slice(0, cap).map((r) => ({ path: r.path, title: r.title, snippet: r.snippet })) };
        }
        const ql = q.toLowerCase();
        const hits = [];
        for (const rel of walkNotes()) {
          let raw;
          try { raw = fs.readFileSync(path.resolve(vault(), rel), "utf8"); } catch { continue; }
          const { title, body } = parseNote(raw, rel);
          const hay = `${title}\n${body}`;
          const idx = hay.toLowerCase().indexOf(ql);
          if (idx < 0) continue;
          const start = Math.max(0, idx - 60);
          const snippet = (start > 0 ? "…" : "") + hay.slice(start, idx + q.length + 80).replace(/\s+/g, " ").trim() + "…";
          hits.push({ path: rel, title, snippet, score: title.toLowerCase().includes(ql) ? 0 : idx + 100 });
        }
        hits.sort((a, b) => a.score - b.score);
        return { query: q, matches: hits.length, results: hits.slice(0, cap).map(({ score, ...r }) => r) };
      },
    },
    {
      name: "read_note",
      description: "Read one note's full content. Match by exact vault path (e.g. 'Projects/Plan.md') or by title (closest match).",
      inputSchema: { type: "object", properties: { path: { type: "string", description: "Vault-relative path OR a note title." } }, required: ["path"] },
      run: async ({ path: q } = {}) => {
        const query = String(q || "").trim();
        if (!query) throw new Error("path is required.");
        if (noteApi?.readNote) {
          const hit = await readViaRepository(query);
          if (!hit) throw new Error(`No note found matching "${query}".`);
          return {
            path: hit.path, title: hit.title, content: hit.content,
            modified: hit.mtimeMs ? new Date(hit.mtimeMs).toISOString() : null,
            content_hash: hit.contentHash || sha256(hit.content),
          };
        }
        try {
          const { rel } = safeNotePath(query);
          if (fs.existsSync(path.resolve(vault(), rel))) return readNoteFile(rel);
        } catch { /* not a path — try title */ }
        const byTitle = walkNotes()
          .map((rel) => { try { return { rel, title: parseNote(fs.readFileSync(path.resolve(vault(), rel), "utf8"), rel).title }; } catch { return null; } })
          .filter(Boolean);
        const lc = query.toLowerCase();
        const hit = byTitle.find((n) => n.title.toLowerCase() === lc) || byTitle.find((n) => n.title.toLowerCase().includes(lc));
        if (!hit) throw new Error(`No note found matching "${query}".`);
        return readNoteFile(hit.rel);
      },
    },
    {
      name: "create_note",
      description: "Create a new Markdown note. Provide either a `path` or a `title` (used to derive the filename). Refuses to overwrite an existing note unless `overwrite` is true.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Vault-relative path, e.g. 'Ideas/New.md'. If omitted, derived from title." },
          title: { type: "string", description: "Note title. Becomes an H1 if the content has none." },
          content: { type: "string", description: "Markdown body." },
          folder: { type: "string", description: "Optional folder to place a title-derived note in." },
          overwrite: { type: "boolean", description: "Allow replacing an existing note (default false)." },
          idempotency_key: { type: "string", description: "Stable unique key for retry-safe creation." },
        },
      },
      run: async ({ path: p, title, content, folder, overwrite } = {}) => {
        let rel;
        if (p) rel = safeNotePath(p).rel;
        else {
          const base = sanitizeFilename(title);
          if (!base) throw new Error("Provide a path or a non-empty title.");
          const prefix = folder ? String(folder).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") + "/" : "";
          rel = safeNotePath(`${prefix}${base}.md`).rel;
        }
        let body = content != null ? String(content) : "";
        if (title && !/^#\s+/m.test(body)) body = `# ${title}\n\n${body}`;
        if (noteApi?.writeNote) {
          const existing = await noteApi.readNote(rel);
          if (existing && !overwrite) throw new Error(`Note already exists: ${rel}. Pass overwrite:true or use update_note.`);
          const saved = await noteApi.writeNote({ path: rel, content: body, expectedHash: existing?.contentHash, syncName: false });
          return { ok: true, path: saved.path, title: saved.title, content_hash: saved.contentHash, bytes: Buffer.byteLength(body) };
        }
        const abs = path.resolve(vault(), rel);
        if (fs.existsSync(abs) && !overwrite) throw new Error(`Note already exists: ${rel}. Pass overwrite:true or use update_note.`);
        atomicWrite(abs, body);
        return { ok: true, path: rel, content_hash: sha256(body), bytes: Buffer.byteLength(body) };
      },
    },
    {
      name: "update_note",
      description: "Update an existing note: replace its content, or append text to the end. The note must already exist.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Vault-relative path of the note to update." },
          content: { type: "string", description: "New full content (replace mode)." },
          append: { type: "string", description: "Text to append to the end of the note (append mode)." },
          expected_hash: { type: "string", description: "Optional optimistic-concurrency hash returned by read_note." },
          idempotency_key: { type: "string", description: "Stable unique key for retry-safe updates." },
        },
        required: ["path"],
      },
      run: async ({ path: p, content, append, expected_hash } = {}) => {
        const { rel, abs } = safeNotePath(p);
        if (noteApi?.writeNote) {
          const existing = await noteApi.readNote(rel);
          if (!existing) throw new Error(`Note not found: ${rel}. Use create_note to make it.`);
          if (expected_hash && existing.contentHash !== expected_hash) throw new Error("Note changed since it was read. Read it again before updating.");
          const next = append != null
            ? String(existing.content || "").replace(/\s*$/, "") + "\n\n" + String(append) + "\n"
            : content != null ? String(content) : null;
          if (next == null) throw new Error("Provide either `content` (replace) or `append`.");
          const saved = await noteApi.writeNote({ path: rel, content: next, expectedHash: existing.contentHash, syncName: false });
          return { ok: true, path: saved.path, mode: append != null ? "append" : "replace", content_hash: saved.contentHash, bytes: Buffer.byteLength(next) };
        }
        if (!fs.existsSync(abs)) throw new Error(`Note not found: ${rel}. Use create_note to make it.`);
        const current = fs.readFileSync(abs, "utf8");
        if (expected_hash && sha256(current) !== expected_hash) throw new Error("Note changed since it was read. Read it again before updating.");
        if (append != null) {
          const joined = current.replace(/\s*$/, "") + "\n\n" + String(append) + "\n";
          atomicWrite(abs, joined);
          return { ok: true, path: rel, mode: "append", content_hash: sha256(joined), bytes: Buffer.byteLength(joined) };
        }
        if (content != null) {
          atomicWrite(abs, String(content));
          return { ok: true, path: rel, mode: "replace", content_hash: sha256(content), bytes: Buffer.byteLength(String(content)) };
        }
        throw new Error("Provide either `content` (replace) or `append`.");
      },
    },
  ];
  if (Array.isArray(opts.extraTools)) TOOLS.push(...opts.extraTools);

  if (opts.actionGateway) {
    TOOLS.push({
      name: "action_status",
      description: "Check a pending or completed Sitku action after the user reviews it in the app.",
      inputSchema: { type: "object", properties: { action_id: { type: "string" } }, required: ["action_id"] },
      requiredScope: "actions:read",
      run: ({ action_id } = {}) => {
        const action = opts.actionGateway.get(String(action_id || ""));
        if (!action) throw new Error("Action not found or expired.");
        return action;
      },
    });
  }

  const writeTools = new Set([
    "create_note", "update_note",
    "finance_add_transaction", "finance_update_transaction",
    "consultant_add_revenue", "consultant_add_expense", "consultant_add_post", "consultant_update_post_metrics",
    "team_add_member", "team_add_project", "team_add_task", "team_update_task", "team_add_kpi", "team_record_kpi",
    "team_add_comment", "team_add_attendance", "team_add_leave", "team_add_review", "team_add_payroll", "team_update_approval",
  ]);
  const scopeFor = (name, write) => {
    if (name === "action_status") return "actions:read";
    if (name.startsWith("finance_")) return `finance:${write ? "write" : "read"}`;
    if (name.startsWith("consultant_")) return `consultant:${write ? "write" : "read"}`;
    if (name.startsWith("team_")) return `team:${write ? "write" : "read"}`;
    return `notes:${write ? "write" : "read"}`;
  };
  for (const tool of TOOLS) {
    const writes = tool.requiresConfirmation ?? writeTools.has(tool.name);
    tool.requiresConfirmation = writes;
    tool.requiredScope ||= scopeFor(tool.name, writes);
    tool.annotations ||= {
      readOnlyHint: !writes,
      destructiveHint: tool.name === "update_note",
      idempotentHint: !writes || tool.name === "update_note" || Boolean(tool.inputSchema?.properties?.idempotency_key),
      openWorldHint: false,
    };
  }
  const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

  function authorize(tool, context) {
    const scopes = context.client?.scopes || ["*"];
    if (!scopes.includes("*") && !scopes.includes(tool.requiredScope)) {
      throw new Error(`Client lacks required scope: ${tool.requiredScope}`);
    }
  }

  const resources = [
    { uri: "sitku://vault", name: "Sitku Vault", description: "Active vault identity and note count", mimeType: "application/json", tool: "get_vault_info" },
    { uri: "sitku://finance/summary", name: "Personal CFO Summary", description: "Current 90-day finance summary", mimeType: "application/json", tool: "finance_summary" },
    { uri: "sitku://consultant/summary", name: "Agent Consultant Summary", description: "Current 90-day consultant summary", mimeType: "application/json", tool: "consultant_summary" },
    { uri: "sitku://team/overview", name: "Team Overview", description: "Current team, tasks, and KPI overview", mimeType: "application/json", tool: "team_overview" },
    { uri: "sitku://team/health", name: "Team Health", description: "Current weighted team health and data coverage", mimeType: "application/json", tool: "team_health" },
  ].filter((resource) => TOOL_MAP.has(resource.tool));
  const prompts = [
    { name: "daily_review", description: "Review today's notes and produce the next three actions", text: "Review today's modified notes. Summarize progress, blockers, and the next three concrete actions. Read data before answering." },
    { name: "monthly_cfo_review", description: "Review Personal CFO performance", text: "Review this month's Personal CFO data. Reconcile income, expenses, subscriptions, and net. Flag anomalies and ask before proposing any write." },
    { name: "consultant_weekly_review", description: "Review content performance", text: "Review this week's Agent Consultant data. Explain channel performance, top posts, weak signals, and the next highest-leverage action." },
    { name: "team_performance_review", description: "Review team delivery and KPIs", text: "Review team workload, overdue tasks, completed work, social metrics, and KPI attainment. Keep the answer visual and action-focused." },
  ];

  /* ── JSON-RPC dispatch (transport-agnostic). Returns a response object, or null for notifications. ── */
  async function dispatch(msg, context = {}) {
    const { id, method, params } = msg || {};
    const isRequest = id !== undefined && id !== null;
    const ok = (result) => (isRequest ? { jsonrpc: "2.0", id, result } : null);
    const err = (code, message) => (isRequest ? { jsonrpc: "2.0", id, error: { code, message } } : null);

    switch (method) {
      case "initialize":
        return ok({
          protocolVersion: (params && params.protocolVersion) || DEFAULT_PROTOCOL,
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION, description: "Local-first Sitku data and action server" },
          instructions: "Read before writing. All important writes become pending actions and execute only after the user approves them inside Sitku. Use get_vault_info first, preserve existing data, use device-local dates, keep responses concise, and poll action_status after proposing a write.",
        });
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: TOOLS.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })) });
      case "tools/call": {
        const tool = TOOL_MAP.get(params && params.name);
        if (!tool) return err(-32602, `Unknown tool: ${params && params.name}`);
        try {
          authorize(tool, context);
          const args = params.arguments || {};
          const result = tool.requiresConfirmation && opts.actionGateway
            ? {
                status: "confirmation_required",
                message: "Review and approve this action inside Sitku before it runs.",
                action: opts.actionGateway.propose({
                  client: context.client,
                  tool: tool.name,
                  preview: tool.preview ? tool.preview(args) : `${tool.description}\n${JSON.stringify(args)}`,
                  idempotencyKey: typeof args.idempotency_key === "string" ? args.idempotency_key : null,
                  execute: () => tool.run(args, context),
                }),
              }
            : await tool.run(args, context);
          return ok({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
        } catch (e) {
          return ok({ content: [{ type: "text", text: `Error: ${e && e.message ? e.message : String(e)}` }], isError: true });
        }
      }
      case "resources/list":
        return ok({ resources: resources.map(({ tool, ...resource }) => resource) });
      case "resources/templates/list":
        return ok({ resourceTemplates: [{ uriTemplate: "sitku://note/{path}", name: "Sitku Note", description: "Read one note by vault-relative path", mimeType: "text/markdown" }] });
      case "resources/read": {
        try {
          const uri = String(params?.uri || "");
          if (uri.startsWith("sitku://note/")) {
            const tool = TOOL_MAP.get("read_note");
            authorize(tool, context);
            const note = await tool.run({ path: decodeURIComponent(uri.slice("sitku://note/".length)) }, context);
            return ok({ contents: [{ uri, mimeType: "text/markdown", text: note.content }] });
          }
          const resource = resources.find((item) => item.uri === uri);
          if (!resource) return err(-32602, `Unknown resource: ${uri}`);
          const tool = TOOL_MAP.get(resource.tool);
          authorize(tool, context);
          const data = await tool.run({}, context);
          return ok({ contents: [{ uri, mimeType: resource.mimeType, text: JSON.stringify(data, null, 2) }] });
        } catch (error) {
          return err(-32001, error?.message || String(error));
        }
      }
      case "prompts/list":
        return ok({ prompts: prompts.map(({ text, ...prompt }) => ({ ...prompt, arguments: [] })) });
      case "prompts/get": {
        const prompt = prompts.find((item) => item.name === params?.name);
        if (!prompt) return err(-32602, `Unknown prompt: ${params?.name}`);
        return ok({ description: prompt.description, messages: [{ role: "user", content: { type: "text", text: prompt.text } }] });
      }
      default:
        return err(-32601, `Method not found: ${method}`);
    }
  }

  return { tools: TOOLS, dispatch };
}
