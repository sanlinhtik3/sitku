import type { SkillManifest } from "@/core/skills/SkillManifest";

export const systemSkillManifests: SkillManifest[] = [
  {
    id: "system.vault",
    name: "Vault Manager",
    version: "1.0.0",
    description: "Opens, creates, switches, and reveals local vault folders.",
    category: "system",
    permissions: ["system.dialog", "vault.read", "vault.write"],
    entry: "skills/system/vault",
    enabledByDefault: true,
    isDesktopOnly: true,
  },
];
