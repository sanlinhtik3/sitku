import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const LEVELS = new Set(["debug", "info", "warn", "error"]);
const STATUSES = new Set([
  "queued", "started", "running", "awaiting_approval", "approved",
  "rejected", "completed", "failed", "cancelled", "interrupted", "retrying",
]);
const SENSITIVE_KEY = /(?:api[_-]?key|authorization|secret|token|password|cookie|audio|transcript|content|prompt|query)/i;
const BATCH_SIZE = 100;
const FLUSH_DELAY_MS = 250;
const RETRY_DELAY_MS = 1_000;
const MAX_PENDING_EVENTS = 2_000;
const JSONL_RETENTION_DAYS = 30;
const DATABASE_RETENTION_DAYS = 90;

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  gray: "\u001b[38;5;244m",
  cyan: "\u001b[38;5;117m",
  mint: "\u001b[38;5;84m",
  amber: "\u001b[38;5;221m",
  rose: "\u001b[38;5;204m",
  violet: "\u001b[38;5;141m",
};

const LEVEL_COLOR = {
  debug: ANSI.gray,
  info: ANSI.cyan,
  warn: ANSI.amber,
  error: ANSI.rose,
};

const STATUS_COLOR = {
  queued: ANSI.gray,
  started: ANSI.cyan,
  running: ANSI.cyan,
  awaiting_approval: ANSI.amber,
  approved: ANSI.mint,
  rejected: ANSI.rose,
  completed: ANSI.mint,
  failed: ANSI.rose,
  cancelled: ANSI.violet,
  interrupted: ANSI.violet,
  retrying: ANSI.amber,
};

const nowIso = () => new Date().toISOString();

function boundedText(value, limit = 500) {
  const result = String(value ?? "");
  return result.length > limit ? `${result.slice(0, limit)}...[truncated]` : result;
}

export function redactLogMetadata(value, key = "") {
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactLogMetadata(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 40)
        .map(([childKey, childValue]) => [childKey, redactLogMetadata(childValue, childKey)]),
    );
  }
  if (typeof value === "string") return boundedText(value);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  return boundedText(value);
}

function normalizeEvent(input = {}, timestamp = nowIso()) {
  const status = input.status ? boundedText(input.status, 48) : null;
  return {
    timestamp: String(input.timestamp || timestamp),
    level: LEVELS.has(input.level) ? input.level : "info",
    domain: boundedText(input.domain || "app", 64),
    event: boundedText(input.event || "event", 96),
    traceId: input.traceId ? boundedText(input.traceId, 128) : null,
    turnId: input.turnId ? boundedText(input.turnId, 128) : null,
    actionId: input.actionId ? boundedText(input.actionId, 128) : null,
    status: !status || STATUSES.has(status) ? status : "running",
    durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : null,
    errorCode: input.errorCode ? boundedText(input.errorCode, 96) : null,
    recovery: input.recovery ? boundedText(input.recovery, 300) : null,
    metadata: redactLogMetadata(input.metadata || {}),
  };
}

function paint(value, color, enabled) {
  return enabled ? `${color}${value}${ANSI.reset}` : value;
}

function compactTimestamp(timestamp) {
  const value = String(timestamp || "");
  const match = value.match(/^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2}\.\d{3})Z/);
  return (match?.[1] || value.slice(-13)).padEnd(12);
}

function compactIdentifier(value) {
  if (!value) return "";
  const text = String(value);
  return text.length > 14 ? `${text.slice(0, 11)}…` : text;
}

function compactEvent(event) {
  const text = String(event || "event");
  const trimmed = text.replace(/\.(started|completed|failed|cancelled)$/, "");
  return trimmed.replace(/[._-]+/g, " ").toUpperCase().slice(0, 18);
}

export function terminalColorsEnabled(stream = process.stdout, environment = process.env) {
  if (environment.NO_COLOR != null) return false;
  if (environment.FORCE_COLOR != null) return environment.FORCE_COLOR !== "0";
  return Boolean(stream?.isTTY);
}

export function formatTerminalEvent(record, { color = false } = {}) {
  const traceId = record.traceId ?? record.trace_id;
  const turnId = record.turnId ?? record.turn_id;
  const actionId = record.actionId ?? record.action_id;
  const durationMs = record.durationMs ?? record.duration_ms;
  const errorCode = record.errorCode ?? record.error_code;
  const level = String(record.level || "info").toLowerCase();
  const status = record.status ? String(record.status) : "-";
  const details = [
    traceId && `#${compactIdentifier(traceId)}`,
    !traceId && turnId && `#${compactIdentifier(turnId)}`,
    errorCode && `code=${errorCode}`,
    !traceId && !turnId && actionId && `action=${compactIdentifier(actionId)}`,
  ].filter(Boolean).join(" ");
  const timestampColumn = paint(compactTimestamp(record.timestamp), ANSI.gray, color);
  const levelColumn = paint(level.toUpperCase().padEnd(5), LEVEL_COLOR[level] || ANSI.gray, color);
  const domainColumn = paint(String(record.domain || "app").toUpperCase().slice(0, 7).padEnd(7), ANSI.cyan, color);
  const eventColumn = paint(compactEvent(record.event).padEnd(18), ANSI.bold, color);
  const statusColumn = paint(status.toUpperCase().slice(0, 12).padEnd(12), STATUS_COLOR[status] || ANSI.gray, color);
  const durationColumn = durationMs != null
    ? paint(`${durationMs}ms`.padStart(8), ANSI.gray, color)
    : " ".repeat(8);
  const separator = paint(" | ", ANSI.dim, color);
  const detailColumn = details ? `${separator}${paint(details, ANSI.gray, color)}` : "";
  return `${timestampColumn}${separator}${levelColumn}${separator}${domainColumn}${separator}${eventColumn}${separator}${statusColumn}${separator}${durationColumn}${detailColumn}`;
}

/**
 * Local-only structured logging. Events are buffered and written outside hot UI paths.
 * A failed log write is contained and retried; it never fails the product action.
 */
export class LocalObservabilityService {
  constructor({ rootDir, terminal = process.stdout, clock = nowIso } = {}) {
    if (!rootDir) throw new Error("Observability root directory is required");
    this.rootDir = rootDir;
    this.logsDir = path.join(rootDir, "logs");
    this.terminal = terminal;
    this.clock = clock;
    this.pending = [];
    this.timer = null;
    this.flushing = null;
    this.closed = false;
    this.droppedEvents = 0;
    this.maintenanceTimer = null;

    fs.mkdirSync(this.logsDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(rootDir, "observability.sqlite"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 2500;
      CREATE TABLE IF NOT EXISTS observability_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        domain TEXT NOT NULL,
        event TEXT NOT NULL,
        trace_id TEXT,
        turn_id TEXT,
        action_id TEXT,
        status TEXT,
        duration_ms INTEGER,
        error_code TEXT,
        recovery TEXT,
        metadata_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_observability_timestamp ON observability_events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_observability_trace ON observability_events(trace_id, timestamp ASC);
      CREATE INDEX IF NOT EXISTS idx_observability_level ON observability_events(level, timestamp DESC);
    `);
    this.insert = this.db.prepare(`
      INSERT INTO observability_events(
        timestamp, level, domain, event, trace_id, turn_id, action_id,
        status, duration_ms, error_code, recovery, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.maintenanceTimer = setTimeout(() => this.prune(), 5_000);
    this.maintenanceTimer.unref?.();
  }

  record(input) {
    if (this.closed) return;
    const record = normalizeEvent(input, this.clock());
    if (this.pending.length >= MAX_PENDING_EVENTS) {
      this.pending.shift();
      this.droppedEvents += 1;
    }
    this.pending.push(record);
    if (record.level !== "debug") {
      this.terminal?.write?.(`${formatTerminalEvent(record, { color: terminalColorsEnabled(this.terminal) })}\n`);
    }
    if (this.pending.length >= BATCH_SIZE) void this.flush();
    else this.scheduleFlush(FLUSH_DELAY_MS);
  }

  scheduleFlush(delayMs) {
    if (this.timer || this.closed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delayMs);
    this.timer.unref?.();
  }

  flush() {
    if (this.flushing) return this.flushing;
    if (!this.pending.length || this.closed) return Promise.resolve();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const batch = this.pending.splice(0, BATCH_SIZE);
    this.flushing = this.writeBatch(batch)
      .catch(() => {
        this.pending.unshift(...batch);
        if (this.pending.length > MAX_PENDING_EVENTS) {
          this.droppedEvents += this.pending.length - MAX_PENDING_EVENTS;
          this.pending.length = MAX_PENDING_EVENTS;
        }
        this.terminal?.write?.(`${nowIso()} WARN  observability.flush_failed status=retrying code=LOG_WRITE_FAILED\n`);
        this.scheduleFlush(RETRY_DELAY_MS);
      })
      .finally(() => {
        this.flushing = null;
        if (this.pending.length && !this.timer) this.scheduleFlush(FLUSH_DELAY_MS);
      });
    return this.flushing;
  }

  async drain(maxPasses = 25) {
    let passes = 0;
    while (!this.closed && (this.flushing || this.pending.length) && passes < maxPasses) {
      passes += 1;
      if (this.flushing) await this.flushing;
      else await this.flush();
    }
    return this.pending.length === 0;
  }

  async writeBatch(batch) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const record of batch) {
        this.insert.run(
          record.timestamp, record.level, record.domain, record.event,
          record.traceId, record.turnId, record.actionId, record.status,
          record.durationMs, record.errorCode, record.recovery,
          JSON.stringify(record.metadata),
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      throw error;
    }
    const grouped = Map.groupBy(batch, (record) => record.timestamp.slice(0, 10) || "unknown-date");
    for (const [date, records] of grouped) {
      await fs.promises.appendFile(
        path.join(this.logsDir, `${date}.jsonl`),
        records.map((record) => `${JSON.stringify(record)}\n`).join(""),
        { encoding: "utf8", mode: 0o600 },
      );
    }
  }

  list({ traceId, level, limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(1_000, Number(limit) || 100));
    const clauses = [];
    const args = [];
    if (traceId) { clauses.push("trace_id = ?"); args.push(String(traceId)); }
    if (level) { clauses.push("level = ?"); args.push(String(level)); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`
      SELECT timestamp, level, domain, event, trace_id AS traceId, turn_id AS turnId,
             action_id AS actionId, status, duration_ms AS durationMs,
             error_code AS errorCode, recovery, metadata_json AS metadataJson
      FROM observability_events ${where}
      ORDER BY timestamp DESC LIMIT ?
    `).all(...args, safeLimit).map((row) => ({
      ...row,
      metadata: JSON.parse(row.metadataJson),
      metadataJson: undefined,
    }));
  }

  prune() {
    if (this.closed) return;
    try {
      const databaseCutoff = new Date(Date.now() - DATABASE_RETENTION_DAYS * 86_400_000).toISOString();
      this.db.prepare("DELETE FROM observability_events WHERE timestamp < ?").run(databaseCutoff);

      const jsonlCutoff = Date.now() - JSONL_RETENTION_DAYS * 86_400_000;
      for (const fileName of fs.readdirSync(this.logsDir)) {
        if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(fileName)) continue;
        const dateValue = Date.parse(fileName.slice(0, 10));
        if (Number.isFinite(dateValue) && dateValue < jsonlCutoff) {
          fs.promises.unlink(path.join(this.logsDir, fileName)).catch(() => {});
        }
      }
    } catch {
      this.terminal?.write?.(`${nowIso()} WARN  observability.maintenance_failed status=failed code=LOG_MAINTENANCE_FAILED\n`);
    }
  }

  async close() {
    if (this.timer) clearTimeout(this.timer);
    if (this.maintenanceTimer) clearTimeout(this.maintenanceTimer);
    this.timer = null;
    this.maintenanceTimer = null;
    const drained = await this.drain();
    if (!drained) {
      this.terminal?.write?.(`${nowIso()} WARN  observability.shutdown_incomplete status=interrupted code=LOG_DRAIN_INCOMPLETE\n`);
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.closed = true;
    this.db.close();
  }
}
