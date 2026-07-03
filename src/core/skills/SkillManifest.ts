export type SkillCategory = "notes" | "memory" | "tasks" | "web" | "crypto" | "system" | "agent";

export interface SkillManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  category: SkillCategory;
  permissions: string[];
  entry?: string;
  enabledByDefault?: boolean;
  isDesktopOnly?: boolean;
  core?: boolean;
}

export interface SkillRuntimeContext {
  permissions: Set<string>;
  vault: unknown;
  memory: unknown;
  tasks: unknown;
  search: unknown;
  settings: unknown;
  events: unknown;
}
