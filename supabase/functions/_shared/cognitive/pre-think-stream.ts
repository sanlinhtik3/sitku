// ═══ Pre-Think Streamer ═══
// Streams a short, transparent reasoning preface BEFORE the Brain executes.
// Emits Anthropic-compatible `thinking_block` SSE events (start → delta* → stop)
// so the existing frontend ExtendedThinkingPanel renders it for ALL providers
// (Gemini, Claude, GPT) — not just Anthropic-native paths.
//
// Cheap (~150–300ms p50, ≤120 tokens) via gemini-2.5-flash-lite. Fire-and-forget;
// never blocks the main Brain call. Failures are silent.

const PRETHINK_MODEL = "google/gemini-2.5-flash-lite";

export interface PreThinkOptions {
  userMessage: string;
  agentName?: string;
  isMyanmar: boolean;
  abortSignal?: AbortSignal;
  blockIndex?: number; // index in the thinking_blocks array, default 0
}

export type EmitEvent = (json: Record<string, unknown>) => void;

/**
 * Streams a pre-execution reasoning monologue. Resolves when fully streamed
 * (or aborted/failed). Caller should NOT await unless they want sequential
 * execution — typically race with the Brain call.
 */
export async function streamPreThink(
  emit: EmitEvent,
  opts: PreThinkOptions
): Promise<void> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return;

  const idx = opts.blockIndex ?? 0;
  const t0 = Date.now();

  // Emit start envelope immediately so UI shows the panel before any delta.
  emit({ type: "thinking_block", phase: "start", index: idx, step: 0 });

  const sysPrompt = opts.isMyanmar
    ? `မင်းက ${opts.agentName || "BeeBot"} ရဲ့ inner monologue ဖြစ်တယ်။ User ရဲ့ မေးခွန်းကို ဘယ်လို ချဉ်းကပ်မလဲ ၂-၃ ကြောင်း Burmese နဲ့ ရိုးရှင်းစွာ စဉ်းစားပြ။

CRITICAL:
- "ငါ" သို့မဟုတ် "ကျွန်တော်" ဆိုပြီး စတင်
- Tool တွေ၊ ရှာဖွေနည်းတွေ၊ အဖြေ ဖွဲ့စည်းပုံကို ထည့်တွက်
- "ပထမ... ဒုတိယ... " ဆိုပြီး တိတိကျကျ ပြောပြ
- ၁၀၀ စကားလုံး မပိုစေနဲ့
- Final answer မရေးနဲ့ — စဉ်းစားနေတဲ့ thought process ပဲ`
    : `You are the inner monologue of ${opts.agentName || "BeeBot"}. Think aloud about how to approach the user's question in 2-3 short sentences.

CRITICAL:
- Start with "I" (e.g. "I'll start by...")
- Mention tools, search strategy, response structure
- Use "First... then... finally..." pacing
- Stay under 100 words
- Do NOT write the final answer — only the reasoning before it`;

  let acc = "";
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: PRETHINK_MODEL,
        stream: true,
        temperature: 0.4,
        max_tokens: 180,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: `User asked:\n${opts.userMessage.slice(0, 800)}\n\nThink out loud (do not answer):` },
        ],
      }),
      signal: opts.abortSignal,
    });

    if (!resp.ok || !resp.body) {
      emit({ type: "thinking_block", phase: "stop", index: idx, chars: 0 });
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") { reader.cancel().catch(() => {}); break; }
        try {
          const parsed = JSON.parse(json);
          const delta = parsed?.choices?.[0]?.delta?.content as string | undefined;
          if (delta) {
            acc += delta;
            emit({ type: "thinking_block", phase: "delta", index: idx, text: delta });
          }
        } catch { /* partial frame, wait */ }
      }
    }
  } catch (e) {
    if ((e as any)?.name !== "AbortError") {
      console.warn("[PreThink] error:", (e as Error).message);
    }
  } finally {
    emit({ type: "thinking_block", phase: "stop", index: idx, chars: acc.length });
    console.log(`[PreThink] streamed ${acc.length} chars in ${Date.now() - t0}ms`);
  }
}
