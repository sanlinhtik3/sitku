import type { VoiceMode, VoiceSkill } from "@/features/jarvis/core/commands";
import type { EvToolPreview } from "@/features/ev-voice/workspace/contracts";
import type { EvCapabilityDescriptor } from "./capabilityRegistry";

export interface EvCapabilityPolicyDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  requiresEvidence: boolean;
  reason: string;
}

export function evaluateEvCapabilityPolicy(
  descriptor: EvCapabilityDescriptor,
  preview: EvToolPreview | null,
): EvCapabilityPolicyDecision {
  if (preview && !preview.ok) {
    return {
      allowed: false,
      requiresConfirmation: false,
      requiresEvidence: descriptor.requiresEvidence,
      reason: preview.error.message,
    };
  }

  if (descriptor.risk === "dynamic" && !preview) {
    return {
      allowed: false,
      requiresConfirmation: false,
      requiresEvidence: descriptor.requiresEvidence,
      reason: `${descriptor.id} requires a runtime risk preview before execution.`,
    };
  }

  const adapterRequiresConfirmation = preview?.ok === true && preview.requiresConfirmation;
  const metadataRequiresConfirmation = descriptor.risk === "destructive"
    || descriptor.risk === "state_change"
    || descriptor.confirmation === "always"
    || (descriptor.confirmation === "dynamic" && adapterRequiresConfirmation);

  return {
    allowed: true,
    requiresConfirmation: adapterRequiresConfirmation || metadataRequiresConfirmation,
    requiresEvidence: descriptor.requiresEvidence,
    reason: metadataRequiresConfirmation
      ? `${descriptor.id} changes important state and requires approval.`
      : `${descriptor.id} is permitted by its registered capability policy.`,
  };
}

export function applyCapabilityPolicyToPreview(
  descriptor: EvCapabilityDescriptor,
  preview: EvToolPreview | null,
  decision: EvCapabilityPolicyDecision,
): EvToolPreview | null {
  if (!decision.allowed) {
    if (preview && !preview.ok) return preview;
    return {
      ok: false,
      error: { code: "UNSUPPORTED_OPERATION", message: decision.reason },
      recovery: "Retry after E.V can inspect the capability risk and target.",
    };
  }

  if (preview?.ok) {
    return {
      ...preview,
      requiresConfirmation: preview.requiresConfirmation || decision.requiresConfirmation,
    };
  }

  if (!decision.requiresConfirmation) return null;
  return {
    ok: true,
    requiresConfirmation: true,
    prompt: `Approve E.V capability: ${descriptor.declaration.description}`,
    intent: descriptor.id,
    skill: skillForDomain(descriptor.domain),
    mode: modeForRisk(descriptor.risk),
  };
}

function skillForDomain(domain: EvCapabilityDescriptor["domain"]): VoiceSkill {
  if (domain === "notes" || domain === "workspace") return "notes_skill";
  if (domain === "terminal") return "terminal_skill";
  if (domain === "research" || domain === "memory" || domain === "notion" || domain === "system") return "system_skill";
  return "conversation_skill";
}

function modeForRisk(risk: EvCapabilityDescriptor["risk"]): VoiceMode {
  return risk === "read_only" ? "question" : "command";
}
