import { supabase } from "@/integrations/supabase/client";
import type {
  AgentRuntimeRepository,
  AgentRuntimeStatus,
  AgentRuntimeStreamResponse,
  ContinueAgentStreamInput,
  StartAgentStreamInput,
} from "@/repositories/contracts/agentRuntime";

interface CachedSession {
  token: string;
  expires: number;
}

function wrapFetchResponse(response: Response): AgentRuntimeStreamResponse {
  return {
    ok: response.ok,
    status: response.status,
    json: <T = unknown>() => response.json().catch(() => ({})) as Promise<T>,
    async *readChunks() {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    },
  };
}

export class SupabaseAgentRuntimeRepository implements AgentRuntimeRepository {
  private cachedSession: CachedSession | null = null;

  async getStatus(): Promise<AgentRuntimeStatus> {
    return {
      adapter: "supabase",
      provider: "supabase-edge",
      label: "Supabase Edge",
      configured: true,
      model: null,
      baseUrl: import.meta.env.VITE_SUPABASE_URL || null,
    };
  }

  async warmup(): Promise<void> {
    await supabase.functions.invoke("agent-chat", { body: { action: "warmup" } });
  }

  async startStream(input: StartAgentStreamInput): Promise<AgentRuntimeStreamResponse> {
    return this.post({
      body: {
        sessionId: input.sessionId,
        userId: input.userId,
        session_kind: input.sessionKind,
        message: input.message,
        attachments: input.attachments,
        deviceContext: input.deviceContext,
        preferred_model: input.preferredModel,
        api_source_preference: input.apiSourcePreference,
        trace_id: input.traceId,
        client_request_id: input.clientRequestId,
      },
      signal: input.signal,
      preferredModel: input.preferredModel,
      resumeMissionId: input.resumeMissionId,
      resumeLastEventId: input.resumeLastEventId,
    });
  }

  async continueStream(input: ContinueAgentStreamInput): Promise<AgentRuntimeStreamResponse> {
    return this.post({
      body: {
        sessionId: input.sessionId,
        userId: input.userId,
        message: input.message,
        deviceContext: input.deviceContext,
        preferred_model: input.preferredModel,
        api_source_preference: input.apiSourcePreference,
        continuation: input.continuation,
      },
      signal: input.signal,
      preferredModel: input.preferredModel,
    });
  }

  async cancelStream(input: { sessionId: string }): Promise<void> {
    const token = await this.getAccessToken();
    await fetch(this.endpointUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "cancel_stream", session_id: input.sessionId }),
    });
  }

  private async post(input: {
    body: Record<string, unknown>;
    signal: AbortSignal;
    preferredModel?: string | null;
    resumeMissionId?: string | null;
    resumeLastEventId?: number;
  }): Promise<AgentRuntimeStreamResponse> {
    const run = async (token: string) => fetch(this.endpointUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(input.preferredModel ? { "x-apex-model": input.preferredModel } : {}),
        ...(input.resumeMissionId ? { "x-resume-mission-id": input.resumeMissionId } : {}),
        ...(input.resumeLastEventId && input.resumeLastEventId > 0
          ? { "x-resume-last-event-id": String(input.resumeLastEventId) }
          : {}),
      },
      body: JSON.stringify(input.body),
      signal: input.signal,
    });

    let token = await this.getAccessToken();
    let response = await run(token);
    if (response.status === 401) {
      token = await this.refreshAccessToken();
      response = await run(token);
    }

    return wrapFetchResponse(response);
  }

  private endpointUrl(): string {
    return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-chat`;
  }

  private async getAccessToken(): Promise<string> {
    const nowMs = Date.now();
    if (this.cachedSession && this.cachedSession.expires > nowMs + 60_000) {
      return this.cachedSession.token;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not authenticated");
    this.cachedSession = {
      token: session.access_token,
      expires: (session.expires_at || 0) * 1000,
    };
    return session.access_token;
  }

  private async refreshAccessToken(): Promise<string> {
    const { data: refreshed } = await supabase.auth.refreshSession();
    const token = refreshed?.session?.access_token;
    if (!token) throw new Error("Session expired. Please sign in again.");

    this.cachedSession = {
      token,
      expires: (refreshed.session?.expires_at || 0) * 1000,
    };
    return token;
  }
}
