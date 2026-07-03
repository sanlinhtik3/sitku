export interface AgentRuntimeStreamResponse {
  ok: boolean;
  status: number;
  json<T = unknown>(): Promise<T>;
  readChunks(): AsyncIterable<Uint8Array>;
}

export interface AgentRuntimeBaseInput {
  sessionId: string;
  userId: string;
  message: string;
  deviceContext: Record<string, unknown>;
  preferredModel?: string | null;
  apiSourcePreference: string;
  signal: AbortSignal;
}

export interface StartAgentStreamInput extends AgentRuntimeBaseInput {
  sessionKind: string;
  attachments?: unknown[];
  traceId: string;
  clientRequestId: string;
  resumeMissionId?: string | null;
  resumeLastEventId?: number;
}

export interface ContinueAgentStreamInput extends AgentRuntimeBaseInput {
  continuation: {
    context_snapshot: string;
    relay_round: number;
  };
}

export interface CancelAgentStreamInput {
  sessionId: string;
}

export interface AgentRuntimeStatus {
  adapter: "supabase" | "electron-local";
  provider: "supabase-edge" | "openai-compatible" | "local-fallback";
  label: string;
  configured: boolean;
  model?: string | null;
  baseUrl?: string | null;
}

export interface AgentRuntimeRepository {
  warmup(): Promise<void>;
  startStream(input: StartAgentStreamInput): Promise<AgentRuntimeStreamResponse>;
  continueStream(input: ContinueAgentStreamInput): Promise<AgentRuntimeStreamResponse>;
  cancelStream(input: CancelAgentStreamInput): Promise<void>;
  getStatus(): Promise<AgentRuntimeStatus>;
}
