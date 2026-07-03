// ═══ v17.2.0: Guard Protocols — P0 Optimized ═══
// Pure functions that return GuardResult for uniform handling in the agentic loop.
// P0: Removed reflection from moderate, tightened triggers, stepIncrease 2→1

import { isQuestionMessage } from "./observer.ts";

// ═══ DRY: Shared Intent Regex Constants (single source for all guards) ═══
const IMAGE_INTENT_RE = /ပုံ|ဆွဲ|draw|image|picture|illustrate|generate.*image|ဖန်တီး.*ပုံ/i;
const FINANCE_INTENT_RE = /ငွေ|money|expense|income|ဝင်ငွေ|ထွက်ငွေ|balance|flowstate/i;
const TASK_INTENT_RE = /task|အလုပ်|todo|assign|workspace/i;
const CONTENT_INTENT_RE = /ရေး|write|article|caption|script|blog|content/i;

// ═══ GuardResult Interface ═══
export interface GuardResult {
  triggered: boolean;
  action: "continue" | "break" | "none";
  nudgeMessage?: string;
  assistantEcho?: string;
  thinkingLabel?: string;
  sseEvent?: object;
  stepIncrease?: number;
  logMessage?: string;
}

// ═══ NO-TOOL-CALL GUARDS ═══

export function checkDeepResearchGuard(
  isDeepQuery: boolean,
  allToolResults: any[],
  deepResearchRetryAttempted: boolean,
  step: number,
  MAX_AGENT_STEPS: number,
  stepContent: string,
): GuardResult {
  if (isDeepQuery && allToolResults.length === 0 && !deepResearchRetryAttempted && step < MAX_AGENT_STEPS - 1) {
    return {
      triggered: true,
      action: "continue",
      assistantEcho: stepContent,
      nudgeMessage:
        "[SYSTEM] DEEP RESEARCH GUARD: You MUST call search_web or spawn_sub_agent before answering a deep query. " +
        "Your internal knowledge is NOT sufficient for time-sensitive or research queries. Call search_web NOW with a relevant query.",
      thinkingLabel: "Initiating mandatory research... 🔍",
      sseEvent: { type: "agent_step", current: step, max: MAX_AGENT_STEPS, status: "deep_research_guard", reason: "Deep query requires tool-based research" },
      stepIncrease: 1, // P0: 2→1
      logMessage: `[DeepResearchGuard] Deep query detected with ZERO tool calls. Forcing research.`,
    };
  }
  return { triggered: false, action: "none" };
}

export function checkAntiGhostGuard(
  stepContent: string,
  sanitizedMessage: string,
  promiseRetryCount: number,
  step: number,
  MAX_AGENT_STEPS: number,
  imageGenerationCompleted: boolean,
  lastGeneratedImageUrl: string | null,
  allToolResults?: any[],
): GuardResult & { newRetryCount: number } {
  const noTrigger = { triggered: false, action: "none" as const, newRetryCount: promiseRetryCount };

  // P0: Max 2 retries (was 1), but with smarter checks to reduce false positives
  if (promiseRetryCount >= 2 || step >= MAX_AGENT_STEPS - 1 || !stepContent) return noTrigger;

  // ═══ CRITICAL FIX: If tools already ran successfully, promise text is transitional — NOT ghosting ═══
  if (allToolResults && allToolResults.length > 0) {
    return noTrigger;
  }

  // ═══ CRITICAL FIX: Content length check — long responses with promise phrases are real content, not ghosting ═══
  // Only trigger on short (<200 char) promise-only responses
  if (stepContent.trim().length > 200) {
    return noTrigger;
  }

  // P0: Tightened patterns — REMOVED overly broad conversational Myanmar patterns
  // Removed: ပြောပြပေးမယ်, ရှင်းပြပေးမယ်, ပြောပြမယ်, လေ့လာပေးမယ် (conversational, not action promises)
  // Removed: ကြည့်ရအောင် (common speech filler)
  const promisePatterns = [
    /ရှာပေးနေ/, /ရှာဖွေနေ/, /စောင့်ပေးပါ/, /ရှာနေ/, /ပြန်စစ်/, /ပြန်ရှာ/,
    /စစ်ပေးပါမယ်/, /ရှာပေးပါမယ်/, /ပြန်ကြည့်/,
    /ထပ်ရှာပေးမယ်/, /ရှာပေးမယ်/, /ထပ်ရှာ/,
    /ကြည့်ပေးနေ/, /ကြည့်နေ/, /ရှာပေးလိုက်မယ်/, /စစ်ဆေးနေ/,
    /ဖန်တီးနေ/, /ဆွဲနေ/, /ဆွဲပေးနေ/, /ပုံ.*ဖန်တီးပေး(?!ပြီး)/,
    /generate.*ပေးပါမယ်/, /လုပ်ပေးနေ/, /ပြင်ဆင်နေ/,
    /ကြည့်လိုက်မယ်/, /ကြည့်ပေးမယ်/,
    /ရှာလိုက်မယ်/, /လုပ်ပေးမယ်/,
    /သိအောင်.*လုပ်/, /ကြည့်လိုက်ပါမယ်/, /ရှာကြည့်/,
    // Plain-text pseudo-tool leak (Gemini hallucination)
    /^tool_code\s*$/m,
    /print\s*\(\s*search_web\s*\(/,
    /^search_web\s*$/m,
    /^search_web\s*\{/m,
    /^search_web\s*\n+\s*\{/m,
    // P0: Tightened — sentence-start only to prevent false positives
    /^I('m| am)\s+(creating|generating|drawing|preparing|searching|looking|checking|finding)/im,
    /^let me (search|find|check|look)/im,
    /^please wait/im, /^working on it/im,
    /^checking now/im, /^searching now/im,
  ];

  const isPromiseWithoutAction = promisePatterns.some(p => p.test(stepContent));
  if (!isPromiseWithoutAction) return noTrigger;

  // ═══ DRY: Shared intent regex constants ═══
  const userMessageIsQuestion = isQuestionMessage(sanitizedMessage);

  if (IMAGE_INTENT_RE.test(sanitizedMessage || "") && (imageGenerationCompleted || userMessageIsQuestion)) {
    return { triggered: false, action: "none", newRetryCount: promiseRetryCount };
  }

  const newCount = promiseRetryCount + 1;

  let nudgeTool = "search_web or browser_search";
  let nudgeEmoji = "🔍";
  let nudgeAction = "search";
  if (IMAGE_INTENT_RE.test(sanitizedMessage || "")) {
    nudgeTool = "generate_image"; nudgeEmoji = "🎨"; nudgeAction = "generate an image";
  } else if (FINANCE_INTENT_RE.test(sanitizedMessage || "")) {
    nudgeTool = "manage_flowstate"; nudgeEmoji = "💰"; nudgeAction = "manage finance";
  } else if (TASK_INTENT_RE.test(sanitizedMessage || "")) {
    nudgeTool = "manage_workspace_task"; nudgeEmoji = "📋"; nudgeAction = "manage tasks";
  } else if (CONTENT_INTENT_RE.test(sanitizedMessage || "")) {
    nudgeTool = "generate_ai_content"; nudgeEmoji = "✍️"; nudgeAction = "generate content";
  }

  if (IMAGE_INTENT_RE.test(sanitizedMessage || "")) {
    nudgeTool = "generate_image"; nudgeEmoji = "🎨"; nudgeAction = "generate an image";
  } else if (FINANCE_INTENT_RE.test(sanitizedMessage || "")) {
    nudgeTool = "manage_flowstate"; nudgeEmoji = "💰"; nudgeAction = "manage finance";
  } else if (TASK_INTENT_RE.test(sanitizedMessage || "")) {
    nudgeTool = "manage_workspace_task"; nudgeEmoji = "📋"; nudgeAction = "manage tasks";
  } else if (CONTENT_INTENT_RE.test(sanitizedMessage || "")) {
    nudgeTool = "generate_ai_content"; nudgeEmoji = "✍️"; nudgeAction = "generate content";
  }

  return {
    triggered: true,
    action: "continue",
    newRetryCount: newCount,
    assistantEcho: stepContent,
    nudgeMessage:
      `[SYSTEM] CRITICAL: You just said you would ${nudgeAction} but did NOT call any tool. ` +
      `You MUST call ${nudgeTool} NOW. Do NOT respond with text only. User query: "${sanitizedMessage.slice(0, 100)}"`,
    thinkingLabel: `Initiating ${nudgeAction}... ${nudgeEmoji}`,
    sseEvent: { type: "agent_step", current: step, max: MAX_AGENT_STEPS, status: "anti_ghost_retry", reason: `Promise detected without tool call (attempt ${newCount}/2) - nudging ${nudgeTool}` },
    stepIncrease: 1,
    logMessage: `[AntiGhost] Detected promise-without-action (attempt ${newCount}/2). Forcing tool call retry. (intent: ${nudgeTool})`,
  };
}

// ═══ P0: NON-TIME-SENSITIVE WHITELIST for Hallucination Guard ═══
const NON_TIME_SENSITIVE_PATTERNS = /\b(math|calculate|formula|equation|definition|concept|theory|algorithm|tutorial|example|how\s+to|explain|describe|history\s+of|what\s+is|who\s+is|meaning|syntax|grammar|time|clock|what\s+time)\b|တွက်|ဖော်မြူလာ|သမိုင်း|အဓိပ္ပာယ်|ရှင်းပြ|အချိန်|ဘယ်နှစ်နာရီ|နာရီ/i;
const TIME_SENSITIVE_PATTERNS = /price|ဈေး|weather|ရာသီဥတု|score|news|သတင်း|stock|market|exchange\s*rate|နှုန်း|current|today|ဒီနေ့|latest|live|real.?time/i;

// ═══ EDITORIAL INTENT BYPASS — prevents false-positive guards on content review requests ═══
const EDITORIAL_INTENT_PATTERNS = /ဆွေးနွေး|လေ့လာ|review|discuss|feedback|opinion|ပြန်ရေး|သုံးသပ်|ဝေဖန်|စစ်ပေး|ကြည့်ပေး|မပြင်နဲ့|မထုတ်နဲ့|ပြင်ပေး|ရေးပေး|ထင်မြင်ချက်|အကဲဖြတ်|critique|proofread|edit.*for me|check.*article|check.*content/i;

export function checkHallucinationGuard(
  stepContent: string,
  sanitizedMessage: string,
  allToolResults: any[],
  hallucinationGuardCount: number,
  step: number,
  MAX_AGENT_STEPS: number,
  imageGenerationCompleted: boolean,
): GuardResult & { newGuardCount: number } {
  const noTrigger = { triggered: false, action: "none" as const, newGuardCount: hallucinationGuardCount };

  if (hallucinationGuardCount >= 2 || allToolResults.length > 0 || imageGenerationCompleted || step >= MAX_AGENT_STEPS - 1 || !stepContent) return noTrigger;

  // Editorial/discussion intent bypass — user is asking for review of their own content, not live data
  if (EDITORIAL_INTENT_PATTERNS.test(sanitizedMessage)) {
    return noTrigger;
  }
  // (Duplicate editorial check removed — DRY: line 169 already handles this)

  // P0: Skip for non-time-sensitive queries (math, definitions, general knowledge)
  if (NON_TIME_SENSITIVE_PATTERNS.test(sanitizedMessage) && !TIME_SENSITIVE_PATTERNS.test(sanitizedMessage)) {
    return noTrigger;
  }

  const factualClaimPatterns = [
    /\$[\d,]+/, /\d+(\.\d+)?%/, /\d{1,3}(,\d{3})+/,
    /လက်ရှိ.*ဈေးနှုန်း/, /ယနေ့.*ရလဒ်/,
    /\d+\s*(USD|MMK|BTC|ETH|ကျပ်)/i,
    /top\s*\d+/i,
    /\d+\s*(users?|ယောက်|ဦး)/i,
    /\d+\s*(tokens?|IU)/i,
    /\d+\s*(requests?|times?|ကြိမ်)/i,
  ];
  const hasFactualClaims = factualClaimPatterns.some(p => p.test(stepContent));

  const factualQuestionPatterns = [
    /ဘယ်လောက်/, /price/i, /ဈေးနှုန်း/, /how much/i,
    /ဘယ်လိုဖြစ်/, /what.*happening/i, /news/i, /သတင်း/,
    /score/i, /ရလဒ်/, /weather/i, /ရာသီဥတု/,
    /exchange\s*rate/i, /နှုန်း/, /stock/i, /crypto/i,
    /top.*user|user.*list|iu.*အများဆုံး|who.*most/i,
    /အသုံးအများဆုံး|အများဆုံး.*ယောက်/,
    /consumer|usage.*rank|leaderboard/i,
  ];
  const wasFactualQuestion = factualQuestionPatterns.some(p => p.test(sanitizedMessage));

  const vagueFactualPatterns = [
    /တက်နေ|ကျနေ|မြင့်နေ|နိမ့်နေ/,
    /increased|decreased|went up|went down/i,
    /currently|right now|at the moment/i,
    /လက်ရှိ|အခု|ယနေ့/,
  ];
  const isVagueFactual = wasFactualQuestion && vagueFactualPatterns.some(p => p.test(stepContent));

  if (!((hasFactualClaims && wasFactualQuestion) || isVagueFactual)) return noTrigger;

  const newCount = hallucinationGuardCount + 1;
  return {
    triggered: true,
    action: "continue",
    newGuardCount: newCount,
    assistantEcho: stepContent,
    nudgeMessage:
      "[SYSTEM] HALLUCINATION GUARD: You just stated specific facts/numbers without calling any tool. " +
      "Your training data may be outdated. Call search_web NOW to verify your claims before presenting them. " +
      "Do NOT repeat the same numbers. Get REAL data from tools.",
    thinkingLabel: "Verifying facts with live data... 🔍",
    sseEvent: { type: "agent_step", current: step, max: MAX_AGENT_STEPS, status: "hallucination_guard", reason: isVagueFactual ? "Vague factual answer without tool verification" : "Factual claims without tool verification" },
    stepIncrease: 1, // P0: 2→1
    logMessage: `[HallucinationGuard V2] ${isVagueFactual ? 'Vague factual answer' : 'Factual claims'} detected WITHOUT tool verification (attempt ${newCount}/2). Forcing tool call.`,
  };
}

// ═══ MERGED: checkPostToolGrounding + crossCheckNumericGrounding → checkNumericGrounding ═══
// DRY: Single function with 2 paths — strict VALUE_KEYS cross-check (primary) + broad catch-all (secondary)
export function checkNumericGrounding(
  stepContent: string,
  allToolResults: any[],
  postToolGroundingChecked: boolean,
  step: number,
  MAX_AGENT_STEPS: number,
  sanitizedMessage?: string,
): GuardResult {
  if (postToolGroundingChecked || allToolResults.length === 0 || step >= MAX_AGENT_STEPS - 1 || !stepContent) {
    return { triggered: false, action: "none" };
  }

  // Editorial intent bypass (single check — DRY)
  if (EDITORIAL_INTENT_PATTERNS.test(sanitizedMessage || "")) {
    return { triggered: false, action: "none" };
  }

  const successfulResults = allToolResults.filter((r: any) => !r.error && r.result);

  // ═══ PATH 1 (STRICT): VALUE_KEYS cross-check — highest sensitivity ═══
  if (successfulResults.length > 0) {
    const toolValues = new Set<string>();
    const VALUE_KEYS = ['price', 'balance', 'total', 'amount', 'count', 'rate', 'score', 'new_balance', 'cost', 'revenue', 'profit', 'quantity', 'points'];

    function extractValues(obj: any, depth = 0) {
      if (depth > 4 || !obj || typeof obj !== 'object') return;
      // Extract array lengths as grounded counts
      if (Array.isArray(obj)) {
        if (obj.length >= 1) {
          toolValues.add(String(obj.length));
        }
        obj.forEach(item => extractValues(item, depth + 1));
        return;
      }
      for (const [key, val] of Object.entries(obj)) {
        if (Array.isArray(val) && val.length >= 1) {
          toolValues.add(String(val.length)); // array length = grounded count
        }
        if (typeof val === 'number' && Math.abs(val) >= 2) {
          if (VALUE_KEYS.some(vk => key.toLowerCase().includes(vk))) {
            toolValues.add(String(val));
            if (Number.isInteger(val)) toolValues.add(val.toLocaleString('en-US'));
          }
        } else if (typeof val === 'string' && /^\d[\d,.]+$/.test(val)) {
          toolValues.add(val.replace(/,/g, ''));
        } else if (typeof val === 'object') {
          extractValues(val, depth + 1);
        }
      }
    }

    for (const r of successfulResults) extractValues(r.result);

    if (toolValues.size > 0) {
      const responseNumbers = stepContent.match(/\d[\d,.]+/g) || [];
      const significantNumbers = responseNumbers.filter((n: string) => {
        const clean = n.replace(/,/g, '');
        const num = parseFloat(clean);
        if (num < 2 || isNaN(num)) return false;
        if (Number.isInteger(num) && num >= 1900 && num <= 2099 && clean.length === 4) return false;
        return true;
      });

      if (significantNumbers.length > 0) {
        const mismatched = significantNumbers.filter((n: string) => {
          const clean = n.replace(/,/g, '');
          return !toolValues.has(clean) && !toolValues.has(n);
        });
        const mismatchRatio = mismatched.length / significantNumbers.length;

        // Strict: >30% mismatch AND ≥3 mismatches → trigger
        if (mismatchRatio > 0.3 && mismatched.length >= 3) {
          console.log(`[NumericGrounding-Strict] ${mismatched.length}/${significantNumbers.length} ungrounded (${(mismatchRatio * 100).toFixed(0)}%). Samples: ${mismatched.slice(0, 5).join(', ')}`);
          return {
            triggered: true,
            action: "continue",
            assistantEcho: stepContent,
            nudgeMessage:
              `[SYSTEM] NUMERIC GROUNDING CHECK: ${mismatched.length} numbers in your response do NOT match any values from tool results. ` +
              `Suspicious: ${mismatched.slice(0, 5).join(', ')}. ` +
              `Re-read tool results and use ONLY exact values from the data. Do NOT round, estimate, or insert numbers from your training data.`,
            thinkingLabel: "Verifying numeric accuracy... 🔢",
            sseEvent: { type: "agent_step", current: step, max: MAX_AGENT_STEPS, status: "numeric_grounding", reason: `${mismatched.length} ungrounded numbers detected` },
            logMessage: `[NumericGrounding-Strict] Triggered: ${mismatched.length}/${significantNumbers.length} ungrounded (${(mismatchRatio * 100).toFixed(0)}%)`,
          };
        }

        // ═══ COUNT + FABRICATED QUALIFIER DETECTION ═══
        const COUNT_QUALIFIER_PATTERN = /(\d+)\s+(high|low|medium|urgent|critical|pending|completed|overdue|active|inactive|expired)\s*(?:priority|importance|status)?\s*(?:tasks?|items?|ခု|records?|ရလဒ်)/gi;
        let qualifierMatch;
        while ((qualifierMatch = COUNT_QUALIFIER_PATTERN.exec(stepContent)) !== null) {
          const qualifier = qualifierMatch[2].toLowerCase();
          const rawJson = JSON.stringify(successfulResults).toLowerCase();
          if (!rawJson.includes(qualifier)) {
            console.log(`[SchemaGrounding-CountQualifier] Fabricated qualifier "${qualifier}" in "${qualifierMatch[0]}"`);
            return {
              triggered: true, action: "continue",
              assistantEcho: stepContent,
              nudgeMessage: `[SYSTEM] SCHEMA GROUNDING CHECK: Your response says "${qualifierMatch[0]}" but the qualifier "${qualifier}" does NOT exist anywhere in the tool results. The data has no such attribute. Re-read the tool results and describe ONLY what the data actually contains. Do NOT add qualifiers like priority, status, or urgency unless the data explicitly includes them.`,
              thinkingLabel: "Verifying data schema accuracy... 🔍",
              logMessage: `[SchemaGrounding-CountQualifier] Fabricated qualifier "${qualifier}" not in tool data`,
            };
          }
        }

        // ═══ CRITICAL SINGLE-VALUE CHECK: count, total, balance claims ═══
        const CRITICAL_COUNT_PATTERN = /(\d+)\s*(?:ခု|ရလဒ်|items?|tasks?|transactions?|records?|accounts?|entries)/gi;
        let critMatch;
        while ((critMatch = CRITICAL_COUNT_PATTERN.exec(stepContent)) !== null) {
          const claimedNum = critMatch[1];
          if (parseInt(claimedNum) < 2) continue;
          if (!toolValues.has(claimedNum)) {
            console.log(`[CountGrounding] Claimed ${claimedNum} but grounded values: ${[...toolValues].slice(0, 10).join(', ')}`);
            return {
              triggered: true, action: "continue",
              assistantEcho: stepContent,
              nudgeMessage: `[SYSTEM] COUNT GROUNDING CHECK: You claimed "${critMatch[0]}" but the number ${claimedNum} does NOT match any count in tool results. Actual grounded values: [${[...toolValues].slice(0, 10).join(', ')}]. Re-count from the raw tool data and use the EXACT number.`,
              thinkingLabel: "Verifying count accuracy... 🔢",
              logMessage: `[CountGrounding] Claimed ${claimedNum} but grounded values: ${[...toolValues].slice(0, 10).join(', ')}`,
            };
          }
        }
      }
    }

    // ═══ SCHEMA GROUNDING: detect fabricated attributes ═══
    const ATTRIBUTE_CLAIM_PATTERNS = [
      /(\d+)\s+(high|low|medium|urgent|critical)\s+(priority|importance)/i,
      /\b(priority|status|category|type|level|grade|rank|tier)[\s:]+["']?(\w+)["']?/i,
      /(\d+)\s+(pending|completed|active|inactive|overdue|expired)\s+(tasks?|items?)/i,
    ];

    const toolKeys = new Set<string>();
    function extractSchemaKeys(obj: any, depth = 0) {
      if (depth > 4 || !obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        for (const item of obj) {
          if (item && typeof item === 'object') extractSchemaKeys(item, depth + 1);
        }
        return;
      }
      for (const [key, val] of Object.entries(obj)) {
        toolKeys.add(key.toLowerCase());
        if (typeof val === 'object') extractSchemaKeys(val, depth + 1);
      }
    }
    for (const r of successfulResults) extractSchemaKeys(r.result);

    if (toolKeys.size > 0) {
      for (const pattern of ATTRIBUTE_CLAIM_PATTERNS) {
        const match = stepContent.match(pattern);
        if (match) {
          const claimedAttr = match[2]?.toLowerCase() || match[1]?.toLowerCase();
          const attrExists = [...toolKeys].some(k => k.includes(claimedAttr) || claimedAttr.includes(k));
          if (!attrExists) {
            const rawJson = JSON.stringify(successfulResults).toLowerCase();
            if (!rawJson.includes(claimedAttr)) {
              console.log(`[SchemaGrounding] Fabricated attribute "${claimedAttr}" — not in tool schema keys: ${[...toolKeys].slice(0, 10).join(', ')}`);
              return {
                triggered: true, action: "continue",
                assistantEcho: stepContent,
                nudgeMessage: `[SYSTEM] SCHEMA GROUNDING CHECK: Your response claims "${match[0]}" but the attribute "${claimedAttr}" does NOT exist in the tool results. The data schema has these keys: [${[...toolKeys].slice(0, 15).join(', ')}]. Re-read the tool results and describe ONLY attributes that actually exist. Do NOT invent fields like priority, status, or category unless they appear in the data.`,
                thinkingLabel: "Verifying data schema accuracy... 🔍",
                logMessage: `[SchemaGrounding] Fabricated attribute "${claimedAttr}" — not in tool schema`,
              };
            }
          }
        }
      }
    }
  }

  // ═══ PATH 2 (BROAD): All-numbers catch-all — lower sensitivity ═══
  const responseNumbers = stepContent.match(/\d[\d,.]+/g) || [];
  const toolDataStr = JSON.stringify(allToolResults);
  const toolNumbers = new Set(toolDataStr.match(/\d[\d,.]+/g) || []);
  const ungroundedNumbers = responseNumbers.filter((n: string) => {
    const clean = n.replace(/,/g, '');
    if (parseFloat(clean) < 2) return false;
    const num = parseInt(clean, 10);
    if (num >= 1900 && num <= 2099 && clean.length === 4) return false;
    return !toolNumbers.has(n) && !toolNumbers.has(clean);
  });

  if (ungroundedNumbers.length < 2) return { triggered: false, action: "none" };

  return {
    triggered: true,
    action: "continue",
    assistantEcho: stepContent,
    nudgeMessage:
      "[SYSTEM] POST-TOOL GROUNDING CHECK: Your response contains numbers that do NOT appear in the tool results. " +
      `Suspicious values: ${ungroundedNumbers.slice(0, 5).join(', ')}. ` +
      "Re-read the tool results carefully and use ONLY the exact numbers from the data. " +
      "Do NOT round, estimate, or substitute with your own knowledge.",
    thinkingLabel: "Cross-checking data accuracy... 🔍",
    stepIncrease: 1,
    logMessage: `[NumericGrounding-Broad] ${ungroundedNumbers.length} ungrounded numbers detected: ${ungroundedNumbers.slice(0, 5).join(', ')}`,
  };
}

export function buildReflectionPrompt(
  isDeepQuery: boolean,
  stepContent: string,
  allToolCalls: any[],
  allToolResults: any[],
  reflectionAttempted: boolean,
  step: number,
  MAX_AGENT_STEPS: number,
): GuardResult {
  const primaryToolWasImage = allToolCalls.some(tc => tc.name === 'generate_image');
  if (reflectionAttempted || allToolResults.length === 0 || step >= MAX_AGENT_STEPS - 1 || primaryToolWasImage) {
    return { triggered: false, action: "none" };
  }

  const reflectionPrompt = isDeepQuery
    ? `[SYSTEM] DEEP QUALITY AUDIT — Review your answer above with these STRICT gates:
1. ACCURACY: Did you use data from tool results accurately? Any misquotes or wrong numbers?
2. COMPLETENESS: Did you answer ALL parts of the user's question?
3. DEPTH: Does the response cover ALL findings from tool results? Are there data points being left out? Every relevant fact must be included. Length = Value.
4. SOURCES: Did you cite at least 2 distinct sources with explicit attribution?
5. DIMENSIONS: Does it cover The Now (breaking updates), The Why (context), AND The Next (analysis)?
If ALL 5 checks pass: Re-output your answer as-is (it will replace the draft).
If ANY check fails: Your response is too shallow. Call more tools and expand your analysis. Do NOT apologize, just fix it.`
    : `[SYSTEM] REFLECTION CHECK: Review your answer above.
1. Did you use data from tool results accurately? Any misquotes or wrong numbers?
2. Did you answer ALL parts of the user's question?
3. Is anything missing that another tool call could fill?
If ALL checks pass: Re-output your answer as-is (it will replace the draft).
If ANY check fails: Call the appropriate tool to fix the gap. Do NOT apologize, just fix it.`;

  return {
    triggered: true,
    action: "continue",
    assistantEcho: stepContent,
    nudgeMessage: reflectionPrompt,
    thinkingLabel: isDeepQuery ? "Quality audit in progress... 🧠" : "Reviewing answer for accuracy... 🔍",
    sseEvent: { type: "agent_step", current: step, max: MAX_AGENT_STEPS, status: "reflecting", reason: isDeepQuery ? "Deep quality audit with enhanced gates" : "Self-correction check on tool-based answer" },
    logMessage: `[Agent] Triggering reflection check at step ${step}${isDeepQuery ? " (DEEP QUALITY GATES)" : ""}`,
  };
}

// ═══ P0: runQualityGate — applies to ALL complex queries, threshold 70 ═══
export async function runQualityGate(
  stepContent: string,
  sanitizedMessage: string,
  qualityRequeueAttempted: boolean,
  reflectionAttempted: boolean,
  isDeepQuery: boolean,
  step: number,
  MAX_AGENT_STEPS: number,
  _modelToUse: string,
  _isUsingPersonalKey: boolean,
  _userAISettings: any,
  _hasSystemGoogleKey: boolean,
  _systemKeyCheck: any,
  _hasSystemAnthropicKey: boolean,
  supabase: any,
  userId: string,
  complexity?: "simple" | "moderate" | "complex",
): Promise<GuardResult> {
  // Phase 3: Run for complex queries (with or without reflection) and deep queries after reflection
  const isEligible = (isDeepQuery && reflectionAttempted) || complexity === "complex";
  if (!isEligible || qualityRequeueAttempted || step >= MAX_AGENT_STEPS - 1 || !stepContent) {
    return { triggered: false, action: "none" };
  }

  // P0: Use inline heuristic (saves 1-3s)
  const qualityScore = inlineQualityScore(stepContent, []);
  
  // Phase 3: Lowered threshold from 75 to 70
  if (qualityScore >= 70) {
    console.log(`[QualityGate-P3] Inline score: ${qualityScore}/100. PASS ✓`);
    return { triggered: false, action: "none" };
  }

  // Fire-and-forget forensic log
  Promise.resolve(supabase.from("agent_communication_log").insert({
    requester_agent_id: userId, target_type: "quality_gate",
    query_type: "value_density_validation",
    query_content: `[COMMANDER] -> [ANALYST]: ⚠️ Value-Density Check FAILED (${qualityScore}/100).`,
    response_summary: `[ANALYST] -> [COMMANDER]: Initiating quality-control loop.`,
    was_successful: true,
  })).catch(() => {});

  return {
    triggered: true,
    action: "continue",
    assistantEcho: stepContent,
    nudgeMessage:
      `[SYSTEM] QUALITY GATE FAILED — Score: ${qualityScore}/100 (threshold: 70). ` +
      `Your response lacks specific data points or depth. ` +
      `RECURSIVE QUALITY-CONTROL: READ all tool_results again. EXTRACT every specific data point you missed. ` +
      `Cover ALL dimensions. Include every data point from tool results. Do NOT truncate. Length = Value.`,
    thinkingLabel: `Quality audit: ${qualityScore}/100. Enhancing... 🔍`,
    sseEvent: { type: "agent_step", current: step, max: MAX_AGENT_STEPS, status: "quality_requeue", reason: `Score ${qualityScore}/100 < 70` },
    logMessage: `[QualityGate-P3] Inline score: ${qualityScore}/100. Re-engaging...`,
  };
}

// ═══ TOOL ERROR RE-PLAN GUARD: Analyze → Classify → Retry with refined params ═══
export function checkToolErrorReplan(
  stepToolResults: { name: string; result: any; error?: string }[],
  stepToolCalls: { name: string; arguments?: Record<string, any> }[],
  toolReplanAttempts: Map<string, number>,
  step: number,
  MAX_AGENT_STEPS: number,
): GuardResult & { updatedReplanAttempts: Map<string, number> } {
  const MAX_REPLAN_PER_TOOL = 2;
  const noTrigger = { triggered: false, action: "none" as const, updatedReplanAttempts: toolReplanAttempts };

  if (step >= MAX_AGENT_STEPS - 1) return noTrigger;

  const failedResults = stepToolResults.filter(tr => tr.error);
  if (failedResults.length === 0) return noTrigger;

  // Find a failed tool that hasn't exceeded replan limit
  const replanCandidate = failedResults.find(tr => {
    const attempts = toolReplanAttempts.get(tr.name) || 0;
    return attempts < MAX_REPLAN_PER_TOOL;
  });

  if (!replanCandidate) return noTrigger;

  // Classify error
  const errorStr = String(replanCandidate.error || "").toLowerCase();
  let errorClass: "wrong_params" | "service_unavailable" | "permission_denied" | "rate_limited" | "unknown" = "unknown";
  let replanStrategy = "";

  if (/invalid|missing|required|param|argument|type|format|parse|syntax/i.test(errorStr)) {
    errorClass = "wrong_params";
    // Find original call args
    const originalCall = stepToolCalls.find(tc => tc.name === replanCandidate.name);
    const originalArgs = originalCall?.arguments ? JSON.stringify(originalCall.arguments).slice(0, 200) : "unknown";
    replanStrategy = `ERROR CLASS: wrong_params. Original args: ${originalArgs}. 
FIX: Analyze the error message carefully. Modify the parameters to fix the issue:
- If a required field is missing, add it
- If a value format is wrong, correct it (e.g., date format, number type)
- If an enum value is invalid, check valid options
Call ${replanCandidate.name} again with CORRECTED parameters.`;
  } else if (/timeout|unavailable|503|502|500|network|connection|ECONNREFUSED/i.test(errorStr)) {
    errorClass = "service_unavailable";
    replanStrategy = `ERROR CLASS: service_unavailable. The service is temporarily down.
FIX: Do NOT retry the same tool immediately. Instead:
1. Try an alternative tool that can provide similar data
2. If no alternative exists, wait and inform the user about the temporary issue`;
  } else if (/denied|forbidden|403|unauthorized|permission/i.test(errorStr)) {
    errorClass = "permission_denied";
    replanStrategy = `ERROR CLASS: permission_denied. You don't have access.
FIX: Do NOT retry this tool. Inform the user about the permission limitation and suggest alternatives.`;
  } else if (/rate.?limit|429|too many|throttl/i.test(errorStr)) {
    errorClass = "rate_limited";
    replanStrategy = `ERROR CLASS: rate_limited. Too many requests.
FIX: Do NOT retry immediately. Use cached data or your knowledge as a temporary fallback.`;
  } else {
    replanStrategy = `ERROR CLASS: unknown. Error: "${String(replanCandidate.error).slice(0, 150)}"
FIX: Analyze the error. If it seems parameter-related, fix params and retry.
If it seems systemic, try an alternative approach.`;
  }

  // Update replan attempts
  const updated = new Map(toolReplanAttempts);
  updated.set(replanCandidate.name, (updated.get(replanCandidate.name) || 0) + 1);
  const attempt = updated.get(replanCandidate.name)!;

  // Only auto-retry for wrong_params and unknown (not service/permission/rate)
  if (errorClass === "permission_denied" || errorClass === "rate_limited") {
    return noTrigger;
  }

  return {
    triggered: true,
    action: "continue",
    updatedReplanAttempts: updated,
    assistantEcho: "",
    nudgeMessage: `[SYSTEM] RE-PLAN PROTOCOL (attempt ${attempt}/${MAX_REPLAN_PER_TOOL} for ${replanCandidate.name}):
${replanStrategy}

RULES:
- Do NOT repeat the exact same call with identical parameters
- Analyze the error, modify your approach, then act
- If this is attempt 2/2, consider falling back to alternative tools`,
    thinkingLabel: `Re-planning ${replanCandidate.name}... (${attempt}/${MAX_REPLAN_PER_TOOL}) 🔄`,
    sseEvent: { type: "agent_step", current: step, max: MAX_AGENT_STEPS, status: "replan_retry", reason: `${replanCandidate.name} failed (${errorClass}), re-planning attempt ${attempt}` },
    stepIncrease: 1,
    logMessage: `[ReplanGuard] ${replanCandidate.name} failed (${errorClass}), re-plan attempt ${attempt}/${MAX_REPLAN_PER_TOOL}`,
  };
}

// ═══ POST-TOOL GUARDS ═══

export function checkToolPromiseMismatch(
  sanitizedMessage: string,
  stepToolCalls: any[],
  stepContent: string,
  step: number,
  MAX_AGENT_STEPS: number,
): GuardResult {
  if (step >= MAX_AGENT_STEPS - 1) return { triggered: false, action: "none" };

  const userAskedForImage = IMAGE_INTENT_RE.test(sanitizedMessage);
  const calledImageTool = stepToolCalls.some((tc: any) => tc.name === 'generate_image');
  const calledWrongTool = stepToolCalls.some((tc: any) => tc.name === 'generate_ai_content');

  if (!(userAskedForImage && !calledImageTool && calledWrongTool)) {
    return { triggered: false, action: "none" };
  }

  return {
    triggered: true,
    action: "continue",
    assistantEcho: stepContent || "",
    nudgeMessage:
      "[SYSTEM] TOOL MISMATCH: User asked for an IMAGE but you called generate_ai_content (text-only tool). " +
      "You MUST call generate_image tool to actually generate a visual image. Call generate_image NOW with the user's prompt.",
    thinkingLabel: "Switching to image generation... 🎨",
    sseEvent: { type: "agent_step", current: step, max: MAX_AGENT_STEPS, status: "tool_mismatch_guard", reason: "Image request routed to wrong tool - retrying with generate_image" },
    stepIncrease: 1, // P0: 2→1
    logMessage: `[ToolMismatchGuard] User asked for IMAGE but AI called generate_ai_content. Forcing generate_image.`,
  };
}

export function checkPersistenceProtocol(
  stepToolResults: { name: string; result: any; error?: string }[],
  stepContent: string,
  noResultsRetryAttempted: boolean,
  step: number,
  MAX_AGENT_STEPS: number,
): GuardResult {
  if (noResultsRetryAttempted || step >= MAX_AGENT_STEPS - 2) return { triggered: false, action: "none" };

  const searchToolNames = ['search_web', 'browser_search'];
  const searchResults = stepToolResults.filter(r => searchToolNames.includes(r.name));
  if (searchResults.length === 0) return { triggered: false, action: "none" };

  const allEmpty = searchResults.every(r => {
    if (r.error) return true;
    if (!r.result) return true;
    const resultStr = JSON.stringify(r.result);
    return resultStr.includes('"results":[]') || resultStr.includes('no results') || resultStr.includes('No results') || resultStr.length < 50;
  });

  if (!allEmpty) return { triggered: false, action: "none" };

  return {
    triggered: true,
    action: "continue",
    assistantEcho: stepContent || "Search returned no results.",
    nudgeMessage:
      "[SYSTEM] PERSISTENCE PROTOCOL: Your search returned NO results. Do NOT give up. " +
      "Generate 3 alternative search queries using: (1) broader keywords (e.g., if 'BeeBot Bug Fix' failed, try 'BeeBot Github Issues'), " +
      "(2) remove specific jargon and use common terms, (3) try the query in English if it was in another language. " +
      "If browser_search also fails, try browser_scrape on a relevant known URL. " +
      "NEVER return 'I couldn't find anything' without exhausting ALL search tools. Call search_web or browser_search NOW.",
    thinkingLabel: "Trying alternative search strategies... 🔄",
    sseEvent: { type: "agent_step", current: step, max: MAX_AGENT_STEPS, status: "persistence_retry", reason: "Empty search results - generating alternatives" },
    logMessage: `[PersistenceProtocol] All search results empty. Forcing alternative strategies.`,
  };
}

export async function checkSourceExhaustion(
  stepToolResults: { name: string; result: any; error?: string }[],
  stepContent: string,
  snippetEscalationAttempted: boolean,
  isDeepQuery: boolean,
  step: number,
  MAX_AGENT_STEPS: number,
  supabase: any,
  userId: string,
): Promise<GuardResult> {
  if (snippetEscalationAttempted || step >= MAX_AGENT_STEPS - 2 || !isDeepQuery) {
    return { triggered: false, action: "none" };
  }

  const snippetSearchResults = stepToolResults.filter(r =>
    ['search_web', 'browser_search'].includes(r.name) && !r.error && r.result
  );
  if (snippetSearchResults.length === 0) return { triggered: false, action: "none" };

  const hasOnlySnippets = snippetSearchResults.every(r => {
    const res = r.result;
    if (res.answer && res.answer.length > 500) return false;
    if (res.markdown && res.markdown.length > 500) return false;
    const results = res.results || res.data || [];
    return Array.isArray(results) && results.length > 0 &&
      results.every((item: any) => !item.markdown || item.markdown.length < 300);
  });

  if (!hasOnlySnippets) return { triggered: false, action: "none" };

  try {
    await supabase.from("agent_communication_log").insert({
      requester_agent_id: userId, target_type: "recon",
      query_type: "snippet_escalation",
      query_content: `[COMMANDER] -> [RECON]: Snippets insufficient. Escalating to full article scraping.`,
      response_summary: `[RECON] -> [COMMANDER]: Initiating browser_scrape on top URLs for full content extraction.`,
      was_successful: true,
    });
  } catch { /* non-critical */ }

  return {
    triggered: true,
    action: "continue",
    assistantEcho: stepContent || "Initial search complete.",
    nudgeMessage:
      "[SYSTEM] SOURCE EXHAUSTION PROTOCOL: Your search returned only snippets/metadata, not full article content. " +
      "For a deep research report, you MUST read the actual articles. " +
      "Use browser_scrape on the top 2-3 most relevant URLs from your search results to extract full article content. " +
      "Do NOT report what you 'think' the article says — report what you actually READ. " +
      "Call browser_scrape NOW with the most promising URLs.",
    thinkingLabel: "Escalating to full article analysis... 📄",
    sseEvent: { type: "agent_step", current: step, max: MAX_AGENT_STEPS, status: "source_exhaustion", reason: "Snippet-only results - escalating to full article scrape" },
    logMessage: `[SourceExhaustion] Snippet-only results detected. Instructing article-level scraping.`,
  };
}

export function checkConfirmationLoopBreak(
  stepToolResults: { name: string; result: any; error?: string }[],
): GuardResult {
  const confirmationResult = stepToolResults.find(tr => tr.result?.needs_confirmation);
  if (!confirmationResult) return { triggered: false, action: "none" };

  return {
    triggered: true,
    action: "break",
    logMessage: `[Agent] BREAK MAIN LOOP: Confirmation required, exiting agentic loop`,
  };
}

// ═══ TOOL-FAILURE FABRICATION GUARD (v3 — Per-Tool Failure Detection + Numeric Cross-Check) ═══
export function checkToolFailureFabrication(
  stepContent: string,
  allToolResults: { name: string; result: any; error?: string }[],
  step: number,
  MAX_AGENT_STEPS: number,
): GuardResult {
  if (!stepContent || step >= MAX_AGENT_STEPS - 1 || allToolResults.length === 0) {
    return { triggered: false, action: "none" };
  }

  const failedTools = allToolResults.filter(r => r.error || (r.result && typeof r.result === 'object' && (r.result.error || r.result.success === false)));
  if (failedTools.length === 0) {
    // ═══ v3 DRY: Delegate to merged checkNumericGrounding (strict VALUE_KEYS path) ═══
    return checkNumericGrounding(stepContent, allToolResults, false, step, MAX_AGENT_STEPS);
  }

  const IMAGE_TOOLS = ['generate_image', 'generate_file'];
  if (failedTools.every(t => IMAGE_TOOLS.includes(t.name))) {
    return { triggered: false, action: "none" };
  }

  const successfulTools = allToolResults.filter(r => !r.error && !(r.result && typeof r.result === 'object' && (r.result.error || r.result.success === false)));

  const TOOL_DATA_DOMAINS: Record<string, RegExp[]> = {
    admin_ai_analytics: [/\d+\s*(tokens?|IU)/i, /\d+\s*(requests?|ကြိမ်)/i, /top\s*\d+/i, /consumer/i, /usage/i, /\d+(\.\d+)?\s*(USD|cost)/i],
    admin_user_lookup: [/@[a-zA-Z0-9.]+\.[a-z]{2,}/, /\d+\s*(users?|ယောက်|ဦး)/i],
    admin_system_overview: [/\d+\s*(users?|ယောက်)/i, /success.*rate/i, /total.*credit/i, /circulation/i],
    manage_flowstate: [/\d+(\.\d+)?\s*(MMK|USD|ကျပ်)/i, /balance|ငွေ|လက်ကျန်/i],
    search_web: [/\$[\d,]+/, /\d+(\.\d+)?%/],
    browser_search: [/\$[\d,]+/, /\d+(\.\d+)?%/],
    manage_workspace_task: [/\d+\s*(tasks?|points?|အလုပ်)/i],
  };

  if (successfulTools.length === 0) {
    const fabricationIndicators = [
      /\d{2,}/, /@[a-zA-Z0-9.]+\.[a-z]{2,}/,
      /\d+\s*(users?|ယောက်|ဦး|ခု|items?|records?)/i,
      /top\s*\d+/i,
      /\d+(\.\d+)?\s*(MMK|USD|BTC|ETH|ကျပ်|tokens?)/i,
    ];
    const hasSuspiciousData = fabricationIndicators.some(p => p.test(stepContent));
    if (!hasSuspiciousData) return { triggered: false, action: "none" };

    const failedToolNames = failedTools.map(t => t.name).join(', ');
    return {
      triggered: true,
      action: "continue",
      assistantEcho: stepContent,
      nudgeMessage:
        `[SYSTEM] ZERO-FABRICATION GUARD: ALL tool calls FAILED (${failedToolNames}) but your response contains specific data. ` +
        `This is FORBIDDEN. You MUST NOT invent data when tools fail. ` +
        `Re-write your response to: (1) State which tools failed, (2) Explain the limitation clearly, ` +
        `(3) Suggest the user try again or rephrase. Use "ဒီ data ကို ယခု ရယူ၍ မရပါ" pattern.`,
      thinkingLabel: "Verifying data integrity... 🛡️",
      sseEvent: { type: "agent_step", current: step, max: MAX_AGENT_STEPS, status: "fabrication_guard", reason: `All tools failed but response contains specific data` },
      logMessage: `[FabricationGuard] ALL tools failed (${failedToolNames}) but response contains specific data. Forcing correction.`,
    };
  }

  const failedToolNames = failedTools.map(t => t.name);
  const fabricatedDomains: string[] = [];

  // Narrative fabrication domains — triggers even without numeric claims
  const TOOL_NARRATIVE_DOMAINS: Record<string, RegExp[]> = {
    manage_flowstate: [/ဘဏ္ဍာ|finance|ငွေကြေး|balance|income|expense|ဝင်ငွေ|ထွက်ငွေ|ကောင်းပါတယ်.*ဘဏ္ဍာ|financial.*health/i],
    manage_workspace_task: [/task.*complete|အလုပ်.*ပြီး|workspace|leaderboard|assign/i],
  };

  for (const failedName of failedToolNames) {
    const patterns = TOOL_DATA_DOMAINS[failedName];
    if (!patterns) continue;
    const matchesFailedDomain = patterns.some(p => p.test(stepContent));
    if (matchesFailedDomain) {
      const successfulDataStr = JSON.stringify(successfulTools.map(t => t.result));
      const numbersInResponse = stepContent.match(/\d[\d,.]+/g) || [];
      const ungroundedFromFailed = numbersInResponse.some(n => {
        const clean = n.replace(/,/g, '');
        if (parseFloat(clean) < 2) return false;
        return !successfulDataStr.includes(n) && !successfulDataStr.includes(clean);
      });
      if (ungroundedFromFailed) {
        fabricatedDomains.push(failedName);
      }
    }
  }

  // Narrative fabrication check — catches qualitative claims from failed tool domains
  for (const failedName of failedToolNames) {
    if (fabricatedDomains.includes(failedName)) continue; // already caught
    const narrativePatterns = TOOL_NARRATIVE_DOMAINS[failedName];
    if (!narrativePatterns) continue;
    const matchesNarrative = narrativePatterns.some(p => p.test(stepContent));
    if (matchesNarrative && !successfulTools.some(t => t.name === failedName)) {
      fabricatedDomains.push(failedName);
    }
  }

  if (fabricatedDomains.length === 0) return { triggered: false, action: "none" };

  return {
    triggered: true,
    action: "continue",
    assistantEcho: stepContent,
    nudgeMessage:
      `[SYSTEM] PARTIAL-FAILURE FABRICATION GUARD: These tools FAILED: [${fabricatedDomains.join(', ')}] but your response contains data from their domain. ` +
      `This is FORBIDDEN. You MUST NOT present data from failed tools. ` +
      `Re-write your response: (1) Present data ONLY from successful tools, ` +
      `(2) For each failed tool's domain, state: "ဒီ data ကို ယခု ရယူ၍ မရပါ" ` +
      `(3) Never invent numbers, rankings, or user data.`,
    thinkingLabel: "Cross-checking data sources... 🛡️",
    sseEvent: { type: "agent_step", current: step, max: MAX_AGENT_STEPS, status: "partial_fabrication_guard", reason: `Failed tools [${fabricatedDomains.join(', ')}] but response references their data` },
    logMessage: `[FabricationGuard v2] Partial failure: [${fabricatedDomains.join(', ')}] failed but response contains their domain data. Forcing correction.`,
  };
}

// crossCheckNumericGrounding — REMOVED (DRY: merged into checkNumericGrounding above)

// ═══ CONSTITUTIONAL GUARD V2: 5-Dimension Self-Audit ═══
export function constitutionalSelfCheck(
  stepContent: string,
  sanitizedMessage: string,
  allToolResults: any[],
  personalityMode?: string,
): GuardResult & { corrections: string[] } {
  const noTrigger = { triggered: false, action: "none" as const, corrections: [] };
  if (!stepContent || stepContent.length < 20) return noTrigger;

  const corrections: string[] = [];

  const piiPatterns = [
    { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, type: "email" },
    { pattern: /\b(?:\+?95|09)\d{7,10}\b/g, type: "phone_mm" },
    { pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, type: "phone" },
    { pattern: /\b(sk|pk|api|key|secret|token)[-_]?[A-Za-z0-9]{20,}\b/gi, type: "api_key" },
    { pattern: /AIza[A-Za-z0-9_-]{35}/g, type: "google_api_key" },
  ];

  for (const { pattern, type } of piiPatterns) {
    const matches = stepContent.match(pattern);
    if (matches && matches.length > 0) {
      const toolDataStr = JSON.stringify(allToolResults);
      const isFromTools = matches.some(m => toolDataStr.includes(m));
      if (!isFromTools) {
        corrections.push(`PII_LEAK:${type}:${matches.length} instance(s) detected outside tool data`);
      }
    }
  }

  const userMyanmarRatio = (sanitizedMessage.match(/[\u1000-\u109F]/g) || []).length / Math.max(sanitizedMessage.length, 1);
  const responseMyanmarRatio = (stepContent.match(/[\u1000-\u109F]/g) || []).length / Math.max(stepContent.length, 1);
  
  if (userMyanmarRatio > 0.4 && responseMyanmarRatio < 0.05 && stepContent.length > 100) {
    corrections.push("LANG_MISMATCH: User wrote in Myanmar but response is predominantly English");
  }

  if (allToolResults.length > 0) {
    const fabricationPhrases = [
      /\bapproximately\s+\d/gi, /\baround\s+\d/gi,
      /\bI\s+think\s+(?:the|it|this)/gi, /\bI\s+believe\s+(?:the|it|this)/gi,
      /\bprobably\s+(?:around|about)\s+\d/gi, /\bif\s+I\s+(?:recall|remember)\s+correctly/gi,
    ];
    const fabricationHits = fabricationPhrases.filter(p => p.test(stepContent));
    if (fabricationHits.length >= 2) {
      corrections.push(`FABRICATION_MARKER: ${fabricationHits.length} hedging phrases detected in tool-backed response`);
    }

    // Schema fabrication dimension — detect invented attributes
    const toolJson = JSON.stringify(allToolResults).toLowerCase();
    const FABRICATED_ATTRS = ['priority', 'urgency', 'importance', 'deadline', 'severity'];
    const usedFabricatedAttrs = FABRICATED_ATTRS.filter(attr =>
      stepContent.toLowerCase().includes(attr) && !toolJson.includes(attr)
    );
    if (usedFabricatedAttrs.length > 0) {
      corrections.push(`SCHEMA_FABRICATION: Response references [${usedFabricatedAttrs.join(', ')}] but these fields don't exist in tool data`);
    }
  }

  const mode = personalityMode || "friendly";
  if (mode === "professional") {
    const emojiCount = (stepContent.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
    if (emojiCount > 5) {
      corrections.push(`TONE_MISMATCH: Professional mode but ${emojiCount} emojis detected (max: 3)`);
    }
  } else if (mode === "friendly" || mode === "casual") {
    const formalPhrases = (stepContent.match(/\b(?:furthermore|henceforth|whereas|hereby|therein|notwithstanding)\b/gi) || []).length;
    if (formalPhrases >= 3) {
      corrections.push(`TONE_MISMATCH: ${mode} mode but ${formalPhrases} overly formal phrases detected`);
    }
  }

  const queryWordCount = sanitizedMessage.split(/\s+/).length;
  const responseWordCount = stepContent.split(/\s+/).length;
  
  if (queryWordCount <= 8 && responseWordCount > 300 && allToolResults.length === 0) {
    corrections.push(`EFFICIENCY_GATE: Query is ${queryWordCount} words but response is ${responseWordCount} words (ratio: ${Math.round(responseWordCount/queryWordCount)}x). Be concise.`);
  }

  if (corrections.length === 0) return noTrigger;

  if (corrections.length < 2) {
    console.log(`[ConstitutionalGuard V2] 1 minor issue detected (below threshold): ${corrections[0]}`);
    return noTrigger;
  }

  const correctionSummary = corrections.map(c => `- ${c}`).join('\n');
  console.log(`[ConstitutionalGuard V2] ${corrections.length} dimension(s) failed:\n${correctionSummary}`);

  return {
    triggered: true,
    action: "continue",
    corrections,
    assistantEcho: stepContent,
    nudgeMessage: `[SYSTEM] CONSTITUTIONAL SELF-CHECK V2: ${corrections.length} dimension(s) failed:\n${correctionSummary}\n\nCorrect these issues:\n- PII_LEAK: Remove or redact exposed personal data.\n- LANG_MISMATCH: Respond in the user's language.\n- FABRICATION_MARKER: Replace hedging with exact data or state "data unavailable".\n- TONE_MISMATCH: Adjust tone to match the ${mode} personality mode.\n- EFFICIENCY_GATE: Shorten your response proportionally to query complexity.`,
    thinkingLabel: "Self-audit: correcting output... 🛡️",
    sseEvent: { type: "agent_step", status: "constitutional_guard_v2", reason: corrections.join('; ') },
    logMessage: `[ConstitutionalGuard V2] Triggered: ${corrections.join('; ')}`,
  };
}

// ═══ v18.0.0: ADAPTIVE GUARD PIPELINE — Phase 3: Added replan guard ═══
export type GuardName = "deepResearch" | "antiGhost" | "hallucination" | "postToolGrounding" | "toolFailureFabrication" | "reflection" | "qualityGate" | "replan";

export function getActiveGuards(
  isSimpleMessage: boolean,
  isDeepQuery: boolean,
  complexity: "simple" | "moderate" | "complex" | undefined,
): Set<GuardName> {
  if (isSimpleMessage) {
    console.log("[AdaptiveGuard] Simple message — guards: antiGhost + hallucination");
    return new Set<GuardName>(["antiGhost", "hallucination"]);
  }

  // Complex/deep queries: run ALL guards including replan
  if (isDeepQuery || complexity === "complex") {
    return new Set(["deepResearch", "antiGhost", "hallucination", "postToolGrounding", "toolFailureFabrication", "reflection", "qualityGate", "replan"]);
  }

  // Moderate queries: include replan for error recovery
  console.log("[AdaptiveGuard] Moderate — skipping deepResearch + qualityGate + reflection, including replan");
  return new Set(["antiGhost", "hallucination", "postToolGrounding", "toolFailureFabrication", "replan"]);
}

// ═══ MODULE 4: INLINE QUALITY SCORING V2 ═══
export function inlineQualityScore(
  stepContent: string,
  allToolResults: any[],
): number {
  let score = 50;

  const wordCount = stepContent.split(/\s+/).length;
  if (wordCount > 200) score += 15;
  else if (wordCount > 100) score += 10;
  else if (wordCount > 50) score += 5;

  const citationCount = (stepContent.match(/\*\*[A-Z][^*]+\*\*/g) || []).length;
  const accordingToCount = (stepContent.match(/according to|reports|states|confirms/gi) || []).length;
  score += Math.min(citationCount * 3, 15);
  score += Math.min(accordingToCount * 5, 10);

  const headingCount = (stepContent.match(/^#{1,4}\s/gm) || []).length;
  score += Math.min(headingCount * 3, 12);

  if (allToolResults.length > 0) {
    const successfulTools = allToolResults.filter(r => !r.error && r.result);
    const contentLower = stepContent.toLowerCase();
    const referencedTools = successfulTools.filter(r =>
      contentLower.includes(r.name.replace(/_/g, ' ').toLowerCase()) ||
      contentLower.includes(r.name.toLowerCase())
    );
    const coverage = successfulTools.length > 0 ? referencedTools.length / successfulTools.length : 1;
    score += Math.round(coverage * 15);

    if (successfulTools.length > 0 && referencedTools.length === 0) {
      score -= 20;
    }
  }

  return Math.max(0, Math.min(100, score));
}
