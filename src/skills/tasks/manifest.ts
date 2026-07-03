import type { SkillManifest } from "@/core/skills/SkillManifest";

export const taskSkillManifests: SkillManifest[] = [
  {
    id: "tasks.local",
    name: "Local Tasks",
    version: "0.1.0",
    description: "Creates and tracks BeeBot tasks in SQLite.",
    category: "tasks",
    permissions: ["tasks.read", "tasks.write"],
    entry: "skills/tasks/local",
    enabledByDefault: false,
  },
];
