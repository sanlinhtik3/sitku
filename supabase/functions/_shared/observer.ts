// ═══ Project Phoenix: _shared/observer.ts ═══
// Extracted from agent-chat/index.ts (lines 4015-4175)
// LLM-based intent classifier with regex fallback
// v17.2.0: P0 — Expanded prescreen to ~90%+, cache TTL 300s, max 200

// ═══ Universal Question Guard ═══
// Detects Burmese + English question markers to prevent misclassifying questions as commands
// Tightened in v2: phrase-level matching to prevent false positives (e.g. bare "ဘာ" no longer matches)
export function isQuestionMessage(message: string): boolean {
  // Specific question phrases (safe to match anywhere)
  const specificQuestionPhrases = /ဘာ\s*(model|tool|လဲ|သုံး|ကို|က\s)|ဘယ်\s*(လို|model|tool|ဟာ|လောက်)|ဘယ်.*သုံး|model\s*(က|ကို)?\s*ဘာ|what\s*(model|is|does)|which\s*model|how\s*(does|do|is|many)|tell\s*me\s*about|explain|ရှင်းပြ/i;
  // End-of-message question markers (anchored to end)
  const endQuestionMarkers = /(သလဲ|လဲ|လား)\s*[?]?\s*$/i;
  // Explicit question mark
  const hasQuestionMark = /\?\s*$/;
  
  return specificQuestionPhrases.test(message) || endQuestionMarkers.test(message) || hasQuestionMark.test(message);
}

export interface ObserverResult {
  modules: string[];
  intent: string;
  needs_tools: boolean;
  complexity: "simple" | "moderate" | "complex";
  primary_action?: string;
}

// ═══ v17.2.0: LRU CACHE — Increased TTL 300s, max 200 (Observer uses temperature=0, safe to cache) ═══
interface CacheEntry {
  result: ObserverResult;
  timestamp: number;
}

const OBSERVER_CACHE_TTL_MS = 300_000; // P0: 60s → 300s
const OBSERVER_CACHE_MAX = 200; // P0: 50 → 200
const observerCache = new Map<string, CacheEntry>();

function hashMessage(msg: string): string {
  // Simple hash: normalize whitespace, lowercase, take first 200 chars
  return msg.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
}

function getCachedObserver(message: string): ObserverResult | null {
  const key = hashMessage(message);
  const entry = observerCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > OBSERVER_CACHE_TTL_MS) {
    observerCache.delete(key);
    return null;
  }
  // LRU: delete + re-insert to move to end (eviction targets Map start)
  observerCache.delete(key);
  observerCache.set(key, entry);
  console.log(`[Observer] ⚡ Cache HIT (LRU refreshed) for: "${key.slice(0, 50)}..."`);
  return entry.result;
}

function setCachedObserver(message: string, result: ObserverResult): void {
  const key = hashMessage(message);
  // Evict oldest if at capacity
  if (observerCache.size >= OBSERVER_CACHE_MAX) {
    const oldestKey = observerCache.keys().next().value;
    if (oldestKey) observerCache.delete(oldestKey);
  }
  observerCache.set(key, { result, timestamp: Date.now() });
}

export async function observerAnalyze(
  userMessage: string,
  recentHistory: Array<{ role: string; content: string }>,
  isAdmin: boolean,
  personalGeminiKey?: string,
  llmConfig?: { apiKey: string; endpoint: string; model: string; headers: Record<string, string> } | null,
): Promise<ObserverResult | null> {
  // ═══ v16.5.0: Check LRU cache first ═══
  const cached = getCachedObserver(userMessage);
  if (cached) {
    // FIX: clone cached result + modules array to prevent mutation bleeding
    // across requests. Previously `.filter()` on cached.modules permanently
    // stripped ADMIN/HIVE from the shared cache entry, causing later admin
    // requests to silently lose those modules.
    const cloned: ObserverResult = { ...cached, modules: [...(cached.modules || [])] };
    if (!isAdmin) {
      cloned.modules = cloned.modules.filter(m => m !== "ADMIN" && m !== "HIVE");
    }
    return cloned;
  }

  // ═══ v18.0: Provider-aware — resolve endpoint/key/model from llmConfig OR personalGeminiKey ═══
  let resolvedEndpoint: string;
  let resolvedHeaders: Record<string, string>;
  let resolvedModel: string;

  if (llmConfig) {
    resolvedEndpoint = llmConfig.endpoint;
    resolvedHeaders = llmConfig.headers;
    resolvedModel = llmConfig.model;
  } else if (personalGeminiKey) {
    const { GEMINI_OPENAI_ENDPOINT } = await import("./api-endpoints.ts");
    resolvedEndpoint = GEMINI_OPENAI_ENDPOINT;
    resolvedHeaders = { "Authorization": `Bearer ${personalGeminiKey}`, "Content-Type": "application/json" };
    resolvedModel = "gemini-2.5-flash-lite";
  } else {
    console.warn("[Observer] No LLM config or Gemini key available, skipping observer");
    return null;
  }

  const last3 = recentHistory.slice(-3).map(m => `${m.role}: ${m.content.slice(0, 100)}`).join("\n");
  
  const observerPrompt = `Classify this user message. Return JSON only, no markdown.
Fields: modules (array from: CORE, FINANCE, CONTENT, WORKSPACE, ADMIN, KNOWLEDGE, MEMORY, HIVE), intent (string), needs_tools (bool), complexity (simple|moderate|complex), primary_action (string).
Rules:
- CORE is always included automatically, don't add it.
- FINANCE: money, expense, income, budget, ငွေ, ကုန်ကျ, ဝင်ငွေ
- CONTENT: write, create, generate, article, ရေး, ဖန်တီး
- WORKSPACE: task, team, workspace, အလုပ်, assign
- ADMIN: admin, system, users, manage (only if context suggests admin actions)
- KNOWLEDGE: questions about app features, how-to, ဘာလဲ, ဘယ်လို
- MEMORY: remember, recall, forget, မှတ်, သတိရ
- HIVE: agent network, other agents, sync (admin only)
- simple: greeting, single question, quick lookup
- moderate: tool usage, multi-part question
- complex: multi-tool, analysis, planning, "deep search", "deep", "analyze", "detailed", "research"
- primary_action: one of: save_verbatim, generate_content, generate_image, search_info, search_web, manage_finance, strategy_advisory, manage_task, manage_content, manage_api_key, broadcast_message, schedule_task, manage_goal, manage_facebook, background_objective, check_config, answer_question, navigate_app, update_settings, remember_fact, recall_memory, check_notifications, get_user_info, check_my_health, check_system_vitals, admin_action, other
- strategy_advisory: user wants strategic / consulting analysis — SWOT, Porter, OKR, roadmap, lean canvas, business strategy, မဟာဗျူဟာ, plan, vision, framework, consult, ဗျူဟာ, business analysis
  - schedule_task: user wants to schedule/remind/set a future task or recurring job (remind me, later, every day, timer, alarm, schedule, သတိပေး, ခဏကြာရင်, နေ့တိုင်း)
  - manage_goal: user wants a LONG-TERM autonomous goal. REQUIRES explicit DURATION (days, weeks, hours, e.g. "for 3 days", "48 hours", "keep monitoring") OR the word "goal"/"project". Also for checking background tasks, running tasks, active autonomous jobs (background task ရှိလား, running task, my goals, ဘာတွေ run နေလဲ). "Research this" alone is NOT manage_goal -- that is search_web with complexity complex. "Search deeply" is search_web (complex), NOT manage_goal.
  - CRITICAL: "double check", "check again", "re-check", "verify", "စစ်ပေး" are NOT manage_goal. Map these to check_config or self_debug. manage_goal requires explicit long-term/autonomous language (days, weeks, monitor, research long-term).
  - background_objective: ONLY when user explicitly says "while I'm away", "in the background", or specifies multi-day autonomous work with a duration (e.g. "research this for 3 days while I'm away"). Do NOT use for "search deeply", "research this topic", "investigate X", "find out about Y" -- those are search_web (complex). Myanmar: ရှာပေးပြီး report လုပ်ပေး (with duration), သုတေသန လုပ် (with duration).
  - broadcast_message: user wants to POST/SEND/BROADCAST to a channel, add/manage broadcast channels, or RESET/WIPE all Telegram config (ပို့ပေး channel, broadcast, post to channel, ကြေငြာ, add channel, reset telegram, delete all configs, Telegram ဖျက်, config ဖျက်, reset ချ)
  - manage_facebook: user wants to manage Facebook page — post to Facebook, reply to Facebook comments, view Facebook posts, delete Facebook post, connect Facebook page (facebook, FB, Facebook page, FB post, FB comment, Facebook မှာ post, FB reply)
  - save_verbatim: user wants to SAVE/STORE their own text as-is (သိမ်း, save, store, မှတ်ထား + content block)
  - generate_content: user wants AI to WRITE/CREATE new TEXT content (ရေးပေး, write, create article, generate text). NOT for images.
  - generate_image: user wants AI to DRAW/GENERATE a visual IMAGE (ပုံ, ပုံဆွဲပေး, draw, image, picture, illustrate, paint, design visual, ဆွဲ, ဖန်တီး+ပုံ). This is DIFFERENT from generate_content which creates TEXT content only.
  - search_info: user asks a question or wants information (ဘာလဲ, explain, ရှင်းပြ)
  - search_web: user wants LIVE internet search (Google, search, latest, current price, news, weather, ရှာပေး, Google ပေး, ရာသီဥတု)
  - manage_finance: user wants to record/check finances (ငွေ, expense, balance)
  - manage_task: user wants to create/manage workspace tasks (task, အလုပ်, assign, workspace task, create task, list tasks)
  - manage_content: user wants to list/delete/view their saved content (my content, saved content, content list)
  - remember_fact: user tells you to remember something about them (မှတ်ထားပေး, remember that I, မမေ့နဲ့)
  - recall_memory: user asks what you remember or references past conversations (what do you remember, မှတ်ထားတာ, သတိရ)
  - manage_api_key: user wants to set, check, validate, verify, update, or delete an API key (key, API key, tvly-, sk-, delete key, remove key, key ထည့်, key ဖျက်, "here is my key", "check my token", "verify token", "token စစ်ပေး", "reactivate", "is my token working")
  - check_my_health: user asks about BeeBot's health, speed, performance, errors (ကျန်းမာလား, နေကောင်းလား, feeling okay, are you slow, why slow, my health, error ရှိလား)
  - check_system_vitals: admin asks about system health, infrastructure, API metrics, system vitals (admin only)
  - check_config: user wants to see their config, settings, setup, connected channels, API key status, OR asks about bot identity, bot name, account name, username, connection status (show config, check settings, my setup, bot name, account name, what's your name on telegram, username, connected, connection, ချိတ်ဆက်, config ပြပေး, setting ကြည့်, bot နာမည်, account)
  - navigate_app: user asks where a feature is, how to find something in the app (ဘယ်မှာလဲ, where is, how do I find, navigate to)
  - check_notifications: user asks about notifications, unread messages, alerts (notification, unread, alerts, အသိပေးချက်)
  - update_settings: user wants to change bot name, emoji, personality mode (rename, call you, change name, emoji ပြောင်း)
  - get_user_info: user asks about their credits, profile info, statistics (credit ဘယ်လောက်, my profile, my stats, credits remaining)
  - answer_question: general conversation, no tools needed
  - other: unclear or multi-purpose, use full tool set`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(resolvedEndpoint, {
      method: "POST",
      headers: resolvedHeaders,
      signal: controller.signal,
      body: JSON.stringify({
        model: resolvedModel,
        messages: [
          { role: "system", content: observerPrompt },
          { role: "user", content: `Message: "${userMessage.slice(0, 500)}"\nRecent context:\n${last3}` }
        ],
        temperature: 0,
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[Observer] Personal key returned ${response.status}`);
      return null;
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response (handle potential markdown wrapping)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[Observer] Could not parse JSON from response:", content.slice(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as ObserverResult;
    
    // Ensure CORE is always present
    if (!parsed.modules.includes("CORE")) {
      parsed.modules.unshift("CORE");
    }
    
    // Filter admin/hive modules for non-admin users
    if (!isAdmin) {
      parsed.modules = parsed.modules.filter(m => m !== "ADMIN" && m !== "HIVE");
    }

    // Ensure primary_action has a fallback
    if (!parsed.primary_action) {
      parsed.primary_action = "other";
    }

    console.log(`[Observer] Intent: ${parsed.intent}, Modules: [${parsed.modules.join(",")}], Complexity: ${parsed.complexity}, Action: ${parsed.primary_action}`);
    // ═══ v16.5.0: Cache the result ═══
    setCachedObserver(userMessage, { ...parsed }); // Store a copy before admin filtering
    return parsed;
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.warn("[Observer] Timed out after 4s, using regex fallback");
      // ═══ FIX 4: On timeout, use regex fallback instead of returning null ═══
      const fallback = fallbackObserverClassify(userMessage);
      if (fallback) {
        console.log(`[Observer] Timeout fallback matched: ${fallback.primary_action}`);
        setCachedObserver(userMessage, { ...fallback });
        return fallback;
      }
    } else {
      console.error("[Observer] Error:", error);
    }
    return null;
  }
}

// ═══ PRE-SCREEN: High-confidence regex that runs BEFORE the LLM ═══
// v17.2.0: P0 — Expanded to ~90%+ coverage
export function preScreenClassify(message: string): ObserverResult | null {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // ═══ P0: TOOL_KEYWORDS for short-message gating ═══
  const TOOL_KEYWORDS = /search|ရှာ|price|ဈေး|write|ရေး|draw|ဆွဲ|image|ပုံ|task|အလုပ်|expense|ငွေ|balance|config|setting|schedule|remind|broadcast|goal|credit|health|api|key|token|notify|channel|remember|မှတ်|cancel|stop|delete|ဖျက်|deep|analyze|research|audit/i;

  // ═══ FIX: Specific pattern matchers FIRST, short-message default LAST ═══
  // Previously the <50 char default blocked all patterns below from matching.

  // Cancel/stop goal - highest priority
  const cancelPattern = /cancel\s*(goal|objective|research|task|all)|stop\s*(goal|research|monitoring|all)|terminate\s*(goal|task)|ရပ်တန့်|goal\s*(cancel|stop|delete|remove)|ဖျက်.*(goal|objective)/i;
  if (cancelPattern.test(message)) {
    console.log(`[PreScreen] ✅ Matched: cancel_goal`);
    return { modules: ["CORE"], intent: "cancel_goal", needs_tools: true, complexity: "simple", primary_action: "manage_goal" };
  }

  // Image generation - HIGH PRIORITY: must come before config/content patterns
  const imagePattern = /ပုံ|ပုံဆွဲ|ဆွဲပေး|draw|illustrate|image|picture|generate.*image|create.*image|make.*picture|ပုံ.*ဖန်တီး|ဆွဲ|paint/i;
  if (imagePattern.test(message)) {
    if (isQuestionMessage(message)) {
      console.log(`[PreScreen] Image keyword found but message is a QUESTION — deferring to LLM Observer`);
      return null;
    }
    console.log(`[PreScreen] ✅ Matched: generate_image`);
    return { modules: ["CORE", "CONTENT"], intent: "generate_image", needs_tools: true, complexity: "moderate", primary_action: "generate_image" };
  }

  // Config/check/verify - often misclassified as goal
  const configPattern = /double.?check|re.?check|verify|စစ်ပေး|check\s*(config|setting|setup|telegram|connection)|config|setting|setup|telegram|connection|ချိတ်ဆက်|bot\s*name|account\s*name|username/i;
  if (configPattern.test(message)) {
    console.log(`[PreScreen] ✅ Matched: check_config`);
    return { modules: ["CORE"], intent: "check_config", needs_tools: true, complexity: "simple", primary_action: "check_config" };
  }

  // Goal status/list queries - route to Goal Engine, NOT OS processes
  const goalListPattern = /background\s*task|running\s*task|active\s*(goal|task|objective)|how\s*many\s*(task|goal)|goal\s*(status|list|check|စစ်)|my\s*goal|show\s*goal|list\s*goal|ရှိ.*(goal|task)|goal\s*ဘယ်နှစ်/i;
  if (goalListPattern.test(message)) {
    console.log(`[PreScreen] ✅ Matched: goal_list`);
    return { modules: ["CORE"], intent: "manage_goal", needs_tools: true, complexity: "simple", primary_action: "manage_goal" };
  }

  // ═══ P0-FIX: "X အကြောင်း ပြောပြ/ရှင်းပြ" — topic research needs web search, not simple knowledge ═══
  const topicResearchPattern = /အကြောင်း.*(ပြောပြ|ရှင်းပြ|ပြောပြပါ|ရှင်းပြပါ|ပြောပေး|ရှင်းပေး|ပြောပြပေး|ရှင်းပြပေး|သိချင်|လေ့လာ)|tell\s+me\s+about\s+\w/i;
  if (topicResearchPattern.test(trimmed) && !TOOL_KEYWORDS.test(trimmed)) {
    console.log(`[PreScreen] ✅ Matched: topic_research (needs search)`);
    return { modules: ["CORE", "KNOWLEDGE"], intent: "search_info", needs_tools: true, complexity: "moderate", primary_action: "search_web" };
  }

  // ═══ P0: EXPANDED GENERAL KNOWLEDGE / HOW-TO / COMPARISON PATTERNS ═══
  const generalKnowledgePattern = /^(what\s+is|what\s+are|who\s+is|who\s+are|when\s+(was|did|is)|where\s+(is|are|was)|why\s+(is|are|do|does|did)|how\s+to|how\s+do|how\s+does|how\s+can|how\s+is|explain\s|define\s|describe\s|tell\s+me\s+about|ဘာ.*လဲ|ဘယ်.*လဲ|ဘာကြောင့်|ဘယ်လို|ရှင်းပြ|ပြောပြ)/i;
  if (generalKnowledgePattern.test(trimmed) && !TOOL_KEYWORDS.test(trimmed)) {
    console.log(`[PreScreen] ✅ Matched: general_knowledge`);
    return { modules: ["CORE", "KNOWLEDGE"], intent: "answer_question", needs_tools: false, complexity: "simple", primary_action: "answer_question" };
  }

  // Comparison / vs patterns
  const comparisonPattern = /\bvs\.?\b|\bversus\b|\bcompare\b|\bcomparison\b|\bdifference\s+between\b|နှိုင်းယှဉ်|ခြားနားချက်|ကွာခြားချက်/i;
  if (comparisonPattern.test(trimmed) && !TOOL_KEYWORDS.test(trimmed)) {
    console.log(`[PreScreen] ✅ Matched: comparison`);
    return { modules: ["CORE", "KNOWLEDGE"], intent: "answer_question", needs_tools: false, complexity: "simple", primary_action: "answer_question" };
  }

  // ═══ P0: YES/NO FOLLOW-UPS & SHORT CONFIRMATIONS ═══
  const confirmationPattern = /^(yes|no|yeah|nah|yep|nope|ok|okay|sure|right|correct|exactly|agreed|ဟုတ်|မဟုတ်|ဟုတ်ကဲ့|အင်း|ဟင့်အင်း|ကောင်းပြီ|ကောင်းတယ်|ရပါတယ်|ရတယ်|ဟုတ်တယ်|မှန်တယ်|အိုကေ|got\s*it|alright|fine|good|great|cool|nice|understood|roger)\s*[!.?]*\s*$/i;
  if (confirmationPattern.test(trimmed)) {
    console.log(`[PreScreen] ✅ Matched: confirmation/follow-up`);
    return { modules: ["CORE"], intent: "follow_up", needs_tools: false, complexity: "simple", primary_action: "answer_question" };
  }

  // ═══ P0: OPINION / ADVICE PATTERNS ═══
  const opinionPattern = /\b(should\s+i|what\s+should|recommend|suggest|advice|tips?\s+for|best\s+way|pros?\s+and\s+cons?|ဘာ.*ကောင်းမလဲ|ဘယ်.*ကောင်း|အကြံပေး|ဘယ်လို.*ကောင်းမလဲ)\b/i;
  if (opinionPattern.test(trimmed) && !TOOL_KEYWORDS.test(trimmed)) {
    console.log(`[PreScreen] ✅ Matched: opinion/advice`);
    return { modules: ["CORE"], intent: "answer_question", needs_tools: false, complexity: "simple", primary_action: "answer_question" };
  }

  // Crypto/price/latest data queries — need actual web search (moderate or complex based on detail request)
  const cryptoPattern = /price|ဈေး|rates|market|btc|eth|usdt|binance|exchange|ကျပ်|dollar|crypto|bitcoin|coin|defi|blockchain|wallet/i;
  const detailModifier = /အသေးစိတ်|detail|analyze|ခွဲခြမ်း|in.?depth|thorough|comprehensive|အပြည့်အစုံ/i;
  if (cryptoPattern.test(message)) {
    const complexity = detailModifier.test(message) ? "complex" : "moderate";
    console.log(`[PreScreen] ✅ Matched: crypto_price (complexity: ${complexity})`);
    return { modules: ["CORE"], intent: "search_web", needs_tools: true, complexity: complexity as any, primary_action: "search_web" };
  }

  // Learning/course queries
  const learningPattern = /course|သင်ခန်း|learn|သင်ယူ|lesson|tutorial|beginner|crypto\s*101|education|study|လေ့လာ/i;
  if (learningPattern.test(message)) {
    console.log(`[PreScreen] ✅ Matched: learning`);
    return { modules: ["CORE"], intent: "answer_question", needs_tools: false, complexity: "simple", primary_action: "answer_question" };
  }

  // Calculation/math queries
  const calcPattern = /calculate|တွက်|convert|exchange\s*rate|\d+\s*(btc|eth|usdt|usd|mmk|ks|ကျပ်)/i;
  if (calcPattern.test(message)) {
    console.log(`[PreScreen] ✅ Matched: calculation`);
    return { modules: ["CORE"], intent: "answer_question", needs_tools: false, complexity: "simple", primary_action: "answer_question" };
  }

  // News/latest/today queries — always need live web search
  const newsPattern = /news|သတင်း|latest|recent|today'?s?|ဒီနေ့|headline|breaking|နောက်ဆုံး|အသစ်|real.?time|live/i;
  if (newsPattern.test(message)) {
    const complexity = detailModifier.test(message) ? "complex" : "moderate";
    console.log(`[PreScreen] ✅ Matched: news (complexity: ${complexity})`);
    return { modules: ["CORE"], intent: "search_web", needs_tools: true, complexity: complexity as any, primary_action: "search_web" };
  }

  // Personal/memory queries
  const personalPattern = /remember|မှတ်|my\s*name|ငါ့နာမည်|preference|setting|မမေ့နဲ့|သတိရ/i;
  if (personalPattern.test(message)) {
    console.log(`[PreScreen] ✅ Matched: personal_memory`);
    return { modules: ["CORE", "MEMORY"], intent: "memory_action", needs_tools: true, complexity: "simple", primary_action: "remember_fact" };
  }

  // Direct Myanmar question pattern
  const myanmarQuestionPattern = /^(ဘာ|ဘယ်|ဘယ်လို|ဘယ်တုန်း|ဘာကြောင့်|ဘယ်နှ|ဘယ်သူ|ဘာလဲ).{0,150}[?？]?$/;
  if (myanmarQuestionPattern.test(trimmed)) {
    console.log(`[PreScreen] ✅ Matched: myanmar_direct_question`);
    return { modules: ["CORE", "KNOWLEDGE"], intent: "answer_question", needs_tools: false, complexity: "simple", primary_action: "answer_question" };
  }

  // Simple greetings (hi, hello, etc.)
  const greetingPattern = /^(hi|hello|hey|မင်္ဂလာ|ဟယ်လို|ဟိုင်း|yo|sup|good\s*(morning|afternoon|evening))\s*[!.?]?\s*$/i;
  if (greetingPattern.test(trimmed)) {
    console.log(`[PreScreen] ✅ Matched: greeting`);
    return { modules: ["CORE"], intent: "greeting", needs_tools: false, complexity: "simple", primary_action: "answer_question" };
  }

  // Thank you / farewell
  const farewellPattern = /^(thanks?|thank\s*you|ကျေးဇူး|bye|goodbye|see\s*you|ဘိုင်|good\s*night)\s*[!.]*\s*$/i;
  if (farewellPattern.test(trimmed)) {
    console.log(`[PreScreen] ✅ Matched: farewell`);
    return { modules: ["CORE"], intent: "farewell", needs_tools: false, complexity: "simple", primary_action: "answer_question" };
  }

  // ═══ P0: EMOTIONAL / CONVERSATIONAL PATTERNS ═══
  const emotionalPattern = /^(i('m| am)\s+(happy|sad|tired|bored|excited|stressed|angry|confused|lonely|grateful)|ပျော်|ဝမ်းနည်း|ပင်ပန်း|စိတ်ညစ်|စိတ်ရှုပ်|စိတ်ပျက်|love\s+you|miss\s+you|ချစ်တယ်|လွမ်း|haha|lol|😂|😊|🥲|😭)\s*[!.]*\s*$/i;
  if (emotionalPattern.test(trimmed)) {
    console.log(`[PreScreen] ✅ Matched: emotional/conversational`);
    return { modules: ["CORE"], intent: "answer_question", needs_tools: false, complexity: "simple", primary_action: "answer_question" };
  }

  // Facebook page management
  const facebookPattern = /facebook|fb\s*(page|post|comment|reply)|facebook\s*မှာ|FB\s*မှာ|facebook\s*page/i;
  if (facebookPattern.test(message)) {
    console.log(`[PreScreen] ✅ Matched: manage_facebook`);
    return { modules: ["CORE"], intent: "manage_facebook", needs_tools: true, complexity: "moderate", primary_action: "manage_facebook" };
  }

  // ═══ SHORT MESSAGE DEFAULT (LAST — after all specific pattern matchers) ═══
  // Only applies to messages without Burmese substance
  const hasBurmeseSubstance = /[\u1000-\u109F]{2,}/.test(trimmed) && trimmed.length > 10;
  if (trimmed.length < 50 && !TOOL_KEYWORDS.test(trimmed) && !hasBurmeseSubstance) {
    console.log(`[PreScreen] ✅ Short message default (<50 chars, no tool keywords, no Burmese substance): simple`);
    return { modules: ["CORE"], intent: "answer_question", needs_tools: false, complexity: "simple", primary_action: "answer_question" };
  }

  return null;
}

// ═══ OBSERVER FALLBACK: Regex-based intent detection when Observer times out or returns null ═══
export function fallbackObserverClassify(message: string): ObserverResult | null {
  // Cancel/stop goal intent - MUST come before goal creation patterns
  const cancelGoalPattern = /cancel\s*(goal|objective|research|task)|stop\s*(goal|research|monitoring)|terminate\s*goal|ရပ်တန့်|goal\s*(cancel|stop|delete|remove)|ဖျက်.*(goal|objective)/i;
  if (cancelGoalPattern.test(message)) {
    console.log(`[Observer] FALLBACK regex matched: cancel_goal`);
    return { modules: ["CORE"], intent: "cancel_goal", needs_tools: true, complexity: "simple", primary_action: "manage_goal" };
  }

  // ═══ QUESTION GUARD: Skip goal creation patterns entirely for questions ═══
  if (!isQuestionMessage(message)) {
    const bgPattern = /^(start|create|begin|launch|new)\s+(background\s+objective|background\s+research|background\s+task)|while\s*i'?m\s*away/i;
    const goalPattern = /^(start|create|begin|launch|new)\s+(goal|objective|project)|research\s*for\s*\d+\s*day|long.?term\s*(goal|research|project|monitor)|ရက်ရှည်\s*လေ့လာ/i;

    if (bgPattern.test(message)) {
      console.log(`[Observer] FALLBACK regex matched: background_objective`);
      return { modules: ["CORE"], intent: "background_objective", needs_tools: true, complexity: "complex", primary_action: "background_objective" };
    }
    if (goalPattern.test(message)) {
      console.log(`[Observer] FALLBACK regex matched: manage_goal`);
      return { modules: ["CORE"], intent: "manage_goal", needs_tools: true, complexity: "complex", primary_action: "manage_goal" };
    }
  } else {
    console.log(`[Observer] FALLBACK: Question guard (isQuestionMessage) triggered, skipping goal creation patterns`);
  }

  // Config/identity/connection keywords
  const configPattern = /double.?check|re.?check|verify|စစ်ပေး|config|setting|setup|connect|telegram|connection|check\s*config|ချိတ်ဆက်မှု|bot\s*name|account\s*name|username|channel\s*(name|list|connected)|ချိတ်ဆက်|bot\s*နာမည်|account|telegram.*name|name.*telegram/i;
  if (configPattern.test(message)) {
    console.log(`[Observer] FALLBACK regex matched: check_config`);
    return { modules: ["CORE"], intent: "check_config", needs_tools: true, complexity: "simple", primary_action: "check_config" };
  }

  const searchPattern = /search|ရှာ|Google|latest|news|price|weather|ရာသီဥတု|current|crypto|bitcoin|stock|score|သုံးသပ်|အသေးစိတ်|ဈေးကွက်|တုံ့ပြန်|ရှာဖွေ|စစ်ဆေး|ဈေးနှုန်း|FOMC|reaction|outlook|commentary|market|sentiment|forecast|analysis|analyze/i;
  if (searchPattern.test(message)) {
    console.log(`[Observer] FALLBACK regex matched: search_web`);
    return { modules: ["CORE"], intent: "web_search", needs_tools: true, complexity: "moderate", primary_action: "search_web" };
  }

  const financePattern = /ငွေ|money|expense|income|budget|balance|ကုန်ကျ|ဝင်ငွေ|flowstate/i;
  if (financePattern.test(message)) {
    console.log(`[Observer] FALLBACK regex matched: manage_finance`);
    return { modules: ["CORE", "FINANCE"], intent: "manage_finance", needs_tools: true, complexity: "moderate", primary_action: "manage_flowstate" };
  }

  const imagePattern = /ပုံ|ပုံဆွဲ|ဆွဲပေး|draw|image|picture|illustrate|paint|ဆွဲ/i;
  if (imagePattern.test(message)) {
    if (isQuestionMessage(message)) {
      console.log(`[Observer] FALLBACK: Image keyword found but message is a QUESTION — skipping`);
    } else {
      console.log(`[Observer] FALLBACK regex matched: generate_image`);
      return { modules: ["CORE", "CONTENT"], intent: "generate_image", needs_tools: true, complexity: "moderate", primary_action: "generate_image" };
    }
  }

  const contentPattern = /ရေး|write|create|generate|article|blog|caption/i;
  if (contentPattern.test(message)) {
    if (isQuestionMessage(message)) {
      console.log(`[Observer] FALLBACK: Content keyword found but message is a QUESTION — skipping`);
    } else {
      console.log(`[Observer] FALLBACK regex matched: generate_content`);
      return { modules: ["CORE", "CONTENT"], intent: "generate_content", needs_tools: true, complexity: "moderate", primary_action: "generate_ai_content" };
    }
  }

  const schedulePattern = /remind|alarm|timer|schedule|သတိပေး|every\s*(day|morning|evening)|နေ့တိုင်း|later\s+at|tomorrow|ခဏကြာ/i;
  if (schedulePattern.test(message)) {
    if (isQuestionMessage(message)) {
      console.log(`[Observer] FALLBACK: Schedule keyword found but message is a QUESTION — skipping`);
    } else {
      console.log(`[Observer] FALLBACK regex matched: schedule_task`);
      return { modules: ["CORE"], intent: "schedule_task", needs_tools: true, complexity: "moderate", primary_action: "schedule_task" };
    }
  }

  const broadcastPattern = /broadcast|ပို့ပေး|ကြေငြာ|post\s*to\s*channel|channel.*ပို့|send\s*to\s*(@|channel)/i;
  if (broadcastPattern.test(message)) {
    if (isQuestionMessage(message)) {
      console.log(`[Observer] FALLBACK: Broadcast keyword found but message is a QUESTION — skipping`);
    } else {
      console.log(`[Observer] FALLBACK regex matched: broadcast_message`);
      return { modules: ["CORE"], intent: "broadcast_message", needs_tools: true, complexity: "moderate", primary_action: "broadcast_message" };
    }
  }

  const workspacePattern = /workspace\s*task|task\s*(create|list|assign|complete|delete)|အလုပ်\s*(ဖန်တီး|ပြ|list)/i;
  if (workspacePattern.test(message)) {
    if (isQuestionMessage(message)) {
      console.log(`[Observer] FALLBACK: Workspace keyword found but message is a QUESTION — skipping`);
    } else {
      console.log(`[Observer] FALLBACK regex matched: manage_task`);
      return { modules: ["CORE", "WORKSPACE"], intent: "manage_task", needs_tools: true, complexity: "moderate", primary_action: "manage_task" };
    }
  }

  const apiKeyPattern = /api\s*key|token\s*(set|check|validate|delete|ထည့်|ဖျက်)|tvly-|sk-|bot\s*token|key\s*(ထည့်|ဖျက်|check)/i;
  if (apiKeyPattern.test(message)) {
    console.log(`[Observer] FALLBACK regex matched: manage_api_key`);
    return { modules: ["CORE"], intent: "manage_api_key", needs_tools: true, complexity: "simple", primary_action: "manage_api_key" };
  }

  const healthPattern = /ကျန်းမာ|နေကောင်း|health|are\s*you\s*(ok|slow)|why\s*slow|feeling\s*okay|error\s*ရှိ|my\s*health|performance/i;
  if (healthPattern.test(message)) {
    console.log(`[Observer] FALLBACK regex matched: check_my_health`);
    return { modules: ["CORE"], intent: "check_my_health", needs_tools: true, complexity: "simple", primary_action: "check_my_health" };
  }

  const userInfoPattern = /credit.*ဘယ်လောက်|my\s*credits?|credit\s*(balance|remaining|ကျန်)|profile\s*info|statistics/i;
  if (userInfoPattern.test(message)) {
    console.log(`[Observer] FALLBACK regex matched: get_user_info`);
    return { modules: ["CORE"], intent: "get_user_info", needs_tools: true, complexity: "simple", primary_action: "get_user_info" };
  }

  const memoryPattern = /remember\s*(that|this)|မှတ်ထားပေး|မမေ့နဲ့|what\s*do\s*you\s*remember|မှတ်ထားတာ|သတိရ/i;
  if (memoryPattern.test(message)) {
    console.log(`[Observer] FALLBACK regex matched: memory_action`);
    return { modules: ["CORE", "MEMORY"], intent: "memory_action", needs_tools: true, complexity: "simple", primary_action: "remember_fact" };
  }

  const notifPattern = /notification|unread\s*(message|alert)|alert.*ဘယ်နှစ်|အသိပေးချက်/i;
  if (notifPattern.test(message)) {
    console.log(`[Observer] FALLBACK regex matched: check_notifications`);
    return { modules: ["CORE"], intent: "check_notifications", needs_tools: true, complexity: "simple", primary_action: "check_notifications" };
  }

  return null;
}
