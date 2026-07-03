export interface SearchResult {
  id: string;
  source: "note" | "memory" | "conversation" | "task";
  title: string;
  path?: string;
  snippet: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface SearchRepository {
  search(query: string, limit?: number): Promise<SearchResult[]>;
  rebuildNoteIndex(paths?: string[]): Promise<void>;
  rebuildEmbeddings(paths?: string[]): Promise<void>;
}
