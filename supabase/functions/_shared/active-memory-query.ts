// ═══ INITIATIVE 2: Active Memory Query System ═══
// Pre-planning phase that actively searches memory before plan generation.
// Runs between Observer and Plan Generator for complexity >= moderate.

export interface MemoryQueryResult {
  has_answer: boolean;
  confidence: number;          // 0-1
  relevant_memories: string[]; // formatted memory snippets
  relevant_facts: string[];    // user facts matched
  suggested_strategy: 'respond_from_memory' | 'verify_with_tools' | 'full_research';
  query_time_ms: number;
}

// Keyword extraction for fact matching
function extractKeywords(message: string): string[] {
  // Remove common stop words and short particles
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'it', 'its', 'this', 'that',
    'and', 'or', 'but', 'not', 'no', 'so', 'if', 'then', 'than',
    'my', 'me', 'i', 'you', 'your', 'we', 'our', 'they', 'their',
    'what', 'how', 'when', 'where', 'who', 'which', 'why',
    // Burmese particles
    'ကို', 'က', 'မှာ', 'တွင်', 'နဲ့', 'နှင့်', 'သည်', 'ဖြစ်', 'ပါ',
  ]);

  // Split on whitespace and punctuation, filter meaningful terms
  const words = message
    .toLowerCase()
    .replace(/[^\w\s\u1000-\u109F]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  return [...new Set(words)].slice(0, 10);
}

// Calculate recency score (0-1) based on how recent the memory is
function recencyScore(dateStr: string | null): number {
  if (!dateStr) return 0;
  const ageMs = Date.now() - new Date(dateStr).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  // Exponential decay: 1.0 for today, 0.5 at 7 days, ~0.1 at 30 days
  return Math.max(0, Math.exp(-ageDays / 10));
}

/**
 * Actively queries the agent's memory systems to determine if prior knowledge
 * can answer the user's question without external tool calls.
 */
export async function queryActiveMemory(
  supabase: any,
  userId: string,
  message: string,
  embedding: number[] | null,
): Promise<MemoryQueryResult> {
  const t_start = Date.now();
  const keywords = extractKeywords(message);

  // Parallel memory search across 3 sources
  const [vectorResults, factResults, sessionResults] = await Promise.all([
    // 1. Vector search against chat_memory_embeddings (if embedding available)
    embedding
      ? supabase.rpc('match_chat_memories', {
          query_embedding: embedding,
          match_threshold: 0.75,
          match_count: 5,
          p_user_id: userId,
        }).then(({ data }: any) => data || []).catch(() => [])
      : Promise.resolve([]),

    // 2. Keyword search against user_memories (FIX: agent_user_facts is empty/dead — switched to live source)
    keywords.length > 0
      ? supabase
          .from('user_memories')
	          .select('content, category, updated_at:last_accessed, created_at')
	          .eq('user_id', userId)
	          .eq('is_active', true)
	          .eq('scope', 'personal')
	          .is('scope_key', null)
	          .order('priority', { ascending: false })
          .limit(40)
          .then(({ data }: any) => {
            if (!data) return [];
            return data
              .filter((mem: any) => {
                const combined = `${mem.category || ''} ${mem.content || ''}`.toLowerCase();
                return keywords.some(kw => combined.includes(kw));
              })
              .map((mem: any) => ({
                fact_key: mem.category || 'memory',
                fact_value: mem.content,
                updated_at: mem.updated_at || mem.created_at,
              }));
          })
          .catch(() => [])
      : Promise.resolve([]),

    // 3. Recent session summaries (semantic match via keywords)
    supabase
      .from('agent_chat_sessions')
      .select('context_summary, updated_at')
      .eq('user_id', userId)
      .not('context_summary', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(5)
      .then(({ data }: any) => {
        if (!data) return [];
        // Filter sessions that mention relevant keywords
        return data.filter((s: any) => {
          if (!s.context_summary) return false;
          const summary = s.context_summary.toLowerCase();
          return keywords.some(kw => summary.includes(kw));
        });
      })
      .catch(() => []),
  ]);

  // Format memory snippets
  const relevant_memories: string[] = [];
  const relevant_facts: string[] = [];

  // Process vector results
  for (const mem of vectorResults.slice(0, 3)) {
    const content = mem.content || mem.summary || '';
    if (content.length > 10) {
      relevant_memories.push(content.slice(0, 300));
    }
  }

  // Process fact results
  for (const fact of factResults.slice(0, 5)) {
    relevant_facts.push(`${fact.fact_key}: ${fact.fact_value}`);
  }

  // Process session summaries
  for (const session of sessionResults.slice(0, 2)) {
    if (session.context_summary) {
      relevant_memories.push(`[Previous session] ${session.context_summary.slice(0, 200)}`);
    }
  }

  // Calculate confidence score
  // Weighted: vector similarity (0.6) + fact matches (0.2) + recency (0.2)
  let vectorScore = 0;
  if (vectorResults.length > 0) {
    // Average similarity of top results
    const similarities = vectorResults.map((r: any) => r.similarity || 0);
    vectorScore = similarities.reduce((a: number, b: number) => a + b, 0) / similarities.length;
  }

  const factScore = Math.min(1.0, factResults.length / 3); // 3+ facts = max

  let recencyMax = 0;
  for (const mem of vectorResults) {
    const score = recencyScore(mem.created_at);
    if (score > recencyMax) recencyMax = score;
  }
  for (const fact of factResults) {
    const score = recencyScore(fact.updated_at);
    if (score > recencyMax) recencyMax = score;
  }

  const confidence = (vectorScore * 0.6) + (factScore * 0.2) + (recencyMax * 0.2);

  // Determine strategy
  let suggested_strategy: MemoryQueryResult['suggested_strategy'];
  if (confidence > 0.85 && (relevant_memories.length > 0 || relevant_facts.length >= 2)) {
    suggested_strategy = 'respond_from_memory';
  } else if (confidence > 0.5 && (relevant_memories.length > 0 || relevant_facts.length > 0)) {
    suggested_strategy = 'verify_with_tools';
  } else {
    suggested_strategy = 'full_research';
  }

  const has_answer = suggested_strategy === 'respond_from_memory';
  const query_time_ms = Date.now() - t_start;

  console.log(`[ActiveMemory] Query complete in ${query_time_ms}ms: confidence=${confidence.toFixed(2)}, strategy=${suggested_strategy}, vectors=${vectorResults.length}, facts=${factResults.length}, sessions=${sessionResults.length}`);

  return {
    has_answer,
    confidence,
    relevant_memories,
    relevant_facts,
    suggested_strategy,
    query_time_ms,
  };
}
