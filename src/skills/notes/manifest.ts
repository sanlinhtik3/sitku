import type { SkillManifest } from "@/core/skills/SkillManifest";

export const notesSkillManifests: SkillManifest[] = [
  {
    id: "notes.read",
    name: "Read Notes",
    version: "1.0.0",
    description: "Reads Markdown notes from the active vault.",
    category: "notes",
    permissions: ["vault.read"],
    entry: "skills/notes/read",
    enabledByDefault: true,
  },
  {
    id: "notes.create",
    name: "Create Notes",
    version: "1.0.0",
    description: "Creates and updates Markdown notes in the active vault.",
    category: "notes",
    permissions: ["vault.read", "vault.write"],
    entry: "skills/notes/write",
    enabledByDefault: true,
  },
  {
    id: "notes.search",
    name: "Search Notes",
    version: "1.0.0",
    description: "Searches the active vault through SQLite FTS metadata.",
    category: "notes",
    permissions: ["vault.read", "search.read"],
    entry: "skills/notes/search",
    enabledByDefault: true,
  },
];
