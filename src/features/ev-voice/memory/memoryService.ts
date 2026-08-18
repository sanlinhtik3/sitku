import type {
  EvConversationMessage,
  EvConversationSession,
  EvConversationSummary,
  EvLongTermMemory,
  EvMemoryBackupData,
  EvMemoryBackupEnvelope,
  EvMemoryContext,
  EvMemoryRepository,
} from "./contracts";
import { createEvMemorySummaryProcessor } from "./langchainMemoryProcessor";

const FALLBACK_KEY = "sitku.ev.memory.v1";
const SUMMARY_MESSAGE_THRESHOLD = 8;
const PROCESSOR = "langchain-core-local-extractive";
const PROCESSOR_VERSION = 1;

interface StoredFallback extends EvMemoryBackupData {}

function emptyData(): StoredFallback {
  return { schemaVersion: 1, sessions: [], messages: [], summaries: [], memories: [] };
}

function fallbackLoad(): StoredFallback {
  if (typeof localStorage === "undefined") return emptyData();
  try {
    const parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) || "null") as Partial<StoredFallback> | null;
    if (!parsed || parsed.schemaVersion !== 1) return emptyData();
    return {
      schemaVersion: 1,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      summaries: Array.isArray(parsed.summaries) ? parsed.summaries : [],
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
    };
  } catch {
    return emptyData();
  }
}

function fallbackSave(data: StoredFallback) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(data));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : canonicalJson(value));
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let output = 2166136261;
  for (const byte of bytes) output = Math.imul(output ^ byte, 16777619);
  return `fallback-${(output >>> 0).toString(16).padStart(8, "0")}`;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): { values: T[]; imported: number; skipped: number } {
  const map = new Map(current.map((item) => [item.id, item]));
  let imported = 0;
  let skipped = 0;
  for (const item of incoming) {
    if (map.has(item.id)) { skipped += 1; continue; }
    map.set(item.id, item);
    imported += 1;
  }
  return { values: [...map.values()], imported, skipped };
}

function createBrowserRepository(): EvMemoryRepository {
  return {
    async openSession({ sessionId, startedAt }) {
      const data = fallbackLoad();
      const existing = data.sessions.find((session) => session.id === sessionId);
      if (existing) return existing;
      const session: EvConversationSession = { id: sessionId, status: "active", startedAt, createdAt: startedAt, updatedAt: startedAt };
      data.sessions.push(session);
      fallbackSave(data);
      return session;
    },
    async closeSession({ sessionId, status, endedAt }) {
      const data = fallbackLoad();
      const index = data.sessions.findIndex((session) => session.id === sessionId);
      if (index < 0) throw new Error("E.V memory session was not found.");
      data.sessions[index] = { ...data.sessions[index], status, endedAt, updatedAt: endedAt };
      fallbackSave(data);
      return data.sessions[index];
    },
    async appendMessage(input) {
      const content = input.content.trim();
      if (!content) throw new Error("E.V memory message content is required.");
      const data = fallbackLoad();
      const existing = data.messages.find((message) => message.id === input.id);
      if (existing) {
        if (existing.content !== content) throw new Error("E.V append-only message conflict.");
        return existing;
      }
      const sequence = Math.max(0, ...data.messages.filter((message) => message.sessionId === input.sessionId).map((message) => message.sequence)) + 1;
      const message: EvConversationMessage = { ...input, content, sequence, contentHash: await hash(content) };
      data.messages.push(message);
      const session = data.sessions.find((item) => item.id === input.sessionId);
      if (session) Object.assign(session, { lastMessageAt: input.createdAt, updatedAt: input.createdAt });
      fallbackSave(data);
      return message;
    },
    async listMessages(sessionId, limit = 200) {
      return fallbackLoad().messages
        .filter((message) => message.sessionId === sessionId)
        .sort((a, b) => a.sequence - b.sequence)
        .slice(-Math.max(1, Math.min(2_000, limit)));
    },
    async listSummaries(sessionId, limit = 20) {
      return fallbackLoad().summaries
        .filter((summary) => summary.sessionId === sessionId)
        .sort((a, b) => b.toSequence - a.toSequence)
        .slice(0, Math.max(1, Math.min(200, limit)));
    },
    async saveSummary(input) {
      const data = fallbackLoad();
      const contentHash = await hash({ sessionId: input.sessionId, from: input.fromSequence, to: input.toSequence, summary: input.summary });
      const existing = data.summaries.find((summary) => summary.contentHash === contentHash);
      if (existing) return existing;
      const summary: EvConversationSummary = { ...input, id: makeId("ev-summary"), contentHash, createdAt: new Date().toISOString() };
      data.summaries.push(summary);
      fallbackSave(data);
      return summary;
    },
    async getContext({ sessionId, recentLimit = 10, memoryLimit = 12 }) {
      const data = fallbackLoad();
      const summaries = data.summaries.filter((summary) => !sessionId || summary.sessionId !== sessionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const messages = sessionId ? data.messages.filter((message) => message.sessionId === sessionId) : data.messages;
      return {
        latestSummary: summaries[0],
        recentMessages: messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-recentLimit),
        confirmedMemories: data.memories.filter((memory) => memory.status === "confirmed").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, memoryLimit),
      };
    },
    async upsertMemory(input) {
      const data = fallbackLoad();
      const content = input.content.trim();
      const contentHash = await hash(content);
      const existing = data.memories.find((memory) => memory.id === input.id || memory.contentHash === contentHash);
      const now = new Date().toISOString();
      const memory: EvLongTermMemory = {
        ...input,
        id: existing?.id || input.id || makeId("ev-memory"),
        content,
        contentHash,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      data.memories = [memory, ...data.memories.filter((item) => item.id !== memory.id)];
      fallbackSave(data);
      return memory;
    },
    async listLongTermMemories(input = {}) {
      return fallbackLoad().memories
        .filter((memory) => !input.status || memory.status === input.status)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, Math.max(1, Math.min(500, input.limit || 100)));
    },
    async exportData() {
      const data = fallbackLoad();
      return { format: "sitku-ev-memory", schemaVersion: 1, exportedAt: new Date().toISOString(), checksum: await hash(data), data };
    },
    async importData(envelope) {
      if (envelope.format !== "sitku-ev-memory" || envelope.schemaVersion !== 1 || envelope.data.schemaVersion !== 1) throw new Error("Unsupported E.V memory backup.");
      if (await hash(envelope.data) !== envelope.checksum) throw new Error("E.V memory backup checksum mismatch.");
      const current = fallbackLoad();
      const sessions = mergeById(current.sessions, envelope.data.sessions);
      const messages = mergeById(current.messages, envelope.data.messages);
      const summaries = mergeById(current.summaries, envelope.data.summaries);
      const memories = mergeById(current.memories, envelope.data.memories);
      fallbackSave({ schemaVersion: 1, sessions: sessions.values, messages: messages.values, summaries: summaries.values, memories: memories.values });
      return { imported: sessions.imported + messages.imported + summaries.imported + memories.imported, skipped: sessions.skipped + messages.skipped + summaries.skipped + memories.skipped };
    },
  };
}

function repository(): EvMemoryRepository {
  if (typeof window !== "undefined" && window.beebotLocalRuntime?.evMemory) return window.beebotLocalRuntime.evMemory;
  return createBrowserRepository();
}

export function getEvMemoryRepository(): EvMemoryRepository {
  return repository();
}

function explicitMemory(text: string): string | null {
  const normalized = text.trim();
  if (!/(?:\bremember(?: this| that)?\b|မှတ်ထား)/iu.test(normalized)) return null;
  return normalized.replace(/^(?:please\s+)?remember(?: this| that)?[:,]?\s*/iu, "").replace(/^မှတ်ထား[:,]?\s*/u, "").trim() || normalized;
}

export interface EvConversationMemory {
  startSession(): Promise<{ sessionId: string; promptContext: string }>;
  commitTurn(input: { sessionId: string; turnId: string; user: string; assistant?: string; status: "final" | "failed" | "interrupted"; metadata?: Record<string, unknown> }): Promise<void>;
  refreshSummary(sessionId: string, force?: boolean): Promise<EvConversationSummary | null>;
  endSession(sessionId: string, status?: "completed" | "interrupted"): Promise<void>;
}

export function createEvConversationMemory(): EvConversationMemory {
  const store = repository();
  const summarize = createEvMemorySummaryProcessor();
  const activeSummaries = new Map<string, Promise<EvConversationSummary | null>>();

  const refreshSummary = (sessionId: string, force = false): Promise<EvConversationSummary | null> => {
    const existing = activeSummaries.get(sessionId);
    if (existing) return existing;
    const operation = (async () => {
      const messages = await store.listMessages(sessionId, 2_000);
      const context = await store.getContext({ sessionId, recentLimit: 1, memoryLimit: 1 });
      const latestForSession = (await store.listSummaries(sessionId, 1))[0];
      const unsummarized = messages.filter((message) => message.sequence > (latestForSession?.toSequence || 0));
      if (!force && unsummarized.length < SUMMARY_MESSAGE_THRESHOLD) return null;
      if (!messages.length || !unsummarized.length) return latestForSession || null;
      const draft = await summarize({ messages: unsummarized, previousSummary: latestForSession?.summary || context.latestSummary?.summary });
      return store.saveSummary({
        sessionId,
        fromSequence: draft.fromSequence,
        toSequence: draft.toSequence,
        summary: draft.summary,
        facts: draft.facts,
        decisions: draft.decisions,
        unresolved: draft.unresolved,
        processor: PROCESSOR,
        processorVersion: PROCESSOR_VERSION,
      });
    })().finally(() => activeSummaries.delete(sessionId));
    activeSummaries.set(sessionId, operation);
    return operation;
  };

  return {
    async startSession() {
      const sessionId = makeId("ev-session");
      await store.openSession({ sessionId, startedAt: new Date().toISOString() });
      const context = await store.getContext({ sessionId, recentLimit: 8, memoryLimit: 12 });
      const parts = [
        context.latestSummary?.summary ? `Previous conversation summary:\n${context.latestSummary.summary}` : "",
        context.confirmedMemories.length ? `Confirmed user memories:\n${context.confirmedMemories.map((memory) => `- ${memory.content}`).join("\n")}` : "",
      ].filter(Boolean);
      return { sessionId, promptContext: parts.join("\n\n") };
    },
    async commitTurn(input) {
      const now = new Date().toISOString();
      const user = input.user.trim();
      const assistant = input.assistant?.trim();
      if (user) {
        const message = await store.appendMessage({
          id: `${input.turnId}:user`, sessionId: input.sessionId, turnId: input.turnId,
          role: "user", content: user, status: input.status, metadata: input.metadata, createdAt: now,
        });
        const remembered = explicitMemory(user);
        if (remembered) {
          await store.upsertMemory({
            kind: "instruction", content: remembered, status: "confirmed", confidence: 1, importance: 0.8,
            sourceTurnId: input.turnId, sourceMessageId: message.id, evidence: { sessionId: input.sessionId },
          });
        }
      }
      if (assistant) {
        await store.appendMessage({
          id: `${input.turnId}:assistant`, sessionId: input.sessionId, turnId: input.turnId,
          role: "assistant", content: assistant, status: input.status, metadata: input.metadata, createdAt: now,
        });
      }
      void refreshSummary(input.sessionId).catch((error) => console.warn("[E.V memory] summary deferred", error));
    },
    refreshSummary,
    async endSession(sessionId, status = "completed") {
      await refreshSummary(sessionId, true).catch((error) => console.warn("[E.V memory] final summary deferred", error));
      await store.closeSession({ sessionId, status, endedAt: new Date().toISOString() });
    },
  };
}

export async function exportEvMemoryBackup(): Promise<EvMemoryBackupEnvelope> {
  return repository().exportData();
}

export async function importEvMemoryBackup(envelope: EvMemoryBackupEnvelope): Promise<{ imported: number; skipped: number }> {
  return repository().importData(envelope);
}
