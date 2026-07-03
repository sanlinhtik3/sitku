// ═══ MEMORY CURATOR HELPERS ═══
// Quality gatekeeper for user_memories. Used by memory-curator and memory-curator-backfill.
// Pipeline: triviality filter → normalize → semantic dedupe → LLM scoring

const GARBAGE_PREFIXES = [
  'memory_preference_',
  'memory_context_',
  'memory_fact_',
  'user_preference_',
  'user_fact_',
  'context_',
  'preference_',
];

const TRANSIENT_KEYWORDS = [
  'ယနေ့', 'မနက်ဖြန်', 'မနေ့က', 'အခု', 'ခဏ',
  'today', 'tomorrow', 'yesterday', 'just now', 'right now',
];

const TRANSIENT_KEY_PATTERNS = [
  /^(coffee|food|lunch|dinner|breakfast)_(expense|cost|price)$/i,
  /^task$/i,
  /^current_(activity|task|status)$/i,
  /^temp_/i,
  /_today$/i,
  /^last_(viewed|opened|clicked)/i,
];

const IDENTITY_KEYS = [
  'name', 'preferred_name', 'nickname',
  'occupation', 'role', 'job', 'profession',
  'birthday', 'dob', 'date_of_birth',
  'location', 'city', 'country',
  'language', 'pronouns',
  'company', 'team',
];

export interface CandidateMemory {
  category: string;
  content: string;
  source_session_id?: string | null;
  embedding?: number[] | null;
  scope?: 'personal' | 'telegram_group';
  scope_key?: string | null;
  source_platform?: string | null;
  source_actor?: string | null;
}

export interface CuratorResult {
  decision: 'insert' | 'merge' | 'reject' | 'update';
  reason: string;
  curator_score?: number;
  normalized_key?: string;
  normalized_content?: string;
  suggested_pin?: boolean;
  matched_memory_id?: string;
}

// ─── Step 1: Triviality filter (no LLM) ───
export function isTrivial(candidate: CandidateMemory): { trivial: boolean; reason?: string } {
  const c = (candidate.content || '').trim();
  if (c.length < 10) return { trivial: true, reason: 'too_short' };
  if (/^[\d\s.,$-]+$/.test(c)) return { trivial: true, reason: 'numeric_only' };
  if (/^https?:\/\/\S+$/i.test(c)) return { trivial: true, reason: 'url_only' };

  // Check transient keywords
  const lower = c.toLowerCase();
  for (const kw of TRANSIENT_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      return { trivial: true, reason: `transient_keyword:${kw}` };
    }
  }

  // Parse key from "key: value" format
  const keyMatch = c.match(/^([a-z_][a-z0-9_]*)\s*:/i);
  if (keyMatch) {
    const key = keyMatch[1].toLowerCase();
    for (const pattern of TRANSIENT_KEY_PATTERNS) {
      if (pattern.test(key)) {
        return { trivial: true, reason: `transient_key:${key}` };
      }
    }
  }

  return { trivial: false };
}

// ─── Step 2: Normalize ───
export function normalize(candidate: CandidateMemory): { key: string; content: string } {
  let content = (candidate.content || '').trim();

  // Strip garbage prefixes from "key: value" patterns
  const kvMatch = content.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.+)$/i);
  let key = '';
  let value = content;
  if (kvMatch) {
    key = kvMatch[1].toLowerCase();
    value = kvMatch[2].trim();
    for (const prefix of GARBAGE_PREFIXES) {
      if (key.startsWith(prefix)) {
        key = key.slice(prefix.length);
        break;
      }
    }
    // Reformat to clean human sentence
    const human = key.replace(/_/g, ' ');
    content = `${human.charAt(0).toUpperCase() + human.slice(1)}: ${value}`;
  } else {
    // No key:value format — derive key from first 3 words for dedupe
    key = value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .split(/\s+/)
      .slice(0, 3)
      .join('_')
      .slice(0, 60);
  }

  return { key, content };
}

// ─── Step 3: Semantic dedupe ───
function cosineSim(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

export interface DedupeMatch {
  memory_id: string;
  similarity: number;
  category: string;
  content: string;
  normalized_key: string | null;
  confidence: number;
}

export async function findSemanticMatch(
  supabase: any,
  userId: string,
  candidate: CandidateMemory,
  normalizedKey: string,
): Promise<DedupeMatch | null> {
  const scope = candidate.scope || 'personal';
  const scopeKey = candidate.scope_key || null;

  // Fast path: exact normalized_key match
  if (normalizedKey) {
    let exactQuery = supabase
      .from('user_memories')
      .select('id, category, content, normalized_key, confidence')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('normalized_key', normalizedKey)
      .eq('scope', scope)
      .limit(1)
    if (scopeKey) exactQuery = exactQuery.eq('scope_key', scopeKey);
    else exactQuery = exactQuery.is('scope_key', null);

    const { data: keyMatch } = await exactQuery.maybeSingle();
    if (keyMatch) {
      return {
        memory_id: keyMatch.id,
        similarity: 1.0,
        category: keyMatch.category,
        content: keyMatch.content,
        normalized_key: keyMatch.normalized_key,
        confidence: keyMatch.confidence,
      };
    }
  }

  // Vector path (only if embedding provided)
  if (!candidate.embedding) return null;

  let candidatesQuery = supabase
    .from('user_memories')
    .select('id, category, content, normalized_key, confidence, embedding')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('category', candidate.category)
    .eq('scope', scope)
    .not('embedding', 'is', null)
    .limit(50);
  if (scopeKey) candidatesQuery = candidatesQuery.eq('scope_key', scopeKey);
  else candidatesQuery = candidatesQuery.is('scope_key', null);

  const { data: candidates } = await candidatesQuery;

  if (!candidates?.length) return null;

  let best: DedupeMatch | null = null;
  for (const m of candidates) {
    let emb = m.embedding;
    if (typeof emb === 'string') {
      try { emb = JSON.parse(emb); } catch { continue; }
    }
    const sim = cosineSim(candidate.embedding, emb);
    if (sim > (best?.similarity || 0.74)) {
      best = {
        memory_id: m.id,
        similarity: sim,
        category: m.category,
        content: m.content,
        normalized_key: m.normalized_key,
        confidence: m.confidence,
      };
    }
  }
  return best;
}

// ─── Step 4: LLM scoring ───
export async function scoreCandidate(
  candidate: CandidateMemory,
  apiKey: string,
): Promise<{ confidence: number; suggested_pin: boolean; reason: string }> {
  // Heuristic auto-pin for identity keys (no LLM call needed)
  const lowerContent = candidate.content.toLowerCase();
  const isIdentity = IDENTITY_KEYS.some((k) =>
    lowerContent.includes(k.replace(/_/g, ' ')) || lowerContent.startsWith(k + ':')
  );

  if (!apiKey) {
    return {
      confidence: isIdentity ? 0.85 : 0.6,
      suggested_pin: isIdentity,
      reason: isIdentity ? 'identity_heuristic' : 'no_llm_default',
    };
  }

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content:
              'You are a memory quality judge. Rate if a candidate memory is worth keeping for an AI personal assistant. Score 0.30 (trivial), 0.70 (useful), 0.95 (identity-defining). Pin only identity-lasting facts (name, job, birthday, location, core preferences).',
          },
          {
            role: 'user',
            content: `Category: ${candidate.category}\nContent: "${candidate.content}"\n\nReturn JSON only.`,
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'score_memory',
              description: 'Rate the memory candidate',
              parameters: {
                type: 'object',
                properties: {
                  worth_keeping: { type: 'boolean' },
                  confidence: { type: 'number', minimum: 0.3, maximum: 0.95 },
                  suggested_pin: { type: 'boolean' },
                  reason: { type: 'string', maxLength: 80 },
                },
                required: ['worth_keeping', 'confidence', 'suggested_pin', 'reason'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'score_memory' } },
      }),
    });

    if (!resp.ok) throw new Error(`LLM error ${resp.status}`);
    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error('no tool call');
    const parsed = JSON.parse(args);
    if (!parsed.worth_keeping) {
      return { confidence: 0.2, suggested_pin: false, reason: parsed.reason || 'not_worth' };
    }
    return {
      confidence: Math.max(0.3, Math.min(0.95, parsed.confidence || 0.6)),
      suggested_pin: !!parsed.suggested_pin,
      reason: parsed.reason || 'llm_scored',
    };
  } catch (e) {
    console.warn('[Curator] LLM scoring failed, using heuristic:', e);
    return {
      confidence: isIdentity ? 0.85 : 0.6,
      suggested_pin: isIdentity,
      reason: 'llm_failed_heuristic',
    };
  }
}

// ─── Embedding helper ───
export async function embedText(text: string, apiKey: string): Promise<number[] | null> {
  if (!apiKey || !text) return null;
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          taskType: 'RETRIEVAL_DOCUMENT',
        }),
      },
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.embedding?.values || null;
  } catch {
    return null;
  }
}

// ─── Full curate pipeline ───
export async function curateCandidate(
  supabase: any,
  userId: string,
  candidate: CandidateMemory,
  apiKey: string,
): Promise<CuratorResult> {
  // 1. Triviality filter
  const triv = isTrivial(candidate);
  if (triv.trivial) {
    return {
      decision: 'reject',
      reason: triv.reason || 'trivial',
    };
  }

  // 2. Normalize
  const { key: normalizedKey, content: normalizedContent } = normalize(candidate);
  candidate.content = normalizedContent;

  // 3. Embed if not provided (needed for semantic dedupe)
  if (!candidate.embedding && apiKey) {
    candidate.embedding = await embedText(normalizedContent, apiKey);
  }

  // 4. Semantic dedupe
  const match = await findSemanticMatch(supabase, userId, candidate, normalizedKey);

  if (match) {
    if (match.similarity >= 0.88) {
      // Merge: bump confidence, prefer newer wording
      const newConf = Math.min(0.95, match.confidence + 0.05);
      await supabase
        .from('user_memories')
        .update({
          content: normalizedContent,
          confidence: newConf,
          curator_score: newConf,
          curator_reason: 'merged_duplicate',
          last_accessed: new Date().toISOString(),
          merged_from: [match.memory_id],
        })
        .eq('id', match.memory_id);
      return {
        decision: 'merge',
        reason: `merged_with_existing (sim=${match.similarity.toFixed(2)})`,
        curator_score: newConf,
        normalized_key: normalizedKey,
        normalized_content: normalizedContent,
        matched_memory_id: match.memory_id,
      };
    }
    if (match.similarity >= 0.75) {
      // Conflict: deactivate old, will insert new below
      await supabase
        .from('user_memories')
        .update({ is_active: false, curator_reason: 'superseded_by_newer' })
        .eq('id', match.memory_id);
      // fall through to insert
    }
  }

  // 5. LLM score
  const score = await scoreCandidate(candidate, apiKey);
  if (score.confidence < 0.4) {
    return {
      decision: 'reject',
      reason: `low_score: ${score.reason}`,
      curator_score: score.confidence,
    };
  }

  return {
    decision: 'insert',
    reason: score.reason,
    curator_score: score.confidence,
    normalized_key: normalizedKey,
    normalized_content: normalizedContent,
    suggested_pin: score.suggested_pin,
  };
}
