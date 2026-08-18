export type WorkspaceRoom = "notes" | "cfo" | "consultant";

export type WorkspaceContentSource = "editor-draft" | "active-cache" | "repository";

export interface WorkspaceOpenFile {
  path: string;
  title: string;
  active: boolean;
  split: boolean;
  dirty: boolean;
}

export interface WorkspaceActiveFile extends WorkspaceOpenFile {
  content: string;
  contentHash: string;
  source: WorkspaceContentSource;
  mtimeMs?: number;
}

export interface WorkspaceTruthSnapshot {
  snapshotId: string;
  capturedAt: string;
  room: WorkspaceRoom;
  vault?: { id?: string; name: string; path?: string };
  openFiles: WorkspaceOpenFile[];
  activeFile: WorkspaceActiveFile | null;
}

export interface WorkspaceContextPort {
  capture(): Promise<WorkspaceTruthSnapshot>;
}

export interface WorkspaceNoteActionInput {
  path: string;
  content?: string;
  expectedContentHash?: string;
  newPath?: string;
}

export interface WorkspaceNoteActionReceipt {
  path: string;
  title: string;
  contentHash?: string;
  active: boolean;
}

export interface WorkspaceActionPort {
  createNote(input: WorkspaceNoteActionInput): Promise<WorkspaceNoteActionReceipt>;
  openNote(input: WorkspaceNoteActionInput): Promise<WorkspaceNoteActionReceipt>;
  updateNote(input: WorkspaceNoteActionInput): Promise<WorkspaceNoteActionReceipt>;
  deleteNote(input: WorkspaceNoteActionInput): Promise<WorkspaceNoteActionReceipt>;
  renameNote(input: WorkspaceNoteActionInput): Promise<WorkspaceNoteActionReceipt>;
}

export type EvToolErrorCode =
  | "NO_WORKSPACE_CONTEXT"
  | "NO_ACTIVE_FILE"
  | "FILE_NOT_FOUND"
  | "AMBIGUOUS_TARGET"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "ACTION_VERIFICATION_FAILED"
  | "DRAFT_UNAVAILABLE"
  | "CONTENT_CHANGED"
  | "PERMISSION_DENIED"
  | "SEARCH_UNAVAILABLE"
  | "PROVIDER_QUOTA"
  | "MEMORY_UNAVAILABLE"
  | "TOOL_TIMEOUT"
  | "TERMINAL_FAILED"
  | "NOTION_DISCONNECTED"
  | "APPROVAL_REQUIRED"
  | "REMOTE_TOOL_FAILED"
  | "UNSUPPORTED_OPERATION";

export interface EvidenceRef {
  id: string;
  type: "workspace" | "note" | "search" | "web" | "terminal" | "memory" | "notion";
  tool?: string;
  notionId?: string;
  path?: string;
  title?: string;
  snapshotId?: string;
  contentHash?: string;
  capturedAt: string;
  url?: string;
  snippet?: string;
}

export type EvToolResult<T> =
  | { ok: true; data: T; evidence: EvidenceRef[]; stale?: boolean }
  | {
      ok: false;
      evidence: EvidenceRef[];
      error: { code: EvToolErrorCode; message: string };
      recovery: string;
    };

export interface GroundedAnswer {
  answer: string;
  claims: Array<{ text: string; evidenceIds: string[] }>;
  evidenceIds: string[];
  unknowns: string[];
  confidence: "low" | "medium" | "high";
  stale: boolean;
}

export interface EvFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface EvToolExecutionContext {
  userTranscript: string;
  signal?: AbortSignal;
  approved?: boolean;
  idempotencyKey?: string;
  preview?: EvToolPreview;
  executionId?: string;
  interruptibility?: "foreground" | "background";
  startedAt?: number;
}

export type EvToolPreview =
  | {
      ok: true;
      requiresConfirmation: boolean;
      prompt: string;
      intent: string;
      skill: import("@/features/jarvis/core/commands").VoiceSkill;
      mode: import("@/features/jarvis/core/commands").VoiceMode;
      data?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: { code: EvToolErrorCode; message: string };
      recovery: string;
    };

export interface EvToolRegistry {
  declarations: EvFunctionDeclaration[];
  execute(name: string, args: Record<string, unknown>, context: EvToolExecutionContext): Promise<EvToolResult<unknown>>;
  cancel(): void;
}
