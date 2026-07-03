import type { LocalRuntimeApi } from "@/runtime/LocalRuntimeApi";
import type { AgentRuntimeRepository, MemoryRepository, NotesRepository, SearchRepository, SettingsRepository, SkillsRepository, TaskRepository, VaultRepository } from "@/repositories/contracts";
import { createNotImplementedRepository } from "@/repositories/local/notImplemented";
import { ensureLocalAgentSchema } from "./sqlite/schema";
import { SqliteConversationRepository } from "./sqlite/SqliteConversationRepository";
import type { SqliteDatabase } from "./sqlite/types";

export interface CreateLocalRuntimeApiOptions {
  db: SqliteDatabase;
}

export function createLocalRuntimeApi({ db }: CreateLocalRuntimeApiOptions): LocalRuntimeApi {
  ensureLocalAgentSchema(db);

  return {
    vault: createNotImplementedRepository<VaultRepository>("Local vault"),
    notes: createNotImplementedRepository<NotesRepository>("Local notes"),
    conversations: new SqliteConversationRepository(db),
    memories: createNotImplementedRepository<MemoryRepository>("Local memory"),
    tasks: createNotImplementedRepository<TaskRepository>("Local task"),
    search: createNotImplementedRepository<SearchRepository>("Local search"),
    settings: createNotImplementedRepository<SettingsRepository>("Local settings"),
    skills: createNotImplementedRepository<SkillsRepository>("Local skills"),
    agentRuntime: createNotImplementedRepository<AgentRuntimeRepository>("Local agent runtime"),
  };
}
