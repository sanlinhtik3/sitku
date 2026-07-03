import type { AgentRuntimeRepository } from "./agentRuntime";
import type { ConversationRepository } from "./conversation";
import type { MemoryRepository } from "./memory";
import type { NotesRepository } from "./notes";
import type { SearchRepository } from "./search";
import type { SettingsRepository } from "./settings";
import type { SkillsRepository } from "./skills";
import type { TaskRepository } from "./tasks";
import type { VaultRepository } from "./vault";

export interface AppRepositories {
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
