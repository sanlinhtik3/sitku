// ═══ Legacy Proxy - All logic moved to src/hooks/agent-chat/ ═══
// This file preserves backward compatibility for all consumer imports.

export { useAgentChat } from './agent-chat';
export type {
  MessageAttachment,
  ThinkingStep,
  AgentChatMessage,
  AgentChatSession,
  CreditsExhaustedError,
  CompletedToolStep,
  Artifact,
  TelemetryData,
} from './agent-chat/types';
