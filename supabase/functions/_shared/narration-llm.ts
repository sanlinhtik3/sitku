// ═══ Soul-Aware LLM Pipeline Narration — v2.0 (5-Phase + Language-Aware) ═══
// Generates personalized, context-aware narration using the agent's soul/personality.
// Fire-and-forget pattern: never blocks the main agentic loop.
// Uses resolveInternalLLM config (System Google Key or Personal Gemini Key only).

export interface NarrationContext {
  phase: "pre_tool" | "post_tool" | "swarm_progress" | "error_recovery" | "relay";
  userQuery: string;
  toolName?: string;
  toolResult?: string;
  isFail?: boolean;
  remainingTools?: number;
  currentStep?: number;
  maxSteps?: number;
  completedTools?: string;
  errorMessage?: string;
  retryCount?: number;
  swarmRole?: string;
  swarmProgress?: string;
  // Soul-aware fields
  botName: string;
  botEmoji: string;
  personalityMode: string;
  userName: string;
}

// ═══ SHARED IMPORTS (single source of truth) ═══
import { detectLanguage, getNarrationTone } from "./personality-config.ts";
import { GEMINI_OPENAI_ENDPOINT, OPENROUTER_HEADERS } from "./api-endpoints.ts";
import { tryLLMCall } from "./rpm-budget-guard.ts";


function buildNarrationPrompt(ctx: NarrationContext): string {
  const { phase, userQuery, toolName, toolResult, isFail, remainingTools, botName, botEmoji, personalityMode, userName, completedTools, currentStep, maxSteps, errorMessage, retryCount, swarmRole, swarmProgress } = ctx;

  const lang = detectLanguage(userQuery);
  const langInstruction = lang === "burmese" ? "Write in Burmese." 
    : lang === "mixed" ? "Write in Burmese with English technical terms."
    : "Write in English.";
  
  const tone = getNarrationTone(personalityMode);
  const userRef = userName ? `User: ${userName}.` : '';
  const resultPreview = toolResult ? toolResult.slice(0, 200) : '';

  const baseIdentity = `You are ${botName}${botEmoji}, personality: ${personalityMode} (${tone.style}). ${userRef}`;

  switch (phase) {
    case "pre_tool":
      return `${baseIdentity} Query: "${userQuery.slice(0, 100)}"
About to execute tool "${toolName || 'unknown'}". Step ${currentStep || 1}/${maxSteps || 3}.
Write ONE sentence about what you're about to do. ${langInstruction} ${tone.emojiDensity}. <25 words. Address user naturally.`;

    case "post_tool": {
      const status = isFail ? "FAILED" : "succeeded";
      const remaining = remainingTools && remainingTools > 0 ? `${remainingTools} more tool(s) left.` : 'All done for this step.';
      return `${baseIdentity} Query: "${userQuery.slice(0, 100)}"
Tool "${toolName || 'unknown'}" ${status}. Result: ${resultPreview}. ${remaining}
Write ONE sentence with ${tone.emojiDensity}. Be SPECIFIC about findings. ${langInstruction} <30 words. Address user naturally.`;
    }

    case "swarm_progress":
      return `${baseIdentity} Query: "${userQuery.slice(0, 100)}"
Swarm research in progress. Role "${swarmRole || 'Researcher'}" reporting. Progress: ${swarmProgress || 'analyzing'}.
Write ONE sentence about the parallel research status. ${langInstruction} ${tone.emojiDensity}. <25 words.`;

    case "error_recovery":
      return `${baseIdentity} Query: "${userQuery.slice(0, 100)}"
Tool "${toolName || 'unknown'}" failed: "${errorMessage || 'unknown error'}". Retry ${retryCount || 1}/3.
Write ONE reassuring sentence about recovering. ${langInstruction} ${tone.emojiDensity}. <25 words.`;

    case "relay":
      return `${baseIdentity} Query: "${userQuery.slice(0, 100)}"
Completed: ${completedTools || 'tools'}. Step ${currentStep || 1}/${maxSteps || 3}. Synthesizing results.
Write ONE sentence about what was found and what's next. ${langInstruction} ${tone.emojiDensity}. <30 words. Address user naturally.`;

    default:
      return `${baseIdentity} Write a brief status update. ${langInstruction} <20 words.`;
  }
}

export async function generateNarrationAsync(
  apiKey: string,
  context: NarrationContext,
  options?: { apiEndpoint?: string; provider?: string; resolvedConfig?: { endpoint: string; model: string; headers: Record<string, string> }; userId?: string },
): Promise<string | null> {
  if (!apiKey) return null;

  // Model Sovereignty: If caller provides resolvedConfig (from resolveInternalLLM), use it.
  // If provider is OpenRouter and no resolvedConfig, skip — don't use OpenRouter credits for narration.
  const isOpenRouter = options?.provider === 'openrouter' || (options?.apiEndpoint || '').includes('openrouter.ai');

  if (isOpenRouter && !options?.resolvedConfig) {
    console.log(`[NarrationLLM] Skipped — OpenRouter provider without Gemini config`);
    return null;
  }

  // ═══ RPM BUDGET GUARD: Narration is satellite priority — skip if RPM budget is tight ═══
  const narrationModel = options?.resolvedConfig?.model || "gemini-2.5-flash-lite";
  if (options?.userId && !tryLLMCall(options.userId, narrationModel, 'satellite')) {
    console.log(`[NarrationLLM] Skipped — RPM budget guard denied satellite call`);
    return null;
  }

  const prompt = buildNarrationPrompt(context);
  
  const endpoint = options?.resolvedConfig?.endpoint || options?.apiEndpoint || GEMINI_OPENAI_ENDPOINT;
  const model = options?.resolvedConfig?.model || "gemini-2.5-flash-lite";
  const headers: Record<string, string> = options?.resolvedConfig?.headers || {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  try {
    const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 60,
          temperature: 0.7,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(3_000),
      },
    );

    if (!res.ok) {
      console.warn(`[NarrationLLM] API returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text || text.length < 5) return null;

    // Safety: strip any tool-like or system-like content
    if (/tool_code|tool_name|function_call|<thinking>/i.test(text)) return null;

    return text;
  } catch (err: any) {
    console.warn(`[NarrationLLM] Failed: ${err.message}`);
    return null;
  }
}
