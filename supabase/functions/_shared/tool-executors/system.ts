
// ═══ Project Phoenix: _shared/tool-executors/system.ts ═══
// System health, API keys, broadcast, push, etc.

import { parseTimeDescription, localTimeToUTC, getTimezoneName, parseSchedule, isScheduleError } from "../executor-helpers.ts";
import { formatForMarkdownV2, preflightMarkdownCheck, stripAllMarkdown, convertToHtml } from "../telegram-markdown.ts";

// ═══ Telegram API Helper with 15s Timeout ═══
async function telegramApi(token: string, method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: any; error_code?: number; description?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const rawText = await res.text();
    console.log(`[Telegram] ${method} → ${res.status}:`, rawText.slice(0, 500));
    try {
      return JSON.parse(rawText);
    } catch {
      return { ok: false, error_code: res.status, description: `Non-JSON response: ${rawText.slice(0, 200)}` };
    }
  } catch (e: any) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      console.log(`[Telegram] ${method} → TIMEOUT (15s)`);
      return { ok: false, error_code: 408, description: 'Telegram API timeout (15s)' };
    }
    console.log(`[Telegram] ${method} → ERROR:`, e.message);
    return { ok: false, error_code: 0, description: e.message };
  }
}

// ═══ Levenshtein Fuzzy Matching ═══
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = a[i - 1] === b[j - 1]
        ? d[i - 1][j - 1]
        : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
    }
  }
  return d[m][n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

function findChannel(channels: any[], name?: string): { channel: any | null; suggestion?: string } {
  if (!channels.length) return { channel: null };
  if (!name) {
    const def = channels.find((c: any) => c.is_default && c.is_active);
    return { channel: def || (channels.length === 1 ? channels[0] : null) };
  }
  const lower = name.toLowerCase().replace(/^@/, '');
  // Exact or substring match
  const exact = channels.find((c: any) =>
    c.channel_name?.toLowerCase() === lower ||
    c.channel_name?.toLowerCase().includes(lower) ||
    c.channel_id === name
  );
  if (exact) return { channel: exact };
  // Fuzzy match
  const threshold = lower.length < 5 ? 0.75 : 0.5;
  const autoThreshold = 0.8;
  let best = { ch: null as any, score: 0 };
  for (const ch of channels) {
    const s = similarity(lower, (ch.channel_name || '').toLowerCase());
    if (s > best.score) best = { ch, score: s };
  }
  if (best.score >= autoThreshold) return { channel: best.ch };
  if (best.score >= threshold) return { channel: null, suggestion: best.ch.channel_name };
  return { channel: null };
}

// ═══ Resolve bot token: dedicated channel token → bot_settings_id → deterministic fallback ═══
async function resolveToken(supabase: any, userId: string, channel?: any): Promise<string | null> {
  // 1. Dedicated channel bot_token (highest priority)
  if (channel?.bot_token) return channel.bot_token;

  // 2. Channel bound to a specific bot via bot_settings_id
  if (channel?.bot_settings_id) {
    const { data } = await supabase.from("bot_settings").select("telegram_bot_token").eq("id", channel.bot_settings_id).maybeSingle();
    if (data?.telegram_bot_token) return data.telegram_bot_token;
  }

  // 3. Deterministic fallback: latest active tokened bot for user (ordered by created_at)
  const { data } = await supabase
    .from("bot_settings")
    .select("telegram_bot_token")
    .eq("user_id", userId)
    .not("telegram_bot_token", "is", null)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.telegram_bot_token || null;
}

// ═══ Smart Message Chunker: split long messages at paragraph/line boundaries ═══
const TELEGRAM_MAX_LENGTH = 4000; // leave buffer below 4096

function chunkMessage(text: string, maxLen = TELEGRAM_MAX_LENGTH): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Find best split point: double newline > single newline > sentence end > hard cut
    let splitAt = -1;
    const searchZone = remaining.slice(0, maxLen);

    // Try paragraph break
    const paraIdx = searchZone.lastIndexOf('\n\n');
    if (paraIdx > maxLen * 0.3) splitAt = paraIdx + 2;

    // Try line break
    if (splitAt === -1) {
      const lineIdx = searchZone.lastIndexOf('\n');
      if (lineIdx > maxLen * 0.3) splitAt = lineIdx + 1;
    }

    // Try sentence end
    if (splitAt === -1) {
      const sentenceMatch = searchZone.match(/.*[.!?]\s/s);
      if (sentenceMatch && sentenceMatch[0].length > maxLen * 0.3) splitAt = sentenceMatch[0].length;
    }

    // Hard cut as last resort
    if (splitAt === -1) splitAt = maxLen;

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

// ═══ SENTRY Self-Healing Send: MarkdownV2 → preflight fix → plain text (with auto-chunking) ═══
async function sentryPost(token: string, chatId: string, text: string): Promise<{ ok: boolean; message_id?: number; message_ids?: number[]; chunks_sent?: number; error_code?: number; description?: string }> {
  const chunks = chunkMessage(text);
  const isMultiChunk = chunks.length > 1;
  if (isMultiChunk) console.log(`[SENTRY] Message split into ${chunks.length} chunks`);

  const allMessageIds: number[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const label = isMultiChunk ? ` [${i + 1}/${chunks.length}]` : '';

    // Step 1: Try MarkdownV2
    const formatted = formatForMarkdownV2(chunk);
    const r1 = await telegramApi(token, 'sendMessage', { chat_id: chatId, text: formatted, parse_mode: 'MarkdownV2' });
    console.log(`[SENTRY] Step 1${label} (MarkdownV2): ${r1.ok ? '✅ OK' : `❌ ${r1.error_code}: ${r1.description}`}`);
    if (r1.ok) { allMessageIds.push(r1.result?.message_id); continue; }

    // Step 2: Preflight fix + retry
    if (r1.error_code === 400 && r1.description?.includes('parse')) {
      const { fixed } = preflightMarkdownCheck(formatted);
      const r2 = await telegramApi(token, 'sendMessage', { chat_id: chatId, text: fixed, parse_mode: 'MarkdownV2' });
      console.log(`[SENTRY] Step 2${label} (Preflight fix): ${r2.ok ? '✅ OK' : `❌ ${r2.error_code}: ${r2.description}`}`);
      if (r2.ok) { allMessageIds.push(r2.result?.message_id); continue; }
    }

    // Step 2.5: HTML parse_mode fallback (preserves formatting with Myanmar text)
    const htmlContent = convertToHtml(chunk);
    const r2h = await telegramApi(token, 'sendMessage', { chat_id: chatId, text: htmlContent, parse_mode: 'HTML' });
    console.log(`[SENTRY] Step 2.5${label} (HTML): ${r2h.ok ? '✅ OK' : `❌ ${r2h.error_code}: ${r2h.description}`}`);
    if (r2h.ok) { allMessageIds.push(r2h.result?.message_id); continue; }

    // Step 3: Fallback to plain text
    const plain = stripAllMarkdown(chunk);
    const r3 = await telegramApi(token, 'sendMessage', { chat_id: chatId, text: plain });
    console.log(`[SENTRY] Step 3${label} (Plain text): ${r3.ok ? '✅ OK' : `❌ ${r3.error_code}: ${r3.description}`}`);
    if (r3.ok) { allMessageIds.push(r3.result?.message_id); continue; }

    console.log(`[SENTRY] ❌ ALL 4 STEPS FAILED${label} for chat ${chatId}. Final error: ${r3.error_code} - ${r3.description}`);
    return { ok: false, error_code: r3.error_code, description: r3.description, chunks_sent: allMessageIds.length };
  }

  return { ok: true, message_id: allMessageIds[0], message_ids: allMessageIds, chunks_sent: allMessageIds.length };
}

export async function executeCheckMyHealth(supabase: any, userId: string, args: any) {
  const { time_range = "today" } = args;
  
  // Calculate time window
  const now = new Date();
  let since: string;
  if (time_range === "today") {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  } else if (time_range === "week") {
    since = new Date(now.getTime() - 7 * 86400000).toISOString();
  } else {
    since = new Date(now.getTime() - 24 * 3600000).toISOString();
  }

  // Query real AI usage stats
  const { data: usage } = await supabase.from("agent_ai_usage")
    .select("is_successful, request_duration_ms, tokens_total, error_message, request_count")
    .eq("user_id", userId)
    .gte("created_at", since);

  const total = usage?.reduce((s: number, u: any) => s + (u.request_count || 1), 0) || 0;
  const rowsLogged = usage?.length || 0;
  const successful = usage?.filter((u: any) => u.is_successful)?.length || 0;
  const successRate = rowsLogged > 0 ? Math.round((successful / rowsLogged) * 100) : 100;
  const avgDuration = rowsLogged > 0 ? Math.round(usage!.reduce((s: number, u: any) => s + (u.request_duration_ms || 0), 0) / rowsLogged) : 0;
  const totalTokens = usage?.reduce((s: number, u: any) => s + (u.tokens_total || 0), 0) || 0;
  const errors = usage?.filter((u: any) => !u.is_successful) || [];
  const recentErrors = errors.slice(0, 3).map((e: any) => e.error_message).filter(Boolean);

  // Query heartbeat health
  const { data: heartbeats } = await supabase.from("agent_heartbeat_logs")
    .select("status")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  const hbTotal = heartbeats?.length || 0;
  const hbSuccess = heartbeats?.filter((h: any) => h.status === "success")?.length || 0;
  const hbRate = hbTotal > 0 ? Math.round((hbSuccess / hbTotal) * 100) : 100;

  const verdict = successRate >= 90 && hbRate >= 80 ? "healthy" : successRate >= 70 ? "degraded" : "unhealthy";

  return {
    verdict,
    success_rate: successRate,
    time_range,
    api_metrics: { total_requests: total, rows_logged: rowsLogged, successful, failed: rowsLogged - successful, avg_duration_ms: avgDuration, total_tokens: totalTokens },
    heartbeat_health: { total: hbTotal, success_rate: hbRate },
    recent_errors: recentErrors,
    message: verdict === "healthy" ? "BeeBot is fully operational! 🐝" : verdict === "degraded" ? "⚠️ Some issues detected, but operational." : "🔴 Multiple failures detected. Review errors."
  };
}

export async function executeAuditAIUsage(supabase: any, userId: string, args: any) {
  const { task_id, client_request_id, time_range = "24h" } = args || {};
  const now = new Date();
  const since = task_id || client_request_id
    ? null
    : time_range === "today"
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      : time_range === "this_week"
        ? new Date(now.getTime() - 7 * 86400000).toISOString()
        : time_range === "this_month"
          ? new Date(now.getTime() - 30 * 86400000).toISOString()
          : new Date(now.getTime() - 24 * 3600000).toISOString();

  let query = supabase.from("agent_ai_usage")
    .select("created_at, task_id, client_request_id, trace_id, call_kind, api_source, provider, model_used, request_count, tokens_input, tokens_output, tokens_total, estimated_cost, estimated_iu, request_duration_ms, is_successful, error_message, metadata")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (task_id) query = query.eq("task_id", task_id);
  if (client_request_id) query = query.eq("client_request_id", client_request_id);
  if (since) query = query.gte("created_at", since);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const rows = data || [];
  const totalRequests = rows.reduce((s: number, r: any) => s + (r.request_count || 1), 0);
  const tokensInput = rows.reduce((s: number, r: any) => s + (r.tokens_input || 0), 0);
  const tokensOutput = rows.reduce((s: number, r: any) => s + (r.tokens_output || 0), 0);
  const tokensTotal = rows.reduce((s: number, r: any) => s + (r.tokens_total || 0), 0);
  const estimatedCostUsd = rows.reduce((s: number, r: any) => s + Number(r.estimated_cost || 0), 0);
  const estimatedIU = rows.reduce((s: number, r: any) => s + Number(r.estimated_iu || 0), 0);
  const failures = rows.filter((r: any) => !r.is_successful);

  const byModel: Record<string, any> = {};
  const byProvider: Record<string, any> = {};
  for (const row of rows) {
    const modelKey = row.model_used || "unknown";
    byModel[modelKey] ||= { model: modelKey, requests: 0, tokens_total: 0, estimated_cost_usd: 0, estimated_iu: 0 };
    byModel[modelKey].requests += row.request_count || 1;
    byModel[modelKey].tokens_total += row.tokens_total || 0;
    byModel[modelKey].estimated_cost_usd += Number(row.estimated_cost || 0);
    byModel[modelKey].estimated_iu += Number(row.estimated_iu || 0);

    const providerKey = row.provider || row.api_source || "unknown";
    byProvider[providerKey] ||= { provider: providerKey, requests: 0, tokens_total: 0, estimated_cost_usd: 0, estimated_iu: 0 };
    byProvider[providerKey].requests += row.request_count || 1;
    byProvider[providerKey].tokens_total += row.tokens_total || 0;
    byProvider[providerKey].estimated_cost_usd += Number(row.estimated_cost || 0);
    byProvider[providerKey].estimated_iu += Number(row.estimated_iu || 0);
  }

  return {
    scope: { task_id: task_id || null, client_request_id: client_request_id || null, time_range: task_id || client_request_id ? "exact" : time_range },
    summary: {
      rows_logged: rows.length,
      total_requests: totalRequests,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      tokens_total: tokensTotal,
      estimated_cost_usd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
      estimated_iu: Math.round(estimatedIU * 10_000) / 10_000,
      failed_calls: failures.length,
    },
    by_model: Object.values(byModel).sort((a: any, b: any) => b.requests - a.requests),
    by_provider: Object.values(byProvider).sort((a: any, b: any) => b.requests - a.requests),
    failures: failures.slice(-10).map((r: any) => ({ created_at: r.created_at, model: r.model_used, provider: r.provider, error: r.error_message })),
    calls: rows.map((r: any) => ({
      created_at: r.created_at,
      call_kind: r.call_kind,
      model: r.model_used,
      provider: r.provider,
      api_source: r.api_source,
      request_count: r.request_count || 1,
      tokens_total: r.tokens_total || 0,
      estimated_cost_usd: Number(r.estimated_cost || 0),
      estimated_iu: Number(r.estimated_iu || 0),
      duration_ms: r.request_duration_ms,
      success: r.is_successful,
      trace_id: r.trace_id,
    })),
  };
}

export async function executeGetSystemVitals(supabase: any, args: any) {
  const since24h = new Date(Date.now() - 24 * 3600000).toISOString();

  // Global AI usage stats (last 24h)
  const { data: usage } = await supabase.from("agent_ai_usage")
    .select("is_successful, request_duration_ms, tokens_total, api_source, model_used, estimated_cost, request_count")
    .gte("created_at", since24h);

  const rowsLogged = usage?.length || 0;
  const total = usage?.reduce((s: number, u: any) => s + (u.request_count || 1), 0) || 0;
  const successful = usage?.filter((u: any) => u.is_successful)?.length || 0;
  const successRate = rowsLogged > 0 ? Math.round((successful / rowsLogged) * 100) : 100;
  const avgDuration = rowsLogged > 0 ? Math.round(usage!.reduce((s: number, u: any) => s + (u.request_duration_ms || 0), 0) / rowsLogged) : 0;
  const totalTokens = usage?.reduce((s: number, u: any) => s + (u.tokens_total || 0), 0) || 0;
  const totalCost = usage?.reduce((s: number, u: any) => s + (u.estimated_cost || 0), 0) || 0;

  // API source breakdown
  const sources: Record<string, number> = {};
  const models: Record<string, number> = {};
  for (const u of usage || []) {
    sources[u.api_source] = (sources[u.api_source] || 0) + 1;
    models[u.model_used] = (models[u.model_used] || 0) + 1;
  }

  // Active users count
  const { count: activeUsers } = await supabase.from("agent_chat_sessions")
    .select("*", { count: "exact", head: true })
    .gte("last_message_at", since24h);

  return {
    system_verdict: successRate >= 90 ? "All systems operational" : "Degraded performance detected",
    period: "last_24h",
    api_metrics: { total_requests: total, rows_logged: rowsLogged, success_rate: successRate, avg_duration_ms: avgDuration, total_tokens: totalTokens, estimated_cost_usd: Math.round(totalCost * 10000) / 10000 },
    api_source_breakdown: sources,
    model_usage: models,
    active_users_24h: activeUsers || 0,
  };
}

export async function executeManageApiKey(supabase: any, userId: string, args: any) {
  const { action, api_key, provider } = args;
  
  if (action === "check") {
    const { data } = await supabase.from("user_api_keys").select("is_active, updated_at").eq("user_id", userId).eq("provider", provider).maybeSingle();
    return { exists: !!data, is_active: data?.is_active };
  }
  if (action === "set") {
    if (!api_key || !provider) return { error: "api_key and provider are required" };
    const masked = api_key.length > 8 ? api_key.slice(0, 4) + "****" + api_key.slice(-4) : "****";
    const { error } = await supabase.from("user_api_keys").upsert(
      { user_id: userId, provider, api_key, is_active: true, updated_at: new Date().toISOString() },
      { onConflict: "user_id,provider" }
    );
    if (error) return { error: error.message };
    return { success: true, message: `API key for ${provider} saved (${masked})` };
  }
  if (action === "delete") {
    if (!provider) return { error: "provider is required" };
    const { data } = await supabase.from("user_api_keys").delete().eq("user_id", userId).eq("provider", provider).select("id");
    if (!data?.length) return { error: "No key found for this provider" };
    return { success: true, message: `API key for ${provider} deleted` };
  }
  return { error: "Unknown action. Use: check, set, delete" };
}

// ═══ buildPostLink: single source of truth for Telegram permanent links ═══
function buildPostLink(channel: any, messageId: number | null | undefined): string | null {
  if (!messageId || !channel) return null;
  const name = (channel.channel_name || "").replace(/^@/, "");
  const id = channel.channel_id ? String(channel.channel_id) : "";
  // Public channel (has username, doesn't start with -)
  if (name && !name.startsWith("-") && !/^-?\d+$/.test(name)) {
    return `https://t.me/${name}/${messageId}`;
  }
  // Private supergroup/channel: -100XXXX → t.me/c/XXXX/msg
  if (id.startsWith("-100")) {
    return `https://t.me/c/${id.slice(4)}/${messageId}`;
  }
  return null;
}

// ═══ validatePhotoUrl: HEAD request, content-type + size check ═══
async function validatePhotoUrl(url: string): Promise<{ ok: boolean; reason?: string; content_type?: string; size_mb?: number }> {
  // Allow Telegram file_id passthrough (no http://)
  if (!/^https?:\/\//i.test(url)) {
    return { ok: true, reason: "file_id (no remote validation)" };
  }
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { ok: false, reason: `URL returned HTTP ${r.status}` };
    const ct = r.headers.get("content-type") || "";
    const len = Number(r.headers.get("content-length") || 0);
    const sizeMb = len ? Math.round((len / 1048576) * 100) / 100 : 0;
    if (!ct.startsWith("image/")) return { ok: false, reason: `Not an image (content-type: ${ct || "unknown"})`, content_type: ct };
    if (sizeMb > 5) return { ok: false, reason: `Photo too large (${sizeMb}MB > 5MB Telegram limit). Use sendDocument or compress.`, content_type: ct, size_mb: sizeMb };
    return { ok: true, content_type: ct, size_mb: sizeMb };
  } catch (e: any) {
    return { ok: false, reason: `URL unreachable: ${e.message}` };
  }
}

// ═══ validateButtons: all URLs must be https:// or tg:// ═══
function validateButtons(buttons: any[]): { ok: boolean; reason?: string } {
  if (!Array.isArray(buttons) || buttons.length === 0) return { ok: true };
  for (const b of buttons) {
    if (!b?.text || !b?.url) return { ok: false, reason: `Button missing text or url: ${JSON.stringify(b)}` };
    if (!/^(https?:\/\/|tg:\/\/)/.test(b.url)) return { ok: false, reason: `Button URL must start with https:// or tg:// — got "${b.url}"` };
  }
  return { ok: true };
}

export async function executeBroadcastMessage(supabase: any, userId: string, args: any) {
  const { action, message, channel_name, channel_id: argChannelId, bot_token: argBotToken, bot_username } = args;

  // ── FIX 1: Parameter Normalization ──
  // LLM sometimes sends channels (array), channel (string), or target instead of channel_name
  let resolvedChannelName = channel_name;
  if (!resolvedChannelName && args.channels) {
    resolvedChannelName = Array.isArray(args.channels) ? args.channels[0] : args.channels;
  }
  if (!resolvedChannelName && args.channel) {
    resolvedChannelName = args.channel;
  }
  if (!resolvedChannelName && args.target) {
    resolvedChannelName = args.target;
  }
  // ── FIX 2: Action Normalization ──
  // LLM sometimes omits action when intent is obvious
  let resolvedAction = action?.toLowerCase();
  if (!resolvedAction && message) {
    resolvedAction = "post";
    console.log(`[Broadcast] Action normalized: undefined → "post" (message present)`);
  }
  if (!resolvedAction && !message) {
    resolvedAction = "list_channels";
    console.log(`[Broadcast] Action normalized: undefined → "list_channels" (no message)`);
  }
  console.log(`[Broadcast] Parameter normalization: channel_name="${channel_name}", resolved="${resolvedChannelName}", action="${action}", resolvedAction="${resolvedAction}"`);

  // ── DRY-RUN ALIAS ──
  if ((resolvedAction === "post" || resolvedAction === "post_to_all") && args.dry_run === true) {
    resolvedAction = "preview";
  }

  // ── SCHEDULE SHORTCUT ──
  if (resolvedAction === "post" && (args.schedule_at || args.schedule_recurrence)) {
    const broadcastPayload: Record<string, unknown> = {
      post_type: args.post_type, photo_url: args.photo_url, photo_urls: args.photo_urls,
      poll_question: args.poll_question, poll_options: args.poll_options,
      poll_anonymous: args.poll_anonymous, poll_multiple: args.poll_multiple,
      buttons: args.buttons, pin: args.pin, silent: args.silent,
      disable_link_preview: args.disable_link_preview, parse_mode: args.parse_mode,
      channel_name: resolvedChannelName, message,
    };
    Object.keys(broadcastPayload).forEach((k) => broadcastPayload[k] === undefined && delete broadcastPayload[k]);
    const { data: hb, error: hbErr } = await supabase.from("agent_heartbeats").insert({
      user_id: userId, task_type: "scheduled_task",
      display_name: `Telegram post → ${resolvedChannelName || "default"}`,
      prompt: message ? `Post to Telegram channel "${resolvedChannelName || 'default'}":\n${message}` : `Send scheduled Telegram post`,
      delivery_target: "telegram", delivery_channel_name: resolvedChannelName || null,
      task_config: { delivery_target: "telegram", delivery_channel_name: resolvedChannelName || null, broadcast_payload: broadcastPayload },
      next_run_at: args.schedule_at || null, is_active: true, priority: "normal",
    }).select("id, next_run_at").single();
    if (hbErr) return { success: false, error: `Failed to schedule post: ${hbErr.message}` };
    return { success: true, scheduled: true, task_id: hb.id, next_run_at: hb.next_run_at, message: "📅 Telegram post scheduled. For recurring schedules, use schedule_task directly." };
  }

  // ── PREVIEW ──
  if (resolvedAction === "preview") {
    const { data: channels } = await supabase.from("broadcast_channels").select("*").eq("user_id", userId).eq("is_active", true);
    const { channel, suggestion } = findChannel(channels || [], resolvedChannelName);
    const postType = args.post_type || (args.photo_url ? "photo" : args.photo_urls ? "media_album" : args.poll_question ? "poll" : "text");
    const previewBody: any = {
      action: "preview", post_type: postType,
      target_channel: channel ? { name: channel.channel_name, channel_id: channel.channel_id, bot_username: channel.bot_username } : null,
      channel_match: channel ? "exact" : suggestion ? `did_you_mean:${suggestion}` : "none",
      char_count: (message || "").length,
      defaults: { silent: args.silent === true, pin: args.pin === true, disable_link_preview: args.disable_link_preview === true, parse_mode: args.parse_mode || "auto" },
    };
    if (postType === "text") {
      previewBody.chunk_count = chunkMessage(message || "").length;
      previewBody.over_telegram_limit = (message || "").length > 4096;
      previewBody.markdownv2_rendered = formatForMarkdownV2((message || "").slice(0, 800));
    } else if (postType === "photo") {
      previewBody.caption_length = (message || "").length;
      previewBody.caption_over_limit = (message || "").length > 1024;
      previewBody.photo_validation = args.photo_url ? await validatePhotoUrl(args.photo_url) : { ok: false, reason: "photo_url required" };
    } else if (postType === "media_album") {
      const urls = args.photo_urls || [];
      previewBody.album_size = urls.length;
      previewBody.album_valid = urls.length >= 2 && urls.length <= 10;
      previewBody.photo_validations = await Promise.all(urls.slice(0, 10).map((u: string) => validatePhotoUrl(u)));
    } else if (postType === "poll") {
      previewBody.poll_valid = !!args.poll_question && Array.isArray(args.poll_options) && args.poll_options.length >= 2 && args.poll_options.length <= 10;
    }
    if (args.buttons) previewBody.button_validation = validateButtons(args.buttons);
    if (channel) previewBody.expected_link_pattern = (buildPostLink(channel, 1) || "no public link").replace("/1", "/<message_id>");
    previewBody.next_step = channel ? "Confirm with user, then call action='post' with same args." : "No matching channel. Call action='list_channels' first.";
    return previewBody;
  }

  // ── VERIFY CHANNEL ──
  if (resolvedAction === "verify_channel") {
    const { data: channels } = await supabase.from("broadcast_channels").select("*").eq("user_id", userId);
    const { channel, suggestion } = findChannel(channels || [], resolvedChannelName);
    if (!channel) return { success: false, error: suggestion ? `Did you mean "${suggestion}"?` : `Channel not found` };
    const token = await resolveToken(supabase, userId, channel);
    if (!token) return { success: false, error: "No bot token configured." };
    const meRes = await telegramApi(token, "getMe", {});
    if (!meRes.ok) return { success: false, error: `Bot probe failed: ${meRes.description}`, telegram_code: meRes.error_code };
    const chatRes = await telegramApi(token, "getChat", { chat_id: channel.channel_id });
    const memberRes = await telegramApi(token, "getChatMember", { chat_id: channel.channel_id, user_id: meRes.result.id });
    const status = memberRes.result?.status;
    return {
      success: true, channel_name: channel.channel_name, channel_id: channel.channel_id,
      channel_title: chatRes.result?.title || null, channel_type: chatRes.result?.type || null,
      reachable: chatRes.ok, bot_username: meRes.result.username, bot_status: status || "unknown",
      bot_is_admin: ["administrator", "creator"].includes(status),
      can_post: memberRes.result?.can_post_messages !== false && ["administrator", "creator"].includes(status),
      can_pin: memberRes.result?.can_pin_messages === true || status === "creator",
      can_delete: memberRes.result?.can_delete_messages === true || status === "creator",
      can_edit: memberRes.result?.can_edit_messages === true || status === "creator",
    };
  }

  // ── HEALTH CHECK ──
  if (resolvedAction === "health_check") {
    const { data: channels } = await supabase.from("broadcast_channels").select("*").eq("user_id", userId);
    if (!channels?.length) return { success: true, total: 0, channels: [], summary: "No channels configured." };
    const tokenCache = new Map<string, string | null>();
    const results = await Promise.all(channels.map(async (ch: any) => {
      const cacheKey = ch.bot_settings_id || ch.id;
      let token = tokenCache.get(cacheKey);
      if (token === undefined) { token = await resolveToken(supabase, userId, ch); tokenCache.set(cacheKey, token); }
      if (!token) return { channel_name: ch.channel_name, status: "no_token", healthy: false };
      const chatRes = await telegramApi(token, "getChat", { chat_id: ch.channel_id });
      return { channel_name: ch.channel_name, channel_id: ch.channel_id, is_active: ch.is_active, is_default: ch.is_default,
        bot_username: ch.bot_username, reachable: chatRes.ok, title: chatRes.result?.title || null,
        type: chatRes.result?.type || null, healthy: chatRes.ok, error: chatRes.ok ? null : chatRes.description };
    }));
    const healthy = results.filter((r: any) => r.healthy).length;
    return { success: true, total: channels.length, healthy, degraded: channels.length - healthy, channels: results };
  }

  // ── LIST RECENT POSTS ──
  if (resolvedAction === "list_recent_posts") {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const { data: logs } = await supabase
      .from("agent_heartbeat_logs")
      .select("id, heartbeat_id, payload, created_at, status")
      .eq("user_id", userId).eq("delivery_target", "telegram")
      .order("created_at", { ascending: false }).limit(limit);
    const { data: channels } = await supabase.from("broadcast_channels").select("*").eq("user_id", userId);
    const channelMap = new Map((channels || []).map((c: any) => [c.channel_name, c]));
    const posts = (logs || []).map((l: any) => {
      const p = l.payload || {};
      const msgId = p.message_id || p.telegram_fallback_delivery?.message_id;
      const chName = p.channel_name || p.telegram_fallback_delivery?.channel_name;
      const ch = chName ? channelMap.get(chName) : null;
      return { log_id: l.id, heartbeat_id: l.heartbeat_id, posted_at: l.created_at, status: l.status,
        posted: !!p.posted || !!msgId, message_id: msgId || null, channel_name: chName || null,
        permanent_link: ch && msgId ? buildPostLink(ch, msgId) : (p.permanent_link || p.message_link || null),
        snippet: typeof p.finalContent === "string" ? p.finalContent.slice(0, 120) : null,
        verified: p.verified_success === true };
    });
    return { success: true, total: posts.length, posts };
  }

  // ── EDIT ──
  if (resolvedAction === "edit") {
    if (!args.message_id) return { success: false, error: "message_id is required for edit" };
    if (!message) return { success: false, error: "message (new text) is required for edit" };
    const { data: channels } = await supabase.from("broadcast_channels").select("*").eq("user_id", userId).eq("is_active", true);
    const { channel, suggestion } = findChannel(channels || [], resolvedChannelName);
    if (!channel) return { success: false, error: suggestion ? `Did you mean "${suggestion}"?` : "Channel not found" };
    const token = await resolveToken(supabase, userId, channel);
    if (!token) return { success: false, error: "No bot token configured." };
    let r = await telegramApi(token, "editMessageText", { chat_id: channel.channel_id, message_id: Number(args.message_id), text: formatForMarkdownV2(message), parse_mode: "MarkdownV2" });
    if (!r.ok && r.error_code === 400 && /parse/i.test(r.description || "")) {
      r = await telegramApi(token, "editMessageText", { chat_id: channel.channel_id, message_id: Number(args.message_id), text: convertToHtml(message), parse_mode: "HTML" });
    }
    if (!r.ok && r.error_code === 400 && /parse/i.test(r.description || "")) {
      r = await telegramApi(token, "editMessageText", { chat_id: channel.channel_id, message_id: Number(args.message_id), text: stripAllMarkdown(message) });
    }
    if (r.ok) return { success: true, edited: true, message_id: args.message_id, channel_name: channel.channel_name, permanent_link: buildPostLink(channel, Number(args.message_id)) };
    return { success: false, edited: false, error: `Failed to edit: ${r.description} (code: ${r.error_code})`,
      forensic: { point_of_failure: "Telegram editMessageText", telegram_code: r.error_code, cause: r.description || "Unknown",
        solution: r.error_code === 400 && /not modified/i.test(r.description || "") ? "New text identical — nothing to edit."
          : r.error_code === 400 && /message to edit not found/i.test(r.description || "") ? "Message ID does not exist or was deleted."
          : r.error_code === 403 ? "Bot lacks 'Edit Messages' permission." : "Verify message_id and permissions." } };
  }

  // ── MEDIA ALBUM ──
  if (resolvedAction === "post" && (args.post_type === "media_album" || (args.photo_urls && Array.isArray(args.photo_urls) && args.photo_urls.length >= 2))) {
    const urls: string[] = args.photo_urls || [];
    if (urls.length < 2 || urls.length > 10) return { posted: false, error: `media_album needs 2-10 photos, got ${urls.length}` };
    const { data: channels } = await supabase.from("broadcast_channels").select("*").eq("user_id", userId).eq("is_active", true);
    const { channel, suggestion } = findChannel(channels || [], resolvedChannelName);
    if (!channel) return { posted: false, error: suggestion ? `Did you mean "${suggestion}"?` : "Channel not found" };
    const token = await resolveToken(supabase, userId, channel);
    if (!token) return { posted: false, error: "No bot token configured." };
    const validations = await Promise.all(urls.map((u) => validatePhotoUrl(u)));
    const bad = validations.findIndex((v) => !v.ok);
    if (bad >= 0) return { posted: false, error: `Photo ${bad + 1} invalid: ${validations[bad].reason}`, forensic: { point_of_failure: "Photo URL validation", solution: "Replace failing photo URL with a valid HTTPS image ≤5MB." } };
    const media = urls.map((u, i) => ({ type: "photo", media: u, ...(i === 0 && message ? { caption: message.slice(0, 1024), parse_mode: "HTML" } : {}) }));
    const r = await telegramApi(token, "sendMediaGroup", { chat_id: channel.channel_id, media, disable_notification: args.silent === true });
    if (r.ok) {
      const ids = (r.result || []).map((m: any) => m.message_id);
      return { posted: true, status: "verified_success", message_ids: ids, message_id: ids[0], channel_name: channel.channel_name, post_type: "media_album", permanent_link: buildPostLink(channel, ids[0]) };
    }
    return { posted: false, error: `Album send failed: ${r.description} (code: ${r.error_code})`,
      forensic: { point_of_failure: "Telegram sendMediaGroup", telegram_code: r.error_code, cause: r.description || "Unknown",
        solution: r.error_code === 400 ? "One photo URL may be unreachable. Validate each URL." : "Check bot permissions." } };
  }

  // ── PRE-POST VALIDATION (post / post_to_all) ──
  if (resolvedAction === "post" || resolvedAction === "post_to_all") {
    if (args.buttons) {
      const bv = validateButtons(args.buttons);
      if (!bv.ok) return { posted: false, error: bv.reason, forensic: { point_of_failure: "Button validation", cause: bv.reason, solution: "Use https:// or tg:// URLs for inline buttons." } };
    }
    if (args.photo_url && (args.post_type === "photo" || args.post_type === undefined)) {
      const pv = await validatePhotoUrl(args.photo_url);
      if (!pv.ok) return { posted: false, error: `Photo URL invalid: ${pv.reason}`, forensic: { point_of_failure: "Photo URL validation", cause: pv.reason, solution: "Replace photo_url with a valid HTTPS image ≤5MB, or use sendDocument for larger files." } };
    }
    if (message && args.post_type !== "photo" && message.length > 4096) {
      console.log(`[Broadcast] Message ${message.length} chars — will auto-chunk into ${chunkMessage(message).length} pieces.`);
    }
  }

  // ── LIST CHANNELS ──
  if (resolvedAction === "list_channels") {
    const { data } = await supabase.from("broadcast_channels").select("*").eq("user_id", userId);
    return { success: true, channels: data || [] };
  }

  // ── POST TO ALL CHANNELS ──
  if (resolvedAction === "post_to_all") {
    if (!message) return { posted: false, error: "No message content provided" };
    const { data: channels } = await supabase.from("broadcast_channels").select("*").eq("user_id", userId).eq("is_active", true);
    if (!channels || channels.length === 0) return { posted: false, error: "No active channels configured" };

    // Token cache: avoid redundant resolveToken() calls for channels sharing the same bot
    const tokenCache = new Map<string, string | null>();
    const postResults = await Promise.allSettled(
      channels.map(async (ch: any) => {
        const cacheKey = ch.bot_settings_id || ch.dedicated_bot_token?.slice(0, 10) || ch.id;
        let token = tokenCache.get(cacheKey);
        if (token === undefined) {
          token = await resolveToken(supabase, userId, ch);
          tokenCache.set(cacheKey, token);
        }
        if (!token) return { channel: ch.channel_name, posted: false, error: "No bot token" };
        if (!ch.channel_id) return { channel: ch.channel_name, posted: false, error: "No channel_id" };
        const result = await sentryPost(token, ch.channel_id, message);
        return { channel: ch.channel_name, posted: result.ok, message_id: result.message_id || null, error: result.ok ? null : result.description };
      })
    );

    const formatted = postResults.map((r, i) => r.status === "fulfilled" ? r.value : { channel: channels[i]?.channel_name, posted: false, error: r.reason?.message });
    const successCount = formatted.filter((r: any) => r.posted).length;
    return { posted: successCount > 0, total: channels.length, succeeded: successCount, results: formatted };
  }

  // ── POST ──
  if (resolvedAction === "post") {
    if (!message) return { posted: false, error: "No message content provided" };
    console.log(`[Broadcast] 🚀 Post requested by user ${userId}`);

    const { data: channels } = await supabase.from("broadcast_channels").select("*").eq("user_id", userId).eq("is_active", true);
    const { channel, suggestion } = findChannel(channels || [], resolvedChannelName);
    if (!channel) {
      const available = (channels || []).map((c: any) => c.channel_name);
      console.log(`[Broadcast] ❌ Channel not found. Query="${resolvedChannelName}", Available:`, available);
      if (suggestion) return { posted: false, error: `Channel not found. Did you mean "${suggestion}"?`, available };
      return { posted: false, error: `No matching channel found for "${resolvedChannelName || '(none)'}"`, available };
    }

    // Guard: channel_id must exist
    if (!channel.channel_id) {
      console.log(`[Broadcast] ❌ Channel "${channel.channel_name}" has no channel_id`);
      return { posted: false, error: `Channel "${channel.channel_name}" has no Telegram Chat ID configured. Remove and re-add it.` };
    }
    console.log(`[Broadcast] ✅ Channel: "${channel.channel_name}" (ID: ${channel.channel_id})`);

    const token = await resolveToken(supabase, userId, channel);
    if (!token) {
      console.log(`[Broadcast] ❌ No bot token resolved`);
      return { posted: false, error: "No bot token configured. Set up a bot token in Neural Link settings.",
        forensic: { point_of_failure: "Token Resolution", cause: "No bot token found in channel config or bot_settings", solution: "Go to Neural Link settings and configure a Telegram Bot Token." } };
    }
    console.log(`[Broadcast] ✅ Token resolved (${token.slice(0, 6)}...)`);

    // ── Bot Identity Probe: Use cached bot_username when available ──
    let botId: number | null = null;
    let verifiedBotUsername: string = channel.bot_username || "";

    if (verifiedBotUsername) {
      // Cached bot identity — skip getMe API call
      console.log(`[Broadcast] 🤖 Using cached bot: @${verifiedBotUsername}`);
    } else {
      // No cache — must probe
      const meRes = await telegramApi(token, 'getMe', {});
      if (!meRes.ok) {
        console.log(`[Broadcast] ❌ Identity probe failed: ${meRes.description}`);
        return { posted: false, error: `Bot token invalid or expired: ${meRes.description} (code: ${meRes.error_code})`,
          forensic: { point_of_failure: "Identity Probe (getMe)", telegram_code: meRes.error_code, cause: meRes.description || "Bot token rejected by Telegram", solution: "Verify the bot token is correct and hasn't been revoked. Regenerate via @BotFather if needed." } };
      }
      botId = meRes.result.id;
      verifiedBotUsername = meRes.result.username;
      console.log(`[Broadcast] 🤖 Bot identity: @${verifiedBotUsername} (ID: ${botId})`);

      // Cache bot_username for future calls
      supabase.from("broadcast_channels").update({ bot_username: verifiedBotUsername }).eq("id", channel.id).then(() => {});
    }

    // ── Authority check: skip if bot_username was cached (already verified) ──
    if (!channel.bot_username) {
      // Full probe path — getChat + getChatMember
      const chatRes = await telegramApi(token, 'getChat', { chat_id: channel.channel_id });
      if (!chatRes.ok) {
        console.log(`[Broadcast] ❌ Channel unreachable: ${chatRes.description}`);
        return { posted: false, error: `Channel "${channel.channel_name}" is unreachable: ${chatRes.description} (code: ${chatRes.error_code})`,
          forensic: { point_of_failure: "Reachability Probe (getChat)", telegram_code: chatRes.error_code, cause: chatRes.description || "Channel not accessible", solution: chatRes.error_code === 400 ? "Channel ID may be invalid. Remove and re-add the channel." : "Ensure the bot is still a member of this channel." } };
      }
      console.log(`[Broadcast] ✅ Channel reachable: "${chatRes.result?.title || channel.channel_name}" (type: ${chatRes.result?.type})`);

      if (botId) {
        const memberRes = await telegramApi(token, 'getChatMember', { chat_id: channel.channel_id, user_id: botId });
        if (!memberRes.ok) {
          console.log(`[Broadcast] ❌ Authority probe failed: ${memberRes.description}`);
          return { posted: false, error: `Cannot verify bot permissions in "${channel.channel_name}": ${memberRes.description} (code: ${memberRes.error_code})`,
            forensic: { point_of_failure: "Authority Probe (getChatMember)", telegram_code: memberRes.error_code, cause: memberRes.description || "Permission check failed", solution: "Ensure the bot is added to the channel and try again." } };
        }

        const botStatus = memberRes.result?.status;
        const canPost = memberRes.result?.can_post_messages;
        console.log(`[Broadcast] 🔍 Bot status in "${channel.channel_name}": ${botStatus}, can_post_messages: ${canPost}`);

        if (botStatus === 'left' || botStatus === 'kicked') {
          return { posted: false, error: `Bot @${verifiedBotUsername} is NOT a member of "${channel.channel_name}". Add it to the channel first.`,
            forensic: { point_of_failure: "Authority Probe (getChatMember)", cause: `Bot status: ${botStatus}`, solution: "Add @" + verifiedBotUsername + " to the channel as an admin with 'Post Messages' permission." } };
        }
        if (botStatus === 'member' || botStatus === 'restricted') {
          return { posted: false, error: `Bot @${verifiedBotUsername} is in "${channel.channel_name}" but NOT an admin. Promote it with "Post Messages" permission.`,
            forensic: { point_of_failure: "Authority Probe (getChatMember)", cause: `Bot status: ${botStatus} (not admin)`, solution: "Go to Channel Settings > Admins > Add @" + verifiedBotUsername + " as admin > Enable 'Post Messages'." } };
        }
        if (botStatus === 'administrator' && canPost === false) {
          return { posted: false, error: `Bot @${verifiedBotUsername} is admin in "${channel.channel_name}" but does NOT have "Post Messages" permission.`,
            forensic: { point_of_failure: "Authority Probe (getChatMember)", cause: "Admin without can_post_messages=true", solution: "Go to Channel Settings > Admins > Edit @" + verifiedBotUsername + " > Enable 'Post Messages'." } };
        }
      }
    }

    // ── Determine post type ──
    const postType = args.post_type || 'text';
    const replyMarkup = args.buttons?.length
      ? { inline_keyboard: [args.buttons.map((b: any) => ({ text: b.text, url: b.url }))] }
      : undefined;
    const silent = args.silent === true;
    const shouldPin = args.pin === true;

    let result: { ok: boolean; message_id?: number; message_ids?: number[]; chunks_sent?: number; error_code?: number; description?: string };

    if (postType === 'photo' && args.photo_url) {
      // ── Photo + Caption post ──
      const photoBody: Record<string, unknown> = {
        chat_id: channel.channel_id,
        photo: args.photo_url,
        caption: message?.slice(0, 1024) || '',
        parse_mode: 'HTML',
        disable_notification: silent,
      };
      if (replyMarkup) photoBody.reply_markup = replyMarkup;
      const r = await telegramApi(token, 'sendPhoto', photoBody);
      result = { ok: r.ok, message_id: r.result?.message_id, error_code: r.error_code, description: r.description };
    } else if (postType === 'poll' && args.poll_question && args.poll_options?.length >= 2) {
      // ── Poll post ──
      const pollBody: Record<string, unknown> = {
        chat_id: channel.channel_id,
        question: args.poll_question,
        options: args.poll_options.map((o: string) => ({ text: o })),
        is_anonymous: args.poll_anonymous !== false,
        disable_notification: silent,
      };
      const r = await telegramApi(token, 'sendPoll', pollBody);
      result = { ok: r.ok, message_id: r.result?.message_id, error_code: r.error_code, description: r.description };
    } else {
      // ── Text post (with optional inline buttons) ──
      if (replyMarkup) {
        // Send with inline keyboard directly (skip SENTRY chunking for button posts)
        const body: Record<string, unknown> = {
          chat_id: channel.channel_id,
          text: message,
          reply_markup: replyMarkup,
          disable_notification: silent,
        };
        const r = await telegramApi(token, 'sendMessage', body);
        result = { ok: r.ok, message_id: r.result?.message_id, error_code: r.error_code, description: r.description };
      } else {
        result = await sentryPost(token, channel.channel_id, message);
      }
    }

    console.log(`[Broadcast] Final result (type=${postType}):`, JSON.stringify(result));

    // ── Pin message if requested ──
    if (result.ok && shouldPin && result.message_id) {
      const pinRes = await telegramApi(token, 'pinChatMessage', {
        chat_id: channel.channel_id,
        message_id: result.message_id,
        disable_notification: true,
      });
      console.log(`[Broadcast] Pin result: ${pinRes.ok ? '✅' : '❌'}`);
    }

    // ── Evidence Packet (Verified Success) ──
    if (result.ok) {
      const now = new Date().toISOString();
      const response: any = {
        status: "verified_success",
        posted: true,
        message_id: result.message_id,
        channel_name: channel.channel_name,
        bot_identity: `@${verifiedBotUsername}`,
        timestamp: now,
        post_type: postType,
        pinned: shouldPin && !!result.message_id,
        permanent_link: null,
        message_link: null,
      };
      if (channel.channel_name && !channel.channel_name.startsWith('-')) {
        response.permanent_link = `https://t.me/${channel.channel_name}/${result.message_id}`;
        response.message_link = response.permanent_link;
      }
      console.log(`[Broadcast] ✅ VERIFIED_SUCCESS: msg_id=${result.message_id}, type=${postType}, link=${response.permanent_link}, bot=@${verifiedBotUsername}, time=${now}`);
      return response;
    }

    // ── Forensic Diagnosis (Send Failure) ──
    return { posted: false,
      error: `Failed to post to "${channel.channel_name}": ${result.description || 'Unknown error'} (code: ${result.error_code})`,
      forensic: {
        point_of_failure: `Telegram ${postType === 'photo' ? 'sendPhoto' : postType === 'poll' ? 'sendPoll' : 'sendMessage'}`,
        telegram_code: result.error_code,
        cause: result.description || "Unknown",
        solution: result.error_code === 403
          ? "Go to Channel Settings > Admins > Edit Bot > Enable 'Post Messages'."
          : result.error_code === 400
          ? "Message format may be invalid. Try simpler text without special characters."
          : result.error_code === 429
          ? `Rate limited by Telegram. Wait ${(result as any).parameters?.retry_after || 'a few'} seconds and try again.`
          : "Check bot token validity and channel configuration.",
    } };
  }

  // ── ADD CHANNEL ──
  if (resolvedAction === "add_channel") {
    let resolvedId = argChannelId;
    const name = channel_name || argChannelId || '';
    // If starts with @, resolve via getChat
    if (name.startsWith('@') && !resolvedId) {
      const token = argBotToken || await resolveToken(supabase, userId);
      if (!token) return { success: false, error: "No bot token to resolve channel" };
      const chatRes = await telegramApi(token, 'getChat', { chat_id: name });
      if (!chatRes.ok) return { success: false, error: `Cannot resolve ${name}: ${chatRes.description}`, error_code: chatRes.error_code };
      resolvedId = String(chatRes.result.id);
    }
    if (!resolvedId) return { success: false, error: "channel_id is required" };
    // Verify bot is admin
    const token = argBotToken || await resolveToken(supabase, userId);
    if (token) {
      const meRes = await telegramApi(token, 'getMe', {});
      if (meRes.ok) {
        const memberRes = await telegramApi(token, 'getChatMember', { chat_id: resolvedId, user_id: meRes.result.id });
        if (memberRes.ok) {
          const status = memberRes.result?.status;
          if (status !== 'administrator' && status !== 'creator') {
            return { success: false, error: `Bot is not admin in this channel (status: ${status}). Add the bot as admin first.` };
          }
        }
      }
    }
    const { error } = await supabase.from("broadcast_channels").insert({
      user_id: userId,
      channel_id: resolvedId,
      channel_name: name.replace(/^@/, ''),
      channel_type: 'telegram',
      bot_token: argBotToken || null,
      bot_username: bot_username || null,
      is_active: true,
      is_default: false,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, message: `Channel "${name}" added`, channel_id: resolvedId };
  }

  // ── REMOVE CHANNEL ──
  if (resolvedAction === "remove_channel") {
    const { data: channels } = await supabase.from("broadcast_channels").select("*").eq("user_id", userId);
    const { channel, suggestion } = findChannel(channels || [], channel_name || argChannelId);
    if (!channel) return { success: false, error: suggestion ? `Did you mean "${suggestion}"?` : "Channel not found" };
    await supabase.from("broadcast_channels").delete().eq("id", channel.id);
    return { success: true, message: `Channel "${channel.channel_name}" removed` };
  }

  // ── SET DEFAULT ──
  if (resolvedAction === "set_default") {
    const { data: channels } = await supabase.from("broadcast_channels").select("*").eq("user_id", userId);
    const { channel, suggestion } = findChannel(channels || [], channel_name || argChannelId);
    if (!channel) return { success: false, error: suggestion ? `Did you mean "${suggestion}"?` : "Channel not found" };
    await supabase.from("broadcast_channels").update({ is_default: false }).eq("user_id", userId);
    await supabase.from("broadcast_channels").update({ is_default: true }).eq("id", channel.id);
    return { success: true, message: `"${channel.channel_name}" is now the default channel` };
  }

  // ── DELETE MESSAGE ──
  if (resolvedAction === "delete") {
    if (!args.message_id) return { success: false, error: "Message ID is required to delete a message." };

    const { data: channels } = await supabase.from("broadcast_channels").select("*").eq("user_id", userId).eq("is_active", true);
    const { channel, suggestion } = findChannel(channels || [], resolvedChannelName);
    if (!channel) {
      const available = (channels || []).map((c: any) => c.channel_name);
      if (suggestion) return { success: false, error: `Channel not found. Did you mean "${suggestion}"?`, available };
      return { success: false, error: `No matching channel found for "${resolvedChannelName || '(none)'}"`, available };
    }

    const token = await resolveToken(supabase, userId, channel);
    if (!token) return { success: false, error: "No bot token configured.", forensic: { point_of_failure: "Token Resolution", cause: "No bot token found", solution: "Configure a bot token in Neural Link settings." } };

    const result = await telegramApi(token, 'deleteMessage', { chat_id: channel.channel_id, message_id: Number(args.message_id) });
    console.log(`[Broadcast] Delete message ${args.message_id} from ${channel.channel_name}: ${JSON.stringify(result)}`);

    if (result.ok) {
      return { success: true, deleted: true, message_id: args.message_id, channel_name: channel.channel_name, message: `Message ${args.message_id} deleted from "${channel.channel_name}".` };
    }
    return { success: false, deleted: false, error: `Failed to delete: ${result.description} (code: ${result.error_code})`,
      forensic: { point_of_failure: "Telegram deleteMessage", telegram_code: result.error_code, cause: result.description || "Unknown",
        solution: result.error_code === 400 ? "Message may already be deleted or message ID is invalid."
          : result.error_code === 403 ? "Bot lacks permission to delete messages in this channel."
          : "Check bot permissions and message ID." } };
  }

  // ── RESET ──
  if (resolvedAction === "reset") {
    await supabase.from("broadcast_channels").delete().eq("user_id", userId);
    await supabase.from("bot_settings").update({ telegram_bot_token: null, is_active: false }).eq("user_id", userId);
    return { success: true, message: "All broadcast channels and bot config have been reset" };
  }

  return { success: false, error: `Unknown action: ${resolvedAction}` };
}

export async function executeGetMyConfig(supabase: any, userId: string, sourceChannel?: string) {
  // Identity: fetch actual bot details
  const { data: bot } = await supabase
    .from("bot_settings")
    .select("name, description, telegram_bot_token, bot_username, is_active, allow_dm, trigger_word, last_activity_at, last_error_message, message_count_24h, group_bot_token, group_bot_username, group_bot_name, group_bot_custom_instruction")
    .eq("user_id", userId)
    .maybeSingle();

  // Broadcast network: fetch all channels with details
  const { data: channels } = await supabase
    .from("broadcast_channels")
    .select("channel_name, channel_id, channel_type, bot_username, is_active, is_default, created_at")
    .eq("user_id", userId);

  // Build identity block
  const myIdentity = bot ? {
    bot_name: bot.name || "BeeBot",
    bot_username: bot.bot_username || null,
    bot_token_status: bot.telegram_bot_token ? "configured" : "not_set",
    is_active: bot.is_active ?? false,
    allow_dm: bot.allow_dm ?? false,
    trigger_word: bot.trigger_word || null,
    description: bot.description || null,
  } : { bot_name: "BeeBot", bot_username: null, bot_token_status: "not_configured", is_active: false };

  // Build network map
  const broadcastNetwork = (channels || []).map((ch: any) => ({
    name: ch.channel_name || ch.channel_id,
    channel_id: ch.channel_id,
    type: ch.channel_type || "telegram",
    bot_username: ch.bot_username || null,
    status: ch.is_active ? "connected" : "disconnected",
    is_default: ch.is_default || false,
    added: ch.created_at,
  }));

  // Health assessment
  const hasRecentError = bot?.last_error_message && bot?.last_activity_at;
  const connectionHealth = !bot ? "not_configured"
    : !bot.telegram_bot_token ? "no_token"
    : hasRecentError ? "degraded"
    : "operational";

  // Group Bot details
  const groupBot = bot ? {
    username: bot.group_bot_username || null,
    name: bot.group_bot_name || null,
    token_status: bot.group_bot_token ? "configured" : "not_set",
    custom_instruction: bot.group_bot_custom_instruction || null,
    has_custom_persona: !!bot.group_bot_custom_instruction,
  } : null;

  return {
    my_identity: myIdentity,
    current_session: {
      platform: sourceChannel || "web",
      is_live: true,
    },
    broadcast_network: broadcastNetwork,
    total_channels: broadcastNetwork.length,
    connection_health: connectionHealth,
    recent_activity: {
      messages_24h: bot?.message_count_24h || 0,
      last_error: bot?.last_error_message || null,
    },
    group_bot: groupBot,
  };
}

export async function executeScheduleTask(supabase: any, userId: string, args: any, timezone?: string, runtimeOpts?: { effectiveNowMs?: number; driftMs?: number }) {
  const { action, prompt, time_desc } = args;

  // ═══ CREATE (v2 — structured-first, dry_run, audit trail) ═══
  if (action === "create") {
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return { error: "prompt is required for create" };
    }

    // Resolve timezone: arg.timezone > runtime timezone > 'UTC' (with explicit warning)
    const resolvedTz = (typeof args.timezone === "string" && args.timezone.trim()) || timezone || "UTC";
    const tzWarning = resolvedTz === "UTC" && !args.timezone && !timezone
      ? "No timezone provided; defaulting to UTC. User-local times may not match expectations."
      : null;

    // Build structured input (let parseSchedule decide structured vs NL path)
    const scheduleInput = {
      recurrence: args.recurrence,
      at_time: args.at_time,
      weekdays: args.weekdays,
      day_of_month: args.day_of_month,
      interval_minutes: args.interval_minutes,
      interval_hours: args.interval_hours,
      start_at: args.start_at,
      end_at: args.end_at,
      cron_expression: args.cron_expression,
      time_desc: time_desc,
    };

    // Use server-side effective-now anchor (corrects for client clock drift)
    const effectiveNow = runtimeOpts?.effectiveNowMs ? new Date(runtimeOpts.effectiveNowMs) : undefined;
    const parsed = parseSchedule(scheduleInput, resolvedTz, effectiveNow);
    if (isScheduleError(parsed)) {
      return {
        error: parsed.error,
        suggestions: parsed.suggestions || [],
        hint: "Provide either structured params (recurrence + at_time + timezone) or a clearer time_desc.",
      };
    }

    // Dry-run: return parsed schedule without committing to DB
    if (args.dry_run === true) {
      return {
        success: true,
        verified: true,
        dry_run: true,
        message: `Dry run — schedule would be: ${parsed.display_time_local}`,
        schedule_kind: parsed.schedule_kind,
        cron_expression_utc: parsed.cron_expression_utc,
        one_off_utc: parsed.one_off_utc,
        display_time_local: parsed.display_time_local,
        display_timezone_label: parsed.display_timezone_label,
        next_3_runs_local: parsed.next_3_runs_local,
        next_3_runs_utc: parsed.next_3_runs_utc,
        validation_warnings: [
          ...(tzWarning ? [tzWarning] : []),
          ...parsed.validation_warnings,
        ],
        parser_path: parsed.parser_path,
      };
    }

    // ═══ Task Creation Rate Limit: Max 20 per user ═══
    const { count: existingCount } = await supabase
      .from("agent_heartbeats")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("task_type", "scheduled_task")
      .eq("is_active", true);

    if ((existingCount ?? 0) >= 20) {
      return { error: "Maximum 20 active scheduled tasks per user. Deactivate or delete existing tasks first." };
    }

    const priority = ['low', 'normal', 'high', 'critical'].includes(args.priority) ? args.priority : 'normal';
    const autonomyLevel = ['assisted', 'autonomous', 'guardian'].includes(args.autonomy_level)
      ? args.autonomy_level
      : 'autonomous';
    const contextMemory = ['light', 'deep'].includes(args.context_memory)
      ? args.context_memory
      : 'deep';
    const selfHeal = args.self_heal === false ? false : true;
    const qualityFloorRaw = Number(args.quality_floor);
    const qualityFloor = Number.isFinite(qualityFloorRaw)
      ? Math.max(40, Math.min(95, Math.round(qualityFloorRaw)))
      : 72;
    const refireRaw = Number(args.max_refire_attempts);
    const maxRefireAttempts = Number.isFinite(refireRaw)
      ? Math.max(0, Math.min(5, Math.round(refireRaw)))
      : selfHeal ? (autonomyLevel === 'guardian' ? 3 : autonomyLevel === 'autonomous' ? 2 : 1) : 0;

    // ═══ Telegram Delivery Intent Detection ═══
    const telegramKeywords = /telegram|channel|broadcast|post\s+to|publish\s+to/i;
    const hasTelegramIntent = telegramKeywords.test(prompt);
    const deliveryTarget = args.delivery_target || (hasTelegramIntent ? "telegram" : "in_app");
    const deliveryChannelName = args.delivery_channel_name || null;

    // Compute first next_run_at — for recurring, this is parsed.next_3_runs_utc[0]
    const firstNextRun = parsed.one_off_utc || parsed.next_3_runs_utc[0] || null;

    const { data, error } = await supabase.from("agent_heartbeats").insert({
      user_id: userId,
      name: `sched_${Date.now()}`,
      display_name: prompt.slice(0, 40),
      task_type: "scheduled_task",
      cron_expression: parsed.cron_expression_utc,
      is_active: true,
      trigger_type: "cron",
      task_config: {
        prompt,
        // Original intent (for DST self-heal + auditability)
        original_time: time_desc || JSON.stringify({
          recurrence: args.recurrence, at_time: args.at_time, weekdays: args.weekdays,
          day_of_month: args.day_of_month, interval_minutes: args.interval_minutes,
          interval_hours: args.interval_hours, start_at: args.start_at,
        }),
        original_local_time: args.at_time || null,
        original_recurrence: args.recurrence || null,
        original_weekdays: args.weekdays || null,
        original_day_of_month: args.day_of_month || null,
        original_timezone: resolvedTz,
        end_at_utc: parsed.end_at_utc || null,
        // Resolved schedule
        schedule_type: parsed.schedule_kind === "one_off" ? "one_off" : "recurring",
        is_one_off: parsed.schedule_kind === "one_off",
        // Audit trail
        parsed_at: new Date().toISOString(),
        parser_version: parsed.parser_version,
        parser_path: parsed.parser_path,
        next_3_runs_local_at_create: parsed.next_3_runs_local,
        // ═══ Dual UTC + Local Stamps (Timezone Sovereignty) ═══
        // UI uses these for accurate, server-stamped display without recomputing.
        // Heartbeat worker refreshes them after every fire to stay current.
        next_run_at_utc: parsed.next_3_runs_utc[0] || parsed.one_off_utc || null,
        next_run_at_local: parsed.next_3_runs_local[0] || null,
        next_3_runs_utc: parsed.next_3_runs_utc,
        next_3_runs_local: parsed.next_3_runs_local,
        display_timezone_label: parsed.display_timezone_label,
        last_drift_ms: runtimeOpts?.driftMs ?? 0,
        ...(deliveryTarget === "telegram" && { delivery_target: "telegram" }),
        ...(deliveryChannelName && { delivery_channel_name: deliveryChannelName }),
        ...(typeof args.success_criteria === "string" && args.success_criteria.trim()
          ? { success_criteria: args.success_criteria.trim() }
          : {}),
        ...(["auto", "required", "none"].includes(args.freshness)
          ? { freshness: args.freshness }
          : {}),
        agentic_profile: "beebot_agentic_era",
        agentic_contract_version: 1,
        autonomy_level: autonomyLevel,
        context_memory: contextMemory,
        self_heal: selfHeal,
        quality_floor: qualityFloor,
        max_refire_attempts: maxRefireAttempts,
      },
      next_run_at: firstNextRun,
      priority,
    }).select("id, next_run_at").single();

    if (error) return { error: error.message };

    const nowMs = Date.now();
    const firstFireMs = firstNextRun ? new Date(firstNextRun).getTime() : null;
    const secondsUntilFirstFire = firstFireMs ? Math.max(0, Math.round((firstFireMs - nowMs) / 1000)) : null;

    return {
      success: true,
      verified: true,
      task_id: data.id,
      next_run_at: data.next_run_at,
      delivery_target: deliveryTarget,
      agentic_profile: "beebot_agentic_era",
      autonomy_level: autonomyLevel,
      context_memory: contextMemory,
      self_heal: selfHeal,
      quality_floor: qualityFloor,
      schedule_kind: parsed.schedule_kind,
      cron_expression_utc: parsed.cron_expression_utc,
      display_time_local: parsed.display_time_local,
      display_timezone_label: parsed.display_timezone_label,
      next_3_runs_local: parsed.next_3_runs_local,
      seconds_until_first_fire: secondsUntilFirstFire,
      validation_warnings: [
        ...(tzWarning ? [tzWarning] : []),
        ...parsed.validation_warnings,
      ],
      message: `Task scheduled: ${prompt} → ${parsed.display_time_local}${deliveryTarget === "telegram" ? " (→ Telegram)" : ""}`,
    };
  }
  
  // ═══ LIST (Enhanced with humanized fields for agent quoting) ═══
  if (action === "list") {
    const { enrichScheduledTask } = await import("../schedule-humanizer.ts");
    const tz = (typeof args.timezone === "string" && args.timezone) || timezone || "UTC";

    const { data } = await supabase.from("agent_heartbeats")
      .select("*")
      .eq("user_id", userId)
      .eq("task_type", "scheduled_task")
      .order("next_run_at", { ascending: true });

    const rows = data || [];
    const enriched = rows.map((t: any) => enrichScheduledTask(t, tz));
    const activeTasks = enriched.filter((t: any) => t.is_active);
    const now = new Date();
    const nextAlarm = activeTasks.find((t: any) => t.next_run_at && new Date(t.next_run_at) > now);

    return {
      success: true,
      verified: true,
      tasks: enriched,
      total: enriched.length,
      active: activeTasks.length,
      next_alarm: nextAlarm ? {
        task_id: nextAlarm.id,
        friendly_label: nextAlarm.friendly_label,
        prompt: nextAlarm.prompt,
        schedule_human: nextAlarm.schedule_human,
        next_run_at: nextAlarm.next_run_at,
        next_run_human: nextAlarm.next_run_human,
        is_one_off: nextAlarm.is_one_off,
      } : null,
      _agent_hint: "Quote `friendly_label` + `schedule_human` + `next_run_human` directly. Do not re-parse cron_expression.",
    };
  }

  // ═══ GET (single task detail, enriched) ═══
  if (action === "get") {
    if (!args.task_id) return { error: "task_id is required" };
    const { enrichScheduledTask } = await import("../schedule-humanizer.ts");
    const tz = (typeof args.timezone === "string" && args.timezone) || timezone || "UTC";

    const { data, error } = await supabase.from("agent_heartbeats")
      .select("*")
      .eq("id", args.task_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { success: false, verified: true, not_found: true, message: `Task ${args.task_id} not found` };
    return {
      success: true,
      verified: true,
      task: enrichScheduledTask(data, tz),
      _agent_hint: "Use `friendly_label`, `schedule_human`, `next_run_human`, `last_run_status_label` verbatim when describing this task to the user.",
    };
  }

  // ═══ SUMMARY (compact overview for casual "what's running?" queries) ═══
  if (action === "summary") {
    const { enrichScheduledTask } = await import("../schedule-humanizer.ts");
    const tz = (typeof args.timezone === "string" && args.timezone) || timezone || "UTC";

    const { data } = await supabase.from("agent_heartbeats")
      .select("id, display_name, task_config, cron_expression, next_run_at, last_run_at, last_status, last_result, is_active, priority, refire_count, created_at")
      .eq("user_id", userId)
      .eq("task_type", "scheduled_task")
      .order("is_active", { ascending: false })
      .order("next_run_at", { ascending: true });

    const rows = data || [];
    const enriched = rows.map((t: any) => enrichScheduledTask(t, tz));
    const active = enriched.filter((t: any) => t.is_active);
    const paused = enriched.filter((t: any) => !t.is_active);

    return {
      success: true,
      verified: true,
      active_count: active.length,
      paused_count: paused.length,
      items: enriched.map((t: any) => ({
        id: t.id,
        friendly_label: t.friendly_label,
        schedule_human: t.schedule_human,
        next_run_human: t.is_active ? t.next_run_human : "paused",
        last_run_status_label: t.last_run_status_label,
        health: t.health,
        is_active: t.is_active,
      })),
      _agent_hint: "1-2 line conversational reply. List each as `{friendly_label} — {schedule_human}, နောက်တစ်ခါ {next_run_human}`. Do NOT dump as a table unless user asked for full details.",
    };
  }

  
  // ═══ DELETE (with pre-check + post-check verification) ═══
  if (action === "delete") {
    if (!args.task_id) return { error: "task_id is required" };
    
    // Pre-check: verify task exists
    const { data: before } = await supabase.from("agent_heartbeats")
      .select("id, display_name, task_config")
      .eq("id", args.task_id)
      .eq("user_id", userId)
      .maybeSingle();
    
    if (!before) {
      return { success: false, verified: true, not_found: true, message: `Task ${args.task_id} not found. Cannot delete a task that doesn't exist.` };
    }
    
    // Execute delete
    const { error } = await supabase.from("agent_heartbeats")
      .delete()
      .eq("id", args.task_id)
      .eq("user_id", userId);
    if (error) return { error: error.message, verified: false };
    
    // Post-check: verify deletion
    const { data: after } = await supabase.from("agent_heartbeats")
      .select("id")
      .eq("id", args.task_id)
      .eq("user_id", userId)
      .maybeSingle();
    
    if (after) {
      return { success: false, verified: true, message: "Delete command sent but task still exists in database." };
    }
    
    return {
      success: true,
      verified: true,
      deleted_task_id: args.task_id,
      deleted_prompt: before.task_config?.prompt || before.display_name,
      deleted_at: new Date().toISOString(),
      message: `Task "${before.task_config?.prompt || before.display_name}" has been permanently deleted.`,
    };
  }
  
  // ═══ PAUSE (with pre-check + post-check) ═══
  if (action === "pause") {
    if (!args.task_id) return { error: "task_id is required" };
    
    const { data: before } = await supabase.from("agent_heartbeats")
      .select("id, is_active, display_name, task_config")
      .eq("id", args.task_id)
      .eq("user_id", userId)
      .maybeSingle();
    
    if (!before) return { success: false, verified: true, not_found: true, message: `Task ${args.task_id} not found.` };
    if (!before.is_active) return { success: true, verified: true, message: "Task is already paused.", already_paused: true };
    
    const { error } = await supabase.from("agent_heartbeats")
      .update({ is_active: false })
      .eq("id", args.task_id)
      .eq("user_id", userId);
    if (error) return { error: error.message, verified: false };
    
    // Post-check
    const { data: after } = await supabase.from("agent_heartbeats")
      .select("is_active").eq("id", args.task_id).eq("user_id", userId).maybeSingle();
    
    return {
      success: true,
      verified: after?.is_active === false,
      message: `Task "${before.task_config?.prompt || before.display_name}" paused.`,
      task_id: args.task_id,
    };
  }
  
  // ═══ RESUME (with pre-check + post-check) ═══
  if (action === "resume") {
    if (!args.task_id) return { error: "task_id is required" };
    
    const { data: before } = await supabase.from("agent_heartbeats")
      .select("id, is_active, display_name, task_config")
      .eq("id", args.task_id)
      .eq("user_id", userId)
      .maybeSingle();
    
    if (!before) return { success: false, verified: true, not_found: true, message: `Task ${args.task_id} not found.` };
    if (before.is_active) return { success: true, verified: true, message: "Task is already active.", already_active: true };
    
    const { error } = await supabase.from("agent_heartbeats")
      .update({ is_active: true })
      .eq("id", args.task_id)
      .eq("user_id", userId);
    if (error) return { error: error.message, verified: false };
    
    const { data: after } = await supabase.from("agent_heartbeats")
      .select("is_active").eq("id", args.task_id).eq("user_id", userId).maybeSingle();
    
    return {
      success: true,
      verified: after?.is_active === true,
      message: `Task "${before.task_config?.prompt || before.display_name}" resumed.`,
      task_id: args.task_id,
    };
  }
  
  // ═══ COMPLETE (alias for one-off deactivation) ═══
  if (action === "complete") {
    if (!args.task_id) return { error: "task_id is required" };
    
    const { data: before } = await supabase.from("agent_heartbeats")
      .select("id, is_active, display_name, task_config, cron_expression")
      .eq("id", args.task_id)
      .eq("user_id", userId)
      .maybeSingle();
    
    if (!before) return { success: false, verified: true, not_found: true, message: `Task ${args.task_id} not found.` };
    
    // One-off tasks: deactivate. Recurring: also deactivate (user explicitly completing).
    const { error } = await supabase.from("agent_heartbeats")
      .update({ is_active: false })
      .eq("id", args.task_id)
      .eq("user_id", userId);
    if (error) return { error: error.message, verified: false };
    
    return {
      success: true,
      verified: true,
      message: `Task "${before.task_config?.prompt || before.display_name}" marked as complete and deactivated.`,
      task_id: args.task_id,
      was_one_off: !before.cron_expression,
    };
  }
  
  // ═══ UPDATE (with pre-check + post-check) ═══
  if (action === "update") {
    if (!args.task_id) return { error: "task_id is required" };
    const { data: existing, error: fetchErr } = await supabase.from("agent_heartbeats")
      .select("*")
      .eq("id", args.task_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (fetchErr) return { error: fetchErr.message };
    if (!existing) return { success: false, verified: true, not_found: true, message: `Task ${args.task_id} not found.` };
    
    const updates: any = {};
    if (args.prompt) {
      updates.display_name = args.prompt.slice(0, 40);
      updates.task_config = { ...(existing.task_config || {}), prompt: args.prompt };
    }
    if (args.priority && ['low', 'normal', 'high', 'critical'].includes(args.priority)) {
      updates.priority = args.priority;
    }
    const hasAgenticPolicyUpdate =
      args.autonomy_level !== undefined ||
      args.context_memory !== undefined ||
      args.self_heal !== undefined ||
      args.quality_floor !== undefined ||
      args.max_refire_attempts !== undefined ||
      args.success_criteria !== undefined ||
      args.freshness !== undefined;
    if (hasAgenticPolicyUpdate) {
      const existingConfig = updates.task_config || existing.task_config || {};
      const nextConfig = { ...existingConfig };
      if (['assisted', 'autonomous', 'guardian'].includes(args.autonomy_level)) nextConfig.autonomy_level = args.autonomy_level;
      if (['light', 'deep'].includes(args.context_memory)) nextConfig.context_memory = args.context_memory;
      if (typeof args.self_heal === "boolean") nextConfig.self_heal = args.self_heal;
      if (typeof args.success_criteria === "string" && args.success_criteria.trim()) nextConfig.success_criteria = args.success_criteria.trim();
      if (["auto", "required", "none"].includes(args.freshness)) nextConfig.freshness = args.freshness;
      const q = Number(args.quality_floor);
      if (Number.isFinite(q)) nextConfig.quality_floor = Math.max(40, Math.min(95, Math.round(q)));
      const r = Number(args.max_refire_attempts);
      if (Number.isFinite(r)) nextConfig.max_refire_attempts = Math.max(0, Math.min(5, Math.round(r)));
      nextConfig.agentic_profile = nextConfig.agentic_profile || "beebot_agentic_era";
      nextConfig.agentic_contract_version = 1;
      updates.task_config = nextConfig;
    }
    // Re-schedule if time params provided (structured OR time_desc)
    const hasTimeUpdate = !!(
      args.time_desc || args.recurrence || args.at_time || args.weekdays ||
      args.day_of_month || args.interval_minutes || args.interval_hours ||
      args.start_at || args.cron_expression
    );
    if (hasTimeUpdate) {
      const resolvedTz = (typeof args.timezone === "string" && args.timezone.trim()) || timezone || existing.task_config?.original_timezone || "UTC";
      const parsed = parseSchedule({
        recurrence: args.recurrence, at_time: args.at_time, weekdays: args.weekdays,
        day_of_month: args.day_of_month, interval_minutes: args.interval_minutes,
        interval_hours: args.interval_hours, start_at: args.start_at, end_at: args.end_at,
        cron_expression: args.cron_expression, time_desc: args.time_desc,
      }, resolvedTz);
      if (isScheduleError(parsed)) {
        return { error: `Time update failed: ${parsed.error}`, suggestions: parsed.suggestions || [] };
      }
      updates.cron_expression = parsed.cron_expression_utc;
      updates.next_run_at = parsed.one_off_utc || parsed.next_3_runs_utc[0] || null;
      const existingConfig = updates.task_config || existing.task_config || {};
      updates.task_config = {
        ...existingConfig,
        original_time: args.time_desc || existingConfig.original_time,
        original_local_time: args.at_time || existingConfig.original_local_time || null,
        original_recurrence: args.recurrence || existingConfig.original_recurrence || null,
        original_weekdays: args.weekdays || existingConfig.original_weekdays || null,
        original_day_of_month: args.day_of_month || existingConfig.original_day_of_month || null,
        original_timezone: resolvedTz,
        end_at_utc: parsed.end_at_utc ?? existingConfig.end_at_utc ?? null,
        schedule_type: parsed.schedule_kind === "one_off" ? "one_off" : "recurring",
        is_one_off: parsed.schedule_kind === "one_off",
        parsed_at: new Date().toISOString(),
        parser_version: parsed.parser_version,
        parser_path: parsed.parser_path,
        next_3_runs_local_at_create: parsed.next_3_runs_local,
      };
    }
    
    if (Object.keys(updates).length === 0) return { error: "Nothing to update. Provide prompt, time_desc, priority, or agentic policy fields." };
    
    const { error: updateErr } = await supabase.from("agent_heartbeats")
      .update(updates)
      .eq("id", args.task_id)
      .eq("user_id", userId);
    if (updateErr) return { error: updateErr.message, verified: false };
    
    // Post-check
    const { data: after } = await supabase.from("agent_heartbeats")
      .select("display_name, priority, next_run_at, task_config")
      .eq("id", args.task_id).eq("user_id", userId).maybeSingle();
    
    return {
      success: true,
      verified: !!after,
      message: `Task updated successfully.`,
      task_id: args.task_id,
      updated_fields: Object.keys(updates),
      current_state: after ? {
        prompt: after.task_config?.prompt || after.display_name,
        priority: after.priority,
        next_run_at: after.next_run_at,
      } : null,
    };
  }
  
  return { error: `Unknown action: ${action}. Valid actions: create, list, get, delete, pause, resume, update, complete` };
}

export async function executeSendPushNotification(supabase: any, userId: string, args: any) {
  // Call edge function
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ user_id: userId, title: args.title, body: args.body }),
    });
    return await res.json();
  } catch (e: any) { return { error: e.message }; }
}

export async function executeAnalyzeMyLogs(supabase: any, userId: string, args: any) {
  // Simplified log analysis
  const { data } = await supabase.from("agent_communication_log").select("*").eq("requester_agent_id", userId).limit(10);
  return { success: true, logs: data || [] };
}

export async function executeUpdateMyInstructions(supabase: any, userId: string, args: any) {
  const { skill_name, new_instructions } = args;
  await supabase.from("agent_skills").update({ instructions_md: new_instructions }).eq("user_id", userId).eq("skill_name", skill_name);
  return { success: true, message: "Instructions updated" };
}

// ═══ CONFIGURE GROUP BOT (Project OVERLORD) ═══
export async function executeConfigureGroupBot(supabase: any, userId: string, args: any) {
  const { action, instruction } = args;

  // Try group_bots table first, fallback to bot_settings
  let bot: any = null;
  const { data: groupBots } = await supabase
    .from("group_bots")
    .select("id, bot_token, bot_username, bot_name, custom_instruction")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  
  if (groupBots) {
    bot = {
      id: groupBots.id,
      group_bot_token: groupBots.bot_token,
      group_bot_username: groupBots.bot_username,
      group_bot_name: groupBots.bot_name,
      group_bot_custom_instruction: groupBots.custom_instruction,
    };
  } else {
    const { data: legacyBot } = await supabase
      .from("bot_settings")
      .select("id, group_bot_token, group_bot_username, group_bot_name, group_bot_custom_instruction")
      .eq("user_id", userId)
      .maybeSingle();
    bot = legacyBot;
  }

  if (!bot) {
    return { error: "No bot settings found. Please configure your bot first." };
  }

  const groupBotInfo = {
    username: bot.group_bot_username || null,
    name: bot.group_bot_name || null,
    token_status: bot.group_bot_token ? "configured" : "not_set",
    custom_instruction: bot.group_bot_custom_instruction || null,
    has_custom_persona: !!bot.group_bot_custom_instruction,
  };

  switch (action) {
    case "get_config":
      return {
        success: true,
        action: "get_config",
        group_bot: groupBotInfo,
        display_message: groupBotInfo.username
          ? `Group Bot @${groupBotInfo.username} (${groupBotInfo.name || 'N/A'}) | Custom Persona: ${groupBotInfo.has_custom_persona ? 'Active' : 'Default'}`
          : "Group Bot is not configured yet.",
      };

    case "set_instruction":
      if (!instruction || instruction.trim().length === 0) {
        return { error: "Instruction text is required for set_instruction action." };
      }
      if (instruction.length > 2000) {
        return { error: "Custom instruction must be under 2000 characters." };
      }
      if (groupBots) {
        await supabase.from("group_bots").update({ custom_instruction: instruction.trim(), updated_at: new Date().toISOString() }).eq("id", groupBots.id);
      } else {
        await supabase.from("bot_settings").update({ group_bot_custom_instruction: instruction.trim(), updated_at: new Date().toISOString() }).eq("user_id", userId);
      }
      return {
        success: true,
        action: "set_instruction",
        group_bot: { ...groupBotInfo, custom_instruction: instruction.trim(), has_custom_persona: true },
        display_message: `✅ Group Bot custom persona updated successfully! The group bot will now follow: "${instruction.trim().slice(0, 100)}${instruction.trim().length > 100 ? '...' : ''}"`,
      };

    case "clear_instruction":
      if (groupBots) {
        await supabase.from("group_bots").update({ custom_instruction: null, updated_at: new Date().toISOString() }).eq("id", groupBots.id);
      } else {
        await supabase.from("bot_settings").update({ group_bot_custom_instruction: null, updated_at: new Date().toISOString() }).eq("user_id", userId);
      }
      return {
        success: true,
        action: "clear_instruction",
        group_bot: { ...groupBotInfo, custom_instruction: null, has_custom_persona: false },
        display_message: "✅ Group Bot custom persona cleared. It will use the default Knowledge Assistant persona.",
      };

    default:
      return { error: `Unknown action: ${action}. Use get_config, set_instruction, or clear_instruction.` };
  }
}

// ═══ OPENCLAW: FULL CRON/HEARTBEAT MANAGER ═══
export async function executeCronManager(supabase: any, userId: string, args: any, timezone?: string) {
  const { action } = args;

  // ═══ LIST all crons ═══
  if (action === "list") {
    const { data, error } = await supabase
      .from("agent_heartbeats")
      .select("id, display_name, task_type, trigger_type, cron_expression, next_run_at, is_active, priority, last_run_at, last_status, action_count, task_config")
      .eq("user_id", userId)
      .order("is_active", { ascending: false })
      .order("next_run_at", { ascending: true })
      .limit(50);

    if (error) return { error: error.message };

    return {
      success: true,
      crons: (data || []).map((c: any) => ({
        id: c.id,
        name: c.display_name,
        type: c.task_type,
        trigger: c.trigger_type,
        cron: c.cron_expression,
        next_run: c.next_run_at,
        is_active: c.is_active,
        priority: c.priority,
        last_run: c.last_run_at,
        last_status: c.last_status,
        run_count: c.action_count,
        prompt: c.task_config?.prompt || null,
        schedule_type: c.cron_expression ? "recurring" : "one_off",
      })),
      total: data?.length || 0,
    };
  }

  // ═══ STATUS of a specific cron ═══
  if (action === "status") {
    if (!args.task_id) return { error: "task_id is required for status action." };

    const { data, error } = await supabase
      .from("agent_heartbeats")
      .select("*")
      .eq("id", args.task_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: `Cron ${args.task_id} not found.` };

    // Get recent logs
    const { data: logs } = await supabase
      .from("agent_heartbeat_logs")
      .select("status, result, created_at")
      .eq("heartbeat_id", args.task_id)
      .order("created_at", { ascending: false })
      .limit(5);

    return {
      success: true,
      cron: {
        id: data.id,
        name: data.display_name,
        type: data.task_type,
        cron: data.cron_expression,
        next_run: data.next_run_at,
        is_active: data.is_active,
        priority: data.priority,
        last_run: data.last_run_at,
        last_status: data.last_status,
        run_count: data.action_count,
        config: data.task_config,
      },
      recent_logs: logs || [],
    };
  }

  // ═══ CREATE — delegate to existing schedule_task with enhanced params ═══
  if (action === "create") {
    if (!args.prompt) return { error: "prompt is required for create action." };
    if (!args.time_desc) return { error: "time_desc is required (e.g., 'every day at 8am', 'in 30 minutes')." };

    // Delegate to existing schedule task logic
    const { executeScheduleTask } = await import("./system.ts");
    return await executeScheduleTask(supabase, userId, {
      action: "create",
      prompt: args.prompt,
      time_desc: args.time_desc,
      priority: args.priority || "normal",
      task_type: args.task_type || "custom",
    }, timezone);
  }

  // ═══ UPDATE ═══
  if (action === "update") {
    const { executeScheduleTask } = await import("./system.ts");
    return await executeScheduleTask(supabase, userId, {
      action: "update",
      task_id: args.task_id,
      prompt: args.prompt,
      time_desc: args.time_desc,
      priority: args.priority,
    }, timezone);
  }

  // ═══ PAUSE / RESUME / DELETE ═══
  if (["pause", "resume", "delete"].includes(action)) {
    const { executeScheduleTask } = await import("./system.ts");
    return await executeScheduleTask(supabase, userId, {
      action,
      task_id: args.task_id,
    }, timezone);
  }

  // ═══ RUN_NOW — immediately trigger a heartbeat ═══
  if (action === "run_now") {
    if (!args.task_id) return { error: "task_id is required for run_now." };

    const { data: heartbeat } = await supabase
      .from("agent_heartbeats")
      .select("id, display_name, task_config, is_active")
      .eq("id", args.task_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!heartbeat) return { error: `Cron ${args.task_id} not found.` };

    // Trigger by invoking the heartbeat edge function
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          heartbeat_id: args.task_id,
          force_run: true,
        }),
      });

      const result = await res.json().catch(() => ({ status: res.status }));

      return {
        success: res.ok,
        message: res.ok
          ? `⚡ Cron "${heartbeat.display_name}" triggered immediately!`
          : `Failed to trigger: ${result?.error || res.status}`,
        task_id: args.task_id,
      };
    } catch (e: any) {
      return { error: `Failed to trigger heartbeat: ${e.message}` };
    }
  }

  return { error: `Unknown cron action: ${action}. Valid: list, create, update, pause, resume, delete, run_now, status` };
}

// ═══ FACEBOOK PAGE MANAGEMENT ═══
export async function executeFacebookPage(supabase: any, userId: string, args: any, authHeader?: string): Promise<any> {
  const action = (args.action || "").toLowerCase().trim();
  if (!action) return { error: "action is required (post, get_posts, get_comments, reply_comment, delete_post, get_page_info, list_pages, add_page, remove_page, set_default)" };

  // ═══ LIST_PAGES — local DB query ═══
  if (action === "list_pages") {
    const { data, error } = await supabase
      .from("facebook_pages")
      .select("id, page_id, page_name, is_active, is_default, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return { error: `Failed to list pages: ${error.message}` };
    if (!data?.length) return { success: true, pages: [], message: "No Facebook pages connected. Ask user to connect one via Connectors → Facebook Pages." };
    return {
      success: true,
      pages: data.map((p: any) => ({ id: p.id, page_id: p.page_id, name: p.page_name, is_default: p.is_default, is_active: p.is_active })),
      count: data.length,
    };
  }

  // ═══ ADD_PAGE — save to DB ═══
  if (action === "add_page") {
    const { page_id, page_name, page_access_token } = args;
    if (!page_id || !page_access_token) return { error: "page_id and page_access_token are required for add_page" };
    const { data: existing } = await supabase.from("facebook_pages").select("id").eq("user_id", userId);
    const isFirst = !existing?.length;
    const { error } = await supabase.from("facebook_pages").upsert({
      user_id: userId,
      page_id,
      page_name: page_name || `Page ${page_id.slice(-6)}`,
      page_access_token,
      is_active: true,
      is_default: isFirst,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,page_id" });
    if (error) return { error: `Failed to add page: ${error.message}` };
    return { success: true, message: `✅ Facebook Page "${page_name || page_id}" added successfully!` };
  }

  // ═══ REMOVE_PAGE ═══
  if (action === "remove_page") {
    const { page_id } = args;
    if (!page_id) return { error: "page_id is required for remove_page" };
    const { error } = await supabase.from("facebook_pages").delete().eq("user_id", userId).eq("page_id", page_id);
    if (error) return { error: `Failed to remove page: ${error.message}` };
    return { success: true, message: "✅ Facebook Page removed." };
  }

  // ═══ SET_DEFAULT ═══
  if (action === "set_default") {
    const { page_id } = args;
    if (!page_id) return { error: "page_id is required for set_default" };
    await supabase.from("facebook_pages").update({ is_default: false }).eq("user_id", userId);
    const { error } = await supabase.from("facebook_pages").update({ is_default: true }).eq("user_id", userId).eq("page_id", page_id);
    if (error) return { error: `Failed to set default: ${error.message}` };
    return { success: true, message: "✅ Default Facebook Page updated." };
  }

  // ═══ GRAPH API ACTIONS — delegate to edge function ═══
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // Resolve page_id from page_name if needed
  let resolvedPageId = args.page_id;
  if (!resolvedPageId && args.page_name) {
    const { data: pages } = await supabase
      .from("facebook_pages")
      .select("page_id, page_name")
      .eq("user_id", userId)
      .eq("is_active", true);
    if (pages?.length) {
      const match = pages.find((p: any) =>
        p.page_name.toLowerCase().includes(args.page_name.toLowerCase()) ||
        similarity(args.page_name.toLowerCase(), p.page_name.toLowerCase()) > 0.6
      );
      if (match) resolvedPageId = match.page_id;
    }
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/facebook-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader || `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        action,
        page_id: resolvedPageId,
        message: args.message,
        post_id: args.post_id,
        comment_id: args.comment_id,
        reply_text: args.message || args.reply_text,
        limit: args.limit,
      }),
    });

    const result = await res.json();
    if (!res.ok || result.error) {
      return { error: result.error || `Facebook API error (${res.status})`, action };
    }
    return result;
  } catch (e: any) {
    return { error: `Facebook API call failed: ${e.message}`, action };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 🩺 SCHEDULED TASK HEALTH & REPAIR (BeeBot ↔ Automation runtime)
// Reads telemetry written by agent-heartbeat (intent_class, quality_score,
// gate_reasons, gate_flags, retry_count, quality_holdback) and lets BeeBot
// diagnose + remediate failing automations conversationally.
// ═══════════════════════════════════════════════════════════════════

const QUALITY_DELIVERY_FLOOR = 50;

function summarizeRunRow(hb: any): Record<string, any> {
  const lr = (hb?.last_result || {}) as Record<string, any>;
  return {
    task_id: hb.id,
    name: hb.display_name || hb.name,
    is_active: hb.is_active,
    last_status: hb.last_status,
    last_run_at: hb.last_run_at,
    next_run_at: hb.next_run_at,
    intent_class: lr.intent_class ?? null,
    quality_score: typeof lr.quality_score === "number" ? lr.quality_score : null,
    quality_ok: lr.quality_ok ?? null,
    quality_holdback: lr.quality_holdback === true,
    gate_reasons: Array.isArray(lr.gate_reasons) ? lr.gate_reasons : [],
    gate_flags: Array.isArray(lr.gate_flags) ? lr.gate_flags : [],
    retry_count: typeof lr.retry_count === "number" ? lr.retry_count : 0,
    delivery_target: lr.delivery_target || hb?.task_config?.delivery_target || "in_app",
    posted: lr.posted ?? null,
    duration_ms: lr.duration_ms ?? null,
    content_preview: typeof lr.content_preview === "string" ? lr.content_preview.slice(0, 280) : null,
  };
}

function buildFixSuggestions(summary: Record<string, any>): Array<{ fix_type: string; reason: string; preview: string }> {
  const suggestions: Array<{ fix_type: string; reason: string; preview: string }> = [];
  const flags: string[] = summary.gate_flags || [];
  const intent = summary.intent_class || "general";

  if (flags.includes("duplicate") || flags.includes("near_duplicate")) {
    suggestions.push({
      fix_type: "add_success_criteria",
      reason: "Recent runs are too similar. Tightening success_criteria forces variety.",
      preview: intent === "market"
        ? "Each run must cover a fresh angle: price action, on-chain signal, or macro catalyst."
        : "Each run must contribute new information not present in the prior 2 runs.",
    });
  }
  if (flags.includes("freshness_violation") || flags.includes("stale")) {
    suggestions.push({
      fix_type: "enforce_freshness",
      reason: "Output lacked live/current data. Forcing freshness='required' makes the agent fetch fresh facts.",
      preview: "freshness=required",
    });
  }
  if (flags.includes("too_short")) {
    suggestions.push({
      fix_type: "add_success_criteria",
      reason: "Output is below the minimum length floor for this intent.",
      preview: "Must be at least 3 short paragraphs covering context, key facts, and a takeaway.",
    });
  }
  if (flags.includes("refusal") || flags.includes("placeholder")) {
    suggestions.push({
      fix_type: "add_success_criteria",
      reason: "Agent produced a refusal or placeholder. A concrete success_criteria removes ambiguity.",
      preview: "Must produce a complete, factual answer — never apologise, never use placeholders.",
    });
  }
  if (suggestions.length === 0) {
    // Generic fallback when score is low but no specific flag fired
    if ((summary.quality_score ?? 100) < QUALITY_DELIVERY_FLOOR) {
      suggestions.push({
        fix_type: "re_run_now",
        reason: "Quality is low but no specific failure mode detected — try one more run before adjusting config.",
        preview: "Trigger an immediate out-of-cycle run.",
      });
    }
  }
  return suggestions;
}

function defaultSuccessCriteriaFor(intent: string | null): string {
  switch (intent) {
    case "market":
      return "Must include a current price/level and one fresh insight not present in the previous run.";
    case "news":
      return "Must list at least 3 distinct, dated items with sources, and a one-line takeaway.";
    case "report":
      return "Must include sections: context, key facts (3+), takeaway. Each run covers a different angle.";
    case "reminder":
      return "Must be a single concise reminder line referencing today's date.";
    default:
      return "Must produce a complete, varied, fact-grounded output that adds value beyond the previous run.";
  }
}

export async function executeScheduledTaskHealth(supabase: any, userId: string, args: any) {
  const action = String(args?.action || "").trim();
  if (!action) return { error: "action is required" };

  if (action === "last_run") {
    const taskId = String(args?.task_id || "").trim();
    if (!taskId) return { error: "task_id is required for last_run" };
    const { data, error } = await supabase
      .from("agent_heartbeats")
      .select("id, user_id, display_name, name, is_active, last_status, last_run_at, next_run_at, last_result, task_config")
      .eq("user_id", userId)
      .eq("id", taskId)
      .maybeSingle();
    if (error) return { error: `Lookup failed: ${error.message}` };
    if (!data) return { error: "Task not found or not yours." };
    const summary = summarizeRunRow(data);
    return {
      action: "last_run",
      ...summary,
      held_back: summary.quality_holdback,
      explanation: summary.quality_holdback
        ? `Run completed but was held back: quality_score ${summary.quality_score}/100 < ${QUALITY_DELIVERY_FLOOR}. Reasons: ${summary.gate_reasons.join("; ") || "n/a"}.`
        : summary.last_status === "success"
          ? `Last run delivered successfully (quality ${summary.quality_score ?? "?"}/100).`
          : `Last run status: ${summary.last_status || "unknown"}.`,
    };
  }

  if (action === "recent_failures") {
    const limit = Math.min(20, Math.max(1, Number(args?.limit) || 5));
    const { data, error } = await supabase
      .from("agent_heartbeats")
      .select("id, user_id, display_name, name, is_active, last_status, last_run_at, next_run_at, last_result, task_config")
      .eq("user_id", userId)
      .not("last_run_at", "is", null)
      .order("last_run_at", { ascending: false })
      .limit(60);
    if (error) return { error: `Lookup failed: ${error.message}` };
    const rows = (data || [])
      .map(summarizeRunRow)
      .filter((r: Record<string, any>) => r.quality_holdback === true || r.quality_ok === false || r.last_status === "failed")
      .slice(0, limit);
    return {
      action: "recent_failures",
      count: rows.length,
      failures: rows,
    };
  }

  if (action === "summary") {
    const { data, error } = await supabase
      .from("agent_heartbeats")
      .select("id, last_status, last_run_at, last_result")
      .eq("user_id", userId)
      .not("last_run_at", "is", null);
    if (error) return { error: `Lookup failed: ${error.message}` };
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const recent = (data || []).filter((r: any) => r.last_run_at && new Date(r.last_run_at).getTime() >= sevenDaysAgo);
    const counts = { success: 0, failed: 0, held_back: 0, other: 0 };
    let scoreSum = 0;
    let scored = 0;
    for (const r of recent as any[]) {
      const lr = (r.last_result || {}) as any;
      if (lr.quality_holdback === true) counts.held_back++;
      else if (r.last_status === "success") counts.success++;
      else if (r.last_status === "failed") counts.failed++;
      else counts.other++;
      if (typeof lr.quality_score === "number") {
        scoreSum += lr.quality_score;
        scored++;
      }
    }
    return {
      action: "summary",
      window_days: 7,
      total_runs: recent.length,
      counts,
      avg_quality_score: scored > 0 ? Math.round(scoreSum / scored) : null,
    };
  }

  if (action === "fix_suggestions") {
    const taskId = String(args?.task_id || "").trim();
    if (!taskId) return { error: "task_id is required for fix_suggestions" };
    const { data, error } = await supabase
      .from("agent_heartbeats")
      .select("id, user_id, display_name, name, is_active, last_status, last_run_at, next_run_at, last_result, task_config")
      .eq("user_id", userId)
      .eq("id", taskId)
      .maybeSingle();
    if (error) return { error: `Lookup failed: ${error.message}` };
    if (!data) return { error: "Task not found or not yours." };
    const summary = summarizeRunRow(data);
    const suggestions = buildFixSuggestions(summary);
    return {
      action: "fix_suggestions",
      task_id: taskId,
      name: summary.name,
      quality_score: summary.quality_score,
      gate_flags: summary.gate_flags,
      gate_reasons: summary.gate_reasons,
      suggestions,
      next_step: suggestions[0]
        ? `Call repair_scheduled_task with fix_type='${suggestions[0].fix_type}'.`
        : "No specific repair recommended — task appears healthy.",
    };
  }

  return { error: `Unknown action: ${action}` };
}

export async function executeRepairScheduledTask(supabase: any, userId: string, args: any, timezone?: string) {
  const taskId = String(args?.task_id || "").trim();
  const fixType = String(args?.fix_type || "").trim();
  if (!taskId) return { error: "task_id is required" };
  if (!fixType) return { error: "fix_type is required" };

  // Verify ownership + load current task_config
  const { data: hb, error: hbErr } = await supabase
    .from("agent_heartbeats")
    .select("id, user_id, display_name, is_active, task_config, last_result")
    .eq("user_id", userId)
    .eq("id", taskId)
    .maybeSingle();
  if (hbErr) return { error: `Lookup failed: ${hbErr.message}` };
  if (!hb) return { error: "Task not found or not yours." };

  const config = (hb.task_config || {}) as Record<string, any>;
  const intent = (hb.last_result as any)?.intent_class || null;

  if (fixType === "add_success_criteria") {
    const criteria = String(args?.custom_criteria || "").trim() || defaultSuccessCriteriaFor(intent);
    const newConfig = { ...config, success_criteria: criteria };
    const { error } = await supabase
      .from("agent_heartbeats")
      .update({ task_config: newConfig })
      .eq("id", taskId)
      .eq("user_id", userId);
    if (error) return { error: `Update failed: ${error.message}` };
    return {
      action: "add_success_criteria",
      task_id: taskId,
      name: hb.display_name,
      applied_criteria: criteria,
      message: `Success criteria attached. Next run will be evaluated against: "${criteria}"`,
    };
  }

  if (fixType === "enforce_freshness") {
    const newConfig = { ...config, freshness: "required" };
    const { error } = await supabase
      .from("agent_heartbeats")
      .update({ task_config: newConfig })
      .eq("id", taskId)
      .eq("user_id", userId);
    if (error) return { error: `Update failed: ${error.message}` };
    return {
      action: "enforce_freshness",
      task_id: taskId,
      name: hb.display_name,
      message: "Freshness=required. Each run will fetch live data via web search before composing the answer.",
    };
  }

  if (fixType === "deactivate") {
    return await executeScheduleTask(supabase, userId, { action: "pause", task_id: taskId }, timezone);
  }

  if (fixType === "re_run_now") {
    // Trigger an out-of-cycle execution via the agent-heartbeat function.
    const projectId = Deno.env.get("VITE_SUPABASE_PROJECT_ID")
      || Deno.env.get("SUPABASE_PROJECT_ID")
      || (Deno.env.get("SUPABASE_URL") || "").match(/https?:\/\/([a-z0-9]+)\./)?.[1]
      || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || (projectId ? `https://${projectId}.supabase.co` : "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) {
      return { error: "Cannot trigger immediate run: missing service env vars." };
    }
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/agent-heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
          "apikey": serviceKey,
        },
        body: JSON.stringify({ heartbeat_id: taskId, force_run: true }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return { error: `Trigger failed (${resp.status}): ${(json as any)?.error || "unknown"}` };
      }
      return {
        action: "re_run_now",
        task_id: taskId,
        name: hb.display_name,
        message: "Out-of-cycle run dispatched. Use manage_scheduled_task_health(action='last_run') in ~30s to inspect the result.",
        dispatched: true,
        response: json,
      };
    } catch (e: any) {
      return { error: `Trigger error: ${e.message}` };
    }
  }

  return { error: `Unknown fix_type: ${fixType}` };
}
