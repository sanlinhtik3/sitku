import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const LOCAL_AGENT_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS agent_chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  session_instructions TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_chat_sessions_user_active
  ON agent_chat_sessions(user_id, is_active, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_chat_sessions_kind
  ON agent_chat_sessions(json_extract(metadata_json, '$.kind'));

CREATE TABLE IF NOT EXISTS agent_chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_chat_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  attachments_json TEXT,
  tool_calls_json TEXT,
  tool_results_json TEXT,
  thoughts_json TEXT,
  is_error INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  source_channel TEXT,
  response_rating TEXT,
  feedback_text TEXT,
  feedback_at TEXT,
  is_shared INTEGER NOT NULL DEFAULT 0,
  share_uid TEXT,
  shared_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_chat_messages_session_created
  ON agent_chat_messages(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_chat_messages_user_created
  ON agent_chat_messages(user_id, created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS agent_chat_messages_fts
  USING fts5(message_id UNINDEXED, session_id UNINDEXED, content);

CREATE TRIGGER IF NOT EXISTS trg_agent_chat_messages_fts_insert
AFTER INSERT ON agent_chat_messages
BEGIN
  INSERT INTO agent_chat_messages_fts(message_id, session_id, content)
  VALUES (new.id, new.session_id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS trg_agent_chat_messages_fts_update
AFTER UPDATE OF content ON agent_chat_messages
BEGIN
  UPDATE agent_chat_messages_fts
  SET content = new.content
  WHERE message_id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_agent_chat_messages_fts_delete
AFTER DELETE ON agent_chat_messages
BEGIN
  DELETE FROM agent_chat_messages_fts
  WHERE message_id = old.id;
END;

CREATE TABLE IF NOT EXISTS note_index (
  path TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  frontmatter_json TEXT NOT NULL DEFAULT '{}',
  tags_json TEXT NOT NULL DEFAULT '[]',
  links_json TEXT NOT NULL DEFAULT '[]',
  mtime_ms INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_note_index_title
  ON note_index(title);

CREATE VIRTUAL TABLE IF NOT EXISTS note_index_fts
  USING fts5(path UNINDEXED, title, content);
`;

const unavailableMethods = {
  memories: ["listMemories", "upsertMemory", "deleteMemory", "recordMemoryAccess"],
  tasks: ["listTasks", "upsertTask", "deleteTask"],
};

const BUILT_IN_SKILL_MANIFESTS = [
  {
    id: "agent.chat",
    name: "Sitku Agent",
    version: "1.0.0",
    description: "Runs the embedded Sitku conversation panel and routes requests to enabled skills.",
    category: "agent",
    permissions: ["agent.chat", "conversation.read", "conversation.write"],
    entry: "core/agent",
    enabledByDefault: true,
    isDesktopOnly: false,
    core: true,
  },
  {
    id: "notes.read",
    name: "Read Notes",
    version: "1.0.0",
    description: "Reads Markdown notes from the active vault.",
    category: "notes",
    permissions: ["vault.read"],
    entry: "skills/notes/read",
    enabledByDefault: true,
    isDesktopOnly: false,
  },
  {
    id: "notes.create",
    name: "Create Notes",
    version: "1.0.0",
    description: "Creates and updates Markdown notes in the active vault.",
    category: "notes",
    permissions: ["vault.read", "vault.write"],
    entry: "skills/notes/write",
    enabledByDefault: true,
    isDesktopOnly: false,
  },
  {
    id: "notes.delete",
    name: "Delete Notes",
    version: "1.0.0",
    description: "Deletes Markdown notes from the active vault after user confirmation.",
    category: "notes",
    permissions: ["vault.write", "vault.delete"],
    entry: "skills/notes/delete",
    enabledByDefault: true,
    isDesktopOnly: false,
  },
  {
    id: "notes.search",
    name: "Search Notes",
    version: "1.0.0",
    description: "Searches the active vault through SQLite FTS metadata.",
    category: "notes",
    permissions: ["vault.read", "search.read"],
    entry: "skills/notes/search",
    enabledByDefault: true,
    isDesktopOnly: false,
  },
  {
    id: "system.vault",
    name: "Vault Manager",
    version: "1.0.0",
    description: "Opens, creates, switches, and reveals local vault folders.",
    category: "system",
    permissions: ["system.dialog", "vault.read", "vault.write"],
    entry: "skills/system/vault",
    enabledByDefault: true,
    isDesktopOnly: true,
  },
  {
    id: "memory.local",
    name: "Local Memory",
    version: "0.1.0",
    description: "Stores and retrieves BeeBot runtime memories in SQLite.",
    category: "memory",
    permissions: ["memory.read", "memory.write"],
    entry: "skills/memory/local",
    enabledByDefault: false,
    isDesktopOnly: false,
  },
  {
    id: "tasks.local",
    name: "Local Tasks",
    version: "0.1.0",
    description: "Creates and tracks BeeBot tasks in SQLite.",
    category: "tasks",
    permissions: ["tasks.read", "tasks.write"],
    entry: "skills/tasks/local",
    enabledByDefault: false,
    isDesktopOnly: false,
  },
  {
    id: "web.search",
    name: "Web Search",
    version: "0.1.0",
    description: "Placeholder for future permissioned web search tools.",
    category: "web",
    permissions: ["network.web"],
    entry: "skills/web/search",
    enabledByDefault: false,
    isDesktopOnly: false,
  },
  {
    id: "crypto.price",
    name: "Crypto Price",
    version: "0.1.0",
    description: "Placeholder for future permissioned market data tools.",
    category: "crypto",
    permissions: ["network.crypto"],
    entry: "skills/crypto/price",
    enabledByDefault: false,
    isDesktopOnly: false,
  },
];

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function stringifyJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapSession(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_message_at: row.last_message_at,
    message_count: row.message_count,
    metadata: parseJson(row.metadata_json, {}),
    session_instructions: row.session_instructions,
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    session_id: row.session_id,
    user_id: row.user_id,
    role: row.role,
    content: row.content,
    attachments: parseJson(row.attachments_json, null),
    tool_calls: parseJson(row.tool_calls_json, undefined),
    tool_results: parseJson(row.tool_results_json, undefined),
    thoughts: parseJson(row.thoughts_json, null),
    is_error: Boolean(row.is_error),
    created_at: row.created_at,
    source_channel: row.source_channel,
    response_rating: row.response_rating,
    feedback_text: row.feedback_text,
    feedback_at: row.feedback_at,
    is_shared: Boolean(row.is_shared),
    share_uid: row.share_uid,
    shared_at: row.shared_at,
  };
}

class ConversationRepository {
  constructor(db) {
    this.db = db;
    this.sessionListeners = new Map();
    this.userListeners = new Map();
  }

  listSessions(input) {
    return this.db.prepare(`
      SELECT *
      FROM agent_chat_sessions
      WHERE user_id = ?
        AND is_active = 1
        AND json_extract(metadata_json, '$.kind') = ?
      ORDER BY last_message_at DESC NULLS LAST, updated_at DESC
    `).all(input.userId, input.kind).map(mapSession);
  }

  createSession(input) {
    const timestamp = nowIso();
    const session = {
      id: createId("session"),
      user_id: input.userId,
      title: input.title,
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp,
      last_message_at: null,
      message_count: 0,
      metadata: { ...(input.metadata || {}), kind: input.kind },
      session_instructions: input.sessionInstructions || null,
    };

    this.db.prepare(`
      INSERT INTO agent_chat_sessions (
        id, user_id, title, is_active, created_at, updated_at, last_message_at,
        message_count, metadata_json, session_instructions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.user_id,
      session.title,
      1,
      session.created_at,
      session.updated_at,
      session.last_message_at,
      session.message_count,
      JSON.stringify(session.metadata),
      session.session_instructions,
    );

    return session;
  }

  archiveSession(sessionId) {
    this.db.prepare("UPDATE agent_chat_sessions SET is_active = 0, updated_at = ? WHERE id = ?").run(nowIso(), sessionId);
  }

  renameSession(sessionId, title) {
    this.db.prepare("UPDATE agent_chat_sessions SET title = ?, updated_at = ? WHERE id = ?").run(title, nowIso(), sessionId);
  }

  updateSessionInstructions(sessionId, instructions) {
    this.db.prepare("UPDATE agent_chat_sessions SET session_instructions = ?, updated_at = ? WHERE id = ?").run(instructions || null, nowIso(), sessionId);
  }

  finalizeSessionSummary(sessionId) {
    const row = this.db.prepare("SELECT metadata_json FROM agent_chat_sessions WHERE id = ?").get(sessionId);
    const metadata = parseJson(row?.metadata_json, {});
    metadata.summary_finalized_at = nowIso();
    this.db.prepare("UPDATE agent_chat_sessions SET metadata_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(metadata), nowIso(), sessionId);
  }

  listMessages(input) {
    const rows = this.db.prepare(`
      SELECT *
      FROM agent_chat_messages
      WHERE session_id = ?
        AND (? IS NULL OR created_at < ?)
      ORDER BY created_at DESC
      LIMIT ?
    `).all(input.sessionId, input.beforeCreatedAt ?? null, input.beforeCreatedAt ?? null, input.limit);

    return {
      messages: rows.reverse().map(mapMessage),
      hasMore: rows.length >= input.limit,
    };
  }

  createMessage(input) {
    const timestamp = nowIso();
    const message = {
      id: createId("message"),
      session_id: input.sessionId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      attachments: input.attachments ?? null,
      tool_calls: input.toolCalls,
      tool_results: input.toolResults,
      thoughts: input.thoughts ?? null,
      is_error: input.isError ?? false,
      created_at: timestamp,
      source_channel: input.sourceChannel ?? null,
      response_rating: null,
      feedback_text: null,
      feedback_at: null,
      is_shared: false,
      share_uid: null,
      shared_at: null,
    };

    this.write(() => {
      this.db.prepare(`
        INSERT INTO agent_chat_messages (
          id, session_id, user_id, role, content, attachments_json, tool_calls_json,
          tool_results_json, thoughts_json, is_error, created_at, source_channel,
          response_rating, feedback_text, feedback_at, is_shared, share_uid, shared_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        message.id,
        message.session_id,
        message.user_id,
        message.role,
        message.content,
        stringifyJson(message.attachments),
        stringifyJson(message.tool_calls),
        stringifyJson(message.tool_results),
        stringifyJson(message.thoughts),
        message.is_error ? 1 : 0,
        message.created_at,
        message.source_channel,
        message.response_rating,
        message.feedback_text,
        message.feedback_at,
        message.is_shared ? 1 : 0,
        message.share_uid,
        message.shared_at,
      );

      this.db.prepare(`
        UPDATE agent_chat_sessions
        SET message_count = message_count + 1,
            last_message_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(message.created_at, message.created_at, message.session_id);
    });

    this.emitMessage(message);
  }

  updateMessageContent(messageId, content) {
    this.db.prepare("UPDATE agent_chat_messages SET content = ? WHERE id = ?").run(content, messageId);
  }

  deleteMessage(messageId) {
    const row = this.db.prepare("SELECT session_id FROM agent_chat_messages WHERE id = ?").get(messageId);
    if (!row?.session_id) return;
    this.write(() => {
      this.db.prepare("DELETE FROM agent_chat_messages WHERE id = ?").run(messageId);
      this.refreshSessionMessageStats(row.session_id);
    });
  }

  countThreadReplies(input) {
    const rows = this.db.prepare(`
      SELECT
        json_extract(s.metadata_json, '$.source_message_id') AS source_message_id,
        COUNT(m.id) AS assistant_count
      FROM agent_chat_sessions s
      LEFT JOIN agent_chat_messages m
        ON m.session_id = s.id
       AND m.role = 'assistant'
      WHERE s.user_id = ?
        AND s.is_active = 1
        AND json_extract(s.metadata_json, '$.kind') = 'thread'
        AND json_extract(s.metadata_json, '$.parent_session_id') = ?
      GROUP BY source_message_id
    `).all(input.userId, input.parentSessionId);

    const map = {};
    for (const row of rows) {
      if (row.source_message_id) map[row.source_message_id] = Number(row.assistant_count || 0);
    }
    return map;
  }

  subscribeToSessionMessages(sessionId, onInsert) {
    const listeners = this.sessionListeners.get(sessionId) || new Set();
    listeners.add(onInsert);
    this.sessionListeners.set(sessionId, listeners);
    return {
      unsubscribe: () => {
        listeners.delete(onInsert);
        if (!listeners.size) this.sessionListeners.delete(sessionId);
      },
    };
  }

  subscribeToUserMessages(userId, onInsert) {
    const listeners = this.userListeners.get(userId) || new Set();
    listeners.add(onInsert);
    this.userListeners.set(userId, listeners);
    return {
      unsubscribe: () => {
        listeners.delete(onInsert);
        if (!listeners.size) this.userListeners.delete(userId);
      },
    };
  }

  refreshSessionMessageStats(sessionId) {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS message_count, MAX(created_at) AS last_message_at
      FROM agent_chat_messages
      WHERE session_id = ?
    `).get(sessionId);

    this.db.prepare(`
      UPDATE agent_chat_sessions
      SET message_count = ?, last_message_at = ?, updated_at = ?
      WHERE id = ?
    `).run(Number(row?.message_count || 0), row?.last_message_at ?? null, nowIso(), sessionId);
  }

  write(fn) {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  emitMessage(message) {
    this.sessionListeners.get(message.session_id)?.forEach((listener) => listener());
    this.userListeners.get(message.user_id)?.forEach((listener) => listener({ new: message }));
  }
}

// ── System storage layout ──────────────────────────────────────────────────
// Global app data persists under ~/.sitku/ (hidden, user-owned), split by
// concern into per-domain JSON files + themed dirs. No heavy DB framework —
// just fs + atomic temp-file writes so a crash mid-write can never corrupt a
// config file. Per-vault settings (Obsidian-style) live inside the vault at
// <vault>/.sitku/ so they travel with the vault when it moves machines.
//
//   ~/.sitku/                         (global — copy this + the vault to migrate)
//   ├── app.json           app-level settings (LLM provider, misc)
//   ├── appearance.json    theme/font/window prefs
//   ├── workspace.json     active vault path, bookmarks, local user id
//   ├── themes/            custom theme JSON files
//   ├── vault/             default vault location (Markdown notes)
//   ├── cache/             transient/evictable artifacts
//   └── sitku-agent.sqlite agent memory DB
//
//   <vault>/.sitku/                   (per-vault — travels with the vault)
//   └── core-plugins.json  skill enablement for this vault

const SYSTEM_DIR_NAME = ".sitku";

// Per-vault config dir (Obsidian's `.obsidian` equivalent). Skill enablement and
// any future per-vault prefs live here so they move with the vault across machines.
const VAULT_CONFIG_DIR = ".sitku";

/** Ensure <vault>/.sitku exists, migrating a legacy <vault>/.beebot in place
 *  first. Non-destructive: only renames when the new dir isn't already there,
 *  so a vault from the old build keeps its skill config after the rename.
 *  MUST be called instead of a bare mkdir — a plain mkdir of the new dir would
 *  orphan the old `.beebot` and silently reset skill enablement. Returns dir. */
function ensureVaultConfigDir(vaultPath) {
  const dir = path.join(vaultPath, VAULT_CONFIG_DIR);
  const legacy = path.join(vaultPath, ".beebot");
  if (!fs.existsSync(dir) && fs.existsSync(legacy)) {
    try { fs.renameSync(legacy, dir); } catch (error) { console.warn("[Sitku] vault config migrate failed", error); }
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Map a settings key namespace (e.g. "workspace.appearance") to its file
 *  name. Keys not matched default to app.json so nothing is ever lost. */
function namespaceToFile(key) {
  const k = String(key || "").toLowerCase();
  if (k.includes("appearance") || k.includes("theme") || k.includes("font") || k.includes("ribbon")) return "appearance.json";
  if (k.includes("core-plugins") || k === "skills" || k.startsWith("skills.") || k.includes("plugin")) return "core-plugins.json";
  if (k.includes("page-preview") || k.includes("preview")) return "page-preview.json";
  if (k === "workspaces" || k.startsWith("workspaces.")) return "workspaces.json";
  if (k.startsWith("workspace.") || k === "vault" || k.startsWith("vault.")) return "workspace.json";
  return "app.json";
}

export class SystemStorage {
  constructor(rootDir) {
    this.root = rootDir;
    // Auto-create the layout once. Idempotent — safe to call every boot.
    for (const sub of ["themes", "vault", "cache"]) {
      fs.mkdirSync(path.join(this.root, sub), { recursive: true });
    }
    this.files = new Map(); // fileName → parsed object (lazy, in-memory cache)
  }

  fileFor(key) {
    return path.join(this.root, namespaceToFile(key));
  }

  /** Atomic JSON write: serialize → write to `<file>.tmp` → fs.rename to the
   *  final path. rename() is atomic on POSIX + Windows, so a crash mid-write
   *  leaves either the previous file intact or the new one — never a half. */
  writeJson(fileName, value) {
    const target = path.join(this.root, fileName);
    const tmp = `${target}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(tmp, target);
    this.files.set(fileName, value);
  }

  readJson(fileName, fallback = {}) {
    if (this.files.has(fileName)) return this.files.get(fileName);
    try {
      const value = JSON.parse(fs.readFileSync(path.join(this.root, fileName), "utf8"));
      this.files.set(fileName, value);
      return value;
    } catch (error) {
      if (error.code !== "ENOENT") console.warn(`[storage] ${fileName} reset`, error);
      return fallback;
    }
  }
}

class JsonSettingsRepository {
  // `storage` is a SystemStorage instance. Falls back to the legacy single-file
  // path if constructed with a string (back-compat for tests).
  constructor(storageOrPath) {
    if (typeof storageOrPath === "string") {
      this.legacy = true;
      this.settingsPath = storageOrPath;
      this.values = {};
      this.load();
      return;
    }
    this.legacy = false;
    this.storage = storageOrPath;
  }

  get(key) {
    if (this.legacy) {
      return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null;
    }
    const file = namespaceToFile(key);
    const obj = this.storage.readJson(file);
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
    if (file !== "workspace.json") {
      const wsObj = this.storage.readJson("workspace.json");
      if (Object.prototype.hasOwnProperty.call(wsObj, key)) {
        obj[key] = wsObj[key];
        this.storage.writeJson(file, obj);
        delete wsObj[key];
        this.storage.writeJson("workspace.json", wsObj);
        return obj[key];
      }
    }
    return null;
  }

  set(key, value) {
    if (this.legacy) { this.values[key] = value; this.save(); return; }
    const file = namespaceToFile(key);
    const obj = this.storage.readJson(file);
    obj[key] = value;
    this.storage.writeJson(file, obj);
  }

  remove(key) {
    if (this.legacy) { delete this.values[key]; this.save(); return; }
    const file = namespaceToFile(key);
    const obj = this.storage.readJson(file);
    delete obj[key];
    this.storage.writeJson(file, obj);
  }

  list(prefix = "") {
    if (this.legacy) {
      return Object.fromEntries(Object.entries(this.values).filter(([key]) => key.startsWith(prefix)));
    }
    // Gather across all known files (cheap — small set) so list() still works.
    const all = {};
    const files = ["app.json", "appearance.json", "core-plugins.json", "page-preview.json", "workspace.json", "workspaces.json"];
    for (const fileName of files) {
      Object.assign(all, this.storage.readJson(fileName));
    }
    return Object.fromEntries(Object.entries(all).filter(([key]) => key.startsWith(prefix)));
  }

  load() {
    if (!this.legacy) return;
    try {
      this.values = JSON.parse(fs.readFileSync(this.settingsPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") console.warn("[BeeBot Local Runtime] settings reset", error);
      this.values = {};
    }
  }

  save() {
    if (!this.legacy) return;
    fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.values, null, 2));
  }
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeNotePath(input) {
  const raw = String(input || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!raw) throw new Error("Note path is required.");
  const withExtension = raw.toLowerCase().endsWith(".md") ? raw : `${raw}.md`;
  const normalized = path.posix.normalize(withExtension);
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error("Note path must stay inside the vault.");
  }
  if (!normalized.toLowerCase().endsWith(".md")) {
    throw new Error("Only Markdown notes can be stored in the vault.");
  }
  return normalized;
}

function ensureInsideVault(vaultPath, notePath) {
  const resolved = path.resolve(vaultPath, notePath);
  const root = path.resolve(vaultPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Resolved note path escaped the vault.");
  }
  return resolved;
}

function normalizeFolderPath(input) {
  const raw = String(input || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!raw) throw new Error("Folder path is required.");
  const normalized = path.posix.normalize(raw);
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error("Folder path must stay inside the vault.");
  }
  if (path.posix.basename(normalized).startsWith(".")) {
    throw new Error("BeeBot does not manage hidden vault folders.");
  }
  return normalized;
}

function normalizeVaultPath(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Vault path is required.");
  return path.resolve(raw);
}

function vaultNameFromPath(vaultPath) {
  return path.basename(normalizeVaultPath(vaultPath)) || "Sitku Vault";
}

function sanitizeFilename(input) {
  const cleaned = String(input || "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim()
    .slice(0, 120)
    .trim();
  return cleaned || "Untitled";
}

function extractHeadingTitle(content) {
  // Skip leading frontmatter, then first non-empty line with an optional "# " (h1–h6)
  // marker stripped. Mirrors the client firstLineTitle + titleFromContent so the disk
  // filename follows the title line whether or not it's a markdown heading.
  const body = String(content || "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const firstLine = body.split("\n").find((line) => line.trim().length > 0);
  return firstLine?.replace(/^#{1,6}\s+/, "").trim() || null;
}

function createVaultInfo(vaultPath, activePath, noteCount = 0, lastOpenedAt = undefined) {
  const normalized = normalizeVaultPath(vaultPath);
  return {
    name: vaultNameFromPath(normalized),
    path: normalized,
    active: normalizeVaultPath(activePath) === normalized,
    lastOpenedAt,
    noteCount,
  };
}

function parseFrontmatter(content) {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return { frontmatter: {}, body: content };
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const rawValue = line.slice(colon + 1).trim();
    if (!key) continue;
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      frontmatter[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((value) => value.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else if (rawValue === "true" || rawValue === "false") {
      frontmatter[key] = rawValue === "true";
    } else if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
      frontmatter[key] = Number(rawValue);
    } else {
      frontmatter[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }

  return { frontmatter, body: content.slice(match[0].length) };
}

function extractTitle(notePath, body, frontmatter) {
  if (typeof frontmatter.title === "string" && frontmatter.title.trim()) return frontmatter.title.trim();
  // First non-empty body line (frontmatter already stripped), "# " marker optional.
  const firstLine = String(body || "").split("\n").find((line) => line.trim().length > 0);
  const title = firstLine?.replace(/^#{1,6}\s+/, "").trim();
  if (title) return title;
  return path.posix.basename(notePath, ".md").replace(/[-_]+/g, " ");
}

function extractTags(content, frontmatter) {
  const tags = new Set();
  const add = (value) => {
    const cleaned = String(value || "").replace(/^#/, "").trim();
    if (cleaned) tags.add(cleaned);
  };

  const fmTags = frontmatter.tags;
  if (Array.isArray(fmTags)) fmTags.forEach(add);
  else if (typeof fmTags === "string") fmTags.split(/[,\s]+/).forEach(add);

  for (const match of content.matchAll(/(^|[\s([{])#([A-Za-z0-9_/-]+)/g)) {
    add(match[2]);
  }

  return [...tags].sort((a, b) => a.localeCompare(b));
}

function normalizeLinkTarget(sourcePath, target) {
  const cleaned = String(target || "").split("#")[0].split("|")[0].trim();
  if (!cleaned) return null;
  const withExtension = cleaned.toLowerCase().endsWith(".md") ? cleaned : `${cleaned}.md`;
  const base = path.posix.dirname(sourcePath);
  try {
    return normalizeNotePath(path.posix.normalize(path.posix.join(base, withExtension)));
  } catch {
    return null;
  }
}

function extractLinks(sourcePath, content) {
  const links = new Set();
  for (const match of content.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const normalized = normalizeLinkTarget(sourcePath, match[1]);
    if (normalized) links.add(normalized);
  }
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const href = match[1].trim();
    if (!href.toLowerCase().endsWith(".md")) continue;
    const normalized = normalizeLinkTarget(sourcePath, href);
    if (normalized) links.add(normalized);
  }
  return [...links].sort((a, b) => a.localeCompare(b));
}

function mapNoteRow(row) {
  return {
    path: row.path,
    title: row.title,
    content: "",
    frontmatter: parseJson(row.frontmatter_json, {}),
    mtimeMs: Number(row.mtime_ms || 0),
    contentHash: row.content_hash,
  };
}

function depthFromPath(entryPath) {
  if (!entryPath) return 0;
  return String(entryPath).split("/").filter(Boolean).length - 1;
}

function createFolderEntry(folderPath) {
  const normalized = normalizeFolderPath(folderPath);
  return {
    path: normalized,
    name: path.posix.basename(normalized),
    kind: "folder",
    depth: depthFromPath(normalized),
  };
}

function createNoteEntry(note) {
  return {
    path: note.path,
    name: path.posix.basename(note.path),
    kind: "note",
    title: note.title,
    depth: depthFromPath(note.path),
    mtimeMs: note.mtimeMs,
    contentHash: note.contentHash,
  };
}

class LocalNotesRepository {
  constructor(db, settings, defaultVaultPath, desktop = {}) {
    this.db = db;
    this.settings = settings;
    this.defaultVaultPath = defaultVaultPath;
    this.desktop = desktop;
    this.listeners = new Set();
    this.watcher = null;
    this.ensureVault();
    this.rebuildIndex();
    this.ensureWelcomeNote();
  }

  getVaultPath() {
    const configured = this.settings.get("workspace.vaultPath");
    return String(configured || this.defaultVaultPath);
  }

  ensureVault() {
    const vaultPath = this.getVaultPath();
    fs.mkdirSync(vaultPath, { recursive: true });
    ensureVaultConfigDir(vaultPath);
    if (!this.settings.get("workspace.vaultPath")) {
      this.settings.set("workspace.vaultPath", vaultPath);
    }
    return vaultPath;
  }

  setVaultPath(vaultPath) {
    const normalized = normalizeVaultPath(vaultPath);
    this.settings.set("workspace.vaultPath", normalized);
    this.ensureVault();
    this.ensureWelcomeNote();
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      if (this.listeners.size > 0) this.ensureWatcher();
    }
    this.db.prepare("DELETE FROM note_index").run();
    this.db.prepare("DELETE FROM note_index_fts").run();
    this.rebuildIndex();
    this.emit(this.scanMarkdownFiles());
  }

  ensureWelcomeNote() {
    const notes = this.scanMarkdownFiles();
    if (notes.length > 0) return;
    const welcome = [
      "# Welcome to BeeBot Vault",
      "",
      "This folder is your local-first knowledge workspace.",
      "",
      "- Markdown files are the source of truth.",
      "- SQLite indexes notes for search, backlinks, metadata, and agent memory.",
      "- BeeBot stays beside your notes as the assistant for this workspace.",
      "",
      "[[Ideas]]",
      "",
    ].join("\n");
    this.writeNote({ path: "Welcome.md", content: welcome });
  }

  scanMarkdownFiles() {
    const vaultPath = this.ensureVault();
    const results = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
        results.push(path.relative(vaultPath, fullPath).replace(/\\/g, "/"));
      }
    };
    walk(vaultPath);
    return results.sort((a, b) => a.localeCompare(b));
  }

  listEntries(input = {}) {
    this.rebuildIndex();
    const query = String(input.query || "").trim().toLowerCase();
    const entries = [];
    const vaultPath = this.ensureVault();

    const walk = (dir, base = "") => {
      const dirents = fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith("."))
        .sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      for (const entry of dirents) {
        const relativePath = base ? `${base}/${entry.name}` : entry.name;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          entries.push(createFolderEntry(relativePath));
          walk(fullPath, relativePath);
          continue;
        }
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
        const note = this.readNoteFromDisk(path.relative(vaultPath, fullPath).replace(/\\/g, "/"));
        entries.push(createNoteEntry(note));
      }
    };

    walk(vaultPath);
    if (!query) return entries;
    return entries.filter((entry) => (
      entry.path.toLowerCase().includes(query) ||
      entry.name.toLowerCase().includes(query) ||
      String(entry.title || "").toLowerCase().includes(query)
    ));
  }

  listNotes(input = {}) {
    this.rebuildIndex();
    let rows = this.db.prepare(`
      SELECT *
      FROM note_index
      WHERE (? IS NULL OR path LIKE ?)
        AND (? IS NULL OR path LIKE ? OR title LIKE ?)
      ORDER BY path ASC
      LIMIT ?
    `).all(
      input.folder || null,
      input.folder ? `${input.folder.replace(/%/g, "\\%")}%` : null,
      input.query || null,
      input.query ? `%${input.query}%` : null,
      input.query ? `%${input.query}%` : null,
      input.limit || 500,
    );
    return rows.map(mapNoteRow);
  }

  readNote(notePath) {
    const normalized = normalizeNotePath(notePath);
    const fullPath = ensureInsideVault(this.ensureVault(), normalized);
    if (!fs.existsSync(fullPath)) return null;
    return this.readNoteFromDisk(normalized);
  }

  writeNote(input) {
    const normalized = normalizeNotePath(input.path);
    const fullPath = ensureInsideVault(this.ensureVault(), normalized);
    const current = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : null;
    if (input.expectedHash && current !== null && sha256(current) !== input.expectedHash) {
      throw new Error("Note changed on disk. Reload before overwriting.");
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, String(input.content || ""), "utf8");
    // Content autosave passes syncName:false → write only, NO H1-derived rename
    // (the rename runs once on editor blur via an explicit syncName:true write).
    const finalPath = input.syncName === false
      ? normalized
      : this.renameFromHeadingIfNeeded(normalized, String(input.content || ""));
    const note = this.readNoteFromDisk(finalPath);
    if (finalPath !== normalized) this.removeIndex(normalized);
    this.emit(finalPath === normalized ? [normalized] : [normalized, finalPath]);
    return note;
  }

  renameFromHeadingIfNeeded(notePath, content) {
    const heading = extractHeadingTitle(content);
    if (!heading) return notePath;

    const folder = path.posix.dirname(notePath);
    const currentName = path.posix.basename(notePath, ".md");
    const nextName = sanitizeFilename(heading);
    if (nextName === currentName) return notePath;

    const basePath = folder === "." ? `${nextName}.md` : `${folder}/${nextName}.md`;
    const nextPath = this.findAvailableRenamePath(notePath, basePath);
    if (nextPath === notePath) return notePath;

    const vaultPath = this.ensureVault();
    fs.renameSync(ensureInsideVault(vaultPath, notePath), ensureInsideVault(vaultPath, nextPath));
    return nextPath;
  }

  findAvailableRenamePath(sourcePath, desiredPath) {
    const vaultPath = this.ensureVault();
    const parsed = path.posix.parse(normalizeNotePath(desiredPath));
    let candidate = normalizeNotePath(desiredPath);
    let index = 2;
    while (candidate !== sourcePath && fs.existsSync(ensureInsideVault(vaultPath, candidate))) {
      candidate = normalizeNotePath(path.posix.join(parsed.dir, `${parsed.name} ${index}${parsed.ext}`));
      index += 1;
    }
    return candidate;
  }

  deleteNote(notePath) {
    const normalized = normalizeNotePath(notePath);
    const fullPath = ensureInsideVault(this.ensureVault(), normalized);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    this.removeIndex(normalized);
    this.emit([normalized]);
  }

  createFolder(folderPath) {
    const normalized = normalizeFolderPath(folderPath);
    const fullPath = ensureInsideVault(this.ensureVault(), normalized);
    fs.mkdirSync(fullPath, { recursive: true });
    const entry = createFolderEntry(normalized);
    this.emit([normalized]);
    return entry;
  }

  deleteFolder(folderPath) {
    const normalized = normalizeFolderPath(folderPath);
    const fullPath = ensureInsideVault(this.ensureVault(), normalized);
    if (!fs.existsSync(fullPath)) return;
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) throw new Error("Path is not a folder.");
    fs.rmSync(fullPath, { recursive: true, force: true });
    const rows = this.db.prepare("SELECT path FROM note_index WHERE path LIKE ?").all(`${normalized}/%`);
    for (const row of rows) this.removeIndex(row.path);
    this.emit([normalized]);
  }

  renamePath(input) {
    const oldRaw = String(input?.oldPath || "").trim();
    const newRaw = String(input?.newPath || "").trim();
    if (!oldRaw || !newRaw) throw new Error("Old and new paths are required.");

    const isNote = oldRaw.toLowerCase().endsWith(".md") || newRaw.toLowerCase().endsWith(".md");
    const oldPath = isNote ? normalizeNotePath(oldRaw) : normalizeFolderPath(oldRaw);
    const newPath = isNote ? normalizeNotePath(newRaw) : normalizeFolderPath(newRaw);
    if (oldPath === newPath) return isNote ? createNoteEntry(this.readNoteFromDisk(oldPath)) : createFolderEntry(newPath);

    const vaultPath = this.ensureVault();
    const oldFullPath = ensureInsideVault(vaultPath, oldPath);
    const newFullPath = ensureInsideVault(vaultPath, newPath);
    if (!fs.existsSync(oldFullPath)) throw new Error("Path does not exist.");
    if (fs.existsSync(newFullPath)) throw new Error("A file or folder already exists at the new path.");
    fs.mkdirSync(path.dirname(newFullPath), { recursive: true });
    fs.renameSync(oldFullPath, newFullPath);

    if (isNote) {
      this.removeIndex(oldPath);
      const note = this.readNoteFromDisk(newPath);
      const entry = createNoteEntry(note);
      this.emit([oldPath, newPath]);
      return entry;
    }

    this.rebuildIndex();
    this.emit([oldPath, newPath]);
    return createFolderEntry(newPath);
  }

  async revealPath(entryPath) {
    const raw = String(entryPath || "").trim();
    if (!raw) throw new Error("Path is required.");
    const normalized = raw.toLowerCase().endsWith(".md") ? normalizeNotePath(raw) : normalizeFolderPath(raw);
    const fullPath = ensureInsideVault(this.ensureVault(), normalized);
    await this.desktop.revealPath?.(fullPath);
  }

  watchNotes(onChange) {
    this.listeners.add(onChange);
    this.ensureWatcher();
    return {
      unsubscribe: () => {
        this.listeners.delete(onChange);
        if (this.listeners.size === 0 && this.watcher) {
          this.watcher.close();
          this.watcher = null;
        }
      },
    };
  }

  ensureWatcher() {
    if (this.watcher) return;
    try {
      this.watcher = fs.watch(this.ensureVault(), { recursive: true }, (_event, filename) => {
        if (!filename || !String(filename).toLowerCase().endsWith(".md")) return;
        let normalized;
        try {
          normalized = normalizeNotePath(String(filename));
        } catch {
          return;
        }
        if (this.readNote(normalized)) this.indexNote(normalized);
        else this.removeIndex(normalized);
        this.emit([normalized]);
      });
    } catch (error) {
      console.warn("[BeeBot Local Runtime] note watcher unavailable", error);
    }
  }

  readNoteFromDisk(normalized) {
    const fullPath = ensureInsideVault(this.ensureVault(), normalized);
    const content = fs.readFileSync(fullPath, "utf8");
    const stat = fs.statSync(fullPath);
    const { frontmatter, body } = parseFrontmatter(content);
    const title = extractTitle(normalized, body, frontmatter);
    const note = {
      path: normalized,
      title,
      content,
      frontmatter,
      mtimeMs: stat.mtimeMs,
      contentHash: sha256(content),
    };
    this.indexNote(normalized, note);
    return note;
  }

  rebuildIndex(paths = null) {
    const targets = paths ? paths.map(normalizeNotePath) : this.scanMarkdownFiles();
    if (!paths) {
      const existing = new Set(targets);
      const rows = this.db.prepare("SELECT path FROM note_index").all();
      for (const row of rows) {
        if (!existing.has(row.path)) this.removeIndex(row.path);
      }
    }
    for (const notePath of targets) {
      const fullPath = ensureInsideVault(this.ensureVault(), notePath);
      if (fs.existsSync(fullPath)) this.readNoteFromDisk(notePath);
      else this.removeIndex(notePath);
    }
  }

  indexNote(notePath, note = null) {
    const normalized = normalizeNotePath(notePath);
    const target = note || this.readNoteFromDisk(normalized);
    const tags = extractTags(target.content, target.frontmatter || {});
    const links = extractLinks(normalized, target.content);
    const indexedAt = nowIso();

    this.db.prepare(`
      INSERT INTO note_index (
        path, title, frontmatter_json, tags_json, links_json, mtime_ms, content_hash, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        title = excluded.title,
        frontmatter_json = excluded.frontmatter_json,
        tags_json = excluded.tags_json,
        links_json = excluded.links_json,
        mtime_ms = excluded.mtime_ms,
        content_hash = excluded.content_hash,
        indexed_at = excluded.indexed_at
    `).run(
      normalized,
      target.title,
      JSON.stringify(target.frontmatter || {}),
      JSON.stringify(tags),
      JSON.stringify(links),
      Math.round(target.mtimeMs || 0),
      target.contentHash,
      indexedAt,
    );

    this.db.prepare("DELETE FROM note_index_fts WHERE path = ?").run(normalized);
    this.db.prepare("INSERT INTO note_index_fts(path, title, content) VALUES (?, ?, ?)").run(
      normalized,
      target.title,
      target.content,
    );
  }

  removeIndex(notePath) {
    this.db.prepare("DELETE FROM note_index WHERE path = ?").run(notePath);
    this.db.prepare("DELETE FROM note_index_fts WHERE path = ?").run(notePath);
  }

  emit(paths) {
    for (const listener of this.listeners) listener(paths);
  }
}

class LocalVaultRepository {
  constructor(settings, notes, defaultVaultPath, desktop = {}) {
    this.settings = settings;
    this.notes = notes;
    this.defaultVaultPath = defaultVaultPath;
    this.desktop = desktop;
    this.ensureActiveVault();
  }

  getActivePath() {
    return normalizeVaultPath(this.settings.get("workspace.vaultPath") || this.defaultVaultPath);
  }

  ensureActiveVault() {
    const activePath = this.getActivePath();
    fs.mkdirSync(activePath, { recursive: true });
    ensureVaultConfigDir(activePath);
    this.settings.set("workspace.vaultPath", activePath);
    this.recordVault(activePath);
    return activePath;
  }

  getActiveVault() {
    const activePath = this.ensureActiveVault();
    return createVaultInfo(activePath, activePath, this.notes.scanMarkdownFiles().length, this.findRecent(activePath)?.lastOpenedAt);
  }

  listVaults() {
    const activePath = this.ensureActiveVault();
    return this.getRecentVaults().map((vault) => createVaultInfo(vault.path, activePath, this.countNotes(vault.path), vault.lastOpenedAt));
  }

  async createVault(input = {}) {
    const name = sanitizeFilename(input.name || "BeeBot Vault");
    const parentPath = input.parentPath ? normalizeVaultPath(input.parentPath) : await this.desktop.chooseVaultParent?.();
    if (!parentPath) return null;
    const vaultPath = normalizeVaultPath(path.join(parentPath, name));
    fs.mkdirSync(vaultPath, { recursive: true });
    ensureVaultConfigDir(vaultPath);
    this.notes.setVaultPath(vaultPath);
    this.recordVault(vaultPath);
    return this.getActiveVault();
  }

  async openVault(input = {}) {
    const selectedPath = input.path ? normalizeVaultPath(input.path) : await this.desktop.chooseExistingVault?.();
    if (!selectedPath) return null;
    fs.mkdirSync(selectedPath, { recursive: true });
    ensureVaultConfigDir(selectedPath);
    this.notes.setVaultPath(selectedPath);
    this.recordVault(selectedPath);
    return this.getActiveVault();
  }

  switchVault(vaultPath) {
    const normalized = normalizeVaultPath(vaultPath);
    if (!fs.existsSync(normalized)) {
      throw new Error("Vault folder does not exist.");
    }
    this.notes.setVaultPath(normalized);
    this.recordVault(normalized);
    return this.getActiveVault();
  }

  async revealActiveVault() {
    const activePath = this.ensureActiveVault();
    await this.desktop.revealPath?.(activePath);
  }

  // Drop a vault from the Recent list. Only forgets the entry — the folder and
  // its notes on disk are untouched, and the active vault can't be forgotten.
  forgetVault(vaultPath) {
    const normalized = normalizeVaultPath(vaultPath);
    if (normalized === normalizeVaultPath(this.getActivePath())) return;
    const next = this.getRecentVaults()
      .filter((vault) => vault.path !== normalized)
      .map((vault) => ({ name: vault.name, path: vault.path, lastOpenedAt: vault.lastOpenedAt }));
    this.settings.set("vaults.recent", next);
  }

  getRecentVaults() {
    const raw = this.settings.get("vaults.recent");
    const recent = Array.isArray(raw) ? raw : [];
    return recent
      .filter((vault) => vault?.path)
      .map((vault) => ({
        name: String(vault.name || vaultNameFromPath(vault.path)),
        path: normalizeVaultPath(vault.path),
        lastOpenedAt: vault.lastOpenedAt || undefined,
      }));
  }

  findRecent(vaultPath) {
    const normalized = normalizeVaultPath(vaultPath);
    return this.getRecentVaults().find((vault) => vault.path === normalized);
  }

  recordVault(vaultPath) {
    const normalized = normalizeVaultPath(vaultPath);
    const next = [
      { name: vaultNameFromPath(normalized), path: normalized, lastOpenedAt: nowIso() },
      ...this.getRecentVaults().filter((vault) => vault.path !== normalized),
    ].slice(0, 12);
    this.settings.set("vaults.recent", next);
  }

  countNotes(vaultPath) {
    const normalized = normalizeVaultPath(vaultPath);
    if (!fs.existsSync(normalized)) return 0;
    let count = 0;
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(fullPath);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) count += 1;
      }
    };
    walk(normalized);
    return count;
  }
}

class LocalSkillsRepository {
  constructor(vault) {
    this.vault = vault;
  }

  listSkills() {
    const config = this.readConfig();
    const skills = BUILT_IN_SKILL_MANIFESTS.map((manifest) => this.toInstalledSkill(manifest, config));
    return skills.sort((a, b) => {
      if (a.manifest.core !== b.manifest.core) return a.manifest.core ? -1 : 1;
      return `${a.manifest.category}:${a.manifest.name}`.localeCompare(`${b.manifest.category}:${b.manifest.name}`);
    });
  }

  getSkill(skillId) {
    const manifest = this.findManifest(skillId);
    if (!manifest) return null;
    return this.toInstalledSkill(manifest, this.readConfig());
  }

  setSkillEnabled(input) {
    const skillId = String(input?.skillId || "").trim();
    const manifest = this.findManifest(skillId);
    if (!manifest) throw new Error("Skill is not installed.");
    if (manifest.core && input.enabled === false) {
      throw new Error("Core BeeBot skills cannot be disabled.");
    }

    const config = this.readConfig();
    const nextSkills = {
      ...(config.skills || {}),
      [skillId]: {
        enabled: Boolean(input.enabled),
        updatedAt: nowIso(),
      },
    };
    this.writeConfig({ ...config, version: 1, skills: nextSkills });
    return this.toInstalledSkill(manifest, this.readConfig());
  }

  getSummary() {
    const skills = this.listSkills();
    const permissions = new Set();
    const categories = new Set();
    for (const skill of skills) {
      categories.add(skill.manifest.category);
      for (const permission of skill.manifest.permissions || []) permissions.add(permission);
    }
    return {
      enabledCount: skills.filter((skill) => skill.enabled).length,
      totalCount: skills.length,
      permissionCount: permissions.size,
      categories: [...categories].sort(),
    };
  }

  findManifest(skillId) {
    return BUILT_IN_SKILL_MANIFESTS.find((manifest) => manifest.id === skillId) || null;
  }

  toInstalledSkill(manifest, config) {
    const state = config.skills?.[manifest.id] || {};
    const enabled = manifest.core ? true : typeof state.enabled === "boolean" ? state.enabled : Boolean(manifest.enabledByDefault);
    return {
      manifest,
      enabled,
      source: manifest.core ? "core" : "built-in",
      installedAt: config.installedAt || undefined,
      updatedAt: state.updatedAt || undefined,
    };
  }

  getConfigPath() {
    const vaultPath = this.vault.ensureActiveVault();
    const configDir = ensureVaultConfigDir(vaultPath);
    return path.join(configDir, "core-plugins.json");
  }

  readConfig() {
    const configPath = this.getConfigPath();
    // Filename migration: old builds wrote skills.json in the same dir. Promote
    // it to core-plugins.json once so skill enablement survives the rename.
    if (!fs.existsSync(configPath)) {
      const legacyFile = path.join(path.dirname(configPath), "skills.json");
      if (fs.existsSync(legacyFile)) {
        try { fs.renameSync(legacyFile, configPath); } catch (error) { console.warn("[Sitku] skills.json migrate failed", error); }
      }
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
      return {
        version: 1,
        installedAt: parsed.installedAt || nowIso(),
        skills: parsed.skills && typeof parsed.skills === "object" ? parsed.skills : {},
      };
    } catch (error) {
      if (error.code !== "ENOENT") console.warn("[BeeBot Local Runtime] skills config reset", error);
      const initial = { version: 1, installedAt: nowIso(), skills: {} };
      this.writeConfig(initial);
      return initial;
    }
  }

  writeConfig(config) {
    const configPath = this.getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  }
}

function buildFtsQuery(query) {
  return String(query || "")
    .trim()
    .split(/\s+/)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(" AND ");
}

class LocalSearchRepository {
  constructor(db, notes) {
    this.db = db;
    this.notes = notes;
  }

  search(query, limit = 20) {
    const trimmed = String(query || "").trim();
    if (!trimmed) {
      return this.notes.listNotes({ limit }).map((note) => ({
        id: note.path,
        source: "note",
        title: note.title,
        path: note.path,
        snippet: note.path,
        score: 1,
        metadata: { contentHash: note.contentHash, mtimeMs: note.mtimeMs },
      }));
    }

    const results = [];
    const match = buildFtsQuery(trimmed);
    try {
      const rows = this.db.prepare(`
        SELECT
          n.path,
          n.title,
          n.tags_json,
          n.links_json,
          snippet(note_index_fts, 2, '', '', '...', 18) AS snippet,
          bm25(note_index_fts) AS rank
        FROM note_index_fts
        JOIN note_index n ON n.path = note_index_fts.path
        WHERE note_index_fts MATCH ?
        ORDER BY rank ASC
        LIMIT ?
      `).all(match, limit);
      for (const row of rows) {
        results.push({
          id: row.path,
          source: "note",
          title: row.title,
          path: row.path,
          snippet: row.snippet || row.path,
          score: 1 / (1 + Math.abs(Number(row.rank || 0))),
          metadata: {
            tags: parseJson(row.tags_json, []),
            links: parseJson(row.links_json, []),
          },
        });
      }
    } catch {
      const rows = this.db.prepare(`
        SELECT path, title, tags_json, links_json
        FROM note_index
        WHERE title LIKE ? OR path LIKE ?
        ORDER BY title ASC
        LIMIT ?
      `).all(`%${trimmed}%`, `%${trimmed}%`, limit);
      for (const row of rows) {
        results.push({
          id: row.path,
          source: "note",
          title: row.title,
          path: row.path,
          snippet: row.path,
          score: 0.5,
          metadata: {
            tags: parseJson(row.tags_json, []),
            links: parseJson(row.links_json, []),
          },
        });
      }
    }

    if (results.length < limit) {
      try {
        const rows = this.db.prepare(`
          SELECT
            m.id,
            m.session_id,
            s.title,
            snippet(agent_chat_messages_fts, 2, '', '', '...', 18) AS snippet,
            bm25(agent_chat_messages_fts) AS rank
          FROM agent_chat_messages_fts
          JOIN agent_chat_messages m ON m.id = agent_chat_messages_fts.message_id
          LEFT JOIN agent_chat_sessions s ON s.id = m.session_id
          WHERE agent_chat_messages_fts MATCH ?
          ORDER BY rank ASC
          LIMIT ?
        `).all(match, limit - results.length);
        for (const row of rows) {
          results.push({
            id: row.id,
            source: "conversation",
            title: row.title || "Conversation",
            snippet: row.snippet || "",
            score: 0.75 / (1 + Math.abs(Number(row.rank || 0))),
            metadata: { sessionId: row.session_id },
          });
        }
      } catch {
        // Conversation FTS is best-effort for this V1 surface.
      }
    }

    return results;
  }

  rebuildNoteIndex(paths = null) {
    this.notes.rebuildIndex(paths);
  }

  rebuildEmbeddings() {
    return undefined;
  }
}

function encodeSse(event) {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

class OpenAICompatibleProvider {
  constructor(settings) {
    this.settings = settings;
  }

  getConfig() {
    const configured = this.settings.get("agentRuntime.openaiCompatible") || {};
    const apiKey = configured.apiKey || process.env.BEEBOT_OPENAI_COMPAT_API_KEY || process.env.OPENAI_API_KEY || "";
    const baseUrl = normalizeBaseUrl(
      configured.baseUrl ||
      process.env.BEEBOT_OPENAI_COMPAT_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      "",
    );
    const model = configured.model || process.env.BEEBOT_OPENAI_COMPAT_MODEL || process.env.OPENAI_MODEL || "";

    if (!apiKey || !baseUrl || !model) return null;

    return {
      apiKey,
      baseUrl,
      model,
      systemPrompt: configured.systemPrompt || "You are Sitku, a concise local-first knowledge workspace assistant. Be helpful, practical, and clear.",
    };
  }

  isConfigured() {
    return Boolean(this.getConfig());
  }

  getStatus() {
    const config = this.getConfig();
    if (!config) {
      return {
        adapter: "electron-local",
        provider: "local-fallback",
        label: "Local Fallback",
        configured: false,
        model: null,
        baseUrl: null,
      };
    }

    return {
      adapter: "electron-local",
      provider: "openai-compatible",
      label: "OpenAI-Compatible",
      configured: true,
      model: config.model,
      baseUrl: config.baseUrl,
    };
  }

  async *stream(input) {
    const config = this.getConfig();
    if (!config) throw new Error("OpenAI-compatible provider is not configured.");

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        stream: true,
        messages: [
          { role: "system", content: config.systemPrompt },
          { role: "user", content: String(input.message || "") },
        ],
      }),
      signal: input.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`OpenAI-compatible provider failed (${response.status}): ${errorText.slice(0, 300)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("OpenAI-compatible provider returned no response body.");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;

        const payload = line.slice(6).trim();
        if (!payload || payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload);
          const content = parsed.choices?.[0]?.delta?.content || "";
          if (content) yield content;
        } catch {
          // Ignore malformed provider frames; upstream stream may split JSON.
        }
      }
    }
  }
}

class LocalAgentRuntimeRepository {
  constructor(conversations, settings) {
    this.conversations = conversations;
    this.provider = new OpenAICompatibleProvider(settings);
  }

  warmup() {
    this.provider.getStatus();
  }

  startStream(input) {
    return this.createStreamResponse(input, false);
  }

  continueStream(input) {
    return this.createStreamResponse(input, true);
  }

  cancelStream() {
    return undefined;
  }

  getStatus() {
    return this.provider.getStatus();
  }

  createStreamResponse(input, isContinuation) {
    return {
      ok: true,
      status: 200,
      async json() {
        return {};
      },
      readChunks: () => this.generateChunks(input, isContinuation),
    };
  }

  async *generateChunks(input, isContinuation) {
    const sessionId = input.sessionId;
    let content = "";
    const providerConfigured = this.provider.isConfigured();

    yield encodeSse({
      type: "thinking",
      status: {
        id: `local_runtime_${Date.now()}`,
        title: providerConfigured ? "Running local provider" : "Running local fallback",
        detail: providerConfigured
          ? "BeeBot is streaming from the configured OpenAI-compatible provider."
          : "BeeBot is using the deterministic Electron local runtime fallback.",
        status: "loading",
        timestamp: new Date().toISOString(),
      },
    });
    await sleep(40);

    if (providerConfigured) {
      try {
        for await (const chunk of this.provider.stream(input)) {
          content += chunk;
          yield encodeSse({ type: "content", content: chunk });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        yield encodeSse({
          type: "provider_error",
          provider: "OpenAI-compatible local runtime",
          error_type: "provider_failed",
          message,
        });
        content = this.composeLocalReply(input, isContinuation, message);
        for (const chunk of this.chunkText(content, 48)) {
          yield encodeSse({ type: "content", content: chunk });
          await sleep(18);
        }
      }
    } else {
      content = this.composeLocalReply(input, isContinuation);
      for (const chunk of this.chunkText(content, 48)) {
        yield encodeSse({ type: "content", content: chunk });
        await sleep(18);
      }
    }

    if (content.trim()) {
      this.conversations.createMessage({
        sessionId,
        userId: input.userId || "local-user",
        role: "assistant",
        content,
        sourceChannel: providerConfigured ? "electron-openai-compatible" : "electron-local-runtime",
      });
    }

    yield encodeSse({
      type: "thinking",
      status: {
        id: `local_runtime_done_${Date.now()}`,
        title: "Saved to SQLite",
        detail: "Assistant response persisted locally.",
        status: "done",
        timestamp: new Date().toISOString(),
      },
    });
    yield new TextEncoder().encode("data: [DONE]\n\n");
  }

  composeLocalReply(input, isContinuation, providerError = "") {
    const message = String(input.message || "").trim();
    const prefix = isContinuation
      ? "Local continuation runtime is wired."
      : "BeeBot local runtime is online.";
    const subject = message
      ? ` I received: "${message.slice(0, 220)}${message.length > 220 ? "..." : ""}"`
      : " I received your message.";

    return [
      prefix,
      subject,
      " Conversations are now flowing through Electron IPC, streaming into the UI, and persisting assistant replies in local SQLite.",
      providerError
        ? ` The configured provider failed, so I used the local fallback. Provider error: ${providerError}`
        : " Configure agentRuntime.openaiCompatible in local settings or set BEEBOT_OPENAI_COMPAT_* env vars to use a real model provider.",
    ].join("");
  }

  chunkText(text, size) {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
    return chunks;
  }
}

function createUnavailableRepository(domain, methodNames) {
  return Object.fromEntries(methodNames.map((method) => [
    method,
    () => {
      throw new Error(`Local ${domain}.${method} is not implemented yet.`);
    },
  ]));
}

export function createLocalRuntime({ dbPath, settingsPath, desktop = {}, storage }) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(LOCAL_AGENT_SCHEMA_SQL);
  const conversations = new ConversationRepository(db);
  // Prefer the new SystemStorage (namespaced per-domain JSON + atomic writes).
  // Fall back to the legacy single-file path for back-compat / tests.
  const settings = storage
    ? new JsonSettingsRepository(storage)
    : new JsonSettingsRepository(settingsPath);
  const defaultVaultPath = storage
    ? path.join(storage.root, "vault", "Sitku Vault")
    : path.join(path.dirname(settingsPath), "Sitku Vault");
  const notes = new LocalNotesRepository(db, settings, defaultVaultPath, desktop);
  const vault = new LocalVaultRepository(settings, notes, defaultVaultPath, desktop);
  const skills = new LocalSkillsRepository(vault);

  const repositories = {
    vault,
    notes,
    conversations,
    memories: createUnavailableRepository("memories", unavailableMethods.memories),
    tasks: createUnavailableRepository("tasks", unavailableMethods.tasks),
    search: null,
    settings,
    skills,
    agentRuntime: null,
  };

  repositories.search = new LocalSearchRepository(db, notes);
  repositories.agentRuntime = new LocalAgentRuntimeRepository(conversations, repositories.settings);

  const subscriptions = new Map();

  function resolve(domain, method) {
    const repository = repositories[domain];
    const fn = repository?.[method];
    if (typeof fn !== "function") {
      throw new Error(`Local runtime method ${domain}.${method} is unavailable.`);
    }
    return { repository, fn };
  }

  return {
    invoke({ domain, method, args = [] }) {
      const { repository, fn } = resolve(domain, method);
      return fn.apply(repository, args);
    },

    subscribe({ domain, method, args = [], subscriptionId }, emit) {
      const { repository, fn } = resolve(domain, method);
      const subscription = fn.apply(repository, [...args, emit]);
      subscriptions.set(subscriptionId, subscription);
      return { id: subscriptionId };
    },

    unsubscribe(subscriptionId) {
      subscriptions.get(subscriptionId)?.unsubscribe?.();
      subscriptions.delete(subscriptionId);
    },

    close() {
      for (const subscriptionId of subscriptions.keys()) this.unsubscribe(subscriptionId);
      db.close();
    },
  };
}
