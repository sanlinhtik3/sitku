import type { SkillManifest } from "@/core/skills/SkillManifest";

export const webSkillManifests: SkillManifest[] = [
  {
    id: "web.search",
    name: "Web Search",
    version: "0.1.0",
    description: "Placeholder for future permissioned web search tools.",
    category: "web",
    permissions: ["network.web"],
    entry: "skills/web/search",
    enabledByDefault: false,
  },
];
