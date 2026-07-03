// Cognitive Architecture v2 — Phase B
// User Context State synthesizer: distills episodic + semantic memory
// into a compact "who is this user right now" block for prompt injection.

const SYNTH_MODEL = "google/gemini-3.5-flash";
const TTL_MIN_DEFAULT = 60;

export interface UserContextState {
  preference_summary: string | null;
  emotional_baseline: string | null;
  writing_style: string | null;
  topic_clusters: any[];
  recent_themes: string[];
  synthesized_at: string;
  source_episodic_count: number;
  source_semantic_count: number;
}

/** Cheap freshness check + serve-stale-while-revalidate. */
export async function getOrSynthesizeUserContextState(
  supabase: any,
  userId: string,
  opts?: { forceRefresh?: boolean; backgroundRefresh?: boolean }
): Promise<UserContextState | null> {
  try {
    const { data: cached } = await supabase
      .from("user_context_state")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const ttlMin = cached?.ttl_minutes ?? TTL_MIN_DEFAULT;
    const ageMin = cached?.synthesized_at
      ? (Date.now() - new Date(cached.synthesized_at).getTime()) / 60000
      : Infinity;
    const stale = ageMin > ttlMin;

    if (cached && !stale && !opts?.forceRefresh) return cached as UserContextState;

    if (cached && stale && opts?.backgroundRefresh) {
      // fire-and-forget refresh, serve cached now
      synthesizeAndUpsert(supabase, userId).catch((e) =>
        console.warn("[ContextSynth] background refresh failed:", e)
      );
      return cached as UserContextState;
    }

    return await synthesizeAndUpsert(supabase, userId);
  } catch (e) {
    console.warn("[ContextSynth] getOrSynthesize error:", e);
    return null;
  }
}

async function synthesizeAndUpsert(
  supabase: any,
  userId: string
): Promise<UserContextState | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;

  // 1) Pull episodic + semantic memory
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const [episodicRes, semanticRes] = await Promise.all([
    supabase
      .from("chat_memory_embeddings")
      .select("content_summary, importance_score, topic_tags, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("importance_score", { ascending: false })
      .limit(50),
    supabase
      .from("user_memories")
      .select("content, category, priority, confidence, tags, pinned")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .limit(30),
  ]);

  const episodic = episodicRes.data ?? [];
  const semantic = semanticRes.data ?? [];

  if (episodic.length === 0 && semantic.length === 0) {
    return null;
  }

  // 2) Build a compact synthesis prompt
  const epLines = episodic
    .slice(0, 50)
    .map((e: any) => `- [${(e.topic_tags ?? []).join(",")}] ${e.content_summary}`)
    .join("\n");
  const semLines = semantic
    .slice(0, 30)
    .map((s: any) => `- (${s.category}, p${s.priority}) ${s.content}`)
    .join("\n");

  const userPrompt = `Given this user's recent conversational memory and stored facts, synthesize a tight, accurate "User Context State" for prompt injection. Output JSON only via the tool call.

EPISODIC (last 14 days, importance-ranked):
${epLines || "(none)"}

SEMANTIC (priority-ranked facts/preferences):
${semLines || "(none)"}

Rules:
- preference_summary: one sentence, concrete (language, tone, format, do's & don'ts).
- emotional_baseline: one short phrase (e.g. "neutral-positive, frustrated by repetition").
- writing_style: one sentence, observable patterns (length, particles, code-switching).
- topic_clusters: up to 6 items with {label, weight 0-1}.
- recent_themes: 3-7 short tags.
- Be specific. No generic platitudes. If unknown, use null.`;

  let synth: any = null;
  const t0 = Date.now();
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: SYNTH_MODEL,
        messages: [
          { role: "system", content: "You synthesize personal context. Output via tool only." },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_user_context_state",
            description: "Emit synthesized user context state",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                preference_summary: { type: ["string", "null"] },
                emotional_baseline: { type: ["string", "null"] },
                writing_style: { type: ["string", "null"] },
                topic_clusters: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      label: { type: "string" },
                      weight: { type: "number" },
                    },
                    required: ["label", "weight"],
                  },
                },
                recent_themes: { type: "array", items: { type: "string" } },
              },
              required: ["preference_summary", "emotional_baseline", "writing_style", "topic_clusters", "recent_themes"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_user_context_state" } },
        temperature: 0.2,
      }),
    });
    if (!resp.ok) {
      console.warn("[ContextSynth] gateway", resp.status);
      return null;
    }
    const json = await resp.json();
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    synth = args ? JSON.parse(args) : null;
  } catch (e) {
    console.warn("[ContextSynth] LLM error:", e);
    return null;
  }
  if (!synth) return null;

  console.log(`[ContextSynth] synthesized in ${Date.now() - t0}ms ep=${episodic.length} sem=${semantic.length}`);

  const row = {
    user_id: userId,
    preference_summary: synth.preference_summary ?? null,
    emotional_baseline: synth.emotional_baseline ?? null,
    writing_style: synth.writing_style ?? null,
    topic_clusters: synth.topic_clusters ?? [],
    recent_themes: synth.recent_themes ?? [],
    synthesized_at: new Date().toISOString(),
    synthesis_model: SYNTH_MODEL,
    source_episodic_count: episodic.length,
    source_semantic_count: semantic.length,
    ttl_minutes: TTL_MIN_DEFAULT,
  };

  await supabase.from("user_context_state").upsert(row, { onConflict: "user_id" });
  return row as any;
}

/** Format for prompt injection. Tier-aware. */
export function formatUserContextStateBlock(
  state: UserContextState | null,
  tier: string
): string {
  if (!state) return "";
  const t = (tier || "moderate").toLowerCase();
  const lite = t === "turbo" || t === "greeting" || t === "simple";

  if (lite) {
    if (!state.preference_summary) return "";
    return `\n[USER CONTEXT] ${state.preference_summary}\n`;
  }

  const parts: string[] = ["[USER CONTEXT STATE — synthesized from long-term memory]"];
  if (state.preference_summary) parts.push(`Preferences: ${state.preference_summary}`);
  if (state.emotional_baseline) parts.push(`Emotional baseline: ${state.emotional_baseline}`);
  if (state.writing_style) parts.push(`Writing style: ${state.writing_style}`);
  if (state.recent_themes?.length) parts.push(`Recent themes: ${state.recent_themes.slice(0, 7).join(", ")}`);
  if (state.topic_clusters?.length) {
    const top = state.topic_clusters
      .slice()
      .sort((a: any, b: any) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, 4)
      .map((c: any) => `${c.label}(${(c.weight ?? 0).toFixed(2)})`)
      .join(", ");
    parts.push(`Top clusters: ${top}`);
  }
  return "\n" + parts.join("\n") + "\n";
}
