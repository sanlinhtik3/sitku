export interface NoteFile {
  path: string;
  title: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  mtimeMs?: number;
  contentHash?: string;
}

export interface VaultEntry {
  path: string;
  name: string;
  kind: "folder" | "note";
  title?: string;
  depth: number;
  mtimeMs?: number;
  contentHash?: string;
}

export interface ListNotesInput {
  query?: string;
  folder?: string;
  limit?: number;
}

export interface ListVaultEntriesInput {
  query?: string;
}

export interface WriteNoteInput {
  path: string;
  content: string;
  expectedHash?: string;
  /**
   * When false, the backend writes content WITHOUT auto-renaming the file from
   * its H1 heading. Content autosave passes false (silent, no rename churn); the
   * explicit title-sync on editor blur omits it (defaults to renaming).
   */
  syncName?: boolean;
}

export interface RenamePathInput {
  oldPath: string;
  newPath: string;
}

export interface NoteVersion {
  id: number;
  path: string;
  mtimeMs: number;
  size: number;
}

export interface NotesRepository {
  listEntries(input?: ListVaultEntriesInput): Promise<VaultEntry[]>;
  listNotes(input?: ListNotesInput): Promise<NoteFile[]>;
  readNote(path: string): Promise<NoteFile | null>;
  writeNote(input: WriteNoteInput): Promise<NoteFile>;
  deleteNote(path: string): Promise<void>;
  createFolder(path: string): Promise<VaultEntry>;
  deleteFolder(path: string): Promise<void>;
  renamePath(input: RenamePathInput): Promise<VaultEntry>;
  revealPath(path: string): Promise<void>;
  watchNotes(onChange: (paths: string[]) => void): { unsubscribe: () => void };
  // Local version history ("File Recovery"). Optional — only the browser/local
  // store implements it; desktop/runtime repositories may omit it.
  listVersions?(path: string): Promise<NoteVersion[]>;
  getVersionContent?(id: number): Promise<string | null>;
}
