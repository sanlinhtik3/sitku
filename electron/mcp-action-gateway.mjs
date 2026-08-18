import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const now = () => new Date().toISOString();

export function createMcpActionGateway({ rootDir, ttlMs = 10 * 60_000 } = {}) {
  const pending = new Map();
  const history = new Map();
  const idempotency = new Map();
  const auditPath = path.join(rootDir, "mcp-actions.jsonl");

  const publicRecord = (entry) => ({
    id: entry.id,
    client_id: entry.clientId,
    client_name: entry.clientName,
    tool: entry.tool,
    preview: entry.preview,
    status: entry.status,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    expires_at: entry.expiresAt,
    result: entry.result ?? null,
    error: entry.error ?? null,
  });

  function audit(entry, event) {
    try {
      fs.mkdirSync(rootDir, { recursive: true });
      fs.appendFileSync(auditPath, JSON.stringify({ timestamp: now(), event, ...publicRecord(entry) }) + "\n", "utf8");
    } catch (error) {
      console.warn("[Sitku] MCP action audit failed:", error?.message || error);
    }
  }

  function expireOld() {
    const time = Date.now();
    for (const [id, entry] of pending) {
      if (Date.parse(entry.expiresAt) > time) continue;
      entry.status = "expired";
      entry.updatedAt = now();
      pending.delete(id);
      remember(entry);
      audit(entry, "expired");
    }
  }

  function remember(entry) {
    history.set(entry.id, entry);
    while (history.size > 500) history.delete(history.keys().next().value);
  }

  function propose({ client, tool, preview, execute, idempotencyKey }) {
    expireOld();
    const clientId = client?.id || "local-stdio";
    const dedupeKey = idempotencyKey ? `${clientId}:${tool}:${idempotencyKey}` : null;
    if (dedupeKey && idempotency.has(dedupeKey)) {
      const previous = pending.get(idempotency.get(dedupeKey)) || history.get(idempotency.get(dedupeKey));
      if (!previous) idempotency.delete(dedupeKey);
      else {
        if (previous.preview !== String(preview || tool).slice(0, 1000)) throw new Error("Idempotency key was already used with different action data.");
        return publicRecord(previous);
      }
    }
    const createdAt = now();
    const entry = {
      id: `act_${crypto.randomBytes(8).toString("hex")}`,
      clientId,
      clientName: client?.name || "Local MCP client",
      tool,
      preview: String(preview || tool).slice(0, 1000),
      execute,
      status: "pending",
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    };
    pending.set(entry.id, entry);
    if (dedupeKey) idempotency.set(dedupeKey, entry.id);
    audit(entry, "proposed");
    return publicRecord(entry);
  }

  async function approve(id) {
    expireOld();
    const entry = pending.get(id);
    if (!entry) throw new Error("Pending MCP action not found or expired.");
    entry.status = "running";
    entry.updatedAt = now();
    audit(entry, "approved");
    try {
      entry.result = await entry.execute();
      entry.status = "completed";
      entry.updatedAt = now();
      audit(entry, "completed");
    } catch (error) {
      entry.status = "failed";
      entry.error = error?.message || String(error);
      entry.updatedAt = now();
      audit(entry, "failed");
    } finally {
      entry.updatedAt = now();
      delete entry.execute;
      pending.delete(id);
      remember(entry);
    }
    return publicRecord(entry);
  }

  function reject(id) {
    expireOld();
    const entry = pending.get(id);
    if (!entry) throw new Error("Pending MCP action not found or expired.");
    entry.status = "rejected";
    entry.updatedAt = now();
    delete entry.execute;
    pending.delete(id);
    remember(entry);
    audit(entry, "rejected");
    return publicRecord(entry);
  }

  return {
    propose,
    approve,
    reject,
    get(id) { expireOld(); const entry = pending.get(id) || history.get(id); return entry ? publicRecord(entry) : null; },
    list() { expireOld(); return [...pending.values()].map(publicRecord).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
  };
}
