export * from "./conversationProtocol";
export * from "./liveReliabilityProtocol";
export * from "./liveVoiceProtocol";
export * from "./liveTranslationProtocol";

export interface EvProtocolDescriptor {
  id: string;
  version: number;
  purpose: string;
  boundary: string;
}

// The authoritative static protocol inventory. It describes user-visible
// behavior and boundaries only; implementation details and credentials stay out.
export const EV_PROTOCOL_CATALOG: readonly EvProtocolDescriptor[] = Object.freeze([
  {
    id: "ev.live-voice",
    version: 1,
    purpose: "Duplex Gemini Live voice conversation with audio input, transcription, and spoken output.",
    boundary: "It grants no workspace, network, or write access by itself.",
  },
  {
    id: "ev.live-reliability",
    version: 1,
    purpose: "Reconnect, bounded audio buffering, session resumption, and silent-turn recovery.",
    boundary: "It recovers transport only and never fabricates a missing result.",
  },
  {
    id: "ev.narrative-conversation",
    version: 1,
    purpose: "Natural, concise Burmese and English conversation delivery.",
    boundary: "Narrative style never overrides evidence, permissions, or tool results.",
  },
  {
    id: "ev.live-translate",
    version: 1,
    purpose: "Explicit, isolated live audio translation when the user starts translation mode.",
    boundary: "Translation mode does not run E.V tools or ordinary agent actions.",
  },
]);
