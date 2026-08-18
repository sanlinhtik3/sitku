export interface SearchResult {
  id: string;
  source: "note" | "heading" | "tag" | "memory" | "conversation" | "task" | "action";
  title: string;
  path?: string;
  snippet: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface NoteAstIndex {
  outboundLinks: string[];
  backlinks: string[];
  tags: string[];
  headings: { level: number; text: string }[];
  wordCount: number;
}

export interface GraphViewData {
  nodes: { id: string; title: string; degree: number }[];
  links: { source: string; target: string }[];
}

export interface SearchRepository {
  search(query: string, limit?: number): Promise<SearchResult[]>;
  rebuildNoteIndex(paths?: string[]): Promise<void>;
  rebuildEmbeddings(paths?: string[]): Promise<void>;
  // Phase B: Off-main-thread AST Indexing & Graph queries
  getNoteAst?(path: string): Promise<NoteAstIndex | null>;
  getGraphData?(): Promise<GraphViewData>;
  getAllTags?(): Promise<Record<string, number>>;
}
