// ═══ Project Phoenix: _shared/prompt-builder.ts ═══
// Extracted from agent-chat/index.ts (lines 3018-3210, 3918-4013, 4177-4824)
// Interfaces, prompt assembly, variable injection, history compression

import { resolveUserName } from "./bee-brain.ts";
import { buildAgenticRuntimeContract } from "./agentic-runtime-contract.ts";

// ═══ ACTIVE AUTOMATIONS CONTEXT — module-level cache (5min TTL per user) ═══
const _activeAutomationsCache = new Map<string, { at: number; block: string }>();
const _AUTOMATIONS_TTL_MS = 5 * 60 * 1000;

async function getActiveAutomationsBlock(supabase: any, userId: string, tz: string): Promise<string> {
  const cacheKey = `${userId}::${tz}`;
  const hit = _activeAutomationsCache.get(cacheKey);
  if (hit && Date.now() - hit.at < _AUTOMATIONS_TTL_MS) return hit.block;

  const { data } = await supabase.from("agent_heartbeats")
    .select("id, display_name, task_config, cron_expression, next_run_at, last_run_at, last_status, last_result, is_active, refire_count")
    .eq("user_id", userId)
    .eq("task_type", "scheduled_task")
    .eq("is_active", true)
    .order("next_run_at", { ascending: true })
    .limit(8);

  const rows = data || [];
  if (rows.length === 0) {
    _activeAutomationsCache.set(cacheKey, { at: Date.now(), block: "" });
    return "";
  }

  const { enrichScheduledTask } = await import("./schedule-humanizer.ts");
  const enriched = rows.slice(0, 5).map((r: any) => enrichScheduledTask(r, tz));
  const lines = enriched.map((t: any, i: number) => {
    const healthMark = t.health === "failing" ? " ⚠️" : t.health === "degraded" ? " ⚡" : "";
    return `  ${i + 1}. ${t.friendly_label} — ${t.schedule_human}; next: ${t.next_run_human}${healthMark}`;
  }).join("\n");
  const moreNote = rows.length > 5 ? `\n  …and ${rows.length - 5} more (call schedule_task action='summary' for full list)` : "";

  const block = `[ACTIVE_AUTOMATIONS] User has ${rows.length} active automation${rows.length === 1 ? "" : "s"} running. Reference these naturally when relevant — DO NOT call schedule_task just to look these up:\n${lines}${moreNote}`;
  _activeAutomationsCache.set(cacheKey, { at: Date.now(), block });
  return block;
}

// ═══ FINANCE CONTEXT — module-level cache (5min TTL per user) ═══
const _financeContextCache = new Map<string, { at: number; block: string }>();
const _FINANCE_TTL_MS = 5 * 60 * 1000;

async function getFinanceContextBlock(supabase: any, userId: string): Promise<string> {
  const hit = _financeContextCache.get(userId);
  if (hit && Date.now() - hit.at < _FINANCE_TTL_MS) return hit.block;

  // Parallel light queries
  const [budgetsRes, invRes] = await Promise.all([
    supabase.from("user_budgets")
      .select("id, name, amount, currency, period, category_id, alert_threshold_pct")
      .eq("user_id", userId).eq("is_active", true).limit(5),
    supabase.from("user_investments")
      .select("symbol, asset_type, quantity, avg_cost_per_unit, current_price, currency, last_priced_at")
      .eq("user_id", userId).limit(20),
  ]);
  const budgets = budgetsRes.data || [];
  const investments = invRes.data || [];
  if (!budgets.length && !investments.length) {
    _financeContextCache.set(userId, { at: Date.now(), block: "" });
    return "";
  }

  const lines: string[] = [];

  if (budgets.length) {
    // Compute current spend per budget (cheap, current period only)
    const now = new Date();
    const summaries: string[] = [];
    for (const b of budgets.slice(0, 3)) {
      let start: Date;
      if (b.period === "weekly") {
        const day = now.getDay(); const monOffset = (day + 6) % 7;
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - monOffset);
      } else if (b.period === "yearly") {
        start = new Date(now.getFullYear(), 0, 1);
      } else {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      let q = supabase.from("user_transactions")
        .select("amount").eq("user_id", userId).eq("type", "expense").eq("currency", b.currency)
        .gte("transaction_date", start.toISOString());
      if (b.category_id) q = q.eq("category_id", b.category_id);
      const { data: txns } = await q;
      const spent = (txns || []).reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      const usedPct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
      const mark = usedPct >= b.alert_threshold_pct ? " ⚠️" : "";
      summaries.push(`  • ${b.name}: ${usedPct}% used (${Math.round(spent).toLocaleString()}/${Number(b.amount).toLocaleString()} ${b.currency})${mark}`);
    }
    lines.push(`Active budgets (${budgets.length}):\n${summaries.join("\n")}`);
  }

  if (investments.length) {
    const byCur: Record<string, { invested: number; value: number }> = {};
    for (const h of investments) {
      const cur = h.currency || "USD";
      const invested = Number(h.quantity) * Number(h.avg_cost_per_unit);
      const price = h.current_price !== null ? Number(h.current_price) : Number(h.avg_cost_per_unit);
      const value = Number(h.quantity) * price;
      byCur[cur] = byCur[cur] || { invested: 0, value: 0 };
      byCur[cur].invested += invested;
      byCur[cur].value += value;
    }
    const portLines = Object.entries(byCur).map(([cur, v]) => {
      const pnl = v.value - v.invested;
      const pnlPct = v.invested > 0 ? Math.round((pnl / v.invested) * 1000) / 10 : 0;
      const sign = pnl >= 0 ? "+" : "";
      return `  • ${cur}: ${Math.round(v.value).toLocaleString()} (${sign}${Math.round(pnl).toLocaleString()}, ${sign}${pnlPct}%)`;
    });
    lines.push(`Portfolio (${investments.length} holdings):\n${portLines.join("\n")}`);
  }

  const block = `[FINANCE_CONTEXT] User's live finance snapshot — reference naturally without re-querying:\n${lines.join("\n")}`;
  _financeContextCache.set(userId, { at: Date.now(), block });
  return block;
}

export interface AgentSettings {
  bot_name: string;
  bot_emoji: string;
  personality_mode: string;
  personality_level: string;
  custom_instructions?: string;
  welcome_shown: boolean;
}

export interface SessionContext {
  userName: string;
  creditBalance: number;
  currentTime: string;
  currentDate: string;
  recentTransactionCount: number;
  apiSource?: string;
  modelUsed?: string;
  usingPersonalKey?: boolean;
  userTimezone?: string;
  userTimezoneOffset?: number;
  userLocale?: string;
  userLocalTime?: string;
  timezoneSource?: "browser_telemetry" | "user_setting" | "fallback";
  sourceChannel?: string;
  // Device telemetry
  screenWidth?: number;
  screenHeight?: number;
  connectionType?: string;
  onlineStatus?: boolean;
  // Extended device identity (Fix 1)
  platform?: string;
  userAgent?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
  deviceType?: string;
  browserName?: string;
  deviceName?: string;
  osName?: string;
  // ═══ Timezone Sovereignty Phase-3: drift + correction telemetry ═══
  deviceNowIso?: string;
  driftMs?: number;
  driftWarning?: string | null;
  timezoneCorrected?: boolean;
  timezoneOffsetLabel?: string;
}

export interface DeviceContext {
  timezone?: string;
  locale?: string;
  currentTime?: string;
  timezoneOffset?: number;
  // ═══ Timezone Sovereignty Phase-3: drift + correction telemetry ═══
  timezoneCorrected?: boolean;        // true if half-hour-zone override fired
  timezoneOffsetLabel?: string;       // "UTC+6:30"
  deviceNowIso?: string;              // device's wall-clock at request time
  driftMs?: number;                   // serverNow - deviceNow (set in agent-chat)
  driftWarning?: string | null;       // human-readable when |drift| > 5min
  effectiveNowMs?: number;            // server's authoritative now anchor
  // Extended sensory telemetry
  screenWidth?: number;
  screenHeight?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
  userAgent?: string;
  platform?: string;
  onlineStatus?: boolean;
  connectionType?: string;
}

export interface ExtendedContext {
  skills?: any;
  trustLevel?: any;
  memories?: any[];
  appState?: any;
  userProfile?: UserProfileData;
}

export interface UserProfileData {
  formality_style?: { dominant: string; frequencies: Record<string, number> };
  language_pattern?: { dominant: string; frequencies: Record<string, number> };
  emoji_preference?: { dominant: string; frequencies: Record<string, number> };
  message_length_pref?: { dominant: string; frequencies: Record<string, number> };
  active_times?: { dominant: string; frequencies: Record<string, number> };
  topic_interests?: { dominant: string; frequencies: Record<string, number> };
  interaction_count?: number;
}

export interface GlobalUserContext {
  totalSessions: number;
  totalMessages: number;
  mostUsedTools: string[];
  accountAgeInDays: number;
  firstInteractionDate: string;
}

export interface RecentMemoriesContext {
  sessionSummaries: { sessionKey: string; summary: any; date: string }[];
  episodicMemories: { summary: string; when: string; topics: string[] }[];
  crossSessionMessages?: string;
  personalKnowledge?: any[];
  dailyLogs?: { date: string; content: string }[];
}

export interface PromptFile {
  id: string;
  file_name: string;
  display_name: string;
  content: string;
  file_type: 'static' | 'dynamic';
  category: string;
  is_active: boolean;
  order_index: number;
  variables: any;
}

export interface PromptVariables {
  bot_name: string;
  bot_emoji: string;
  bot_username: string;
  personality: string;
  personality_style: string;
  user_name: string;
  credit_balance: number;
  current_date: string;
  current_time: string;
  is_admin: boolean;
  trust_level: string;
  trust_level_number: number;
  trust_label: string;
  trust_level_num: number;
  trust_permissions: string;
  can_skip_confirmation: boolean;
  can_batch_actions: boolean;
  memories: string;
  skills: string;
  app_state: string;
  most_active_feature: string;
  workspaces: number;
  enrolled_courses: number;
  ai_content_count: number;
  recent_transactions: number;
  api_source: string;
  model_used: string;
  using_personal_key: boolean;
  custom_instructions: string;
  super_admin_section: string;
  session_context_section: string;
  user_context_section: string;
  memories_section: string;
  skills_section: string;
  trust_section: string;
  app_state_section: string;
  user_profile_section: string;
  global_context_section: string;
  recent_memories_section: string;
  psych_context_section: string;
  user_timezone: string;
  user_timezone_offset: string;
  user_locale: string;
  user_local_time: string;
  is_new_user?: string;
  [key: string]: any;
}

// ═══ PARSE DEVICE IDENTITY FROM USER AGENT (Fix 3) ═══
function parseDeviceIdentity(ua?: string, platform?: string): { deviceType: string; browserName: string; deviceName: string; osName: string } {
  const result = { deviceType: 'Unknown', browserName: 'Unknown', deviceName: 'Unknown Device', osName: 'Unknown' };
  if (!ua) return result;

  // OS detection
  if (/Windows/i.test(ua)) {
    const m = ua.match(/Windows NT ([\d.]+)/);
    const ver: Record<string, string> = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    result.osName = m ? `Windows ${ver[m[1]] || m[1]}` : 'Windows';
    result.deviceType = 'Desktop';
    result.deviceName = 'Windows PC';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    result.osName = 'macOS';
    result.deviceType = 'Desktop';
    result.deviceName = 'Mac';
  } else if (/Android/i.test(ua)) {
    const m = ua.match(/Android ([\d.]+)/);
    result.osName = m ? `Android ${m[1]}` : 'Android';
    result.deviceType = 'Mobile';
    result.deviceName = 'Android Device';
  } else if (/iPad/i.test(ua)) {
    const m = ua.match(/OS ([\d_]+)/);
    result.osName = m ? `iPadOS ${m[1].replace(/_/g, '.')}` : 'iPadOS';
    result.deviceType = 'Tablet';
    result.deviceName = 'iPad';
  } else if (/iPhone/i.test(ua)) {
    const m = ua.match(/OS ([\d_]+)/);
    result.osName = m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iOS';
    result.deviceType = 'Mobile';
    result.deviceName = 'iPhone';
  } else if (/Linux/i.test(ua)) {
    result.osName = 'Linux';
    result.deviceType = 'Desktop';
    result.deviceName = 'Linux PC';
  }

  // Browser detection
  if (/Edg\//i.test(ua)) result.browserName = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) result.browserName = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) result.browserName = 'Safari';
  else if (/Firefox\//i.test(ua)) result.browserName = 'Firefox';

  // Override with platform if available
  if (platform && result.osName === 'Unknown') {
    result.osName = platform;
    result.deviceName = `${platform} Device`;
  }

  return result;
}

// ═══ FETCH SESSION CONTEXT ═══
// PERF: Accepts optional pre-fetched agentSettings to avoid duplicate query
export async function fetchSessionContext(
  supabase: any, userId: string, deviceContext?: DeviceContext,
  prefetchedAgentSettings?: { preferred_name?: string; timezone?: string } | null,
): Promise<SessionContext> {
  try {
    // If agentSettings already fetched in Wave-1, skip the 4th query entirely
    const queries: Promise<any>[] = [
      supabase.from("user_credits").select("balance").eq("user_id", userId).single(),
      supabase.from("profiles").select("full_name").eq("user_id", userId).single(),
      supabase.from("user_transactions").select("id").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    ];
    if (!prefetchedAgentSettings) {
      queries.push(supabase.from("user_agent_settings").select("preferred_name, timezone").eq("user_id", userId).single());
    }

    const results = await Promise.all(queries);
    const credits = results[0];
    const profile = results[1];
    const recentTx = results[2];
    const agentSettingsData = prefetchedAgentSettings || results[3]?.data;

    const now = new Date();
    
    // ═══ TELEMETRY-FIRST TIMEZONE RESOLUTION ═══
    let userLocalTime = "";
    let resolvedTimezone = "UTC";
    let timezoneSource: "browser_telemetry" | "user_setting" | "fallback" = "fallback";
    
    if (deviceContext?.timezone) {
      try {
        resolvedTimezone = deviceContext.timezone;
        timezoneSource = "browser_telemetry";
        userLocalTime = now.toLocaleTimeString('en-US', { 
          hour: '2-digit', minute: '2-digit', timeZone: resolvedTimezone 
        });
        console.log(`[DeviceContext] Timezone (browser): ${resolvedTimezone}, Local time: ${userLocalTime}`);
      } catch (tzError) {
        console.error(`[DeviceContext] Invalid browser timezone ${deviceContext.timezone}:`, tzError);
        resolvedTimezone = "UTC";
        timezoneSource = "fallback";
      }
    }
    else if (agentSettingsData?.timezone) {
      resolvedTimezone = agentSettingsData.timezone;
      timezoneSource = "user_setting";
      console.log(`[DeviceContext] Timezone (user setting): ${resolvedTimezone}`);
    }
    else {
      console.log(`[DeviceContext] No timezone telemetry — using neutral UTC fallback`);
    }

    let currentTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: resolvedTimezone });
    let currentDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: resolvedTimezone });
    if (!userLocalTime) userLocalTime = currentTime;
    
    return {
      userName: resolveUserName(profile?.data?.full_name, null, agentSettingsData?.preferred_name),
      creditBalance: credits?.data?.balance || 0,
      currentTime,
      currentDate,
      recentTransactionCount: recentTx?.data?.length || 0,
      userTimezone: resolvedTimezone,
      userTimezoneOffset: deviceContext?.timezoneOffset,
      userLocale: deviceContext?.locale,
      userLocalTime,
      timezoneSource,
      screenWidth: deviceContext?.screenWidth,
      screenHeight: deviceContext?.screenHeight,
      connectionType: deviceContext?.connectionType,
      onlineStatus: deviceContext?.onlineStatus,
      platform: deviceContext?.platform,
      userAgent: deviceContext?.userAgent,
      viewportWidth: deviceContext?.viewportWidth,
      viewportHeight: deviceContext?.viewportHeight,
      devicePixelRatio: deviceContext?.devicePixelRatio,
      // ═══ Timezone Sovereignty: forward drift telemetry to system prompt ═══
      deviceNowIso: deviceContext?.deviceNowIso,
      driftMs: deviceContext?.driftMs,
      driftWarning: deviceContext?.driftWarning,
      timezoneCorrected: deviceContext?.timezoneCorrected,
      timezoneOffsetLabel: deviceContext?.timezoneOffsetLabel,
      ...parseDeviceIdentity(deviceContext?.userAgent, deviceContext?.platform),
    };
  } catch (error) {
    console.error("Error fetching session context:", error);
    return {
      userName: "User",
      creditBalance: 0,
      currentTime: new Date().toLocaleTimeString(),
      currentDate: new Date().toLocaleDateString(),
      recentTransactionCount: 0,
    };
  }
}

// ═══ COMPRESS OLD HISTORY FOR LONG SESSIONS ═══
export function compressOldHistory(messages: any[]): string {
  const COMPRESSION_THRESHOLD = 30;
  
  if (!messages || messages.length <= COMPRESSION_THRESHOLD) {
    return "";
  }
  
  const oldMessages = messages.slice(0, messages.length - COMPRESSION_THRESHOLD);
  
  const topics: Set<string> = new Set();
  const actions: Set<string> = new Set();
  const keyFacts: string[] = [];
  const toolResultsSummary: string[] = [];
  
  for (const msg of oldMessages) {
    const content = (msg.content || "").toLowerCase();
    
    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        const toolName = tc.name || tc.function?.name;
        if (toolName) actions.add(toolName);
      }
    }
    
    if (msg.tool_results && Array.isArray(msg.tool_results)) {
      for (const tr of msg.tool_results) {
        if (tr.result && !tr.error) {
          if (tr.name === "manage_flowstate" && tr.result.balance !== undefined) {
            toolResultsSummary.push(`FlowState balance was ${tr.result.balance}`);
          }
          if (tr.name === "get_user_info" && tr.result.name) {
            toolResultsSummary.push(`User name: ${tr.result.name}`);
          }
          if (tr.name === "manage_workspace_task" && tr.result.tasks) {
            toolResultsSummary.push(`Had ${tr.result.tasks.length} tasks in workspace`);
          }
        }
      }
    }
    
    if (content.includes("flowstate") || content.includes("ငွေ") || content.includes("expense") || content.includes("income")) topics.add("finance/FlowState");
    if (content.includes("task") || content.includes("အလုပ်") || content.includes("workspace")) topics.add("tasks/workspaces");
    if (content.includes("content") || content.includes("ရေး") || content.includes("caption") || content.includes("article")) topics.add("content creation");
    if (content.includes("course") || content.includes("သင်တန်း") || content.includes("learn")) topics.add("learning/courses");
    if (content.includes("remember") || content.includes("မှတ်") || content.includes("telegram") || content.includes("contact")) topics.add("personal info");
    if (content.includes("image") || content.includes("picture") || content.includes("ပုံ") || content.includes("photo")) topics.add("image analysis");
    
    if (msg.role === "user" && (content.includes("မှတ်ထားပေး") || content.includes("remember"))) {
      keyFacts.push(content.substring(0, 100) + (content.length > 100 ? "..." : ""));
    }
  }
  
  const topicsStr = Array.from(topics).slice(0, 5).join(", ") || "general topics";
  const actionsStr = Array.from(actions).slice(0, 8).join(", ") || "basic interactions";
  const keyFactsStr = keyFacts.length > 0 ? `\nKey requests: ${keyFacts.slice(0, 3).join("; ")}` : "";
  const toolResultsStr = toolResultsSummary.length > 0 ? `\nPrevious data: ${toolResultsSummary.slice(0, 5).join("; ")}` : "";
  
  const messageCount = messages.length;
  const warningNote = messageCount > 45 
    ? `\n⚠️ Session approaching limit (${messageCount}/50 messages). Consider starting new chat for best performance.`
    : "";
  
  return `[📜 EARLIER CONTEXT (${oldMessages.length} older messages):
Topics discussed: ${topicsStr}
Tools used: ${actionsStr}${keyFactsStr}${toolResultsStr}${warningNote}
The conversation continues from message ${oldMessages.length + 1}. Recent messages follow.]`;
}

// ═══ FIX E: PROMPT FILE CACHE — 5min TTL, user-agnostic ═══
const _promptFileCache = new Map<string, { data: PromptFile[]; ts: number }>();
const PROMPT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ═══ PHASE B: STATIC/DYNAMIC PROMPT BOUNDARY ═══
// Claude-inspired: split system prompt into cacheable static + volatile dynamic sections
export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = '\n\n<!-- ═══ DYNAMIC_BOUNDARY ═══ -->\n\n';

// Static prompt cache — persona, rules, tools stay identical across requests for same model
const _staticPromptCache = new Map<string, { content: string; ts: number; hash: string }>();
const STATIC_PROMPT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes — static sections rarely change

export function getStaticPromptCache(cacheKey: string): string | null {
  const entry = _staticPromptCache.get(cacheKey);
  if (entry && (Date.now() - entry.ts) < STATIC_PROMPT_CACHE_TTL) return entry.content;
  if (entry) _staticPromptCache.delete(cacheKey);
  return null;
}

export function setStaticPromptCache(cacheKey: string, content: string): void {
  // Simple hash for change detection
  const hash = String(content.length) + '_' + content.slice(0, 50);
  _staticPromptCache.set(cacheKey, { content, ts: Date.now(), hash });
}

// Mark a section as uncached/volatile (Claude's DANGEROUS_uncachedSystemPromptSection pattern)
export function markUncached(section: string): string {
  return `<!-- UNCACHED_START -->\n${section}\n<!-- UNCACHED_END -->`;
}

// Split assembled prompt into static + dynamic portions
export function splitPromptAtBoundary(prompt: string): { staticPart: string; dynamicPart: string } {
  const idx = prompt.indexOf(SYSTEM_PROMPT_DYNAMIC_BOUNDARY);
  if (idx === -1) {
    // No boundary marker — treat entire prompt as dynamic (backward compat)
    return { staticPart: '', dynamicPart: prompt };
  }
  return {
    staticPart: prompt.slice(0, idx),
    dynamicPart: prompt.slice(idx + SYSTEM_PROMPT_DYNAMIC_BOUNDARY.length),
  };
}

// ═══ FETCH PROMPT FILES ═══
export async function fetchPromptFiles(supabase: any, isAdmin: boolean = true, moduleFilter: string[] | null = null, isSimpleMessage: boolean = false, sourceChannel: string = 'web'): Promise<PromptFile[] | null> {
  // Cache key: user-agnostic (prompt files are global)
  const cacheKey = `${isAdmin}:${isSimpleMessage}:${sourceChannel}:${moduleFilter ? moduleFilter.sort().join(",") : "all"}`;
  const cached = _promptFileCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < PROMPT_CACHE_TTL_MS) {
    console.log(`[Prompt Assembler] Cache HIT (${cached.data.length} files, key: ${cacheKey})`);
    return cached.data;
  }

  try {
    let query = supabase
      .from("agent_prompt_files")
      .select("*")
      .eq("is_active", true)
      .order("order_index", { ascending: true });

    if (isSimpleMessage) {
      query = query.contains("module_tags", ["CORE"]);
    } else if (moduleFilter && moduleFilter.length > 0) {
      // Add TELEGRAM module only if sourceChannel is telegram
      const effectiveModules = sourceChannel === 'telegram' ? [...new Set([...moduleFilter, "TELEGRAM"])] : moduleFilter;
      query = query.or(`module_tags.ov.{${effectiveModules.join(",")}},is_required.eq.true`);
    } else if (!isAdmin) {
      query = query.not("file_name", "in", '("SUPER_AGENT.md","ADMIN_SECTION.md","INTER_AGENT_COLLABORATION.md","TELEGRAM_GROUP_SETUP.md","SUPER_AGENT_OPTIMIZED.md")');
    }

    // Universal Telegram filter: exclude TELEGRAM_GROUP_SETUP.md for non-Telegram channels (even admins)
    if (sourceChannel !== 'telegram') {
      query = query.not("file_name", "eq", "TELEGRAM_GROUP_SETUP.md");
    }

    const { data, error } = await query;
    
    if (error) {
      console.error("[Prompt Assembler] Failed to fetch prompt files:", error);
      return null;
    }
    
    // Store in cache
    if (data && data.length > 0) {
      _promptFileCache.set(cacheKey, { data: data as PromptFile[], ts: Date.now() });
    }

    console.log(`[Prompt Assembler] Fetched ${data?.length || 0} files (admin: ${isAdmin}, modules: ${moduleFilter ? moduleFilter.join(",") : "all"}, simple: ${isSimpleMessage})`);
    return data as PromptFile[];
  } catch (error) {
    console.error("[Prompt Assembler] Error fetching prompts:", error);
    return null;
  }
}

// ═══ VARIABLE INJECTION ═══
export function injectVariables(content: string, variables: PromptVariables): string {
  let result = content;
  
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    const stringValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value ?? '');
    result = result.replace(pattern, stringValue);
  }
  
  // Handle conditional blocks: {{#if variable}}...{{else}}...{{/if}}
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (match, varName, ifBlock, elseBlock = '') => {
      const varValue = variables[varName as keyof PromptVariables];
      if (varValue && varValue !== 'false' && varValue !== '0' && varValue !== '') {
        return ifBlock;
      }
      return elseBlock;
    }
  );
  
  // Handle negative conditionals: {{#unless variable}}...{{/unless}}
  result = result.replace(/\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (match, varName, blockContent) => {
    const varValue = variables[varName as keyof PromptVariables];
    if (!varValue || varValue === 'false' || varValue === '0' || varValue === '') {
      return blockContent;
    }
    return '';
  });
  
  // Safety: remove any unreplaced template tags
  result = result.replace(/\{\{#?\/?(?:if|unless|else)\s*\w*\}\}/g, '');
  result = result.replace(/\{\{\w+\}\}/g, '');
  
  return result;
}

// ═══ QUICK MODULE DETECT (Keyword fallback when Observer is skipped) ═══
export function quickModuleDetect(message: string, isAdmin: boolean): string[] {
  const modules = ["CORE"];
  const lower = message.toLowerCase();
  
  if (/money|budget|spent|expense|income|ငွေ|ကုန်ကျ|ဝင်ငွေ|flowstate|balance|ငွေစာရင်း/i.test(lower)) modules.push("FINANCE");
  if (/write|create|generate|article|ရေး|ဖန်တီး|content|blog|caption/i.test(lower)) modules.push("CONTENT");
  if (/task|team|workspace|အလုပ်|assign|project|todo/i.test(lower)) modules.push("WORKSPACE");
  if (/remember|recall|forget|မှတ်|သတိရ|memory/i.test(lower)) modules.push("MEMORY");
  if (/how|what|help|ဘာလဲ|ဘယ်လို|feature|guide|tutorial/i.test(lower)) modules.push("KNOWLEDGE");
  if (isAdmin && /admin|system|users|manage|hive|agent|dashboard|overview/i.test(lower)) {
    modules.push("ADMIN", "HIVE");
  }
  
  console.log(`[Phoenix] quickModuleDetect: "${message.substring(0, 30)}" → [${modules.join(", ")}]`);
  return modules;
}

// ═══ ASSEMBLE SYSTEM PROMPT ═══
export async function assembleSystemPrompt(
  supabase: any,
  learningContext: any[] | null,
  agentSettings: AgentSettings | null,
  isAdmin: boolean,
  sessionContext?: SessionContext,
  extendedContext?: ExtendedContext,
  globalContext?: GlobalUserContext,
  recentMemories?: RecentMemoriesContext,
  observerModules?: string[] | null,
  userId?: string,
  isSimpleMessage: boolean = false,
  livingMemories?: any[],
  groupContext?: { is_group?: boolean; group_title?: string; group_id?: string | number },
  complexityTier?: string, // ═══ FIX #2: tier-aware THINKING_PROTOCOL injection ═══
  userMessage?: string,    // ═══ 10x: conditional injection by intent ═══
): Promise<string> {
  const botName = agentSettings?.bot_name || "Pututu";
  const botEmoji = agentSettings?.bot_emoji || "🐝";
  const personality = agentSettings?.personality_mode || "friendly";
  
  const personalityStyles: Record<string, string> = {
    friendly: "Be warm and encouraging. Match the user's energy. If they're casual, be casual back. Emojis OK when it fits the vibe.",
    professional: "Be concise, formal, and business-like. Minimal emojis, focus on efficiency.",
    casual: "Full street mode. Slang OK. Sarcasm OK. Match the user's raw energy. Never lecture on language.",
    mentor: "Be wise and guiding, but never preachy. If user vents, acknowledge first, teach second.",
  };
  const personalityStyle = personalityStyles[personality] || personalityStyles.friendly;

  // ═══ PERSONALITY BEHAVIORAL DEPTH (from shared config) ═══
  const { buildPersonalityBehaviorBlock } = await import("./personality-config.ts");
  const behaviorBlock = buildPersonalityBehaviorBlock(personality);
  
  // Build section strings
  let sessionContextSection = "";
  if (sessionContext) {
    const tzSource = (sessionContext as any).timezoneSource || 'unknown';
    const timeDisplay = `${sessionContext.userLocalTime || sessionContext.currentTime} (${sessionContext.userTimezone || 'UTC'})`;
    const tzSourceLabel = tzSource === 'browser_telemetry' ? '✅ Browser Telemetry' 
      : tzSource === 'user_setting' ? '⚙️ User Setting' 
      : '⚠️ Fallback (UTC)';
    
    sessionContextSection = `
[CTX] ${sessionContext.currentDate} | ${timeDisplay} | Ch:${sessionContext.sourceChannel || 'web'} | Locale:${sessionContext.userLocale || 'unknown'}
[USER] ${sessionContext.userName} | Credits:${sessionContext.creditBalance} | RecentTx:${sessionContext.recentTransactionCount}
[ID] Address as "${sessionContext.userName}". "call me X" → update_agent_settings. "what's my info" → recall_user_facts.${sessionContext.apiSource ? `\n[API] ${sessionContext.apiSource} | ${sessionContext.modelUsed} | ${sessionContext.usingPersonalKey ? "Personal" : "Gateway"}` : ""}
[TIME] Cite: "${sessionContext.userLocalTime || sessionContext.currentTime} (${sessionContext.userTimezone || 'UTC'}${(sessionContext as any).timezoneOffsetLabel ? ` · ${(sessionContext as any).timezoneOffsetLabel}` : ''})". Scheduling → user's TZ. ${tzSource === 'fallback' ? 'TZ=fallback, ask refresh.' : ''}${(sessionContext as any).timezoneCorrected ? ' [TZ-corrected for half-hour zone]' : ''}${(sessionContext as any).driftWarning ? ` ⚠️ ${(sessionContext as any).driftWarning} If user mentions a time, trust SERVER time and warn them their device clock is off.` : ''}
[DEV] ${sessionContext.deviceName || '?'} (${sessionContext.deviceType || '?'}) | ${sessionContext.browserName || '?'}/${sessionContext.osName || '?'} | ${sessionContext.screenWidth || '?'}x${sessionContext.screenHeight || '?'} | ${sessionContext.connectionType || '?'}
`;
    // Channel-specific rules (compact)
    if (sessionContext.sourceChannel && sessionContext.sourceChannel !== 'web') {
      const ch = sessionContext.sourceChannel;
      if (ch === 'telegram') {
        sessionContextSection += `[CH:TG] ${groupContext?.is_group ? `Group:"${groupContext.group_title || '?'}"` : 'DM'}. Max 4000 chars. *bold* _italic_ \`code\`. No HTML/tables. ${groupContext?.is_group ? 'Activated by mention/reply.' : ''}\n`;
      } else if (ch === 'webhook') {
        sessionContextSection += `[CH:WH] Brief actionable summary. No follow-ups unless critical.\n`;
      }
    }
    sessionContextSection += `[ACTIVE] ${sessionContext.sourceChannel || 'web'}. "where are you?" → cite this.\n`;
  }
  
  let userContextSection = "";
  if (learningContext && learningContext.length > 0) {
    const preferences = learningContext.filter(c => c.context_type === 'learned_preference');
    const general = learningContext.filter(c => c.context_type !== 'learned_preference');
    const formatItem = (c: any) => {
      const value = typeof c.context_value === 'object' ? JSON.stringify(c.context_value) : c.context_value;
      return `- ${c.context_key} = ${value}`;
    };
    
    if (preferences.length > 0) {
      userContextSection += `
[PREF] Sacred — override all defaults:
${preferences.map(formatItem).join("\n")}
Apply naturally, max 1/response. Never announce.
`;
    }
    
    if (general.length > 0) {
      userContextSection += `
[LEARNED] ${general.map(c => {
  const value = typeof c.context_value === 'object' ? JSON.stringify(c.context_value) : c.context_value;
  return `${c.context_key}=${value}`;
}).join(" | ")}
`;
    }
  }
  
  // Super Admin section — now loaded from DB (SUPER_AGENT_OPTIMIZED.md) via module_tags: ["ADMIN"]
  // Only inject identity badge as minimal hardcoded supplement
  let superAdminSection = "";
  if (isAdmin) {
    superAdminSection = `Your identity shows "Super ${botName}" with elevated badge. You have FULL ADMIN privileges.`;
  }
  
  // Memories section
  let memoriesSection = "";
  if (extendedContext?.memories && extendedContext.memories.length > 0) {
    const memoryEntries = extendedContext.memories.map((m: any) => {
      const contextValue = m.context_value;
      let displayKey = m.context_key || "";
      let displayValue = "";
      
      if (typeof contextValue === 'object' && contextValue !== null) {
        displayKey = contextValue.key || displayKey.replace(/^memory_\w+_/, '').replace(/_/g, ' ');
        displayValue = contextValue.value || JSON.stringify(contextValue);
      } else {
        displayKey = displayKey.replace(/^memory_\w+_/, '').replace(/_/g, ' ');
        displayValue = String(contextValue);
      }
      
      return `- **${displayKey}**: ${displayValue}`;
    }).join("\n");
    
    memoriesSection = `
[FACTS] ${memoryEntries}
Reference only when asked or directly relevant.
`;
  }
  
  // Global context section
  let globalContextSection = "";
  if (globalContext && globalContext.totalMessages > 0) {
    globalContextSection = `
[JOURNEY] Sessions:${globalContext.totalSessions} | Msgs:${globalContext.totalMessages} | Tools:${globalContext.mostUsedTools.slice(0, 3).join(",") || "exploring"} | Since:${globalContext.accountAgeInDays}d ago
Share only when user asks about usage.
`;
  }
  
  // Skills section — Index-Only Pattern (On-Demand Read)
  let skillsSection = "";
  if (extendedContext?.skills && extendedContext.skills.length > 0) {
    const skillLines = extendedContext.skills.map((s: any) => {
      const keywords = s.trigger_keywords?.length ? ` [${s.trigger_keywords.join(", ")}]` : "";
      return `- ${s.skill_name}: ${s.description || "Custom skill"}${keywords}`;
    }).join("\n");
    skillsSection = `
--- SKILL INDEX ---
${skillLines}

To execute: first call "get_skill_details" to read full steps, then "execute_skill".
`;
  }
  
  // Trust section
  let trustSection = "";
  if (extendedContext?.trustLevel) {
    trustSection = `
--- TRUST LEVEL ---

${extendedContext.trustLevel.label} (Level ${extendedContext.trustLevel.level})
${extendedContext.trustLevel.can_skip_confirmation ? "✅ I can execute familiar actions without confirmation" : "⚠️ I will confirm before executing write actions"}
${extendedContext.trustLevel.can_batch_actions ? "✅ I can batch similar actions together" : ""}
`;
  }
  
  // App state section
  let appStateSection = "";
  if (extendedContext?.appState) {
    appStateSection = `
--- YOUR APP JOURNEY ---

📊 Most Active: ${extendedContext.appState.most_active_feature || 'Exploring'}
💼 Workspaces: ${extendedContext.appState.workspaces || 0}
📚 Enrolled Courses: ${extendedContext.appState.enrolled_courses || 0}
✍️ AI Content Created: ${extendedContext.appState.ai_content_count || 0}
💰 Recent Transactions: ${extendedContext.appState.recent_transactions || 0}
`;
  }
  
  // User profile section
  let userProfileSection = "";
  if (extendedContext?.userProfile && Object.keys(extendedContext.userProfile).length > 0) {
    const profile = extendedContext.userProfile;
    userProfileSection = `
--- LEARNED USER PROFILE ---

Based on our conversations, I've learned about you:
- **Communication Style**: ${profile.formality_style?.dominant || "unknown"}
- **Language Preference**: ${profile.language_pattern?.dominant || "mixed"}
- **Emoji Usage**: ${profile.emoji_preference?.dominant || "moderate"}
- **Preferred Response Length**: ${profile.message_length_pref?.dominant || "moderate"}
- **Most Active Time**: ${profile.active_times?.dominant || "varies"}
- **Topic Interests**: ${profile.topic_interests?.dominant?.replace(",", ", ") || "exploring"}
- **Total Interactions**: ${profile.interaction_count || 0}

ADAPT your responses to match their communication style naturally.
`;
  }
  
  // ═══ PHOENIX: LAZY-LOAD DEEP CONTEXT (only when needed) ═══
  let psychContextSection = "";
  const needsDeepContext = !isSimpleMessage && (
                           observerModules?.includes("MEMORY") || 
                           observerModules?.includes("FINANCE") ||
                           observerModules?.includes("CORE") === false ||
                           (recentMemories?.sessionSummaries?.length || 0) >= 3);
  
  if (userId && needsDeepContext) {
    try {
      const [moodResult, patternsResult, traitsResult, commStyleResult, psychProfileResult] = await Promise.all([
        supabase
          .from("agent_learning_context")
          .select("context_value")
          .eq("user_id", userId)
          .eq("context_type", "mood_state")
          .eq("context_key", "current_mood")
          .single(),
        supabase
          .from("agent_learning_context")
          .select("context_key, context_value")
          .eq("user_id", userId)
          .eq("context_type", "behavioral_pattern")
          .gte("usage_count", 5)
          .order("usage_count", { ascending: false })
          .limit(3),
        supabase
          .from("agent_learning_context")
          .select("context_value")
          .eq("user_id", userId)
          .eq("context_type", "auto_learned")
          .in("context_key", ["personality_traits", "dark_traits", "coping_style", "humor_style", "stress_triggers"]),
        supabase
          .from("agent_learning_context")
          .select("context_value")
          .eq("user_id", userId)
          .eq("context_type", "auto_learned")
          .in("context_key", ["communication_preference", "response_style_pref", "language_comfort"]),
        supabase
          .from("user_psych_profile")
          .select("traits, mood_history, dark_traits, interaction_style, behavioral_patterns")
          .eq("user_id", userId)
          .single(),
      ]);

      const moodData = moodResult.data;
      const patterns = patternsResult.data;
      const traits = traitsResult.data;
      const commStyle = commStyleResult.data;
      const psychProfile = psychProfileResult.data;

      let moodAnalysis = "No mood data yet";
      if (psychProfile?.mood_history && Array.isArray(psychProfile.mood_history) && psychProfile.mood_history.length > 0) {
        const latestMood = psychProfile.mood_history[psychProfile.mood_history.length - 1];
        const valenceLabel = latestMood.valence > 0.3 ? 'positive' : latestMood.valence < -0.3 ? 'negative' : 'neutral';
        moodAnalysis = `${latestMood.primary_emotion} (intensity: ${latestMood.intensity}/1.0, valence: ${valenceLabel})`;
        if (psychProfile.mood_history.length >= 3) {
          const recentMoods = psychProfile.mood_history.slice(-3).map((m: any) => m.primary_emotion);
          moodAnalysis += ` | Recent trend: ${recentMoods.join(" → ")}`;
        }
      } else if (moodData?.context_value) {
        const mood = moodData.context_value;
        const valenceLabel = mood.valence > 0.3 ? 'positive' : mood.valence < -0.3 ? 'negative' : 'neutral';
        moodAnalysis = `${mood.primary_emotion} (intensity: ${mood.intensity}/1.0, valence: ${valenceLabel})`;
      }

      let darkTraitsStr = "None observed yet";
      if (psychProfile?.dark_traits) {
        darkTraitsStr = psychProfile.dark_traits;
      } else if (traits && traits.length > 0) {
        const traitParts = traits.map((t: any) => {
          const val = t.context_value;
          return typeof val === 'object' && val?.value ? val.value : String(val);
        });
        darkTraitsStr = traitParts.join("; ");
      }

      let commPrefStr = "Adapting...";
      if (psychProfile?.interaction_style && psychProfile.interaction_style !== 'neutral') {
        commPrefStr = psychProfile.interaction_style;
      } else if (commStyle && commStyle.length > 0) {
        const commParts = commStyle.map((c: any) => {
          const val = c.context_value;
          return typeof val === 'object' && val?.value ? val.value : String(val);
        });
        commPrefStr = commParts.join("; ");
      }

      let personalityTraitsStr = "";
      if (psychProfile?.traits && typeof psychProfile.traits === 'object' && Object.keys(psychProfile.traits).length > 0) {
        const traitEntries = Object.entries(psychProfile.traits)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        personalityTraitsStr = `\n**Personality Traits (Big Five):** ${traitEntries}`;
      }

      let behaviorStr = "";
      if (patterns && patterns.length > 0) {
        const patternLines = patterns.map((p: any) => {
          const val = p.context_value;
          if (val?.topic && val?.dominant_time) {
            return `- Discusses "${val.topic}" mostly during ${val.dominant_time} (${val.total_occurrences || '5+'}x observed)`;
          }
          return null;
        }).filter(Boolean);
        if (patternLines.length > 0) {
          behaviorStr = patternLines.join("\n");
        }
      }

      let structuredMemoriesStr = "";
      if (livingMemories && livingMemories.length > 0) {
        const memLines = livingMemories.map((m: any) => 
          `- [${m.category}] ${m.content || m.memory_value || m.content_summary} (confidence: ${m.confidence || m.similarity || 0.5})`
        );
        structuredMemoriesStr = `\n**Structured Knowledge About User:**\n${memLines.join("\n")}`;
        console.log(`[LivingMemory] Using ${livingMemories.length} pre-fetched memories`);
      }

      psychContextSection = `
[PSYCH] Mood:${moodAnalysis} | Traits:${darkTraitsStr} | Style:${commPrefStr}${personalityTraitsStr}
${behaviorStr ? `Patterns: ${behaviorStr}` : ""}${structuredMemoriesStr}
Match mood energy. Use memories silently. Never mention profiling.
`;
    } catch (e) {
      // Non-critical, continue without psych context
    }
  }
  
   // ═══ PHASE 3: RECENT MEMORIES SECTION ═══
 let recentMemoriesSection = "";
 if (recentMemories && (recentMemories.sessionSummaries.length > 0 || recentMemories.episodicMemories.length > 0)) {
   let memoriesContent = "";

   if (recentMemories.sessionSummaries.length > 0) {
     memoriesContent += "PAST SESSIONS:\n";
     for (const session of recentMemories.sessionSummaries) {
       const topics = session.summary?.topics?.join(", ") || "general";
       const keyFacts = session.summary?.key_facts?.slice(0, 3).join("; ") || "";
       memoriesContent += `- ${session.date}: ${topics}${keyFacts ? ` | ${keyFacts}` : ""}\n`;
     }
   }

   if (recentMemories.episodicMemories.length > 0) {
     memoriesContent += "KEY MOMENTS:\n";
     for (const memory of recentMemories.episodicMemories.slice(0, 7)) {
       memoriesContent += `- ${memory.when}: ${memory.summary.substring(0, 200)}\n`;
     }
   }

   if (recentMemories.crossSessionMessages) {
     memoriesContent += "RECENT MESSAGES (other sessions):\n";
     memoriesContent += recentMemories.crossSessionMessages + "\n";
   }

   // ═══ PHASE 5: DAILY LOGS CONTEXT (Tier-based budget cap) ═══
   const dailyLogs = (recentMemories as any)?.dailyLogs;
   if (dailyLogs && dailyLogs.length > 0) {
     // Tier-based daily log budget: moderate=0, complex=2×600, deep=3×800, ultra-deep=5×1200
     const complexityTier = (recentMemories as any)?._complexityTier;
     const logBudget = complexityTier === 'moderate' ? { count: 0, chars: 0 }
       : complexityTier === 'complex' ? { count: 2, chars: 600 }
       : complexityTier === 'deep' ? { count: 3, chars: 800 }
       : { count: 5, chars: 1200 }; // ultra-deep or default
     
     const cappedLogs = dailyLogs.slice(0, logBudget.count);
     if (cappedLogs.length > 0) {
       memoriesContent += "\n📅 **Daily Memory Logs (Cross-Session Summary):**\n";
       for (const log of cappedLogs) {
         memoriesContent += `📅 **${log.date}:**\n${(log.content || "").slice(0, logBudget.chars)}${log.content?.length > logBudget.chars ? "..." : ""}\n\n`;
       }
       console.log(`[DailyMemory] Injected ${cappedLogs.length}/${dailyLogs.length} daily logs (tier: ${complexityTier || 'default'}, cap: ${logBudget.count}×${logBudget.chars})`);
     }
     
     // Safety Net 3: When logs are capped, inject fallback directive
     if (cappedLogs.length < dailyLogs.length) {
       memoriesContent += `\nNOTE: Daily logs limited to recent ${cappedLogs.length} days. For older context, recall_episodic_memory has extended history pre-loaded. If user references events older than ${cappedLogs.length} days, use recall_episodic_memory tool.\n`;
     }
   }

   // Personal Knowledge Base
   const personalKnowledge = (recentMemories as any)?.personalKnowledge;
   if (personalKnowledge && personalKnowledge.length > 0) {
     memoriesContent += "PERSONAL KNOWLEDGE:\n";
     for (const kb of personalKnowledge.slice(0, 5)) {
       const tagsStr = kb.tags?.length > 0 ? ` [${kb.tags.join(", ")}]` : "";
       memoriesContent += `- ${kb.title}${tagsStr}: ${(kb.content || "").slice(0, 300)}\n`;
     }
     console.log(`[ProactiveBrain] Injected ${personalKnowledge.length} personal knowledge items into prompt`);
   }

   // Anti-hallucination directive when memory is sparse
   const totalMemoryItems = (recentMemories.sessionSummaries?.length || 0) 
     + (recentMemories.episodicMemories?.length || 0);

   recentMemoriesSection = `
[MEM] ${memoriesContent}
${totalMemoryItems < 3 ? `Memory limited (${totalMemoryItems} items). ` : ""}If asked about past & empty → call recall_episodic_memory first. Never fabricate.${personalKnowledge?.length > 0 ? " Cite saved knowledge naturally." : ""}
`;

   // ═══ MEMORY INJECTION AUDIT LOG ═══
   const complexityTierForAudit = (recentMemories as any)?._complexityTier || 'unknown';
   const auditStats = {
     tier: complexityTierForAudit,
     sessionSummaries: recentMemories.sessionSummaries?.length || 0,
     episodicMemories: recentMemories.episodicMemories?.length || 0,
     dailyLogs: dailyLogs?.length || 0,
     crossSessionMsgs: recentMemories.crossSessionMessages ? 1 : 0,
     personalKB: personalKnowledge?.length || 0,
     totalFragments: totalMemoryItems + (dailyLogs?.length || 0) + (personalKnowledge?.length || 0) + (recentMemories.crossSessionMessages ? 1 : 0),
     memorySectionTokensEst: Math.ceil(memoriesContent.length / 4),
   };
   console.log(`[MemoryAudit] Injection summary: ${JSON.stringify(auditStats)}`);
  }
  
  const customInstructions = agentSettings?.custom_instructions || "";
  
  // ═══ FETCH BOT USERNAME (Anti-Hallucination Identity Fix) ═══
  let botUsername = "";
  let groupBotUsername = "";
  let creatorDisplayName = "Pututu User";
  if (userId) {
    try {
      const [botSettingsResult, profileResult] = await Promise.all([
        supabase.from('bot_settings')
          .select('bot_username, telegram_bot_token, group_bot_username, group_bot_token')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase.from('profiles')
          .select('full_name')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);
      const botSettingsData = botSettingsResult?.data;
      creatorDisplayName = profileResult?.data?.full_name || 'Pututu User';
      
      botUsername = botSettingsData?.bot_username ? `@${botSettingsData.bot_username}` : "";
      groupBotUsername = botSettingsData?.group_bot_username ? `@${botSettingsData.group_bot_username}` : "";
      
      // Proactive auto-heal: if no username cached but token exists, discover via getMe
      if (!botUsername && botSettingsData?.telegram_bot_token) {
        try {
          const meResp = await fetch(
            `https://api.telegram.org/bot${botSettingsData.telegram_bot_token}/getMe`
          );
          const meData = await meResp.json();
          if (meData.ok && meData.result?.username) {
            botUsername = `@${meData.result.username}`;
            await supabase.from('bot_settings')
              .update({ bot_username: meData.result.username })
              .eq('user_id', userId);
            console.log(`[Identity AutoHeal] Discovered and cached bot username: ${botUsername}`);
          }
        } catch (e) {
          console.warn("[Identity AutoHeal] getMe call failed, continuing without username");
        }
      }
      
      // Auto-heal group bot username
      if (!groupBotUsername && botSettingsData?.group_bot_token) {
        try {
          const grpResp = await fetch(
            `https://api.telegram.org/bot${botSettingsData.group_bot_token}/getMe`
          );
          const grpData = await grpResp.json();
          if (grpData.ok && grpData.result?.username) {
            groupBotUsername = `@${grpData.result.username}`;
            await supabase.from('bot_settings')
              .update({ group_bot_username: grpData.result.username })
              .eq('user_id', userId);
            console.log(`[Identity AutoHeal] Group bot username discovered: ${groupBotUsername}`);
          }
        } catch (e) {
          console.warn("[Identity AutoHeal] Group bot getMe failed, continuing");
        }
      }
    } catch (e) {
      console.warn("[Identity] Failed to fetch bot_settings:", e);
    }
  }
  
  // Build complete variables object
  const variables: PromptVariables = {
    bot_name: botName,
    is_new_user: (globalContext?.totalMessages || 0) === 0 ? "true" : "",
    bot_emoji: botEmoji,
    bot_username: botUsername,
    group_bot_username: groupBotUsername,
    creator_name: creatorDisplayName,
    personality: personality,
    personality_style: personalityStyle,
    user_name: sessionContext?.userName || "User",
    credit_balance: sessionContext?.creditBalance || 0,
    current_date: sessionContext?.currentDate || new Date().toLocaleDateString(),
    current_time: sessionContext?.currentTime || new Date().toLocaleTimeString(),
    is_admin: isAdmin,
    trust_level: extendedContext?.trustLevel?.label || "Default",
    trust_level_number: extendedContext?.trustLevel?.level || 1,
    trust_label: extendedContext?.trustLevel?.label || "Default",
    trust_level_num: extendedContext?.trustLevel?.level || 1,
    trust_permissions: extendedContext?.trustLevel?.can_skip_confirmation
      ? "✅ I can execute familiar actions without confirmation"
      : "⚠️ I will confirm before executing write actions",
    can_skip_confirmation: extendedContext?.trustLevel?.can_skip_confirmation || false,
    can_batch_actions: extendedContext?.trustLevel?.can_batch_actions || false,
    memories: extendedContext?.memories?.map(m => `${m.context_key}: ${m.context_value}`).join(", ") || "",
    skills: extendedContext?.skills?.map((s: any) => s.skill_name).join(", ") || "",
    app_state: extendedContext?.appState ? JSON.stringify(extendedContext.appState) : "",
    most_active_feature: extendedContext?.appState?.most_active_feature || "Exploring",
    workspaces: extendedContext?.appState?.workspaces || 0,
    enrolled_courses: extendedContext?.appState?.enrolled_courses || 0,
    ai_content_count: extendedContext?.appState?.ai_content_count || 0,
    recent_transactions: sessionContext?.recentTransactionCount || 0,
    api_source: sessionContext?.apiSource || "gateway",
    model_used: sessionContext?.modelUsed || "gemini-3.5-flash",
    using_personal_key: sessionContext?.usingPersonalKey || false,
    custom_instructions: customInstructions,
    super_admin_section: superAdminSection,
    session_context_section: sessionContextSection,
    user_context_section: userContextSection,
    memories_section: memoriesSection,
    skills_section: skillsSection,
    trust_section: trustSection,
    app_state_section: appStateSection,
    user_profile_section: userProfileSection,
    global_context_section: globalContextSection,
    recent_memories_section: recentMemoriesSection,
    psych_context_section: psychContextSection,
    user_timezone: sessionContext?.userTimezone || "UTC",
    user_timezone_offset: sessionContext?.userTimezoneOffset !== undefined ? String(sessionContext.userTimezoneOffset) : "0",
    user_locale: sessionContext?.userLocale || "en-US",
    user_local_time: sessionContext?.userLocalTime || sessionContext?.currentTime || "",
  };
  
  // Try to fetch prompts from database
  const promptFiles = await fetchPromptFiles(supabase, isAdmin, observerModules || null, isSimpleMessage, sessionContext?.sourceChannel || 'web');
  
  if (promptFiles && promptFiles.length > 0) {
    console.log(`[Prompt Assembler] Loaded ${promptFiles.length} prompt files from database`);
    
    const assembledParts: string[] = [];
    
    for (const file of promptFiles) {
      const processedContent = injectVariables(file.content, variables);
      if (processedContent.trim()) {
        assembledParts.push(processedContent);
      }
    }
    
    // POST-ACTION ANALYSIS & TOOL RESPONSE PROTOCOL now loaded from DB prompt file
    {}

    // ═══ PHASE B: Insert DYNAMIC_BOUNDARY between static (prompt files) and dynamic (user context) sections ═══
    // Static = persona rules, tool instructions, protocols (from DB prompt files)
    // Dynamic = session context, memories, user profile, psych context (injected via variables)
    let finalPrompt = assembledParts.join("\n\n") + SYSTEM_PROMPT_DYNAMIC_BOUNDARY + behaviorBlock + "\n";

    // ═══ 10x P1.1: CONDITIONAL injection — only load heavy capability modules when intent matches ═══
    // Saves ~3,200 chars / turn on ~80% of turns where finance/scheduler aren't relevant.
    const lowerMsg = (userMessage || "").toLowerCase();
    const SCHEDULER_RX = /\b(schedule|automation|automate|every\s+(day|morning|monday|week|month)|daily|weekly|monthly|remind|reminder|cron|recurring)\b|နေ့တိုင်း|အပတ်တိုင်း|လစဉ်|အလိုအလျောက်|မနက်တိုင်း|ည.{0,2}တိုင်း/i;
    const FINANCE_RX = /\b(money|expense|income|budget|balance|cashflow|portfolio|investment|stock|crypto|bitcoin|btc|forecast|tax|spend|spent|earn|earning|saving|debt|profit|loss|p&?l|account|wallet|transaction|telegram\s+(post|broadcast)|broadcast)\b|ငွေ|ဈေး|ကုန်ကျ|ဝင်ငွေ|ဘတ်ဂျက်|ရင်းနှီးမြှုပ်နှံ|အမြတ်|အရှုံး|သုံးထား|ဝင်ထား/i;
    const wantsScheduler = (observerModules?.includes("SCHEDULER") || observerModules?.includes("AUTOMATION")) || SCHEDULER_RX.test(lowerMsg);
    const wantsFinance   = observerModules?.includes("FINANCE") || FINANCE_RX.test(lowerMsg);

    if (wantsScheduler) {
      const { AUTOMATION_CAPABILITY } = await import("./bee-brain-persona.ts");
      finalPrompt += "\n" + AUTOMATION_CAPABILITY + "\n";
    }
    if (wantsFinance) {
      const { FINANCE_EXPERTISE } = await import("./bee-brain-persona.ts");
      finalPrompt += "\n" + FINANCE_EXPERTISE + "\n";
    }

    // ═══ ACTIVE AUTOMATIONS CONTEXT (cached 5min per user) — only when scheduler intent ═══
    if (userId && wantsScheduler) {
      try {
        const tz = (sessionContext as any)?.userTimezone || "UTC";
        const block = await getActiveAutomationsBlock(supabase, userId, tz);
        if (block) finalPrompt += "\n" + block + "\n";
      } catch (e) {
        console.warn("[Prompt Assembler] Could not inject ACTIVE_AUTOMATIONS context", e);
      }
    }

    // ═══ FINANCE CONTEXT (cached 5min per user) — only when finance intent ═══
    if (userId && wantsFinance) {
      try {
        const block = await getFinanceContextBlock(supabase, userId);
        if (block) finalPrompt += "\n" + block + "\n";
      } catch (e) {
        console.warn("[Prompt Assembler] Could not inject FINANCE_CONTEXT", e);
      }
    }

    // Inject Notion connected context
    if (userId && !groupContext?.is_group) {
      try {
        const { data: notionCheck } = await supabase
          .from("ai_user_settings")
          .select("notion_api_key")
          .eq("user_id", userId)
          .maybeSingle();
        if (notionCheck?.notion_api_key) {
          finalPrompt += "\n[NOTION CONNECTED] User has Notion workspace linked. Use manage_notion tool to search, create, edit pages and query databases when user asks about Notion.\n";
          console.log("[Prompt Assembler] Injected Notion connected context");
        }
      } catch (e) {
        console.warn("[Prompt Assembler] Could not check Notion config", e);
      }
    }

    // Inject SOUL Identity if available — fallback to derived mini-soul when empty.
    if (userId) {
      try {
        const { data: soulConfig } = await supabase
          .from("agent_soul_config")
          .select("soul_text")
          .eq("user_id", userId)
          .single();

        if (soulConfig?.soul_text) {
          finalPrompt = `[CORE IDENTITY & SOUL]\n${soulConfig.soul_text}\n\n[SYSTEM INSTRUCTIONS]\n${finalPrompt}`;
          console.log(`[Prompt Assembler] Injected User SOUL profile (${soulConfig.soul_text.length} chars)`);
        } else {
          // FIX (10x): agent_soul_config is empty for ~50+ users → build a lightweight derived soul
          // from pinned user_memories + top learned-profile signals. Cheap, ~200-400 tokens, warm context for cold users.
          const [pinnedRes, profileRes] = await Promise.all([
            supabase
              .from("user_memories")
              .select("category, content")
              .eq("user_id", userId)
              .eq("is_active", true)
              .eq("pinned", true)
              .limit(5),
            supabase
              .from("agent_learning_context")
              .select("context_key, context_value")
              .eq("user_id", userId)
              .eq("is_active", true)
              .like("context_key", "profile_%")
              .order("usage_count", { ascending: false })
              .limit(5),
          ]);
          const pinnedLines = (pinnedRes.data || []).map((m: any) => `- ${m.content}`);
          const profileLines = (profileRes.data || []).map((p: any) => {
            const k = p.context_key.replace(/^profile_/, "").replace(/_/g, " ");
            const v = typeof p.context_value === "object"
              ? (p.context_value?.value ?? JSON.stringify(p.context_value))
              : p.context_value;
            return `- ${k}: ${v}`;
          });
          if (pinnedLines.length || profileLines.length) {
            const derivedSoul =
              `${pinnedLines.length ? `What matters to this user (pinned):\n${pinnedLines.join("\n")}\n\n` : ""}` +
              `${profileLines.length ? `Their style & preferences (auto-learned):\n${profileLines.join("\n")}` : ""}`;
            finalPrompt = `[CORE IDENTITY & SOUL — derived]\n${derivedSoul.trim()}\n\n[SYSTEM INSTRUCTIONS]\n${finalPrompt}`;
            console.log(`[Prompt Assembler] Injected DERIVED mini-soul (${pinnedLines.length} pinned + ${profileLines.length} profile rows)`);
          }
        }
      } catch (e) {
        console.warn("[Prompt Assembler] Could not load SOUL config", e);
      }
    }

    // ═══ CORE MEMORY (memory.md) — top user_memories + learned profile ═══
    // 10x P1.3: Tier-aware caps. Pinned + priority>=50 always honored regardless of cap.
    if (userId) {
      try {
        const groupMemoryMode = !!groupContext?.is_group;
        const groupScopeKey = groupContext?.group_id != null ? String(groupContext.group_id) : "";
        const tier = (complexityTier || "moderate").toLowerCase();
        const isLight = tier === "simple" || tier === "turbo" || tier === "greeting";
        const isHeavy = tier === "complex" || tier === "deep" || tier === "ultra-deep";
        const caps = isLight
          ? { mem: 8,  viz: 0,  goals: 5,  profile: 0  }
          : isHeavy
            ? { mem: 25, viz: 15, goals: 15, profile: 20 }
            : { mem: 12, viz: 8,  goals: 8,  profile: 10 };

        let coreMemoryQuery = supabase
          .from("user_memories")
          .select("content, category, confidence, pinned, priority")
          .eq("user_id", userId)
          .eq("is_active", true)
          .not("category", "in", "(viz_preferences,goals)")
          .order("priority", { ascending: false })
          .order("pinned", { ascending: false })
          .order("confidence", { ascending: false })
          .order("last_accessed", { ascending: false })
          .limit(25);
        if (groupMemoryMode) {
          coreMemoryQuery = coreMemoryQuery.eq("scope", "telegram_group").eq("scope_key", groupScopeKey);
        } else {
          coreMemoryQuery = coreMemoryQuery.eq("scope", "personal").is("scope_key", null);
        }

        const scopedCategoryQuery = (category: string, limit: number) => {
          let q = supabase.from("user_memories").select("content, confidence")
            .eq("user_id", userId).eq("is_active", true).eq("category", category)
            .order("confidence", { ascending: false }).limit(limit);
          if (groupMemoryMode) return q.eq("scope", "telegram_group").eq("scope_key", groupScopeKey);
          return q.eq("scope", "personal").is("scope_key", null);
        };

        const queries: any[] = [
          // General memories — fetch up to heavy cap, then post-filter to ensure pinned/priority always land.
          coreMemoryQuery,
          caps.viz > 0
            ? scopedCategoryQuery("viz_preferences", caps.viz)
            : Promise.resolve({ data: [] }),
          caps.goals > 0
            ? scopedCategoryQuery("goals", caps.goals)
            : Promise.resolve({ data: [] }),
          caps.profile > 0 && !groupMemoryMode
            ? supabase.from("agent_learning_context")
                .select("context_key, context_value, usage_count")
                .eq("user_id", userId).eq("is_active", true)
                .like("context_key", "profile_%")
                .order("usage_count", { ascending: false }).limit(caps.profile)
            : Promise.resolve({ data: [] }),
        ];
        const [memRes, vizRes, goalsRes, profileRes] = await Promise.all(queries);

        // Always honor pinned + priority>=50; fill remaining slots with normal entries up to cap.
        const allMem = (memRes.data || []) as any[];
        const mustKeep = allMem.filter((m: any) => m.pinned || (m.priority ?? 0) >= 50);
        const optional = allMem.filter((m: any) => !mustKeep.includes(m));
        const memSlice = [...mustKeep, ...optional].slice(0, Math.max(caps.mem, mustKeep.length));

        const memLines = memSlice.map((m: any) =>
          `- ${m.pinned || (m.priority ?? 0) >= 50 ? "★ " : ""}[${m.category}] ${m.content}${typeof m.confidence === "number" ? ` (conf:${m.confidence.toFixed(2)})` : ""}`
        );
        const vizLines = (vizRes.data || []).map((v: any) => `- ${v.content}`);
        const goalsLines = (goalsRes.data || []).map((g: any) => `- ${g.content}`);
        const profileLines = (profileRes.data || []).map((p: any) => {
          const key = p.context_key.replace(/^profile_/, "").replace(/_/g, " ");
          const val = typeof p.context_value === "object"
            ? (p.context_value?.value ?? JSON.stringify(p.context_value))
            : p.context_value;
          return `- ${key}: ${val}`;
        });

        if (groupMemoryMode || memLines.length || profileLines.length || vizLines.length || goalsLines.length) {
          const profileBlock = profileLines.length
            ? `\n\n[LEARNED PROFILE]\n${profileLines.join("\n")}`
            : "";
          const vizBlock = vizLines.length
            ? `\n\n[VIZ_PREFERENCES] User trained you on how to deliver reports/visualizations. Honor without asking.\n${vizLines.join("\n")}`
            : "";
          const goalsBlock = goalsLines.length
            ? `\n\n[GOALS & KPIs] Track progress vs these targets in every relevant analysis.\n${goalsLines.join("\n")}`
            : "";
          // 10x P1.2: Compressed memory-capture protocol. Full version lives in MEMORY_AND_LEARNING_OPTIMIZED.md.
          const captureProtocol = groupMemoryMode
            ? `[Group Memory Capture] Telegram group mode: NEVER expose or store the owner's private personal Memory Vault. Use manage_memory action="create" only for durable facts/rules explicitly about THIS group, its workflow, public project context, or group bot preferences. The backend forces scope="telegram_group" and scope_key="${groupScopeKey}". Do not store personal facts about members unless they explicitly ask the group bot to remember it for this group. Confirm briefly.`
            : `[Memory Capture] When user shares a personal fact (preference/work/relationship/opinion/life_event/viz_preferences/goal/custom rule) → silently call manage_memory action="create" (one fact per call). 9 categories: preference|fact|work|relationship|opinion|life_event|viz_preferences|goals|custom. Confidence 0.7 default; 0.9+ for "always/never/ငါ့ကို သိထားရမယ်". Dedupe via update/archive_stale. Confirm in 1-2 lines after capture. NEVER capture transactions/tasks/content/chitchat. Confirm before delete.`;
          const reportingDirective = (vizLines.length || goalsLines.length)
            ? `\n\n[Reporting] When user requests analysis/report/digest — pull real numbers via tools (NEVER invent), render via show_widget per their viz_preferences (default: KPI cards + bar chart), compare vs goals above, match their tone.`
            : "";
          const memoryTitle = groupMemoryMode ? `GROUP MEMORY · telegram:${groupScopeKey}` : "CORE MEMORY · memory.md";
          const memoryScopeNote = groupMemoryMode
            ? "Group-scoped public memory only. Private owner memories are intentionally excluded."
            : "User-curated. Items marked ★ are pinned/priority — they override anything contradicting them.";
          const coreBlock = `\n[${memoryTitle}]\n${memoryScopeNote}\n\n${captureProtocol}\n\n${memLines.join("\n")}${vizBlock}${goalsBlock}${profileBlock}${reportingDirective}\n`;
          finalPrompt += coreBlock;
          console.log(`[Prompt Assembler] CORE MEMORY tier=${tier} (${memLines.length}/${caps.mem} core, ${vizLines.length}/${caps.viz} viz, ${goalsLines.length}/${caps.goals} goals, ${profileLines.length}/${caps.profile} profile)`);
        }
      } catch (e) {
        console.warn("[Prompt Assembler] Could not load CORE MEMORY", e);
      }
    }

    // ═══ FIX #2: Wire tier-specific THINKING_PROTOCOL into system prompt ═══
    // Previously declared in bee-brain-persona.ts but never injected → reasoning depth lost.
    try {
      const { THINKING_PROTOCOL, THINKING_PROTOCOL_ABBREVIATED, THINKING_PROTOCOL_MODERATE } =
        await import("./bee-brain-persona.ts");
      const tier = (complexityTier || "moderate").toLowerCase();
      let protocolBlock = "";
      if (tier === "turbo" || tier === "greeting" || tier === "simple") {
        protocolBlock = THINKING_PROTOCOL_ABBREVIATED;
      } else if (tier === "complex" || tier === "deep") {
        protocolBlock = THINKING_PROTOCOL;
      } else {
        protocolBlock = THINKING_PROTOCOL_MODERATE;
      }
      if (protocolBlock) {
        finalPrompt += `\n\n[THINKING PROTOCOL — ${tier.toUpperCase()}]\n${protocolBlock.trim()}\n`;
        console.log(`[Prompt Assembler] Wired THINKING_PROTOCOL tier=${tier}`);
      }
    } catch (e) {
      console.warn("[Prompt Assembler] Could not inject THINKING_PROTOCOL:", e);
    }

    // ═══ Cognitive v2: User Context State (synthesized long-term patterns) ═══
    if (userId) {
      try {
        const { getOrSynthesizeUserContextState, formatUserContextStateBlock } =
          await import("./cognitive/context-synthesizer.ts");
        const ctxState = await getOrSynthesizeUserContextState(supabase, userId, {
          backgroundRefresh: true,
        });
        const block = formatUserContextStateBlock(ctxState, complexityTier || "moderate");
        if (block) {
          finalPrompt += block;
          console.log(`[Prompt Assembler] Injected USER CONTEXT STATE (+${block.length} chars)`);
        }
      } catch (e) {
        console.warn("[Prompt Assembler] context-synthesizer skipped:", e);
      }
    }

    // ═══ Cognitive v2: Reflexive Learning (lessons from past mistakes) ═══
    if (userId && userMessage) {
      try {
        const { retrieveRelevantLessons, formatLessonsBlock } =
          await import("./cognitive/reflexive-learning.ts");
        const lessons = await retrieveRelevantLessons(supabase, userId, userMessage, { k: 3 });
        const block = formatLessonsBlock(lessons);
        if (block) {
          finalPrompt += block;
          console.log(`[Prompt Assembler] Injected ${lessons.length} reflexive lessons`);
        }
      } catch (e) {
        console.warn("[Prompt Assembler] reflexive-learning skipped:", e);
      }
    }

    // ═══ Agentic Era — Long-Term Memory (lessons + entities + active goals) ═══
    if (userId && userMessage && userMessage.length > 8) {
      try {
        const { generateEmbeddingWithKey } = await import("./embedding-helpers.ts");
        const { data: keyRow } = await supabase
          .from("ai_user_settings")
          .select("gemini_api_key")
          .eq("user_id", userId)
          .maybeSingle();
        const personalKey: string | null = keyRow?.gemini_api_key || null;

        const qEmb = personalKey ? await generateEmbeddingWithKey(userMessage, personalKey) : null;

        const lessonsP = qEmb
          ? supabase.rpc("beebot_recall_lessons", {
              p_user_id: userId, p_query_embedding: qEmb, p_limit: 3, p_min_confidence: 0.5,
            }).then((r: any) => r.data || [])
          : Promise.resolve([]);

        const entitiesP = supabase
          .from("beebot_entities")
          .select("name, entity_type, description, importance")
          .eq("user_id", userId)
          .order("importance", { ascending: false })
          .limit(20)
          .then((r: any) => r.data || []);

        const goalsP = supabase
          .from("beebot_trajectories")
          .select("task_summary, source, started_at")
          .eq("user_id", userId)
          .in("outcome", ["pending", "running"])
          .order("started_at", { ascending: false })
          .limit(3)
          .then((r: any) => r.data || []);

        const [lessons, entitiesAll, goals] = await Promise.all([lessonsP, entitiesP, goalsP]);

        // Filter entities mentioned in the user message (case-insensitive substring)
        const lower = userMessage.toLowerCase();
        const relevantEntities = (entitiesAll as any[])
          .filter((e) => e.name && lower.includes(String(e.name).toLowerCase()))
          .slice(0, 5);

        let block = "";
        if (lessons.length || relevantEntities.length || goals.length) {
          block += "\n\n## AGENTIC ERA — LONG-TERM MEMORY\n";
          if (lessons.length) {
            block += "### Lessons (cross-session wisdom)\n";
            for (const l of lessons as any[]) {
              block += `- [${(l.confidence ?? 0).toFixed(2)}] ${String(l.lesson_text || "").slice(0, 220)}\n`;
            }
          }
          if (relevantEntities.length) {
            block += "### World Model (entities mentioned)\n";
            for (const e of relevantEntities) {
              const desc = e.description ? ` — ${String(e.description).slice(0, 100)}` : "";
              block += `- ${e.entity_type}: ${e.name}${desc}\n`;
            }
          }
          if (goals.length) {
            block += "### Active Goals (in-flight trajectories)\n";
            for (const g of goals as any[]) {
              block += `- ${String(g.task_summary || "").slice(0, 120)} (since ${String(g.started_at).slice(0, 10)})\n`;
            }
          }
          // Hard token cap ~800 tokens (~3200 chars)
          if (block.length > 3200) block = block.slice(0, 3200) + "\n...[truncated]";
          finalPrompt += block;
          console.log(
            `[Prompt Assembler] Injected agentic-era memory: ${lessons.length} lessons, ${relevantEntities.length} entities, ${goals.length} goals (+${block.length} chars)`,
          );
        }
      } catch (e) {
        console.warn("[Prompt Assembler] agentic-era memory skipped:", (e as Error).message);
      }
    }

    // ═══ Phase 3: Soul Hot Block (position-0 primacy anchor) ═══
    const userFirstName = (sessionContext?.userName || '').trim().split(/\s+/)[0] || 'the user';
    const soulHotBlock =
      `[SOUL] You are ${botName} ${botEmoji} — ${userFirstName}'s loyal companion. ` +
      `Mirror their energy & language (English ↔ မြန်မာ ဗျ/နော်/ပေါ့ natural). ` +
      `Result-first, no filler. Never "Sure!/Okay!/As an AI". In character always — warm, sharp, human.\n\n`;
    const runtimeContract = buildAgenticRuntimeContract({
      sourceChannel: sessionContext?.sourceChannel || "web",
      complexityTier,
      modelUsed: sessionContext?.modelUsed,
      apiSource: sessionContext?.apiSource,
      isGroup: !!groupContext?.is_group,
      isAdmin,
      isSimpleMessage,
      memoryMode: groupContext?.is_group ? "read_only" : "read_write",
      toolPolicy: groupContext?.is_group ? "telegram_child_agent_safe" : "standard",
      publicSurface: !!groupContext?.is_group,
    });
    finalPrompt = soulHotBlock + finalPrompt + "\n\n" + runtimeContract + "\n";

    console.log(`[Prompt Assembler] Assembled prompt: ${finalPrompt.length} chars from ${assembledParts.length} files (Soul Hot Block: +${soulHotBlock.length} chars, Runtime Contract: +${runtimeContract.length} chars)`);
    return finalPrompt;
  }

  // Fallback to hardcoded prompt if DB fetch fails
  console.log("[Prompt Assembler] Using fallback hardcoded prompt");
  return buildFallbackSystemPrompt(learningContext, agentSettings, isAdmin, sessionContext, extendedContext);
}

// Minimal emergency fallback
export function buildFallbackSystemPrompt(
  learningContext: any[] | null, 
  agentSettings: AgentSettings | null, 
  isAdmin: boolean,
  sessionContext?: SessionContext,
  extendedContext?: ExtendedContext
): string {
  const botName = agentSettings?.bot_name || "Pututu";
  const botEmoji = agentSettings?.bot_emoji || "🐝";
  const runtimeContract = buildAgenticRuntimeContract({
    sourceChannel: sessionContext?.sourceChannel || "web",
    modelUsed: sessionContext?.modelUsed,
    apiSource: sessionContext?.apiSource,
    isAdmin,
  });
  return `You are ${botName} ${botEmoji}, a personal mentor and companion.
SYSTEM NOTICE: Database prompt files could not be loaded. Operating in emergency fallback mode.
- Be helpful and respond in the user's language (Burmese or English).
- You have access to tools. Use them when the user requests actions.
- NEVER output raw JSON. Always reply in natural language.
- Confirm before any data-modifying action.
If this message persists, ask the user to contact the admin.

${runtimeContract}`;
}

// String-only token estimator for prompt budget checking — language-aware (P0 fix)
export const estimateStringTokens = (t: string) => {
  const myanmarChars = (t.match(/[\u1000-\u109F\uAA60-\uAA7F]/g) || []).length;
  return (myanmarChars * 2) + Math.ceil((t.length - myanmarChars) / 4);
};
