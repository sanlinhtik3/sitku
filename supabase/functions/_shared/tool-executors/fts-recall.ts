// ═══════════════════════════════════════════════════════════════
// M3 — FTS + Session Digest Recall (Hermes-inspired)
// Postgres-native full-text search across the user's chat history,
// grouped per session, with on-demand 2-sentence digest generation.
// ═══════════════════════════════════════════════════════════════

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const DIGEST_MODEL = "google/gemini-3.5-flash";

// Convert free-form query into a tsquery-safe expression.
// Splits on whitespace, escapes single quotes, joins with " & ".
function toTsQuery(q: string): string {
  const tokens = (q || "")
    .replace(/[!&|():*'"]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  if (!tokens.length) return "";
  return tokens.map((t) => `${t}:*`).join(" & ");
}

interface SessionHit {
  session_id: string;
  session_title?: string | null;
  hit_count: number;
  first_match_at: string;
  last_match_at: string;
  excerpts: string[];
  digest?: string;
}

async function generateDigest(excerpts: string[], query: string): Promise<string> {
  if (!LOVABLE_API_KEY || !excerpts.length) {
    return excerpts[0]?.slice(0, 200) || "";
  }
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DIGEST_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You write 1-2 sentence factual digests of chat excerpts in the same language as the excerpts. No fluff, no preamble.",
          },
          {
            role: "user",
            content: `Query: ${query}\n\nExcerpts:\n${excerpts.slice(0, 6).map((e, i) => `${i + 1}. ${e}`).join("\n")}\n\nReturn only the digest.`,
          },
        ],
      }),
    });
    if (!r.ok) return excerpts[0]?.slice(0, 200) || "";
    const j = await r.json();
    return (j?.choices?.[0]?.message?.content || excerpts[0] || "").trim();
  } catch {
    return excerpts[0]?.slice(0, 200) || "";
  }
}

export interface RecallSessionHistoryArgs {
  query: string;
  days?: number;
  max_sessions?: number;
  with_digest?: boolean;
}

export async function executeRecallSessionHistory(
  supabase: any,
  userId: string,
  args: RecallSessionHistoryArgs,
  options?: any,
): Promise<any> {
  const query = String(args?.query || "").trim();
  if (!query) return { error: "query is required" };
  const days = Math.min(Math.max(Number(args?.days) || 90, 1), 365);
  const maxSessions = Math.min(Math.max(Number(args?.max_sessions) || 5, 1), 10);
  const withDigest = args?.with_digest !== false;

  const tsq = toTsQuery(query);
  if (!tsq) return { error: "query contained no searchable tokens" };

  const since = new Date(Date.now() - days * 86400_000).toISOString();

  // 1) Pull matching messages (limited & recent first). In Telegram groups,
  // never search the owner's private chat history; constrain to the group session.
  let messageQuery = supabase
    .from("agent_chat_messages")
    .select("session_id, role, content, created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .filter("content_tsv", "fts", tsq)
    .order("created_at", { ascending: false })
    .limit(120);
  if (options?.groupContext?.is_group && options?.sessionId) {
    messageQuery = messageQuery.eq("session_id", options.sessionId);
  }

  const { data: rows, error } = await messageQuery;

  if (error) {
    return { error: `FTS query failed: ${error.message}` };
  }
  if (!rows || rows.length === 0) {
    return {
      query,
      days,
      session_count: 0,
      sessions: [],
      message: "No matching past messages found in the selected window.",
    };
  }

  // 2) Group by session_id
  const bySession = new Map<string, SessionHit>();
  for (const r of rows) {
    const s = bySession.get(r.session_id) || {
      session_id: r.session_id,
      hit_count: 0,
      first_match_at: r.created_at,
      last_match_at: r.created_at,
      excerpts: [],
    };
    s.hit_count++;
    if (r.created_at < s.first_match_at) s.first_match_at = r.created_at;
    if (r.created_at > s.last_match_at) s.last_match_at = r.created_at;
    if (s.excerpts.length < 6) {
      const text = String(r.content || "").slice(0, 280);
      s.excerpts.push(`[${r.role}] ${text}`);
    }
    bySession.set(r.session_id, s);
  }

  // 3) Resolve session titles
  const sessionIds = [...bySession.keys()];
  const { data: sessions } = await supabase
    .from("agent_chat_sessions")
    .select("id, title")
    .in("id", sessionIds);
  const titleById = new Map<string, string | null>();
  (sessions || []).forEach((s: any) => titleById.set(s.id, s.title));
  for (const hit of bySession.values()) {
    hit.session_title = titleById.get(hit.session_id) ?? null;
  }

  // 4) Rank by hit_count desc, then most recent
  const ranked = [...bySession.values()]
    .sort((a, b) => (b.hit_count - a.hit_count) || (b.last_match_at.localeCompare(a.last_match_at)))
    .slice(0, maxSessions);

  // 5) Generate digests in parallel
  if (withDigest) {
    await Promise.all(
      ranked.map(async (hit) => {
        hit.digest = await generateDigest(hit.excerpts, query);
      }),
    );
  }

  return {
    query,
    days,
    session_count: ranked.length,
    sessions: ranked,
  };
}
