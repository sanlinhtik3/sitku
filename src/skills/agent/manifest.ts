import type { SkillManifest } from "@/core/skills/SkillManifest";

export const agentSkillManifests: SkillManifest[] = [
  {
    id: "agent.storytelling",
    name: "E.V Storytelling Master",
    version: "1.0.0",
    description: "Creates, reviews, and revises grounded storytelling scripts through E.V with approval-gated note writes.",
    category: "agent",
    permissions: ["agent.chat", "vault.read", "vault.write"],
    entry: "skills/agent/storytelling",
    enabledByDefault: true,
    core: true,
  },
];
