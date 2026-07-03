// ═══ SSE event runtime validation ═══
// Lightweight zod envelope: ensures every parsed SSE frame is at least an
// object with a known-shape `type` discriminator before downstream code
// reads `.message`, `.subtask.id`, etc. Prevents `.split is not a function`
// crashes when the backend sends an unexpected payload shape.
import { z } from "zod";

export const SSEEnvelopeSchema = z
  .object({
    type: z.string().optional(),
  })
  .passthrough();

export type SSEEnvelope = z.infer<typeof SSEEnvelopeSchema>;

export function safeParseSSEEvent(raw: unknown): SSEEnvelope | null {
  if (!raw || typeof raw !== "object") return null;
  const result = SSEEnvelopeSchema.safeParse(raw);
  return result.success ? result.data : null;
}

// Strict schemas for the safety-critical events. Use these at the call-site
// when you need typed access to fields. For everything else, the parser's
// existing pattern of `parsed.foo as string | undefined` is acceptable.

export const ErrorEventSchema = z
  .object({
    type: z.literal("error"),
    message: z.string().optional(),
    cooldown_seconds: z.number().optional(),
    source: z.string().optional(),
    model: z.string().optional(),
  })
  .passthrough();

export const UsageEventSchema = z
  .object({
    type: z.literal("usage"),
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
  })
  .passthrough();

export const SubTaskEventSchema = z
  .object({
    type: z.literal("subtask"),
    subtask: z.object({
      id: z.string(),
    }).passthrough(),
  })
  .passthrough();
