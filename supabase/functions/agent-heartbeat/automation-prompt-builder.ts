// ═══ Automation Prompt Builder ═══
// Wraps a stored scheduled-task prompt with an automation-grade contract:
// context, success criteria, freshness mandate, non-duplication memory, output rules.
//
// CRITICAL: When the user supplies a literal source block (translate/forward/
// summarize_given), the user's words are SACRED. We do not inject web_search,
// 3-item rubrics, or 400-char length floors that fight the user's instruction.

export type IntentClass =
  | "translate"          // user supplied source content to render in another language
  | "forward"            // user supplied content to repost / rebroadcast as-is
  | "summarize_given"    // user supplied content to condense
  | "news"               // agent must FIND fresh news on a topic (no source supplied)
  | "market"
  | "weather"
  | "reminder"
  | "report"
  | "generic";

// User-controlled override values that the UI can write into task_config.intent_override.
export type IntentOverride =
  | "auto"
  | "translate"
  | "forward"
  | "summarize_given"
  | "find_and_report"
  | "research" // legacy alias from older Automate UI
  | "reminder";

export interface PriorRunSummary {
  run_index: number;          // 1 = most recent
  ran_at_iso: string;
  summary: string;            // ≤120 chars
}

export interface BuildPromptInput {
  displayName: string;
  userPrompt: string;          // raw stored prompt
  runNumber: number;           // action_count + 1
  scheduleKind: "one_off" | "recurring" | string;
  nowLocal: string;            // formatted local time
  timezone: string;
  lastStatus?: string | null;
  lastSummary?: string | null;
  lastRunLocal?: string | null;
  priorRuns: PriorRunSummary[];
  deliveryTarget: "telegram" | "in_app" | string;
  // Optional explicit overrides set by user via schedule_task tool
  successCriteriaOverride?: string | null;
  freshnessOverride?: "auto" | "required" | "none" | null;
  // NEW: user-locked intent (skips the classifier entirely when set)
  intentOverride?: IntentOverride | null;
  // NEW: pre-resolved intent (lets caller run the async semantic classifier
  // ahead of time and pass the result in). When provided, we do not classify.
  resolvedIntent?: IntentClass | null;
  // Optional retry context
  retryReasons?: string[] | null;
  // Optional agentic control-plane fields written by Automate UI/tooling.
  agenticProfile?: string | null;
  autonomyLevel?: "assisted" | "autonomous" | "guardian" | string | null;
  contextMemory?: "light" | "deep" | string | null;
  selfHeal?: boolean | null;
  qualityFloor?: number | null;
}

export interface BuildPromptOutput {
  prompt: string;
  intent: IntentClass;
  freshness: "required" | "tool_data" | "none";
  successCriteria: string;
  // NEW: extracted source block (verbatim, untouched). Quality gate uses
  // this to compute proportional length floors and detect fabrication.
  sourceContent: string | null;
}

// ─── Verbatim-mode triggers (regex fallback only) ───
// Burmese + English phrasings that strongly imply "do something to THIS text".
const TRANSLATE_RX =
  /(ဘာသာပြန်|translate(?:\s+(?:this|the|it|to|into))?|render\s+in|in\s+(?:burmese|english|thai|chinese))/i;
const FORWARD_RX =
  /(ပြန်တင်|repost|forward(?:\s+this)?|share\s+this|broadcast\s+this|အောက်က.{0,12}(?:ကို|ထဲက).{0,40}တင်)/i;
const SUMMARIZE_GIVEN_RX =
  /(အကျဉ်းချုပ်.{0,40}(?:အောက်က|ဒီ)|summari[sz]e\s+(?:this|the\s+following|below))/i;

// ─── Topic-search triggers (only fires if NO verbatim trigger matched) ───
const NEWS_RX = /(news|သတင်း|digest|headlines|briefing|recap)/i;
const MARKET_RX = /(market|price|ဈေး|btc|eth|bitcoin|ethereum|stock|forex|gold|crypto|coin|usdt|nasdaq|s&p|dow)/i;
const WEATHER_RX = /(weather|ရာသီဥတု|forecast|temperature|rain|မိုး)/i;
const REMINDER_RX = /(remind|reminder|သတိပေး|မမေ့|don'?t forget|notify me)/i;
const REPORT_RX = /(report|summary|အကျဉ်းချုပ်|weekly|monthly|daily report|recap of|review of)/i;

// ─── Source extraction ───
// Looks for a `---` separator (markdown HR) and treats text after it as the
// inline source block. Falls back to text after Burmese/English "the following:"
// markers. Returns null when no obvious source block is present.
const SOURCE_MARKERS = [
  /\n\s*-{3,}\s*\n([\s\S]+)$/,                         // first --- separator
  /(?:^|\n)\s*-{3,}\s*\n([\s\S]+)$/m,
  /(?:အောက်(?:က|မှာ)\s*(?:သတင်း|စာသား|content|message)?[\s\S]{0,40}?[ကို:။]+)\s*\n([\s\S]+)$/i,
  /(?:the following(?:\s+(?:text|news|message|content))?[:\-]+)\s*\n([\s\S]+)$/i,
];

export function extractSourceContent(prompt: string): string | null {
  if (!prompt) return null;
  for (const rx of SOURCE_MARKERS) {
    const m = prompt.match(rx);
    if (m && m[1] && m[1].trim().length >= 8) {
      return m[1].trim();
    }
  }
  return null;
}

// ─── Regex fallback classifier (sub-millisecond) ───
// Verbatim-modes win over topic-modes whenever a source block is also present.
export function classifyIntent(prompt: string): IntentClass {
  const p = prompt || "";
  const hasSource = extractSourceContent(p) !== null;

  // Verbatim modes — only meaningful when there's actual source content.
  if (hasSource) {
    if (TRANSLATE_RX.test(p)) return "translate";
    if (FORWARD_RX.test(p)) return "forward";
    if (SUMMARIZE_GIVEN_RX.test(p)) return "summarize_given";
    // Source present but no explicit verb → safest default is forward.
    // (User pasted content; they almost never want a 1500-char re-research.)
    return "forward";
  }

  if (MARKET_RX.test(p)) return "market";
  if (WEATHER_RX.test(p)) return "weather";
  if (NEWS_RX.test(p)) return "news";
  if (REPORT_RX.test(p)) return "report";
  if (REMINDER_RX.test(p)) return "reminder";
  return "generic";
}

// ─── Intent classifier (regex-only) ───
// The previous semantic classifier called the Lovable AI Gateway, which is
// disallowed project-wide for BeeBot. This wrapper now delegates to the
// deterministic regex classifier so scheduled tasks never depend on the
// gateway. If we later want a real semantic classifier, it must be wired
// to the user's personal/system provider keys (not the gateway).
export async function classifyIntentSemantic(prompt: string): Promise<IntentClass> {
  return classifyIntent(prompt);
}

// ─── Override → IntentClass mapping ───
function applyOverride(override: IntentOverride | null | undefined, prompt: string): IntentClass | null {
  if (!override || override === "auto") return null;
  switch (override) {
    case "translate":         return "translate";
    case "forward":           return "forward";
    case "summarize_given":   return "summarize_given";
    case "find_and_report": {
      // Pick the most specific topic mode the regex can detect; fall back to news.
      if (MARKET_RX.test(prompt)) return "market";
      if (WEATHER_RX.test(prompt)) return "weather";
      return "news";
    }
    case "research": {
      if (MARKET_RX.test(prompt)) return "market";
      if (WEATHER_RX.test(prompt)) return "weather";
      return "news";
    }
    case "reminder":          return "reminder";
    default:                  return null;
  }
}

function isVerbatimIntent(intent: IntentClass): boolean {
  return intent === "translate" || intent === "forward" || intent === "summarize_given";
}

function defaultSuccessCriteria(intent: IntentClass): string {
  switch (intent) {
    case "translate":
      return "Output ONLY the faithful translation of [SOURCE CONTENT] into the user's target language. " +
             "Preserve length, tone, emoji, line breaks. No added commentary, no extra paragraphs, " +
             "no fabricated sources, no broadcast intros like 'မိတ်ဆွေတို့ ရေ'.";
    case "forward":
      return "Repost [SOURCE CONTENT] as-is, lightly formatted for the channel. " +
             "Preserve every fact, number, name, and emoji. Add nothing new.";
    case "summarize_given":
      return "Condense [SOURCE CONTENT] to ≤30% of its original length. " +
             "Preserve every concrete fact. Introduce no new information, no new sources.";
    case "news":
      return "Deliver ≥3 distinct items. For each: 1-line takeaway and a source name. No filler intros.";
    case "market":
      return "Include the current price, 24h change %, and one concrete actionable insight. Use real numbers, not placeholders.";
    case "weather":
      return "Include temperature range, primary condition, and any advisory. Mention the location explicitly.";
    case "reminder":
      return "1–3 sentence reminder in a warm, direct tone. State exactly what to do and (if known) when.";
    case "report":
      return "Sectioned summary with concrete metrics pulled from the user's data tools (FlowState / Workspace). No vague generalities.";
    default:
      return "Deliver a direct, complete answer to the user's intent. No clarifying questions — this is automation.";
  }
}

function defaultFreshness(intent: IntentClass): "required" | "tool_data" | "none" {
  switch (intent) {
    case "translate":
    case "forward":
    case "summarize_given":
      return "none";  // Verbatim modes NEVER need a web lookup.
    case "news":
    case "market":
    case "weather":
      return "required";
    case "report":
      return "tool_data";
    default:
      return "none";
  }
}

function freshnessLine(freshness: "required" | "tool_data" | "none"): string {
  switch (freshness) {
    case "required":
      return "MUST call web_search (or equivalent live-data tool) for current information. Do NOT rely on training data — it is stale.";
    case "tool_data":
      return "MUST call the relevant data tools (manage_flowstate, manage_workspace_task, etc.) to ground the output in real user data.";
    default:
      return "No external lookup required. Use the user's intent directly.";
  }
}

function outputContract(deliveryTarget: string): string {
  if (deliveryTarget === "telegram") {
    return [
      "DELIVERY: public Telegram channel (broadcast voice).",
      "- Plain text only. No Markdown (#, **, ```).",
      "- Emoji headers OK (🤖💡⚡). • bullets OK.",
      "- Hook-first opening. Collective address (မိတ်ဆွေတို့). No self-reference (ကျွန်တော်/I).",
      "- Max 3000 chars. Short paragraphs. Actionable.",
    ].join("\n");
  }
  return [
    "DELIVERY: personal in-app message (1-to-1 voice).",
    "- Conversational, concise, friendly assistant tone.",
    "- Markdown allowed (lists, bold, code blocks where helpful).",
    "- No forced emoji headers, no broadcast framing.",
    "- Address the user directly.",
  ].join("\n");
}

function agenticContract(input: BuildPromptInput, successCriteria: string): string {
  const autonomy = input.autonomyLevel || "autonomous";
  const memory = input.contextMemory || "deep";
  const qualityFloor = typeof input.qualityFloor === "number" ? input.qualityFloor : 70;
  const selfHeal = input.selfHeal !== false;

  const autonomyLine =
    autonomy === "assisted"
      ? "Autonomy: assisted. Be concise and conservative; do not take risky external actions without explicit instruction."
      : autonomy === "guardian"
      ? "Autonomy: guardian. Think end-to-end, verify before delivery, and protect the user's channel quality even if that means holding back weak output."
      : "Autonomy: autonomous. Complete the task without hand-holding, using tools and context as needed.";

  const memoryLine =
    memory === "light"
      ? "Context memory: light. Use the current task, recent runs, and user profile only when directly useful."
      : "Context memory: deep. Use relevant user memory, channel history, previous automation results, and available data tools to keep continuity across runs.";

  return [
    "[AGENTIC OPERATING CONTRACT]",
    `- Profile: ${input.agenticProfile || "beebot_agentic_era"}.`,
    `- ${autonomyLine}`,
    `- ${memoryLine}`,
    `- Self-heal: ${selfHeal ? "enabled" : "disabled"}. If quality is weak, fix the output before final delivery.`,
    `- Quality floor: ${qualityFloor}/100. Your final answer should be specific enough to pass this bar.`,
    "- Work loop: OBSERVE the task/context, PLAN the minimum useful steps, ACT with tools when required, VERIFY facts/format, then FINALIZE.",
    "- For Telegram channels, write like a capable human operator: clear hook, useful substance, no filler, no fake certainty.",
    `- Success definition for this run: ${successCriteria}`,
  ].join("\n");
}

// Verbatim modes need a much stricter delivery contract — no broadcast hooks,
// no collective address, no manufactured persona.
function verbatimOutputContract(deliveryTarget: string, intent: IntentClass): string {
  const base: string[] = [];
  if (deliveryTarget === "telegram") {
    base.push(
      "DELIVERY: public Telegram channel.",
      "- Plain text only. No Markdown (#, **, ```).",
      "- Preserve the original structure and emoji of [SOURCE CONTENT].",
    );
  } else {
    base.push(
      "DELIVERY: personal in-app message.",
      "- Plain text. Preserve the original structure and emoji of [SOURCE CONTENT].",
    );
  }
  base.push(
    "- DO NOT add 'မိတ်ဆွေတို့ ရေ' or any broadcast greeting.",
    "- DO NOT add a sign-off, share request, or follow-up question.",
    "- DO NOT add section headers (🤖 ... / 💡 ... / ⚡ ...) that were not in [SOURCE CONTENT].",
  );
  if (intent === "translate") {
    base.push(
      "- Output the translation ONLY. Roughly the same length as [SOURCE CONTENT] (±40%).",
      "- If [SOURCE CONTENT] is one sentence, output one sentence.",
    );
  }
  if (intent === "forward") {
    base.push(
      "- Output [SOURCE CONTENT] essentially unchanged. Translate ONLY if explicitly requested.",
    );
  }
  if (intent === "summarize_given") {
    base.push(
      "- Output a single condensed version. ≤30% of original length. No new facts.",
    );
  }
  return base.join("\n");
}

export interface BuildAutomationPromptOptions {
  /** Pre-resolve intent asynchronously before calling the (sync) builder. */
  semanticClassifier?: (prompt: string) => Promise<IntentClass>;
}

/**
 * Async wrapper that resolves intent via the semantic classifier (when no
 * override / pre-resolved intent is supplied) and then delegates to the
 * synchronous builder. Use this from the heartbeat worker.
 */
export async function buildAutomationPromptAsync(
  input: BuildPromptInput,
): Promise<BuildPromptOutput> {
  // 1) Hard override wins — user picked a Mode pill.
  let resolvedIntent: IntentClass | null =
    applyOverride(input.intentOverride ?? null, input.userPrompt);

  // 2) Caller-supplied pre-resolved intent (e.g. from cached classification).
  if (!resolvedIntent && input.resolvedIntent) {
    resolvedIntent = input.resolvedIntent;
  }

  // 3) Otherwise, run the semantic classifier (with regex fallback inside).
  if (!resolvedIntent) {
    try {
      resolvedIntent = await classifyIntentSemantic(input.userPrompt);
    } catch {
      resolvedIntent = classifyIntent(input.userPrompt);
    }
  }

  return buildAutomationPrompt({ ...input, resolvedIntent });
}

export function buildAutomationPrompt(input: BuildPromptInput): BuildPromptOutput {
  // Resolve intent: explicit override > pre-resolved > regex fallback.
  const intent: IntentClass =
    applyOverride(input.intentOverride ?? null, input.userPrompt) ??
    input.resolvedIntent ??
    classifyIntent(input.userPrompt);

  const verbatim = isVerbatimIntent(intent);
  const sourceContent = verbatim ? extractSourceContent(input.userPrompt) : null;

  // Freshness: explicit override wins, otherwise intent default.
  // Verbatim modes ALWAYS coerce freshness to "none" (no web lookup permitted)
  // unless the user explicitly forced "required".
  let freshness: "required" | "tool_data" | "none";
  if (input.freshnessOverride === "required") {
    freshness = "required";
  } else if (input.freshnessOverride === "none") {
    freshness = "none";
  } else if (verbatim) {
    freshness = "none";
  } else {
    freshness = defaultFreshness(intent);
  }

  const successCriteria =
    (input.successCriteriaOverride && input.successCriteriaOverride.trim()) ||
    defaultSuccessCriteria(intent);

  const lines: string[] = [];

  lines.push("[AUTOMATION CONTEXT]");
  lines.push(`- Task: ${input.displayName}`);
  lines.push(`- Run #: ${input.runNumber}`);
  lines.push(`- Triggered: ${input.nowLocal} (${input.timezone}) · Recurrence: ${input.scheduleKind}`);
  lines.push(`- Resolved intent: ${intent}${verbatim ? " (VERBATIM MODE — user supplied source)" : ""}`);
  if (input.lastRunLocal) {
    lines.push(
      `- Last run: ${input.lastRunLocal} → ${input.lastStatus || "unknown"}${
        input.lastSummary ? ` (${input.lastSummary.slice(0, 140)})` : ""
      }`,
    );
  }
  lines.push(
    "- Mode: AUTOMATED EXECUTION. No human is watching live; deliver final, ready-to-use output. No clarifying questions.",
  );

  lines.push("");
  lines.push("[USER INTENT]");
  lines.push(input.userPrompt.trim());

  // ═══ Verbatim source block — this is the user's literal content. Never invent. ═══
  if (verbatim && sourceContent) {
    lines.push("");
    lines.push("[SOURCE CONTENT — DO NOT INVENT, DO NOT EXPAND]");
    lines.push("```");
    lines.push(sourceContent);
    lines.push("```");
    lines.push(
      `(Source length: ${sourceContent.length} chars. Your output should respect this scale.)`,
    );
  }

  lines.push("");
  lines.push("[SUCCESS CRITERIA]");
  lines.push(successCriteria);

  if (!verbatim) {
    lines.push("");
    lines.push(agenticContract(input, successCriteria));
  }

  // Skip the freshness section entirely for verbatim modes — it only
  // confuses the agent into running web searches when the user asked
  // for a translation.
  if (!verbatim || freshness !== "none") {
    lines.push("");
    lines.push("[FRESHNESS REQUIREMENT]");
    lines.push(freshnessLine(freshness));
  }

  if (input.priorRuns && input.priorRuns.length > 0 && !verbatim) {
    // Verbatim modes operate on per-run source content; "do not repeat
    // headlines" doesn't apply and would push the agent to invent variations.
    lines.push("");
    lines.push("[NON-DUPLICATION]");
    lines.push("Recent prior outputs (do NOT repeat headlines, examples, framing, or lead numbers):");
    for (const r of input.priorRuns.slice(0, 3)) {
      lines.push(`- run-${r.run_index} (${r.ran_at_iso}): ${r.summary}`);
    }
    lines.push("Bring something new each run.");
  }

  lines.push("");
  lines.push("[OUTPUT CONTRACT]");
  lines.push(verbatim ? verbatimOutputContract(input.deliveryTarget, intent) : outputContract(input.deliveryTarget));

  if (verbatim) {
    lines.push("");
    lines.push("[NEGATIVE CONSTRAINTS — HARD FAIL IF VIOLATED]");
    lines.push("- DO NOT add intros (no 'မိတ်ဆွေတို့ ရေ', no 'Hello friends').");
    lines.push("- DO NOT add 3-section breakdowns (🤖 / 💡 / ⚡) unless they were in [SOURCE CONTENT].");
    lines.push("- DO NOT cite sources (e.g. 'Source: ...') that were NOT in [SOURCE CONTENT].");
    lines.push("- DO NOT expand a one-line headline into an article.");
    lines.push("- DO NOT add a closing question or 'share with friends' call-to-action.");
    lines.push("- DO NOT call web_search, deep_research, or any browsing tool.");
  }

  lines.push("");
  lines.push("[QUALITY BAR]");
  lines.push("- Concrete > generic. Specific numbers, dates, names, sources.");
  lines.push("- No placeholders (no {…}, [insert …], TODO, Lorem ipsum).");
  lines.push("- No refusals or hedging — this is your job, not a request you can decline.");
  lines.push(
    '- If, after honest tool use, you genuinely cannot meet the success criteria, return ONLY this JSON: {"automation_status":"insufficient_data","reason":"..."}',
  );

  if (input.retryReasons && input.retryReasons.length > 0) {
    lines.push("");
    lines.push("[RETRY CONTEXT]");
    lines.push(`Previous attempt failed quality gate: ${input.retryReasons.join("; ")}`);
    lines.push("Address each issue explicitly in this attempt.");
  }

  return {
    prompt: lines.join("\n"),
    intent,
    freshness,
    successCriteria,
    sourceContent,
  };
}

// Helper for short prior-run summaries (≤120 chars).
export function summarizePrior(text: string | null | undefined, maxLen = 120): string {
  if (!text) return "(no content)";
  const flat = String(text)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= maxLen) return flat;
  return flat.slice(0, maxLen - 1) + "…";
}
