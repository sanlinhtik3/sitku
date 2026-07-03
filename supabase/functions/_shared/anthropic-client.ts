// ═══════════════════════════════════════════════════════════════════════════
// Anthropic Client — Phase 1.1 of docs/AGENTIC_AUDIT.md
//
// Goal: replace raw `fetch('https://api.anthropic.com/v1/messages')` with the
// official SDK on the Claude path ONLY. Gemini/OpenRouter paths are untouched.
//
// The wrapper returns a `Response`-shaped object so downstream code
// (`aiResponse.body!.getReader()` + parseSSEStream) needs ZERO changes.
//
// SDK value delivered here:
//   • Centralised auth + `anthropic-version` header
//   • Native parallel-tool-use handling
//   • Built-in retries (configurable below)
//   • Type-checked `Anthropic.MessageCreateParams`
//   • Single rollback point: flip `agentic_sdk_enabled` flag off
//
// Compatibility shim:
//   • For streaming → re-emits the SDK's RawMessageStreamEvent objects as
//     standard `event: <name>\n data: <json>\n\n` SSE frames so the existing
//     parseSSEStream consumes them unchanged.
//   • For non-streaming → wraps the parsed Message in a JSON Response.
// ═══════════════════════════════════════════════════════════════════════════

// Deno-on-Supabase: load SDK via esm.sh CDN, pinned version for reproducibility.
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.30.1?target=deno";

export interface AnthropicViaSDKOpts {
  apiKey: string;
  body: any;              // already-built Anthropic request body (model, messages, tools, etc.)
  signal?: AbortSignal;
  maxRetries?: number;
}

/**
 * Drop-in replacement for `fetch(ANTHROPIC_ENDPOINT, ...)` on the Claude path.
 * Returns a `Response` whose body matches the raw Anthropic API SSE format.
 */
export async function callAnthropicViaSDK(opts: AnthropicViaSDKOpts): Promise<Response> {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    maxRetries: opts.maxRetries ?? 2,
  });

  const isStream = !!opts.body?.stream;
  const startedAt = Date.now();

  // ─── Non-streaming path ──────────────────────────────────────────────────
  if (!isStream) {
    try {
      const message = await client.messages.create(opts.body, { signal: opts.signal });
      console.log(`[anthropic-client] messages.create non-stream ok (${Date.now() - startedAt}ms)`);
      return new Response(JSON.stringify(message), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (e: any) {
      return sdkErrorToResponse(e, "non-stream");
    }
  }

  // ─── Streaming path ──────────────────────────────────────────────────────
  let sdkStream: AsyncIterable<any>;
  try {
    sdkStream = await client.messages.create(
      { ...opts.body, stream: true },
      { signal: opts.signal },
    ) as unknown as AsyncIterable<any>;
    console.log(`[anthropic-client] messages.create stream opened (${Date.now() - startedAt}ms)`);
  } catch (e: any) {
    return sdkErrorToResponse(e, "stream-open");
  }

  const encoder = new TextEncoder();
  const sseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of sdkStream) {
          // event has shape { type: 'message_start' | 'content_block_delta' | ... , ...rest }
          const name = (event && typeof event === "object" && "type" in event) ? event.type : "message";
          const payload = JSON.stringify(event);
          controller.enqueue(encoder.encode(`event: ${name}\ndata: ${payload}\n\n`));
        }
        controller.close();
      } catch (err: any) {
        // Surface SDK runtime errors into the SSE channel so the existing
        // parser can register them — mirrors raw-fetch behavior on mid-stream errors.
        const errPayload = JSON.stringify({
          type: "error",
          error: { type: "sdk_error", message: String(err?.message ?? err) },
        });
        try {
          controller.enqueue(encoder.encode(`event: error\ndata: ${errPayload}\n\n`));
        } catch { /* controller already closed */ }
        controller.close();
      }
    },
  });

  return new Response(sseBody, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-anthropic-via-sdk": "1",
    },
  });
}

/** Convert SDK error → Response with matching status so upstream error logic works. */
function sdkErrorToResponse(e: any, label: string): Response {
  const status = typeof e?.status === "number" ? e.status : 500;
  const message = e?.message ?? `Anthropic SDK ${label} error`;
  const errBody = {
    error: {
      type: e?.error?.type ?? "sdk_error",
      message,
    },
  };
  console.warn(`[anthropic-client] ${label} error (status=${status}): ${message}`);
  return new Response(JSON.stringify(errBody), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Convenience guard for the agentic-loop branching point.
 * Returns true only when the provider is Anthropic AND the user has opted in.
 */
export function shouldUseAnthropicSDK(
  providerType: string | undefined | null,
  agentSettings: any,
): boolean {
  if (providerType !== "anthropic") return false;
  return Boolean(agentSettings?.agentic_sdk_enabled);
}
