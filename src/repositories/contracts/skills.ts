export interface SkillManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  category: "notes" | "memory" | "tasks" | "web" | "crypto" | "system" | "agent";
  permissions: string[];
  entry?: string;
  enabledByDefault?: boolean;
  isDesktopOnly?: boolean;
  core?: boolean;
}

export interface InstalledSkill {
  manifest: SkillManifest;
  enabled: boolean;
  source: "core" | "built-in" | "community";
  installedAt?: string;
  updatedAt?: string;
}

export interface SetSkillEnabledInput {
  skillId: string;
  enabled: boolean;
}

export interface SkillRegistrySummary {
  enabledCount: number;
  totalCount: number;
  permissionCount: number;
  categories: string[];
}

export interface SkillsRepository {
  listSkills(): Promise<InstalledSkill[]>;
  getSkill(skillId: string): Promise<InstalledSkill | null>;
  setSkillEnabled(input: SetSkillEnabledInput): Promise<InstalledSkill>;
  getSummary(): Promise<SkillRegistrySummary>;
}
