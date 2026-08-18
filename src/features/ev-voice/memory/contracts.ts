export type EvConversationRole = "user" | "assistant";
export type EvConversationStatus = "active" | "completed" | "interrupted";
export type EvMessageStatus = "final" | "failed" | "interrupted";
export type EvMemoryStatus = "candidate" | "confirmed" | "archived";
export type EvMemoryKind = "preference" | "fact" | "decision" | "instruction" | "episode";

export interface EvConversationSession {
  id: string;
  status: EvConversationStatus;
  startedAt: string;
  endedAt?: string;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvConversationMessage {
  id: string;
  sessionId: string;
  turnId: string;
  sequence: number;
  role: EvConversationRole;
  content: string;
  status: EvMessageStatus;
  contentHash: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface EvConversationSummary {
  id: string;
  sessionId: string;
  fromSequence: number;
  toSequence: number;
  summary: string;
  facts: string[];
  decisions: string[];
  unresolved: string[];
  contentHash: string;
  processor: string;
  processorVersion: number;
  createdAt: string;
}

export interface EvLongTermMemory {
  id: string;
  kind: EvMemoryKind;
  content: string;
  status: EvMemoryStatus;
  confidence: number;
  importance: number;
  sourceTurnId?: string;
  sourceMessageId?: string;
  evidence?: Record<string, unknown>;
  contentHash: string;
  supersedesId?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface EvMemoryContext {
  latestSummary?: EvConversationSummary;
  recentMessages: EvConversationMessage[];
  confirmedMemories: EvLongTermMemory[];
}

export interface EvMemoryBackupData {
  schemaVersion: 1;
  sessions: EvConversationSession[];
  messages: EvConversationMessage[];
  summaries: EvConversationSummary[];
  memories: EvLongTermMemory[];
}

export interface EvMemoryBackupEnvelope {
  format: "sitku-ev-memory";
  schemaVersion: 1;
  exportedAt: string;
  checksum: string;
  data: EvMemoryBackupData;
}

export interface EvMemoryRepository {
  openSession(input: { sessionId: string; startedAt: string }): Promise<EvConversationSession>;
  closeSession(input: { sessionId: string; status: Exclude<EvConversationStatus, "active">; endedAt: string }): Promise<EvConversationSession>;
  appendMessage(input: Omit<EvConversationMessage, "sequence" | "contentHash">): Promise<EvConversationMessage>;
  listMessages(sessionId: string, limit?: number): Promise<EvConversationMessage[]>;
  listSummaries(sessionId: string, limit?: number): Promise<EvConversationSummary[]>;
  saveSummary(input: Omit<EvConversationSummary, "id" | "contentHash" | "createdAt">): Promise<EvConversationSummary>;
  getContext(input: { sessionId?: string; recentLimit?: number; memoryLimit?: number }): Promise<EvMemoryContext>;
  upsertMemory(input: Omit<EvLongTermMemory, "id" | "contentHash" | "createdAt" | "updatedAt"> & { id?: string }): Promise<EvLongTermMemory>;
  listLongTermMemories(input?: { status?: EvMemoryStatus; limit?: number }): Promise<EvLongTermMemory[]>;
  exportData(): Promise<EvMemoryBackupEnvelope>;
  importData(envelope: EvMemoryBackupEnvelope): Promise<{ imported: number; skipped: number }>;
}
