import type {
  WorkspaceActionPort,
  WorkspaceContextPort,
  WorkspaceNoteActionInput,
  WorkspaceNoteActionReceipt,
  WorkspaceTruthSnapshot,
} from "./contracts";

let activePort: WorkspaceContextPort | null = null;
let activeActionPort: WorkspaceActionPort | null = null;

export function registerWorkspaceContextPort(port: WorkspaceContextPort): () => void {
  activePort = port;
  return () => {
    if (activePort === port) activePort = null;
  };
}

export async function captureWorkspaceTruth(): Promise<WorkspaceTruthSnapshot | null> {
  return activePort ? activePort.capture() : null;
}

export function registerWorkspaceActionPort(port: WorkspaceActionPort): () => void {
  activeActionPort = port;
  return () => {
    if (activeActionPort === port) activeActionPort = null;
  };
}

export async function runWorkspaceNoteAction(
  action: keyof WorkspaceActionPort,
  input: WorkspaceNoteActionInput,
): Promise<WorkspaceNoteActionReceipt> {
  if (!activeActionPort) {
    throw new Error("NO_WORKSPACE_CONTEXT: Notes workspace action port is unavailable.");
  }
  return activeActionPort[action](input);
}

export function stableContentHash(content: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createSnapshotId(capturedAt: string, contentHash = "none"): string {
  return `ws-${stableContentHash(`${capturedAt}:${contentHash}`)}`;
}

export function workspaceEvidenceRequired(text: string): boolean {
  const normalized = text.toLowerCase();
  return /\b(workspace|vault)\b/i.test(normalized)
    || /\b(active|current|open(?:ed)?)\s+(file|note|tab)s?\b/i.test(normalized)
    || /\b(file|note)\s+(content|text|summary|summarize|read|fact.?check|related)\b/i.test(normalized)
    || /(လက်ရှိ|ဖွင့်ထားတဲ့?|အခုဖွင့်ထားတဲ့?).{0,24}(ဖိုင်|note|မှတ်စု)/i.test(normalized)
    || /(ဖိုင်|note|မှတ်စု).{0,24}(ဖတ်ပြ|ရေးထား|အကျဉ်းချုပ်|summary|စစ်ပေး|ဆက်စပ်)/i.test(normalized);
}

export function explicitWebRequested(text: string): boolean {
  return /(\bweb\b|\binternet\b|\bonline\b|\breal[- ]?time\s+(?:web|search|data)\b|\blive\s+(?:web|search|data)\b|အင်တာနက်|ဝဘ်|အွန်လိုင်း|တိုက်ရိုက်(?:ဝဘ်|ရှာ|ဒေတာ))/i.test(text);
}

export type WebSearchPolicy = {
  allowed: boolean;
  automatic: boolean;
  reason: "explicit" | "time-sensitive" | "intent-inferred" | "local-only" | "not-needed";
  goal: "current-fact" | "research-decision" | "local-workspace" | "conversation";
  confidence: number;
  signals: string[];
};

export type AdaptiveWebSearchPlan = {
  searchDepth: "basic" | "advanced";
  maxResults: number;
  topic: "general" | "news" | "finance";
  timeRange?: "day" | "week" | "month" | "year";
  minimumSources: number;
  retryOnWeakEvidence: boolean;
};

export function webSearchQueryAllowed(query: string): boolean {
  const value = query.trim();
  if (!value || value.length > 500) return false;
  return !/(?:api[_ -]?key|password|secret|token)\s*[:=]\s*\S+|-----BEGIN [A-Z ]+ PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{16,}\b|\bAIza[A-Za-z0-9_-]{20,}\b|\/(?:Users|home)\/[^\s]+|[A-Z]:\\Users\\[^\s]+/i.test(value);
}

/**
 * Allows web access only for the user's spoken query. Workspace and note content
 * remain local unless the user explicitly asks to verify them online.
 */
export function webSearchPolicy(text: string): WebSearchPolicy {
  const normalized = text.trim().toLowerCase();
  if (explicitWebRequested(normalized)) {
    return {
      allowed: true,
      automatic: false,
      reason: "explicit",
      goal: "current-fact",
      confidence: 1,
      signals: ["explicit-web"],
    };
  }

  const localOnly = workspaceEvidenceRequired(normalized)
    || /(my|this|active|open)\s+(note|file|vault|workspace)|ငါ့|ဒီဖိုင်|ဒီ note|ဖွင့်ထား/i.test(normalized);
  if (localOnly) {
    return {
      allowed: false,
      automatic: false,
      reason: "local-only",
      goal: "local-workspace",
      confidence: 1,
      signals: ["workspace-private"],
    };
  }

  // A short follow-up can still be an explicit search command even when the
  // user does not repeat "web" (for example, "ဒါဆို သွားရှာလိုက်"). Keep this
  // after the workspace-private guard so note/vault requests remain local.
  const searchAction = /\b(?:search|research|look\s+it\s+up|find\s+out)\b|(?:သွား)?ရှာ(?:ပေး|လိုက်|ကြည့်|ကြည့်|ပါ)?|စုံစမ်း(?:ပေး|ကြည့်|ကြည့်)?/iu.test(normalized);
  if (searchAction) {
    return {
      allowed: true,
      automatic: false,
      reason: "explicit",
      goal: "research-decision",
      confidence: 0.98,
      signals: ["explicit-search-action"],
    };
  }

  const currentCue = /\b(today|tomorrow|now|currently|recent|newest|this\s+(?:week|month|year)|next\s+(?:week|month))\b|ဒီနေ့|မနက်ဖြန်|အခု|ယခု|လတ်တလော|ဒီ(?:အပတ်|လ|နှစ်)|နောက်(?:အပတ်|လ)/i.test(normalized);
  const changingTopic = /\b(news|weather|forecast|score|schedule|exchange\s+rate|market|stock|crypto|bitcoin|btc|ethereum|eth|law|regulation|president|prime minister|ceo|version|release|price)\b|သတင်း|ရာသီဥတု|ပွဲရလဒ်|အချိန်ဇယား|ငွေလဲနှုန်း|စျေးကွက်|ဈေးကွက်|စျေးနှုန်း|ဈေးနှုန်း|ဥပဒေ|စည်းမျဉ်း|သမ္မတ|ဝန်ကြီးချုပ်|ဗားရှင်း/i.test(normalized);
  const inherentlyLive = /\b(?:news|weather|forecast|score|schedule|exchange\s+rate)\b|သတင်း|ရာသီဥတု|မိုး(?:လေဝသ|ရွာ|အခြေအနေ)?|ပွဲ(?:ရလဒ်|စဉ်|ချိန်)?|အချိန်ဇယား|ငွေလဲနှုန်း|\b(?:btc|bitcoin|eth|ethereum|stock|crypto|usd|thb|mmk)\b.{0,24}\b(?:price|rate|value)\b|(?:စျေး|ဈေး|နှုန်း).{0,24}(btc|bitcoin|eth|ethereum|usd|thb|mmk)/i.test(normalized);
  const changingRole = /\b(?:who(?:'s| is)|name)\b.{0,32}\b(?:ceo|president|prime minister|leader)\b|(?:ceo|သမ္မတ|ဝန်ကြီးချုပ်|ခေါင်းဆောင်).{0,24}(ဘယ်သူ|နာမည်)/i.test(normalized);
  const directResearch = /\b(best|better|compare|comparison|recommend|recommendation|review|worth buying|alternative|near me)\b|ဘယ်.{0,32}ပိုကောင်း|နှိုင်းယှဉ်|အကြံပြု|သုံးသပ်|ဝယ်သင့်|ရွေးသင့်|အစားထိုး/i.test(normalized);
  const selectionIntent = /\b(?:which|what).{0,72}\b(?:should\s+i|to)\s+(?:buy|choose|pick|get|use)\b|\bhelp\s+me\s+(?:choose|pick|find)\b|(?:ဘယ်ဟာ|ဘယ်တစ်ခု).{0,48}(?:ရွေး|ဝယ်|ယူ|သုံး)/i.test(normalized);
  const productNeed = /\b(?:i\s+need|i\s+want|looking\s+for|shopping\s+for)\b.{0,72}\b(?:phone|laptop|camera|car|hotel|restaurant|software|tool|service)\b|(?:phone|laptop|camera|ကား|ဟိုတယ်|စားသောက်ဆိုင်|software|tool).{0,48}(?:လိုချင်|လိုတယ်|ရှာပေး)/i.test(normalized);
  const currentTechnology = /(?:\b(?:current|latest|now)\b|အခု|လက်ရှိ|နောက်ဆုံး).{0,48}\b(?:ai|chatgpt|gemini|claude|codex|software|app|model|tool)\b|\b(?:ai|chatgpt|gemini|claude|codex|software|app|model|tool)\b.{0,64}(?:\b(?:available|preview|release|version)\b|ရပြီလား|ရလား|ထွက်ပြီ|ထုတ်လို့ရ|လုပ်လို့ရ)/iu.test(normalized);
  const researchDecision = directResearch || selectionIntent || productNeed;
  const signals = [
    currentCue && "current-cue",
    changingTopic && "changing-topic",
    inherentlyLive && "inherently-live",
    changingRole && "changing-role",
    directResearch && "research-decision",
    selectionIntent && "selection-intent",
    productNeed && "product-need",
    currentTechnology && "current-technology",
  ].filter((signal): signal is string => Boolean(signal));
  const currentScore = Math.min(1,
    (inherentlyLive ? 0.82 : 0)
      + (currentCue ? 0.16 : 0)
      + (changingTopic ? 0.18 : 0)
      + (changingRole ? 0.78 : 0)
      + (currentTechnology ? 0.72 : 0));
  const researchScore = researchDecision ? 0.82 : 0;
  if (currentScore >= 0.7) {
    return {
      allowed: true,
      automatic: true,
      reason: "time-sensitive",
      goal: "current-fact",
      confidence: currentScore,
      signals,
    };
  }
  if (researchScore >= 0.7) {
    return {
      allowed: true,
      automatic: true,
      reason: "intent-inferred",
      goal: "research-decision",
      confidence: researchScore,
      signals,
    };
  }
  return {
    allowed: false,
    automatic: false,
    reason: "not-needed",
    goal: "conversation",
    confidence: Math.max(0.5, 1 - Math.max(currentScore, researchScore)),
    signals,
  };
}

export function planWebSearch(
  text: string,
  query: string,
  policy = webSearchPolicy(text),
  requested: Partial<Pick<AdaptiveWebSearchPlan, "searchDepth" | "maxResults" | "topic" | "timeRange">> = {},
): AdaptiveWebSearchPlan {
  const normalized = `${text} ${query}`.toLowerCase();
  const finance = /\b(finance|financial|market|stock|crypto|bitcoin|btc|ethereum|eth|forex|usd|thb|mmk|revenue)\b|ငွေကြေး|စျေးကွက်|ဈေးကွက်|ငွေလဲနှုန်း/i.test(normalized);
  const news = /\b(news|headline|breaking|announcement|release)\b|သတင်း|ကြေညာချက်|ထုတ်ပြန်/i.test(normalized);
  const deepResearch = policy.goal === "research-decision"
    || /\b(deep|thorough|comprehensive|research|compare|comparison|review)\b|အသေးစိတ်|သုတေသန|နှိုင်းယှဉ်|သုံးသပ်/i.test(normalized);
  const urgent = /\b(today|now|current|latest|live|breaking)\b|ဒီနေ့|အခု|လက်ရှိ|နောက်ဆုံး|တိုက်ရိုက်/i.test(normalized);
  const recent = /\b(tomorrow|this week|next week|recent)\b|မနက်ဖြန်|ဒီအပတ်|နောက်အပတ်|လတ်တလော/i.test(normalized);
  const topic = finance ? "finance" : news ? "news" : requested.topic || "general";
  const searchDepth = requested.searchDepth === "advanced" || deepResearch ? "advanced" : "basic";
  const minimumSources = deepResearch ? 3 : 1;
  const defaultResults = deepResearch ? 8 : news || finance ? 5 : 4;
  const requestedResults = Number(requested.maxResults) || 0;
  const maxResults = Math.max(minimumSources, Math.min(10, requestedResults || defaultResults));
  const timeRange = urgent ? "day" : recent ? "week" : requested.timeRange || (news ? "month" : undefined);
  return {
    searchDepth,
    maxResults,
    topic,
    timeRange,
    minimumSources,
    retryOnWeakEvidence: true,
  };
}
