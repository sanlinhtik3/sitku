// ═══ verify-api-key edge function ═══
// Server-side validation of provider API keys. Prevents the key ever
// reaching DevTools network/history/Referer/proxy logs.
//
// Request:  POST { provider, key, model? }
// Response: { ok: boolean, error?: string, errorType?: 'invalid_key' | 'quota' | 'rate_limit' | 'network' | 'unknown' }
//
// Never echoes the key back. Auth required (JWT). Per-user rate-limited.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import {
  GEMINI_NATIVE_PREFIX,
  ANTHROPIC_ENDPOINT,
  OPENROUTER_ENDPOINT,
  OPENROUTER_HEADERS,
  XAI_ENDPOINT,
} from "../_shared/api-endpoints.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Provider = "gemini" | "claude" | "openrouter" | "xai";

const VALID_PROVIDERS: Provider[] = ["gemini", "claude", "openrouter", "xai"];

const DEFAULT_MODELS: Record<Provider, string> = {
  gemini: "gemini-3.5-flash",
  claude: "claude-haiku-4-5-20251001",
  openrouter: "openai/gpt-4o-mini",
  xai: "grok-4-fast-reasoning",
};

const VERIFY_TIMEOUT_MS = 10_000;

const verifyRateMap = new Map<string, { count: number; resetTime: number }>();
const VERIFY_RATE_LIMIT = 10; // 10 verifications per user per minute
const VERIFY_RATE_WINDOW_MS = 60_000;

function checkVerifyRate(userId: string): boolean {
  const now = Date.now();
  const entry = verifyRateMap.get(userId);
  if (!entry || now > entry.resetTime) {
    verifyRateMap.set(userId, { count: 1, resetTime: now + VERIFY_RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= VERIFY_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function classifyError(status: number, message: string): {
  errorType: "invalid_key" | "quota" | "rate_limit" | "network" | "unknown";
  userMessage: string;
} {
  const lower = (message || "").toLowerCase();
  if (status === 401 || status === 403 || lower.includes("api key not valid") || lower.includes("invalid_api_key") || lower.includes("unauthorized")) {
    return { errorType: "invalid_key", userMessage: "Invalid API key" };
  }
  if (status === 429 || lower.includes("rate") || lower.includes("too many requests")) {
    return { errorType: "rate_limit", userMessage: "Rate limited by provider" };
  }
  if (lower.includes("quota") || lower.includes("exceeded") || lower.includes("billing")) {
    return { errorType: "quota", userMessage: "Quota exceeded — try a smaller model or check billing" };
  }
  if (status >= 500) {
    return { errorType: "network", userMessage: "Provider is having issues. Try again in a moment." };
  }
  return { errorType: "unknown", userMessage: message?.slice(0, 200) || "Unknown error" };
}

async function verifyGemini(key: string, model: string): Promise<Response> {
  const url = `${GEMINI_NATIVE_PREFIX}${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "ping" }] }],
      generationConfig: { maxOutputTokens: 1 },
    }),
    signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  });
}

async function verifyClaude(key: string, model: string): Promise<Response> {
  return fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
    signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  });
}

async function verifyOpenRouter(key: string, model: string): Promise<Response> {
  return fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...OPENROUTER_HEADERS,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
    signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  });
}

async function verifyXAI(key: string, model: string): Promise<Response> {
  return fetch(XAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
    signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  });
}

const VERIFIERS: Record<Provider, (key: string, model: string) => Promise<Response>> = {
  gemini: verifyGemini,
  claude: verifyClaude,
  openrouter: verifyOpenRouter,
  xai: verifyXAI,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        { ok: false, error: "Authentication required", errorType: "invalid_key" },
        { status: 401, headers: corsHeaders },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json(
        { ok: false, error: "Invalid session", errorType: "invalid_key" },
        { status: 401, headers: corsHeaders },
      );
    }

    if (!checkVerifyRate(user.id)) {
      return Response.json(
        { ok: false, error: "Too many verification attempts. Wait a minute.", errorType: "rate_limit" },
        { status: 429, headers: corsHeaders },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json(
        { ok: false, error: "Invalid request body" },
        { status: 400, headers: corsHeaders },
      );
    }

    const { provider, key, model } = body as { provider?: string; key?: string; model?: string };

    if (!provider || !VALID_PROVIDERS.includes(provider as Provider)) {
      return Response.json(
        { ok: false, error: `provider must be one of ${VALID_PROVIDERS.join(", ")}` },
        { status: 400, headers: corsHeaders },
      );
    }
    if (!key || typeof key !== "string" || key.length < 8 || key.length > 500) {
      return Response.json(
        { ok: false, error: "Invalid key format" },
        { status: 400, headers: corsHeaders },
      );
    }
    if (key.includes("•")) {
      return Response.json(
        { ok: false, error: "Cannot verify a masked key" },
        { status: 400, headers: corsHeaders },
      );
    }

    const provKey = provider as Provider;
    const useModel = (model && typeof model === "string" && model.length < 200)
      ? model
      : DEFAULT_MODELS[provKey];

    let response: Response;
    try {
      response = await VERIFIERS[provKey](key, useModel);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isTimeout = msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("aborted");
      return Response.json(
        {
          ok: false,
          error: isTimeout ? "Verification timed out" : "Network error reaching provider",
          errorType: "network" as const,
        },
        { status: 200, headers: corsHeaders },
      );
    }

    if (response.ok) {
      // Drain the body so we don't leak file handles
      try { await response.text(); } catch { /* noop */ }
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    const errBody = await response.json().catch(() => ({} as any));
    const providerMessage =
      errBody?.error?.message ||
      errBody?.error ||
      errBody?.message ||
      `HTTP ${response.status}`;
    const { errorType, userMessage } = classifyError(response.status, String(providerMessage));

    return Response.json(
      { ok: false, error: userMessage, errorType },
      { status: 200, headers: corsHeaders },
    );
  } catch (e) {
    console.error("verify-api-key unexpected error:", e);
    return Response.json(
      { ok: false, error: "Internal error", errorType: "unknown" },
      { status: 500, headers: corsHeaders },
    );
  }
});
