export interface AgentMemory {
  id: string;
  content: string;
  category: string;
  confidence: number;
  importance: number;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string | null;
}

export interface MemorySearchInput {
  query?: string;
  tags?: string[];
  limit?: number;
}

export interface UpsertMemoryInput {
  id?: string;
  content: string;
  category?: string;
  confidence?: number;
  importance?: number;
  tags?: string[];
  pinned?: boolean;
}

export interface MemoryRepository {
  listMemories(input?: MemorySearchInput): Promise<AgentMemory[]>;
  upsertMemory(input: UpsertMemoryInput): Promise<AgentMemory>;
  deleteMemory(id: string): Promise<void>;
  recordMemoryAccess(id: string): Promise<void>;
}
