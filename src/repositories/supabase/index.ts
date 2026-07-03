import type { AppRepositories } from "@/repositories/contracts/repositories";
import type { MemoryRepository, NotesRepository, SearchRepository, SettingsRepository, SkillsRepository, TaskRepository, VaultRepository } from "@/repositories/contracts";
import { createNotImplementedRepository } from "@/repositories/local/notImplemented";
import { SupabaseAgentRuntimeRepository } from "./agentRuntimeRepository";
import { SupabaseConversationRepository } from "./conversationRepository";

export function createSupabaseRepositories(): AppRepositories {
  return {
    vault: createNotImplementedRepository<VaultRepository>("Vault"),
    notes: createNotImplementedRepository<NotesRepository>("Notes"),
    conversations: new SupabaseConversationRepository(),
    memories: createNotImplementedRepository<MemoryRepository>("Memory"),
    tasks: createNotImplementedRepository<TaskRepository>("Task"),
    search: createNotImplementedRepository<SearchRepository>("Search"),
    settings: createNotImplementedRepository<SettingsRepository>("Settings"),
    skills: createNotImplementedRepository<SkillsRepository>("Skills"),
    agentRuntime: new SupabaseAgentRuntimeRepository(),
  };
}
