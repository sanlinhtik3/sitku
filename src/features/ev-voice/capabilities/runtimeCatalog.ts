import type { EvCapabilityDescriptor } from "./capabilityRegistry";
import { EV_PROTOCOL_CATALOG } from "@/features/ev-voice/protocols";

function capabilityLine(capability: EvCapabilityDescriptor): string {
  const confirmation = capability.confirmation === "never"
    ? "no confirmation"
    : `${capability.confirmation} confirmation`;
  return `- ${capability.id}: ${capability.declaration.description} [${capability.domain}; ${capability.risk}; ${confirmation}; evidence=${capability.requiresEvidence ? "required" : "optional"}]`;
}

/** Static runtime context. Session memory is intentionally not included: prior
 * conversations cannot change registered access, protocol boundaries, or policy. */
export function buildEvRuntimeCatalog(capabilities: readonly EvCapabilityDescriptor[]): string {
  const protocolLines = EV_PROTOCOL_CATALOG
    .map((protocol) => `- ${protocol.id} v${protocol.version}: ${protocol.purpose} Boundary: ${protocol.boundary}`)
    .join("\n");
  const capabilityLines = capabilities.length
    ? capabilities.map(capabilityLine).join("\n")
    : "- No runtime capability catalog is available. Do not claim a capability exists; use only declared tools.";

  return `\n\nAUTHORITATIVE E.V RUNTIME CATALOG:\nUse this current inventory when the user asks what E.V can do, which protocols exist, or which access is available. Do not invent capabilities outside this catalog or the declared tools. Capability policy and tool results are authoritative.\n\nProtocols:\n${protocolLines}\n\nCapabilities:\n${capabilityLines}`;
}

export function composeEvLiveSystemInstruction(
  baseInstruction: string,
  capabilities: readonly EvCapabilityDescriptor[] | undefined,
): string {
  return `${baseInstruction}${buildEvRuntimeCatalog(capabilities || [])}`;
}
