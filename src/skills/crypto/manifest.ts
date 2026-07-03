import type { SkillManifest } from "@/core/skills/SkillManifest";

export const cryptoSkillManifests: SkillManifest[] = [
  {
    id: "crypto.price",
    name: "Crypto Price",
    version: "0.1.0",
    description: "Placeholder for future permissioned market data tools.",
    category: "crypto",
    permissions: ["network.crypto"],
    entry: "skills/crypto/price",
    enabledByDefault: false,
  },
];
