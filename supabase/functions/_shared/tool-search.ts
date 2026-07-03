// ═══════════════════════════════════════════════════════════════════════════
// Tool Search — Phase 3.1 of docs/AGENTIC_AUDIT.md
//
// Dynamic, intent-aware tool filtering. When the Anthropic SDK path is on
// (agentic_sdk_enabled = true), we ship only the top-N relevant tools per
// turn instead of all 2,000+ lines from tool-definitions.ts. Target token
// savings: ≥ 20 % per turn (DoD SDK-2).
//
// This complements the existing `tool-marshal.ts` (which filters by
// `primary_action` + `complexity`) by adding a keyword-relevance scorer.
// ═══════════════════════════════════════════════════════════════════════════

interface ToolDef {
  type?: string;
  function?: { name: string; description?: string; parameters?: any };
  name?: string;
  description?: string;
}

const ALWAYS_INCLUDE = new Set<string>([
  "think",                  // reasoning scratchpad — cheap, always useful
  "search_knowledge_base",  // RAG — almost always relevant
]);

const MAX_TOOLS_PER_TURN = 12;       // Empirical cap; protects token budget
const MAX_TOOLS_PER_TURN_DEEP = 18;  // Higher cap for deep/ultra-deep tier

/**
 * Rank tools by simple TF-IDF-ish relevance to the user query + observer hints.
 * No model call — pure string ops. Cheap (< 5 ms per turn).
 */
function scoreToolRelevance(tool: ToolDef, query: string, intent?: string): number {
  const name = (tool.function?.name ?? tool.name ?? "").toLowerCase();
  const desc = (tool.function?.description ?? tool.description ?? "").toLowerCase();
  const q = query.toLowerCase();

  let score = 0;

  // Intent match
  if (intent) {
    const intentLower = intent.toLowerCase();
    if (name.includes(intentLower) || desc.includes(intentLower)) score += 5;
  }

  // Direct name token in query
  for (const token of name.split("_")) {
    if (token.length >= 4 && q.includes(token)) score += 3;
  }

  // Description keyword overlap (cap at 2 hits to avoid description spamming)
  const qTokens = q.split(/\s+/).filter((t) => t.length >= 4);
  let descHits = 0;
  for (const t of qTokens) {
    if (desc.includes(t)) { score += 1; descHits++; if (descHits >= 2) break; }
  }

  return score;
}

export interface ToolSearchOpts {
  userQuery: string;
  observerIntent?: string;
  complexityTier?: string;
  enableDynamic: boolean;            // tied to agentic_sdk_enabled
}

/**
 * Filter a list of tools to the top-N most relevant for this turn.
 * When `enableDynamic` is false → returns the input untouched (legacy behavior).
 */
export function dynamicToolSearch(tools: ToolDef[], opts: ToolSearchOpts): ToolDef[] {
  if (!opts.enableDynamic) return tools;
  if (!tools || tools.length === 0) return tools;
  const cap = (opts.complexityTier === "deep" || opts.complexityTier === "ultra-deep")
    ? MAX_TOOLS_PER_TURN_DEEP
    : MAX_TOOLS_PER_TURN;
  if (tools.length <= cap) return tools;

  // Score every tool; preserve always-include set at the top.
  const scored = tools.map((t) => {
    const name = t.function?.name ?? t.name ?? "";
    const forceKeep = ALWAYS_INCLUDE.has(name);
    return {
      tool: t,
      score: forceKeep ? Number.POSITIVE_INFINITY : scoreToolRelevance(t, opts.userQuery, opts.observerIntent),
      name,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, cap).map((s) => s.tool);

  const droppedCount = tools.length - top.length;
  if (droppedCount > 0) {
    const droppedNames = scored.slice(cap, cap + 5).map((s) => s.name);
    console.log(`[tool-search] kept ${top.length}/${tools.length} tools (dropped ${droppedCount}, samples: ${droppedNames.join(", ")})`);
  }
  return top;
}

/** Helper that respects the user setting + complexity tier in one call. */
export function applyToolSearchIfEnabled(
  tools: ToolDef[],
  agentSettings: any,
  userQuery: string,
  observerIntent?: string,
  complexityTier?: string,
): ToolDef[] {
  return dynamicToolSearch(tools, {
    userQuery,
    observerIntent,
    complexityTier,
    // Reuse agentic_sdk_enabled as the on/off switch — dynamic search is
    // most valuable when paired with SDK path (where token savings matter).
    enableDynamic: Boolean(agentSettings?.agentic_sdk_enabled),
  });
}
