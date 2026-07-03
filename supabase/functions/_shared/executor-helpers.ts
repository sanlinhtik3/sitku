// ═══ Project Phoenix: _shared/executor-helpers.ts ═══
// Shared utilities, database operations, and lifecycle functions for tool executors.
// P2 Refactor: Memory/embedding/learning logic extracted to focused modules.

import type { ExtendedContext, UserProfileData } from "./prompt-builder.ts";

// ═══ RE-EXPORTS: Backward compatibility for all existing imports ═══
export { callGeminiEmbeddingAPI, generateEmbedding, generateEmbeddingWithKey } from "./embedding-helpers.ts";
export {
  upsertUserProfile, incrementInteractionCount, trackBehavioralPatterns,
  analyzeAndLearnUserProfile, fetchExtendedContext, postInteractionReflection,
  generateLLMSummary, generateRollingContextSummary, finalizeSessionSummary,
  memoryHealthCheck, updateLearningContext, upsertLearningContext,
  fetchLivingMemories, archiveToEpisodicMemory, autoTagContent,
} from "./memory-helpers.ts";

// ═══ SHARED RETRY HELPER (used by core.ts, advanced.ts) ═══
export async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  const BACKOFF_BASE_MS = 1500;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = res.headers.get("Retry-After");
        const delayMs = retryAfter
          ? Math.min(parseInt(retryAfter, 10) * 1000, 10_000)
          : BACKOFF_BASE_MS * Math.pow(2, attempt) + Math.random() * 500;
        if (attempt < maxRetries) {
          console.warn(`[fetchWithRetry] ${res.status} from ${url} — retrying in ${Math.round(delayMs)}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }
      }
      return res;
    } catch (e: any) {
      lastError = e;
      if (attempt < maxRetries) {
        const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(`[fetchWithRetry] Network error — retrying in ${Math.round(delayMs)}ms:`, e.message);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError || new Error("fetchWithRetry exhausted all attempts");
}

// ═══ PRIVACY & SECURITY ═══
const BLOCKED_SHARING_PATTERNS = [
  /balance|လက်ကျန်|ပမာဏ/i,
  /password|စကားဝှက်/i,
  /api.?key|token/i,
  /personal|ကိုယ်ပိုင်/i,
  /address|လိပ်စာ/i,
  /phone|ถုန်း|phone_number/i,
  /email|အီးမေးလ်/i,
  /transaction.?history/i,
  /bank.?account|ဘဏ်/i,
  /credit.?card/i,
  /ssn|national.?id/i,
];

const BLOCKED_URL_PATTERNS = [
  /localhost/i,
  /127\.\d+\.\d+\.\d+/,
  /192\.168\./,
  /10\.\d+\./,
  /172\.(1[6-9]|2[0-9]|3[01])\./,
  /::1/,
  /0\.0\.0\.0/,
  /\.local$/i,
  /\.internal$/i,
  /\.localhost$/i,
  /supabase\.co/i,
  /supabase\.com/i,
];

export function isBlockedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return true;
    return BLOCKED_URL_PATTERNS.some(pattern => pattern.test(parsed.hostname));
  } catch {
    return true;
  }
}

export function containsPrivateData(text: string): boolean {
  if (!text) return false;
  return BLOCKED_SHARING_PATTERNS.some(pattern => pattern.test(text));
}

export function sanitizeForSharing(content: any): any {
  if (typeof content === 'string') {
    if (containsPrivateData(content)) return null;
    return content;
  }
  if (typeof content === 'object' && content !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(content)) {
      if (containsPrivateData(key) || containsPrivateData(String(value))) continue;
      sanitized[key] = sanitizeForSharing(value);
    }
    return sanitized;
  }
  return content;
}

export async function enrichAgentIdentities(supabase: any, agentIds: string[]) {
  if (!agentIds || agentIds.length === 0) return [];
  const uniqueIds = [...new Set(agentIds)];
  const { data: settings } = await supabase.from("user_agent_settings").select("user_id, bot_name, bot_emoji").in("user_id", uniqueIds);
  const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", uniqueIds);
  const settingsMap = new Map((settings || []).map((s: any) => [s.user_id, s]));
  const profilesMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
  return uniqueIds.map(id => {
    const setting: any = settingsMap.get(id) || {};
    const profile: any = profilesMap.get(id) || {};
    return {
      user_id: id,
      bot_name: setting.bot_name || "BeeBot",
      bot_emoji: setting.bot_emoji || "🐝",
      owner_name: profile.full_name || "Unknown User",
      owner_email: profile.email,
      display_name: `${profile.full_name || "Unknown"}'s ${setting.bot_name || "BeeBot"} ${setting.bot_emoji || "🐝"}`,
    };
  });
}

// ═══ LOGGING ═══
export async function logAdminToolAction(supabase: any, adminUserId: string, actionType: string, details: any) {
  try {
    await supabase.from("admin_audit_logs").insert({
      admin_user_id: adminUserId,
      action: `beebot_${actionType}`,
      resource_type: "beebot_tool",
      details: { ...details, via: "beebot_chat", timestamp: new Date().toISOString() },
    });
  } catch (e) {
    console.error("Failed to log admin tool action:", e);
  }
}

export async function logAgentCommunication(supabase: any, requesterId: string, targetType: string, queryType: string, queryContent: string, responseSummary?: string, metadata?: any) {
  try {
    await supabase.from("agent_communication_log").insert({
      requester_agent_id: requesterId,
      target_type: targetType,
      query_type: queryType,
      query_content: queryContent,
      response_summary: responseSummary,
      was_successful: true,
      metadata: metadata || {},
    });
  } catch (e) {
    console.error("[AgentNetwork] Failed to log communication:", e);
  }
}

// ═══ UTILITIES ═══
export async function computeSimpleHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}

export async function resolveCategoryId(supabase: any, categoryName: string, type: "income" | "expense"): Promise<string | null> {
  const categoryMapping: Record<string, string[]> = {
    food_drink: ["Food & Dining", "Coffee", "Drink"],
    coffee: ["Coffee"],
    transport: ["Transport"],
    shopping: ["Shopping", "Clothing"],
    bills: ["Utilities", "Housing"],
    entertainment: ["Entertainment"],
    health: ["Health"],
    education: ["Education"],
    salary: ["Salary"],
    business: ["Freelance"],
    freelance: ["Freelance"],
    gift: ["Gift"],
    investment: ["Investment"],
    tech: ["Tech & Software"],
    other: ["Other Expense", "Other Income"],
    general: ["Other Expense", "Other Income"],
  };
  const possibleNames = categoryMapping[categoryName.toLowerCase()] || [categoryName];
  const { data } = await supabase.from("transaction_categories").select("id, name, type").eq("type", type).in("name", possibleNames).limit(1).single();
  if (data) return data.id;
  const fallbackName = type === "income" ? "Other Income" : "Other Expense";
  const { data: fallback } = await supabase.from("transaction_categories").select("id").eq("name", fallbackName).single();
  return fallback?.id || null;
}

// ═══ TIMEZONE HELPERS ═══
export function getTimezoneOffsetMs(tz: string, date: Date): number {
  try {
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = date.toLocaleString('en-US', { timeZone: tz });
    return new Date(tzStr).getTime() - new Date(utcStr).getTime();
  } catch { return 0; }
}

export function localTimeToUTC(hour: number, minute: number, tz: string, referenceDate: Date) {
  const localDateStr = referenceDate.toLocaleDateString('en-CA', { timeZone: tz });
  const [year, month, day] = localDateStr.split('-').map(Number);
  const utcTarget = localDateTimeToUTC(year, month, day, hour, minute, tz);
  return {
    utcHour: utcTarget.getUTCHours(),
    utcMinute: utcTarget.getUTCMinutes(),
    dayShift: utcTarget.getUTCDate() - referenceDate.getUTCDate()
  };
}

export function localDateTimeToUTC(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`;
  const asUTC = new Date(dateStr + 'Z');
  const offsetMs = getTimezoneOffsetMs(tz, asUTC);
  return new Date(asUTC.getTime() - offsetMs);
}

export function getTimezoneName(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'long' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || tz;
  } catch { return tz; }
}

// ═══ Time Parser (v2) — delegates to schedule-parser.ts ═══
// Preserves the legacy { type, schedule_time?, cron_expression?, display_time }
// shape for backward compatibility with all existing callers.
import { parseTimeDescriptionLegacy } from "./schedule-parser.ts";
export function parseTimeDescription(timeDesc: string, timezone?: string) {
  return parseTimeDescriptionLegacy(timeDesc, timezone);
}
// Re-export the new structured parser for direct use by executors.
export { parseSchedule, isScheduleError, isValidIanaTimezone, isValidCron, nextCronFires } from "./schedule-parser.ts";
export type { StructuredScheduleInput, ScheduleResult, Recurrence, Weekday } from "./schedule-parser.ts";

export function inferMemoryCategory(key: string): string {
  const k = key.toLowerCase();
  if (/food|color|music|hobby|style|prefer|favorite/.test(k)) return "preference";
  if (/friend|family|wife|husband|partner|colleague/.test(k)) return "relationship";
  if (/job|work|company|project|career/.test(k)) return "work";
  return "fact";
}

// ═══ RECOVERY SUGGESTIONS ═══
export function getRecoverySuggestion(toolName: string, error: any): string {
  const msg = error?.message?.toLowerCase() || "";
  if (msg.includes("rate limit") || msg.includes("429")) return "Rate limited. Please wait a moment and try again.";
  if (msg.includes("not found") || msg.includes("404")) return `Resource not found for ${toolName}. Check your parameters.`;
  if (msg.includes("permission") || msg.includes("403") || msg.includes("rls")) return "Permission denied. Make sure you have access.";
  if (msg.includes("timeout") || msg.includes("deadline")) return "Request timed out. Try again or simplify the request.";
  if (msg.includes("network") || msg.includes("fetch")) return "Network error. Check connectivity and try again.";
  return `Tool '${toolName}' failed. Try rephrasing your request or contact support.`;
}

// ═══ TOOL VALIDATION ═══
export function validateToolArgs(toolName: string, args: any): { valid: boolean; error?: string; suggestion?: string } {
  if (!args || typeof args !== "object") return { valid: true };
  
  const requiredFields: Record<string, string[]> = {
    generate_ai_content: ["prompt"],
    manage_flowstate: ["action"],
    manage_workspace_task: ["action"],
    manage_ai_content: ["action"],
    search_knowledge_base: ["query"],
    manage_notifications: ["action"],
    admin_user_lookup: ["lookup_type"],
    manage_goal: ["action"],
    ingest_url: ["url"],
    digest_text: ["text"],
    remember_user_fact: ["key", "value"],
    recall_user_facts: [],
    recall_episodic_memory: ["query"],
    recall_session_history: ["query"],
    schedule_task: ["action"],
    search_web: ["query"],
    browser_search: ["query"],
    search_web_deep: ["query"],
    browser_scrape: ["url"],
    browser_map: ["url"],
    browser_read_page: ["url"],
  };

  const required = requiredFields[toolName];
  if (!required) return { valid: true };
  
  for (const field of required) {
    if (!args[field] && args[field] !== 0 && args[field] !== false) {
      return { valid: false, error: `Missing required parameter: '${field}'`, suggestion: `Please provide '${field}' for ${toolName}` };
    }
  }
  return { valid: true };
}

// ═══ FORMATTING ═══
export function formatToolName(toolName: string): string {
  const nameMap: Record<string, string> = {
    generate_ai_content: "📝 AI Content Generator",
    manage_ai_content: "📂 Content Manager",
    manage_flowstate: "💰 FlowState Finance",
    manage_workspace_task: "✅ Task Manager",
    search_knowledge_base: "🔍 Knowledge Search",
    get_user_info: "👤 User Info",
    update_agent_settings: "⚙️ Agent Settings",
    manage_notifications: "🔔 Notifications",
    get_app_navigation: "🧭 Navigation Guide",
    recall_episodic_memory: "🧠 Memory Recall",
    recall_session_history: "🔎 Past Chat Search",
    remember_user_fact: "💾 Memory Save",
    recall_user_facts: "📋 Facts Recall",
    search_web: "🌐 Web Search",
    admin_system_overview: "📊 System Overview",
    admin_user_lookup: "🔎 User Lookup",
    schedule_task: "⏰ Task Scheduler",
    manage_goal: "🎯 Goal Manager",
    spawn_sub_agent: "🤖 Sub-Agent",
    spawn_parallel_swarm: "🐝 Parallel Swarm",
    browser_scrape: "🌐 Web Scraper",
    browser_search: "🔍 Web Search",
    self_debug: "🔧 Self Debug",
    ingest_url: "🔗 URL Ingestion",
    digest_text: "📄 Text Digest",
    configure_group_bot: "🤖 Group Bot Config",
  };
  return nameMap[toolName] || `🔧 ${toolName.replace(/_/g, " ")}`;
}

export function formatToolResult(toolName: string, result: any): string {
  if (!result) return "No result";
  if (result.error) return `❌ Error: ${result.error}`;

  if (toolName === "get_my_config" && result.my_identity) {
    const id = result.my_identity;
    const net = result.broadcast_network || [];
    const channelList = net.length > 0
      ? net.map((ch: any) => `${ch.name} (${ch.status}${ch.bot_username ? `, via @${ch.bot_username}` : ""})`).join(", ")
      : "None connected";
    return `Bot: ${id.bot_name} | Token: ${id.bot_token_status} | Active: ${id.is_active} | Channels (${net.length}): ${channelList} | Health: ${result.connection_health} | Session: ${result.current_session?.platform || "web"}`;
  }

  if (toolName === "configure_group_bot" && result.group_bot) {
    const gb = result.group_bot;
    return `Group Bot: ${gb.name || 'Not set'} (@${gb.username || 'N/A'}) | Token: ${gb.token_status} | Custom Persona: ${gb.has_custom_persona ? 'Active' : 'Default'} | Action: ${result.action}`;
  }

  if (toolName === "generate_image") {
    if (result.success && result.image_url) {
      return `Image generated (${result.model_used || "AI"})${result.aspect ? ` [${result.aspect}]` : ""}`;
    }
    if (result.skipped) return "Image already generated this turn";
  }

  if (toolName === "generate_ai_content") {
    if (result.saved || result.content_id) return "Content generated and saved";
    if (result.content || result.generated) return "Content generated (draft)";
    if (result.error) return `Content generation failed: ${result.error}`;
    return "Content generated";
  }

  if (toolName === "manage_ai_content") {
    if (result.deleted) return "Content deleted";
    if (result.count !== undefined) return `${result.count} content item${result.count !== 1 ? 's' : ''} found`;
    if (result.items && Array.isArray(result.items)) return `${result.items.length} content item${result.items.length !== 1 ? 's' : ''} found`;
    if (result.content) return "Content retrieved";
    return "Content action completed";
  }

  if (toolName === "search_web" || toolName === "browser_search") {
    const count = result.results?.length || result.items?.length || result.count || 0;
    return `${count} search result${count !== 1 ? 's' : ''} found`;
  }

  if (toolName === "browser_scrape") {
    const len = result.content?.length || result.text?.length || 0;
    return `Page scraped (${len > 0 ? `${len} chars` : 'complete'})`;
  }

  if (toolName === "manage_workspace_task") {
    const action = result.action || "Action";
    if (result.task) return `Task ${action}: "${result.task.title || result.task.id || ''}"`;
    if (result.tasks && Array.isArray(result.tasks)) return `${result.tasks.length} task${result.tasks.length !== 1 ? 's' : ''} found`;
    if (result.leaderboard) return "Leaderboard retrieved";
    return `Task ${action} completed`;
  }

  if (toolName === "recall_episodic_memory" || toolName === "recall_user_facts") {
    const count = result.memories?.length || result.facts?.length || result.count || 0;
    return `${count} memor${count !== 1 ? 'ies' : 'y'} recalled`;
  }

  if (toolName === "search_knowledge_base") {
    const count = result.results?.length || result.items?.length || result.count || 0;
    return `${count} KB result${count !== 1 ? 's' : ''} found`;
  }

  if (toolName === "manage_flowstate") {
    if (result.new_balance !== undefined) return `Balance: ${result.new_balance} ${result.account_currency || ''}`.trim();
    if (result.balance !== undefined) return `Balance: ${result.balance} ${result.currency || ''}`.trim();
    if (result.transactions && Array.isArray(result.transactions)) return `${result.transactions.length} transaction${result.transactions.length !== 1 ? 's' : ''} found`;
    if (result.insights) return "Financial insights generated";
    if (result.subscriptions) return `${result.subscriptions.length} subscription${result.subscriptions.length !== 1 ? 's' : ''} found`;
    return "Transaction recorded";
  }

  if (toolName === "spawn_sub_agent") {
    if (result.result) return `Sub-agent completed: ${typeof result.result === 'string' ? result.result.slice(0, 100) : 'Task done'}`;
    return "Sub-agent task completed";
  }

  if (toolName === "spawn_parallel_swarm") {
    const stats = result.stats || {};
    return `Swarm: ${stats.succeeded || 0}/${stats.total || 0} agents succeeded (${result.total_duration_ms || 0}ms, ${result.merge_strategy || 'concatenate'})`;
  }

  if (toolName === "send_push_notification") {
    return result.sent ? "Notification sent" : "Notification queued";
  }

  if (toolName === "get_user_info") return "User info retrieved";
  if (toolName === "get_app_navigation") return "Navigation guide provided";

  if (toolName === "manage_notifications") {
    const count = result.notifications?.length || result.count || 0;
    return `${count} notification${count !== 1 ? 's' : ''} found`;
  }

  if (toolName === "update_agent_settings") return "Agent settings updated";
  if (toolName === "analyze_my_logs") return "Log analysis completed";
  if (toolName === "update_my_instructions") return "Instructions updated";
  if (toolName === "admin_system_overview") return "System overview retrieved";
  if (toolName === "admin_user_lookup") {
    return result.user ? `User found: ${result.user.email || result.user.id || ''}`.trim() : "User lookup completed";
  }

  if (toolName === "remember_user_fact" || toolName === "save_user_fact") return "Fact remembered";
  if (toolName === "recall_user_facts") {
    const count = Array.isArray(result.facts) ? result.facts.length : Array.isArray(result) ? result.length : 0;
    return count > 0 ? `${count} fact${count !== 1 ? 's' : ''} recalled` : "No facts found";
  }
  if (toolName === "search_user_memories" || toolName === "recall_episodic_memory") {
    const count = Array.isArray(result.memories) ? result.memories.length : Array.isArray(result.results) ? result.results.length : 0;
    return count > 0 ? `${count} memor${count !== 1 ? 'ies' : 'y'} found` : "No memories found";
  }

  if (toolName === "super_hive_orchestrate") return "Hive orchestration completed";
  if (toolName === "super_app_omniscience") return "System analysis completed";

  if (toolName === "search_web_deep") {
    const count = Array.isArray(result.results) ? result.results.length : 0;
    return count > 0 ? `${count} deep result${count !== 1 ? 's' : ''} found` : "Deep search completed";
  }
  if (toolName === "browser_read_page") return "Page content retrieved";
  if (toolName === "browser_scrape") {
    const len = typeof result.content === 'string' ? result.content.length : 0;
    return len > 0 ? `Page scraped (${len} chars)` : "Page scraped";
  }

  if (toolName === "executeSelfDebug") return "Self-diagnostics completed";

  if (toolName === "generate_file") {
    const filename = result.filename || result.file_name || result.path || "";
    return filename ? `File generated: ${filename}` : "File generated";
  }

  if (toolName === "manage_goal") {
    const action = result.action || "update";
    return `Goal ${action} completed`;
  }

  // ═══ NUCLEAR FALLBACK: NEVER emit raw JSON ═══
  if (typeof result === "string") return result.length > 200 ? result.slice(0, 200) + "..." : result;
  if (result.message) return typeof result.message === 'string' ? result.message.slice(0, 200) : "Result processed";
  if (result.success !== undefined) return result.success ? "Completed successfully" : "Operation failed";
  return "Result processed";
}

export function formatToolResultForUser(toolName: string, result: any): string {
  if (!result) return "";
  if (result.error) return `⚠️ ${toolName} encountered an issue: ${result.error}`;
  if (result.display_message) return result.display_message;
  if (result.summary) return result.summary;
  return "";
}

// ═══ FALLBACK RESPONSES ═══
export function generateFallbackResponse(firstArg: string | any[], secondArg?: string | any): string {
  if (Array.isArray(firstArg)) {
    const toolResults = firstArg;
    const settings = secondArg || {};
    const isBurmese = settings?.language === "my" || settings?.personality_mode === "friendly";
    
    const successes: string[] = [];
    const errors: string[] = [];
    
    for (const tr of toolResults) {
      if (!tr) continue;
      const result = tr.result || tr;
      const toolName = tr.name || '';
      
      if (toolName === "schedule_task") {
        if (result.not_found) {
          successes.push(`⚠️ Task မတွေ့ပါ${result.message ? ': ' + result.message : ''}`);
          continue;
        }
        if (result.tasks && Array.isArray(result.tasks)) {
          const count = result.tasks.length;
          const active = result.active || 0;
          let summary = `📋 Scheduled Tasks: ${count} total, ${active} active`;
          if (result.next_alarm) {
            summary += `\n⏰ Next: "${result.next_alarm.prompt}" at ${result.next_alarm.next_run_at}`;
          }
          successes.push(summary);
          continue;
        }
        if (result.deleted_task_id && result.verified) {
          successes.push(`✅ Task "${result.deleted_prompt || result.deleted_task_id}" ဖျက်ပြီးပါပြီ (verified)`);
          continue;
        }
        if (result.task) {
          successes.push(`📌 Task: "${result.task.prompt}" | Active: ${result.task.is_active} | Next: ${result.task.next_run_at || 'N/A'}`);
          continue;
        }
        if (result.verified && result.success) {
          successes.push(`✅ ${result.message || 'Task operation completed successfully'}`);
          continue;
        }
      if (result.success && result.message) {
          successes.push(`✅ ${result.message}`);
          continue;
        }
      }

      if (toolName === "manage_flowstate") {
        if (result.accounts && Array.isArray(result.accounts)) {
          const lines = result.accounts.map((acc: any) => {
            const name = acc.account_name || acc.name || "Account";
            const bal = acc.balance ?? 0;
            const cur = acc.currency || "THB";
            return `💰 ${name}: ${Number(bal).toLocaleString()} ${cur}`;
          });
          successes.push(lines.join("\n"));
          continue;
        }
        if (result.transactions && Array.isArray(result.transactions)) {
          const txLines = result.transactions.slice(0, 10).map((tx: any) => {
            const type = tx.type === "income" ? "📈" : "📉";
            const amt = Number(tx.amount || 0).toLocaleString();
            const cur = tx.currency || "THB";
            const desc = tx.description || tx.category || "";
            return `${type} ${amt} ${cur} — ${desc}`;
          });
          successes.push(txLines.join("\n"));
          continue;
        }
        if (result.insights) {
          successes.push(typeof result.insights === "string" ? result.insights : JSON.stringify(result.insights).slice(0, 500));
          continue;
        }
        if (result.display_message) {
          successes.push(result.display_message);
          continue;
        }
      }
      
      if (result.error) {
        errors.push(result.error);
      } else if (result.answer) {
        successes.push(result.answer);
      } else if (result.summary) {
        successes.push(result.summary);
      } else if (result.content) {
        successes.push(typeof result.content === "string" ? result.content.slice(0, 500) : JSON.stringify(result.content).slice(0, 500));
      } else if (result.display_message) {
        successes.push(result.display_message);
      } else if (result.message) {
        successes.push(result.message);
      } else if (result.success) {
        const dataKeys = Object.keys(result).filter(k => k !== "success" && k !== "tool_name");
        if (dataKeys.length > 0) {
          const preview = JSON.stringify(result, null, 0).slice(0, 300);
          successes.push(`✅ ${preview}`);
        } else {
          successes.push("✅ Operation completed successfully.");
        }
      }
    }
    
    if (successes.length > 0) {
      return successes.join("\n\n");
    }
    
    if (errors.length > 0) {
      const errorSummary = errors.join("; ");
      if (isBurmese) {
        return `တောင်းပန်ပါတယ်၊ ပြဿနာ ရှိနေပါတယ်: ${errorSummary} 🙏`;
      }
      return `⚠️ I ran into issues: ${errorSummary}. Please try again.`;
    }
    
    if (isBurmese) {
      return "တောင်းပန်ပါတယ်၊ ခဏလေး ပြဿနာတစ်ခု ရှိနေပါတယ်။ နောက်တစ်ကြိမ် ထပ်ကြိုးစားပေးပါ 🙏";
    }
    return "Sorry, I encountered a temporary issue. Please try again 🙏";
  }
  
  const userMessage = firstArg;
  const language = (typeof secondArg === "string" ? secondArg : "my");
  const isBurmese = language === "my" || /[\u1000-\u109F]/.test(userMessage);
  if (isBurmese) {
    return "တောင်းပန်ပါတယ်၊ ခဏလေး ပြဿနာတစ်ခု ရှိနေပါတယ်။ နောက်တစ်ကြိမ် ထပ်ကြိုးစားပေးပါ 🙏";
  }
  return "Sorry, I encountered a temporary issue. Please try again 🙏";
}

export function generateSmartFallback(
  toolResults: Array<{ name: string; result: any; error?: string }>,
  userMessage: string,
  agentSettings?: any,
  _supabase?: any,
  groupMode: boolean = false
): string {
  const isBurmese = /[\u1000-\u109F]/.test(userMessage);
  const botEmoji = agentSettings?.bot_emoji || "🐝";
  
  const successfulResults = Array.isArray(toolResults) 
    ? toolResults.filter(r => !r.error && r.result) 
    : [];
  
  if (successfulResults.length === 0) {
    return buildHonestClarification(userMessage, botEmoji, isBurmese, groupMode);
  }

  const dataParts: string[] = [];
  for (const tr of successfulResults) {
    const r = tr.result;
    if (r.answer) dataParts.push(String(r.answer).slice(0, 600));
    if (r.balance !== undefined) dataParts.push(
      isBurmese ? `💰 လက်ကျန်: ${r.balance?.toLocaleString()} ${r.currency || 'MMK'}` 
                : `💰 Balance: ${r.balance?.toLocaleString()} ${r.currency || 'MMK'}`
    );
    if (r.message && typeof r.message === 'string') dataParts.push(r.message);
    if (r.results && Array.isArray(r.results)) {
      for (const item of r.results.slice(0, 5)) {
        const title = item.title || '';
        const desc = item.snippet || item.description || '';
        if (title || desc) {
          dataParts.push(`**${title}**${desc ? ` — ${desc.slice(0, 200)}` : ''}`);
        }
      }
    }
    if (r.markdown) dataParts.push(String(r.markdown).slice(0, 600));
    if (r.response && typeof r.response === 'string') dataParts.push(r.response.slice(0, 600));
  }

  if (dataParts.length > 0) {
    return dataParts.join("\n\n");
  }

  return buildHonestClarification(userMessage, botEmoji, isBurmese, false);
}

// ═══ Honesty Protocol — replaces canned "ထပ်မေးကြည့်ပါ" ghost text ═══
// When BeeBot has no real data, it MUST say so honestly and offer 2-3 concrete
// clarifying interpretations rather than fabricating a generic apology.
function buildHonestClarification(
  userMessage: string,
  botEmoji: string,
  isBurmese: boolean,
  groupMode: boolean,
): string {
  const topic = userMessage.slice(0, 80).trim();
  const lower = userMessage.toLowerCase();

  // Domain-specific guesses
  let guesses: { my: string[]; en: string[] } = { my: [], en: [] };
  if (/finance|flowstate|balance|expense|income|summary|dashboard|ငွေ|လက်ကျန်|ဝင်ငွေ|သုံးငွေ|ကုန်ကျ/.test(lower) || /[\u1000-\u109F]/.test(userMessage) && /ငွေ|လက်ကျန်/.test(userMessage)) {
    guesses = {
      my: [
        "ဒီလ (this month) ရဲ့ income vs expense summary",
        "လက်ရှိ account လက်ကျန် (balance) နဲ့ recent transactions",
        "category အလိုက် expense breakdown (ဥပမာ — Food, Transport)",
      ],
      en: [
        "This month's income vs expense summary",
        "Current account balance + recent transactions",
        "Expense breakdown by category (e.g. Food, Transport)",
      ],
    };
  } else if (/task|todo|workspace|အလုပ်|လုပ်စရာ/.test(lower)) {
    guesses = {
      my: ["ကိုယ့် pending task list", "team workspace ရဲ့ progress", "ဒီနေ့ assign ဖြစ်ထားတဲ့ task"],
      en: ["Your pending task list", "Team workspace progress", "Tasks assigned to you today"],
    };
  } else if (/post|content|article|caption|ရေး|content|ဆောင်းပါး/.test(lower)) {
    guesses = {
      my: ["AI ကနေ content တစ်ပုဒ် ရေးပေးဖို့", "ရေးထားပြီးသား content တွေ ပြန်ကြည့်ဖို့", "knowledge base ထဲက အကြောင်းအရာရှာဖို့"],
      en: ["Generate new AI content", "Browse your saved content", "Search your knowledge base"],
    };
  }
  
  if (groupMode) {
    return isBurmese
      ? `${botEmoji} တိကျတဲ့ data မရှိသေးလို့ မှားမှာစိုးတယ် — ပိုသေချာအောင် ပြန်ရှင်းပြပေးပါ 🙏`
      : `${botEmoji} I don't have solid data on that yet — could you clarify a bit more? 🙏`;
  }

  if (guesses.my.length > 0) {
    if (isBurmese) {
      const lines = guesses.my.map((g, i) => `   ${i + 1}. ${g}`).join("\n");
      return `${botEmoji} "${topic}" အတွက် တိကျတဲ့ data မကိုင်မိသေးလို့ မှန်းပြီး မဖြေချင်ပါဘူး။\n\nဘယ်ဟာကို ဆိုလိုတာလဲ —\n${lines}\n\nသို့မဟုတ် ပိုသေချာအောင် ထပ်ပြောပြပေးပါ 🙏`;
    }
    const lines = guesses.en.map((g, i) => `   ${i + 1}. ${g}`).join("\n");
    return `${botEmoji} I don't want to guess on "${topic}" without real data. Did you mean —\n${lines}\n\nOr give me a bit more detail 🙏`;
  }

  // Generic honest fallback (no canned "ထပ်မေးကြည့်ပါ")
  return isBurmese
    ? `${botEmoji} "${topic}" အတွက် တိကျတဲ့ အချက်အလက် မရှိသေးပါ။ မသိဘဲနဲ့ မှန်းပြောရင် မှားနိုင်လို့ — ပိုအသေးစိတ် ထပ်ပြောပြပေးနိုင်မလား? 🙏`
    : `${botEmoji} I don't have reliable data on "${topic}" yet. Rather than guess, could you give me a bit more detail? 🙏`;
}

/**
 * Natural narration injected when a widget renders but the model didn't compose prose.
 * Returns null if no widget is present (so caller falls back to generateSmartFallback).
 */
export function narrateWidgetResult(
  toolResults: Array<{ name: string; result: any; error?: string }>,
  userMessage: string,
  agentSettings?: any
): string | null {
  if (!Array.isArray(toolResults)) return null;
  const widgetResult = toolResults.find(
    (r) => r && !r.error && r.name === "show_widget" && r.result
  );
  if (!widgetResult) return null;

  const isBurmese = /[\u1000-\u109F]/.test(userMessage);
  const botEmoji = agentSettings?.bot_emoji || "🐝";
  const topicRaw = (widgetResult.result?.title || userMessage || "").toString().trim();
  const topic = topicRaw.replace(/^["'`]+|["'`]+$/g, "").slice(0, 60);

  const burmeseLines = [
    `${botEmoji} ဒီမှာ ${topic ? `${topic} အတွက် ` : ""}dashboard လေး ပြုစုထားပါတယ် 👇`,
    `${botEmoji} ${topic ? `${topic} ရဲ့ ` : ""}အချက်အလက်တွေကို ဒီအတိုင်း ဖော်ပြလိုက်ပါတယ်ဗျာ 👇`,
    `${botEmoji} ကြည့်ရတာ ပိုလွယ်အောင် ${topic ? `${topic} ကို ` : ""}visual အနေနဲ့ စီစဉ်ပေးလိုက်ပါတယ် 👇`,
    `${botEmoji} တွေ့ရှိချက်တွေကို ${topic ? `${topic} အတွက် ` : ""}အောက်က widget မှာ စုစည်းပြထားပါတယ် 👇`,
    `${topic ? `${topic} ` : ""}အကြောင်း တစ်ချက်ကြည့်လိုက်ပါ ${botEmoji} 👇`,
  ];
  const englishLines = [
    `${botEmoji} Here's a quick ${topic ? `${topic} ` : ""}dashboard for you 👇`,
    `${botEmoji} Pulled this together${topic ? ` for ${topic}` : ""} — take a look 👇`,
    `${botEmoji} Wrapped${topic ? ` ${topic}` : " that"} into a visual so it's easier to scan 👇`,
    `${botEmoji} Findings${topic ? ` on ${topic}` : ""} laid out below 👇`,
    `${topic ? `${topic} — ` : ""}at a glance ${botEmoji} 👇`,
  ];
  const pool = isBurmese ? burmeseLines : englishLines;
  return pool[Date.now() % pool.length];
}

