import type { SkillManifest } from "@/core/skills/SkillManifest";

export const memorySkillManifests: SkillManifest[] = [
  {
    id: "memory.local",
    name: "Local Memory",
    version: "0.1.0",
    description: "Stores and retrieves BeeBot runtime memories in SQLite.",
    category: "memory",
    permissions: ["memory.read", "memory.write"],
    entry: "skills/memory/local",
    enabledByDefault: false,
  },
];
