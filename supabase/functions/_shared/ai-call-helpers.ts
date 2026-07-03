// ═══ Shared AI Call Helpers (extracted from orchestrator) ═══
// Direct API call wrappers for Gemini, Anthropic, and OpenAI-compatible endpoints.

import { GEMINI_NATIVE_PREFIX, ANTHROPIC_ENDPOINT } from "./api-endpoints.ts";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

export async function callGeminiDirect(
  apiKey: string, prompt: string, temperature: number, maxTokens: number,
  signal?: AbortSignal, model: string = DEFAULT_GEMINI_MODEL,
): Promise<string> {
  const url = `${GEMINI_NATIVE_PREFIX}${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
    signal,
  });
  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Gemini API error (${response.status}): ${errText}`) as any;
    err.status = response.status;
    throw err;
  }
  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated";
}

export async function callAnthropicDirect(
  apiKey: string, systemPrompt: string, userPrompt: string, temperature: number, maxTokens: number,
  signal?: AbortSignal, model: string = "claude-sonnet-4-20250514",
): Promise<string> {
  const response = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal,
  });
  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Anthropic API error (${response.status}): ${errText}`) as any;
    err.status = response.status;
    throw err;
  }
  const data = await response.json();
  return data?.content?.[0]?.text || "No response generated";
}

export async function callOpenAIDirect(
  apiKey: string, endpoint: string, systemPrompt: string, userPrompt: string,
  temperature: number, maxTokens: number,
  signal?: AbortSignal, model: string = "gpt-4o",
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  };
  if (endpoint.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "https://zoecrypto.lovable.app";
    headers["X-Title"] = "BeeBot Orchestrator";
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
    signal,
  });
  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`OpenAI-compat API error (${response.status}): ${errText}`) as any;
    err.status = response.status;
    throw err;
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "No response generated";
}
