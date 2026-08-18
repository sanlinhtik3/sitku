import type {
  AgentRuntimeRepository,
  ConversationRepository,
  MemoryRepository,
  NotesRepository,
  SearchRepository,
  SettingsRepository,
  SkillsRepository,
  TaskRepository,
  TeamRepository,
  VaultRepository,
} from "@/repositories/contracts";
import type { MarkdownCommand } from "@/components/editor/cm/types";
import type { EvMemoryRepository } from "@/features/ev-voice/memory/contracts";

export type DesktopCommand =
  | "new-note"
  | "save-note"
  | "command-palette"
  | "search-notes"
  | `format:${MarkdownCommand}`;

export interface LocalRuntimeApi {
  vault: VaultRepository;
  notes: NotesRepository;
  conversations: ConversationRepository;
  memories: MemoryRepository;
  tasks: TaskRepository;
  team?: TeamRepository;
  search: SearchRepository;
  settings: SettingsRepository;
  skills: SkillsRepository;
  agentRuntime: AgentRuntimeRepository;
  evMemory?: EvMemoryRepository;
  jarvis?: {
    begin(input: { turnId: string; status: string; startedAt: string }): Promise<void>;
    update(input: Record<string, unknown>): Promise<void>;
    claimAction(input: { turnId: string; idempotencyKey: string; intent: string; skill: string }): Promise<{ claimed: boolean; result?: string; reply?: string }>;
    listRecent(limit?: number): Promise<Array<{
      turnId: string;
      idempotencyKey?: string;
      status: "recording" | "thinking" | "confirming" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
      intent?: string;
      skill?: import("@/features/jarvis/core/commands").VoiceSkill;
      result?: string;
      reply?: string;
      error?: string;
      metadata?: import("@/features/jarvis/core/engine").VoiceTurnMetadata;
      actionClaimed?: boolean;
      updatedAt: string;
    }>>;
    recoverInterrupted(): Promise<{ recovered: number }>;
  };
}

export interface LocalFontData {
  family?: string;
  fullName?: string;
  postscriptName?: string;
  style?: string;
}

declare global {
  interface Window {
    beebotLocalRuntime?: LocalRuntimeApi;
    beebotDesktop?: {
      platform: string;
      titleBar: "hiddenInset";
      setWindowBackground?: (color: string) => void;
      setNativeContextMenus?: (enabled: boolean) => void;
      nativeChromeStatus?: () => Promise<{ available: boolean; attached: boolean; reason?: string | null }>;
      setNativeAppearance?: (mode: "system" | "dark" | "light") => void;
      performNativeHaptic?: (kind: "selection" | "warning") => void;
      setDocumentState?: (state: { path: string | null; edited: boolean }) => void;
      onWindowState?: (cb: (state: { active: boolean; fullscreen: boolean; maximized: boolean }) => void) => () => void;
      listFonts?: () => Promise<string[]>;
      // Auto-update (electron-updater). onUpdateReady fires once a new version
      // is downloaded and ready; installUpdate restarts into it.
      onUpdateReady?: (cb: (info: { version: string }) => void) => () => void;
      onUpdateProgress?: (cb: (info: { percent: number; transferred: number; total: number; bytesPerSecond: number }) => void) => () => void;
      onUpdateError?: (cb: (info: { message: string }) => void) => () => void;
      onUpdateStatus?: (cb: (info: { status: string; version?: string }) => void) => () => void;
      checkForUpdates?: () => Promise<unknown>;
      startDownload?: () => Promise<unknown>;
      installUpdate?: () => Promise<void>;
      openMicSettings?: () => Promise<void>;
      recordObservability?: (input: {
        domain: "ev";
        level?: "info" | "warn" | "error";
        event: string;
        status: "started" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled" | "interrupted" | "retrying";
        traceId?: string | null;
        turnId?: string | null;
        actionId?: string | null;
        durationMs?: number;
        errorCode?: string;
        recovery?: string;
        metadata?: Record<string, unknown>;
      }) => void;
      jarvisKeyStatus?: () => Promise<{ hasKey: boolean }>;
      jarvisSetKey?: (key: string) => Promise<{ hasKey: boolean }>;
      evLiveToken?: (
        model: string,
        translation?: { targetLanguageCode: string; echoTargetLanguage: boolean },
      ) => Promise<{ token: string; model: string }>;
      tavilyKeyStatus?: () => Promise<{ hasKey: boolean }>;
      tavilySetKey?: (key: string) => Promise<{ hasKey: boolean }>;
      tavilyTest?: (key?: string) => Promise<{ ok: boolean; usage?: unknown; account?: unknown }>;
      tavilySearch?: (request: {
        query: string;
        searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
        maxResults?: number;
        topic?: "general" | "news" | "finance";
        timeRange?: "day" | "week" | "month" | "year";
        signal?: AbortSignal;
      }) => Promise<{
        query: string;
        answer: string;
        results: Array<{ title: string; url: string; content: string; score: number | null; publishedDate?: string }>;
        requestId?: string;
        responseTime?: string | number;
        usage?: unknown;
      }>;
      notionMcpStatus?: () => Promise<NotionMcpConnectionState>;
      notionMcpConnect?: () => Promise<NotionMcpConnectionState>;
      notionMcpDisconnect?: () => Promise<NotionMcpConnectionState>;
      notionMcpListTools?: () => Promise<{
        tools: Array<{
          name: string;
          normalizedName: string | null;
          description: string;
          inputSchema: Record<string, unknown>;
          policy: "read" | "write";
        }>;
        unsupportedCount: number;
      }>;
      notionMcpCallTool?: (input: {
        name: string;
        arguments: Record<string, unknown>;
        approved: boolean;
        executionId: string;
        idempotencyKey: string;
      }) => Promise<{
        ok: boolean;
        data?: unknown;
        summary?: string;
        evidence?: unknown[];
        requestId?: string;
        policy?: "read" | "write";
        error?: { code: string; message: string };
      }>;
      evTerminalPlan?: (input: { command: string; cwd?: string; purpose?: string }) => Promise<{
        ok: boolean;
        plan?: {
          planId: string;
          command: string;
          executable: string;
          args: string[];
          cwd: string;
          purpose: string;
          risk: "read_only" | "state_change" | "destructive";
          requiresConfirmation: boolean;
          destructiveTargets: string[];
          createdAt: string;
          expiresAt: string;
        };
        error?: { code: string; message: string };
        recovery?: string;
      }>;
      evTerminalExecute?: (input: { planId: string; executionId: string; idempotencyKey: string; approved: boolean; timeoutMs?: number }) => Promise<Record<string, unknown>>;
      evTerminalCancel?: (executionId: string) => Promise<{ ok: boolean }>;
      jarvisGemini?: (request: { model: string; body: unknown; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; body?: string; error?: string }>;
      jarvisGeminiStream?: (request: { model: string; body: unknown; signal?: AbortSignal }) => {
        readChunks(): AsyncIterable<Uint8Array>;
      };
      // Authoritative app version (packaged build) for the Settings version check.
      getVersion?: () => Promise<string>;
      // Fired when the native menu's Settings item is chosen.
      onOpenSettings?: (cb: () => void) => () => void;
      // Native application menu commands that operate on the active workspace.
      onDesktopCommand?: (cb: (command: DesktopCommand) => void) => () => void;
    };
    queryLocalFonts?: () => Promise<LocalFontData[]>;
  }
}

export interface NotionMcpConnectionState {
  state: "not_connected" | "authorizing" | "connected" | "refreshing" | "permission_required" | "error";
  connected: boolean;
  workspaceName: string | null;
  grantedScope: string | null;
  lastSuccessfulCall: string | null;
  error: { code: string; message: string } | null;
  desktopOnly: true;
}

export function getLocalRuntimeApi(): LocalRuntimeApi {
  if (typeof window === "undefined" || !window.beebotLocalRuntime) {
    throw new Error(
      "Local runtime API is unavailable. Electron preload must expose window.beebotLocalRuntime before enabling VITE_REPOSITORY_RUNTIME=local.",
    );
  }

  return window.beebotLocalRuntime;
}
