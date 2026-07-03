import type {
  AgentRuntimeRepository,
  ConversationRepository,
  MemoryRepository,
  NotesRepository,
  SearchRepository,
  SettingsRepository,
  SkillsRepository,
  TaskRepository,
  VaultRepository,
} from "@/repositories/contracts";

export interface LocalRuntimeApi {
  vault: VaultRepository;
  notes: NotesRepository;
  conversations: ConversationRepository;
  memories: MemoryRepository;
  tasks: TaskRepository;
  search: SearchRepository;
  settings: SettingsRepository;
  skills: SkillsRepository;
  agentRuntime: AgentRuntimeRepository;
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
      listFonts?: () => Promise<string[]>;
      // Auto-update (electron-updater). onUpdateReady fires once a new version
      // is downloaded and ready; installUpdate restarts into it.
      onUpdateReady?: (cb: (info: { version: string }) => void) => () => void;
      installUpdate?: () => Promise<void>;
      openMicSettings?: () => Promise<void>;
      // Authoritative app version (packaged build) for the Settings version check.
      getVersion?: () => Promise<string>;
      // Fired when the native menu's Settings item is chosen.
      onOpenSettings?: (cb: () => void) => () => void;
    };
    queryLocalFonts?: () => Promise<LocalFontData[]>;
  }
}

export function getLocalRuntimeApi(): LocalRuntimeApi {
  if (typeof window === "undefined" || !window.beebotLocalRuntime) {
    throw new Error(
      "Local runtime API is unavailable. Electron preload must expose window.beebotLocalRuntime before enabling VITE_REPOSITORY_RUNTIME=local.",
    );
  }

  return window.beebotLocalRuntime;
}
