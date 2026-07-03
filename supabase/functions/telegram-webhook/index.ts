import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { formatForMarkdownV2, stripAllMarkdown } from "../_shared/telegram-markdown.ts";
import { sanitizeUserVisibleText } from "../_shared/sanitizer.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ═══ HELPER: Download photo from Telegram ═══
async function downloadTelegramPhoto(
  botToken: string, 
  fileId: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const fileResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
    );
    const fileData = await fileResponse.json();
    
    if (!fileData.ok || !fileData.result?.file_path) {
      console.error('Failed to get file path:', fileData);
      return null;
    }
    
    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    
    const imageResponse = await fetch(fileUrl);
    if (!imageResponse.ok) {
      console.error('Failed to download image:', imageResponse.status);
      return null;
    }
    
    const arrayBuffer = await imageResponse.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    let base64 = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      base64 += String.fromCharCode(...chunk);
    }
    base64 = btoa(base64);
    
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : 
                     ext === 'gif' ? 'image/gif' : 
                     ext === 'webp' ? 'image/webp' :
                     'image/jpeg';
    
    console.log(`Downloaded photo: ${filePath}, size: ${uint8Array.length}, mimeType: ${mimeType}`);
    return { base64, mimeType };
  } catch (error) {
    console.error('Failed to download photo:', error);
    return null;
  }
}
// ═══ HELPER: Fetch group admins with in-memory cache (5-min TTL) ═══
// ═══ UPDATE_ID DEDUPLICATION: In-Memory Cache (Layer 1) ═══
const recentUpdateIds = new Set<number>();

const groupAdminCache = new Map<string, { admins: Array<{ user_id: number; username: string | null; first_name: string; status: string }>; expires: number }>();
const ADMIN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchGroupAdmins(botToken: string, chatId: number): Promise<Array<{ user_id: number; username: string | null; first_name: string; status: string }>> {
  const cacheKey = `${chatId}`;
  const cached = groupAdminCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) return cached.admins;

  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/getChatAdministrators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId }),
    });
    const data = await resp.json();
    if (!data.ok) {
      console.warn('[AdminAwareness] getChatAdministrators failed:', data.description);
      return [];
    }
    const admins = (data.result || [])
      .filter((m: any) => !m.user?.is_bot)
      .map((m: any) => ({
        user_id: m.user.id,
        username: m.user.username || null,
        first_name: m.user.first_name || 'Unknown',
        status: m.status, // 'creator' or 'administrator'
      }));
    groupAdminCache.set(cacheKey, { admins, expires: Date.now() + ADMIN_CACHE_TTL });
    console.log(`[AdminAwareness] Fetched ${admins.length} admins for chat ${chatId}`);
    return admins;
  } catch (e) {
    console.error('[AdminAwareness] Error fetching admins:', e);
    return [];
  }
}


// ═══ RESPONSE VALIDATION: Sanitize before sending to Telegram ═══
const SYSTEM_LEAK_PATTERNS = [
  /\[SYSTEM\][^\n]*/g,
  /\[GUARD\][^\n]*/g,
  /\[NUDGE\][^\n]*/g,
  /\[CONSISTENCY_CHECK\][^\n]*/g,
  /\[QUALITY GATE[^\]]*\][^\n]*/g,
  /\[FABRICATION[^\]]*\][^\n]*/g,
  /\[REFLECTION[^\]]*\][^\n]*/g,
  /\[CONSTITUTIONAL[^\]]*\][^\n]*/g,
  /\[RE-PLAN[^\]]*\][^\n]*/g,
  /\[PERSISTENCE[^\]]*\][^\n]*/g,
  /\[HALLUCINATION[^\]]*\][^\n]*/g,
  /\[DEEP RESEARCH[^\]]*\][^\n]*/g,
  /\[ANTI.?GHOST[^\]]*\][^\n]*/g,
  /\[SOURCE EXHAUSTION[^\]]*\][^\n]*/g,
  /tool_code\s*\n/g,
  /^print\s*\(\s*\w+\s*\(/gm,
];

function validateTelegramResponse(text: string): string {
  if (!text || !text.trim()) {
    console.warn('[ResponseValidation] Empty response detected — using fallback');
    return 'ခဏစောင့်ပေးပါ၊ ပြန်ကြိုးစားပေးပါမယ် 🐝';
  }

  let cleaned = text;

  // Strip system instruction leaks
  for (const pattern of SYSTEM_LEAK_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove consecutive empty lines left after stripping
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  // If stripping left nothing useful
  if (!cleaned || cleaned.length < 3) {
    console.warn('[ResponseValidation] Response became empty after sanitization — using fallback');
    return 'ခဏစောင့်ပေးပါ၊ ပြန်ကြိုးစားပေးပါမယ် 🐝';
  }

  return cleaned;
}

async function sendTelegramMessage(
  botToken: string, 
  chatId: number, 
  text: string, 
  parseMode: 'Markdown' | 'MarkdownV2' | 'HTML' | null = null,
  replyToMessageId?: number
): Promise<void> {
  const MAX_LENGTH = 4000;

  // ═══ PRE-SEND VALIDATION ═══
  const validatedText = validateTelegramResponse(text);
  
  const messages = [];
  
  // Auto-escape for MarkdownV2
  let processedText = validatedText;
  if (parseMode === 'MarkdownV2') {
    processedText = formatForMarkdownV2(validatedText);
  }
  
  if (processedText.length <= MAX_LENGTH) {
    messages.push(processedText);
  } else {
    let remaining = processedText;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_LENGTH) {
        messages.push(remaining);
        break;
      }
      let splitIndex = remaining.lastIndexOf('\n', MAX_LENGTH);
      if (splitIndex === -1 || splitIndex < MAX_LENGTH / 2) {
        splitIndex = MAX_LENGTH;
      }
      messages.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex).trim();
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const body: Record<string, unknown> = { chat_id: chatId, text: msg };
    if (parseMode) body.parse_mode = parseMode;
    // Only reply to the original message on the first chunk
    if (i === 0 && replyToMessageId) {
      body.reply_to_message_id = replyToMessageId;
      body.allow_sending_without_reply = true;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Telegram API error:', response.status, errorText);
      throw new Error(`Telegram API error: ${response.status} - ${errorText}`);
    }
  }
}

// ═══ HELPER: Update bot status ═══
async function updateBotStatus(
  supabase: any,
  botId: string,
  status: 'success' | 'error',
  errorMessage?: string
): Promise<void> {
  try {
    if (status === 'success') {
      await supabase.from('bot_settings').update({
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', botId);
    } else {
      await supabase.from('bot_settings').update({
        last_error_at: new Date().toISOString(),
        last_error_message: errorMessage?.substring(0, 255) || 'Unknown error',
        updated_at: new Date().toISOString(),
      }).eq('id', botId);
    }
  } catch (err) {
    console.error('Error updating bot status:', err);
  }
}

// ═══ WEBHOOK SECRET VALIDATION ═══
async function generateWebhookSecret(botToken: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(botToken + "_webhook_secret");
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

function validateTelegramWebhook(req: Request, expectedSecret: string): boolean {
  const receivedSecret = req.headers.get('x-telegram-bot-api-secret-token');
  if (!receivedSecret) {
    console.warn('No X-Telegram-Bot-Api-Secret-Token header received');
    return false;
  }
  if (receivedSecret.length !== expectedSecret.length) return false;
  let result = 0;
  for (let i = 0; i < receivedSecret.length; i++) {
    result |= receivedSecret.charCodeAt(i) ^ expectedSecret.charCodeAt(i);
  }
  return result === 0;
}

// ═══ LINKING CODE GENERATOR ═══
function generateLinkCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ═══ GATEWAY: Forward message to agent-chat brain ═══
// ═══ DB-AS-SOURCE-OF-TRUTH ARCHITECTURE ═══
// We drain the SSE stream WITHOUT parsing content events, then read the canonical
// assistant message from the database. This guarantees Telegram receives the EXACT
// same content that web clients see — eliminating the 4 quality-degrading bugs of
// the previous SSE re-parsing approach (step_complete overwrite, relay reset,
// aggressive sentence dedup, Format B ignore).
async function forwardToAgentChat(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  sessionId: string,
  message: string,
  attachments?: { type: string; base64: string; mime_type: string; file_name: string }[],
  groupContext?: { is_group: boolean; group_title: string; group_id: string; triggered_by: string; gateway?: string; creator_name?: string; group_bot_custom_instruction?: string | null; group_bot_allow_web_search?: boolean; group_bot_username?: string },
  deviceContext?: { timezone: string; timezoneOffset: number }
): Promise<string> {
  const agentChatUrl = `${supabaseUrl}/functions/v1/agent-chat`;

  const tz = deviceContext?.timezone || 'UTC';
  const tzOffset = deviceContext?.timezoneOffset ?? 0;

  const body: any = {
    sessionId,
    message,
    source_channel: 'telegram',
    deviceContext: {
      timezone: tz,
      locale: 'en-US',
      currentTime: new Date().toISOString(),
      timezoneOffset: tzOffset,
    },
    ...(groupContext ? { groupContext } : {}),
  };

  if (attachments && attachments.length > 0) {
    body.attachments = attachments;
  }

  // Snapshot timestamp BEFORE the request — used to find the assistant row
  // produced by THIS turn (must be created at or after this moment).
  const snapshotTs = new Date(Date.now() - 1000).toISOString(); // 1s buffer for clock skew

  console.log(`[Webhook-Preflight] agent-chat URL: ${agentChatUrl}`);
  console.log(`[Webhook-Preflight] Session: ${sessionId}, User: ${userId}, snapshot=${snapshotTs}`);

  // ═══ PHASE 1: Fire request with 55s hard timeout ═══
  const AGENT_CHAT_TIMEOUT_MS = 55_000;
  let response: Response;
  try {
    response = await fetch(agentChatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'x-telegram-gateway': 'true',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AGENT_CHAT_TIMEOUT_MS),
    });
  } catch (fetchErr: any) {
    if (fetchErr?.name === 'AbortError' || fetchErr?.name === 'TimeoutError') {
      console.error(`[HardTimeout] agent-chat fetch timed out after ${AGENT_CHAT_TIMEOUT_MS}ms. Session: ${sessionId}`);
      // Even on timeout — try to read DB in case loop completed but stream hung
      const lateRow = await readAssistantRow(supabaseUrl, serviceKey, sessionId, snapshotTs, 5_000);
      if (lateRow) return lateRow;
      return '🐝 ခဏနေ ထပ်မေးပေးပါ ဗျ';
    }
    throw fetchErr;
  }

  // ═══ Non-OK transparency contract ═══
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[AgentChat-Error] Status: ${response.status}, Body: ${errorBody.substring(0, 500)}`);

    if (response.status === 429) {
      return '🐝 ခဏလေးစောင့်ပါ... BeeBot က အရင် message ကို process လုပ်နေပါသေးတယ်။ စက္ကန့် ၃၀ အတွင်း ပြန်စမ်းပေးပါ။';
    }

    // Even on error, if loop wrote partial content to DB, deliver that
    const errRow = await readAssistantRow(supabaseUrl, serviceKey, sessionId, snapshotTs, 2_000);
    if (errRow) return errRow;

    return `[System Error: ${response.status}] ${errorBody.substring(0, 500)}`;
  }

  // ═══ Handle 202 / non-SSE JSON responses (queued, early-exit JSON, etc.) ═══
  const contentType = response.headers.get('content-type') || '';
  if (response.status === 202 || (contentType.includes('application/json') && !contentType.includes('text/event-stream'))) {
    try {
      const queueBody = await response.text();
      console.log(`[JSON-Intercept] Status: ${response.status}, Body: ${queueBody.substring(0, 300)}`);
      const queueJson = JSON.parse(queueBody);
      if (queueJson.code === 'QUEUED') {
        console.error(`[CRITICAL] Unexpected QUEUED response. mission_id: ${queueJson.message_id}`);
        return '🐝 Processing...';
      }
      if (queueJson.content) return queueJson.content;
      if (queueJson.message) return queueJson.message;
      return `[System Info: ${response.status}] ${queueBody.substring(0, 500)}`;
    } catch (parseErr) {
      console.error('[JSON-Intercept] Parse failed:', parseErr);
      return `[System Error: PARSE_ERROR]`;
    }
  }

  // ═══ PHASE 2: Drain SSE stream WITHOUT parsing content ═══
  // We only care about: stream completion ([DONE]), error events, and inactivity.
  // The actual content will be read from the DB.
  const reader = response.body?.getReader();
  if (!reader) {
    console.error('[StreamDrain] No reader available');
    const fallbackRow = await readAssistantRow(supabaseUrl, serviceKey, sessionId, snapshotTs, 2_000);
    return fallbackRow || '[System Error: NO_READER]';
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let streamDone = false;
  let capturedError: string | null = null;
  let lastChunkAt = Date.now();
  const STREAM_INACTIVITY_TIMEOUT_MS = 50_000;

  try {
    while (true) {
      if (Date.now() - lastChunkAt > STREAM_INACTIVITY_TIMEOUT_MS) {
        console.warn(`[StreamDrain] Inactivity ${STREAM_INACTIVITY_TIMEOUT_MS}ms — breaking, will read DB`);
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      lastChunkAt = Date.now();

      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') { streamDone = true; break; }

        // Capture error events for last-resort fallback
        if (jsonStr.includes('"type":"error"')) {
          try {
            const p = JSON.parse(jsonStr);
            if (p.type === 'error' && p.message) capturedError = p.message;
          } catch { /* ignore */ }
        }
      }
      if (streamDone) break;
    }
  } catch (drainErr) {
    console.warn('[StreamDrain] Read error (non-fatal, will try DB):', drainErr);
  } finally {
    if (!streamDone) {
      try { reader.cancel(); } catch { /* ignore */ }
    }
  }

  console.log(`[StreamDrain] Done=${streamDone}, capturedError=${!!capturedError}. Reading DB...`);

  // ═══ PHASE 3: Read canonical assistant message from DB ═══
  // Post-loop save is fire-and-forget — poll up to 4s.
  const dbContent = await readAssistantRow(supabaseUrl, serviceKey, sessionId, snapshotTs, 4_000);

  if (dbContent) {
    console.log(`[DBRead] ✅ Retrieved ${dbContent.length} chars from agent_chat_messages`);
    // Sanitize ONLY for system-leak patterns (no dedup, no truncation, no overwrite).
    const sanitized = sanitizeUserVisibleText(dbContent);
    if (sanitized && sanitized.trim().length > 3) return sanitized;
    // Sanitizer over-stripped — return raw content
    if (dbContent.trim().length > 3) {
      console.warn('[Sanitizer-Bypass] Over-sanitized — delivering raw DB content');
      return dbContent;
    }
  }

  // ═══ PHASE 4: DB miss — surface error or diagnostic ═══
  if (capturedError) {
    console.warn(`[DBRead] No row found, but stream had error: ${capturedError}`);
    return `[System Error] ${capturedError.substring(0, 500)}`;
  }

  console.error(`[DBRead] ❌ No assistant row found within 4s. Session: ${sessionId}, snapshot: ${snapshotTs}`);
  return '[System Error: NO_DB_ROW] Assistant response was not saved within timeout. Please retry.';
}

// ═══ HELPER: Poll agent_chat_messages for the latest assistant row of this turn ═══
async function readAssistantRow(
  supabaseUrl: string,
  serviceKey: string,
  sessionId: string,
  snapshotTs: string,
  maxWaitMs: number
): Promise<string | null> {
  const dbClient = createClient(supabaseUrl, serviceKey);
  const startedAt = Date.now();
  const POLL_INTERVAL_MS = 400;
  let attempt = 0;

  while (Date.now() - startedAt < maxWaitMs) {
    attempt++;
    try {
      const { data, error } = await dbClient
        .from('agent_chat_messages')
        .select('content, created_at')
        .eq('session_id', sessionId)
        .eq('role', 'assistant')
        .gte('created_at', snapshotTs)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn(`[DBRead] attempt ${attempt} error:`, error.message);
      } else if (data?.content && data.content.trim().length > 0) {
        console.log(`[DBRead] Hit on attempt ${attempt} (${Date.now() - startedAt}ms): ${data.content.length} chars`);
        return data.content;
      }
    } catch (e) {
      console.warn(`[DBRead] attempt ${attempt} exception:`, e);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  return null;
}

// ═══════════════════════════════════════════════════
// ═══ ACTION HANDLERS (setup-webhook, check-webhook)
// ═══════════════════════════════════════════════════

async function handleSetupWebhook(req: Request, supabase: any, supabaseUrl: string): Promise<Response> {
  // Authenticate caller
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const userId = claimsData.claims.sub as string;
  const body = await req.json();
  const botId = body.bot_id;

  if (!botId) {
    return new Response(JSON.stringify({ ok: false, error: 'bot_id is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Look up bot settings (service role - bypass RLS)
  const { data: botSettings, error: botError } = await supabase
    .from('bot_settings')
    .select('*')
    .eq('id', botId)
    .eq('user_id', userId)
    .maybeSingle();

  if (botError || !botSettings) {
    return new Response(JSON.stringify({ ok: false, error: 'Bot not found or access denied' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (!botSettings.telegram_bot_token) {
    return new Response(JSON.stringify({ ok: false, error: 'Bot token not configured' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Generate secret token
  const secretToken = await generateWebhookSecret(botSettings.telegram_bot_token);

  // Construct webhook URL
  const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook?user_id=${userId}&bot_id=${botId}`;

  // Call Telegram setWebhook API server-side
  const telegramResponse = await fetch(
    `https://api.telegram.org/bot${botSettings.telegram_bot_token}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ['message'],
      }),
    }
  );

  const telegramResult = await telegramResponse.json();

  if (!telegramResult.ok) {
    console.error('Telegram setWebhook failed:', telegramResult);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: telegramResult.description || 'Failed to register webhook with Telegram' 
    }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Update bot_settings: activate, enable DMs, save webhook URL
  await supabase.from('bot_settings').update({
    webhook_url: webhookUrl,
    is_active: true,
    allow_dm: true,
    updated_at: new Date().toISOString(),
  }).eq('id', botId);

  console.log(`[setup-webhook] Neural Link activated for bot ${botId} by user ${userId}`);

  return new Response(JSON.stringify({ 
    ok: true, 
    webhook_url: webhookUrl,
    message: 'Neural Link activated! Webhook registered with secret validation.' 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleCheckWebhook(req: Request, supabase: any, supabaseUrl: string): Promise<Response> {
  // Authenticate caller
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const userId = claimsData.claims.sub as string;
  const body = await req.json();
  const botId = body.bot_id;

  if (!botId) {
    return new Response(JSON.stringify({ ok: false, error: 'bot_id is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { data: botSettings } = await supabase
    .from('bot_settings')
    .select('telegram_bot_token')
    .eq('id', botId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!botSettings?.telegram_bot_token) {
    return new Response(JSON.stringify({ ok: false, error: 'Bot not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Check webhook status via Telegram API (server-side, token stays hidden)
  const response = await fetch(
    `https://api.telegram.org/bot${botSettings.telegram_bot_token}/getWebhookInfo`
  );
  const result = await response.json();

  if (result.ok) {
    return new Response(JSON.stringify({
      ok: true,
      has_webhook: !!result.result?.url,
      url: result.result?.url ? '(configured)' : null, // Don't leak full URL
      pending_update_count: result.result?.pending_update_count || 0,
      last_error_date: result.result?.last_error_date || null,
      last_error_message: result.result?.last_error_message || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ ok: false, error: 'Failed to check webhook' }), {
    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// ═══ VALIDATE TOKEN (getMe) ═══
async function handleValidateToken(req: Request, supabase: any, supabaseUrl: string): Promise<Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const userId = claimsData.claims.sub as string;
  const body = await req.json();
  const botId = body.bot_id;

  if (!botId) {
    return new Response(JSON.stringify({ ok: false, error: 'bot_id is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { data: botSettings } = await supabase
    .from('bot_settings')
    .select('telegram_bot_token')
    .eq('id', botId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!botSettings?.telegram_bot_token) {
    return new Response(JSON.stringify({ ok: false, error: 'Bot token not configured. Please save your token first.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botSettings.telegram_bot_token}/getMe`);
    const result = await response.json();

    if (result.ok) {
      console.log(`[validate-token] Bot verified: @${result.result.username} for user ${userId}`);
      return new Response(JSON.stringify({
        ok: true,
        bot_username: result.result.username || null,
        bot_name: result.result.first_name || null,
        bot_id: result.result.id,
        can_join_groups: result.result.can_join_groups || false,
        can_read_all_group_messages: result.result.can_read_all_group_messages || false,
        supports_inline_queries: result.result.supports_inline_queries || false,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      ok: false,
      error: result.description || 'Invalid bot token. Please check your token from @BotFather.',
      error_code: 'INVALID_TOKEN',
    }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[validate-token] Network error:', error);
    return new Response(JSON.stringify({
      ok: false,
      error: 'Network error connecting to Telegram. Please try again.',
      error_code: 'NETWORK_ERROR',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ═══ VERIFY CHANNEL ═══
async function handleVerifyChannel(req: Request, supabase: any, supabaseUrl: string): Promise<Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const userId = claimsData.claims.sub as string;
  const body = await req.json();
  const { bot_id, channel_id, dedicated_bot_token, existing_channel_bot_token } = body;

  if (!channel_id) {
    return new Response(JSON.stringify({ ok: false, error: 'channel_id is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let botToken: string = '';
  let tokenSource = 'unknown';
  let resolvedBotId = bot_id;

  if (dedicated_bot_token && typeof dedicated_bot_token === 'string' && dedicated_bot_token.trim()) {
    // Priority 1: Dedicated bot token provided by user
    botToken = dedicated_bot_token.trim();
    tokenSource = 'dedicated';
    console.log(`[verify-channel] Using dedicated bot token (last4: ...${botToken.slice(-4)})`);
  } else if (existing_channel_bot_token && typeof existing_channel_bot_token === 'string' && existing_channel_bot_token.trim()) {
    // Priority 2: Frontend sent existing channel's stored bot_token
    botToken = existing_channel_bot_token.trim();
    tokenSource = 'existing_channel_token';
    resolvedBotId = null;
    console.log(`[verify-channel] Using existing channel bot token from frontend (last4: ...${botToken.slice(-4)})`);
  } else {
    // Resolution hierarchy: existing channel bot_token (DB) → bot_id → fallback
    let resolved = false;

    // Priority 2 (server-side): Check existing broadcast_channels for stored bot_token
    const { data: existingChannels } = await supabase
      .from('broadcast_channels')
      .select('bot_token, bot_username, bot_settings_id')
      .eq('user_id', userId)
      .not('bot_token', 'is', null)
      .order('is_default', { ascending: false })
      .limit(1);

    if (existingChannels?.[0]?.bot_token) {
      botToken = existingChannels[0].bot_token;
      tokenSource = 'bound_channel_token';
      resolvedBotId = existingChannels[0].bot_settings_id || null;
      resolved = true;
      console.log(`[verify-channel] Using stored channel bot_token (username: ${existingChannels[0].bot_username}, last4: ...${botToken.slice(-4)})`);
    }

    // Priority 3: Try explicit bot_id from bot_settings
    if (!resolved && bot_id) {
      const { data: botSettings } = await supabase
        .from('bot_settings')
        .select('id, telegram_bot_token')
        .eq('id', bot_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (botSettings?.telegram_bot_token) {
        botToken = botSettings.telegram_bot_token;
        resolvedBotId = botSettings.id;
        tokenSource = 'selected_bot';
        resolved = true;
        console.log(`[verify-channel] Using requested bot (id: ${resolvedBotId})`);
      }
    }

    // Priority 4: Deterministic fallback: latest active tokened bot
    if (!resolved) {
      const { data: fallbackBot } = await supabase
        .from('bot_settings')
        .select('id, telegram_bot_token')
        .eq('user_id', userId)
        .not('telegram_bot_token', 'is', null)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (fallbackBot?.[0]?.telegram_bot_token) {
        botToken = fallbackBot[0].telegram_bot_token;
        resolvedBotId = fallbackBot[0].id;
        tokenSource = 'fallback_active_bot';
        console.log(`[verify-channel] Using fallback bot (id: ${resolvedBotId})`);
      } else {
        return new Response(JSON.stringify({ ok: false, error: 'No bot with a configured token found' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
  }

  try {
    // Step 1: Get channel info via getChat
    const chatResponse = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${encodeURIComponent(channel_id)}`);
    const chatResult = await chatResponse.json();

    if (!chatResult.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: chatResult.description || 'Channel not found. Check the Channel ID or @username.',
        error_code: 'CHANNEL_NOT_FOUND',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const chat = chatResult.result;

    // Step 2: Get bot's own ID via getMe
    const meResponse = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meResult = await meResponse.json();
    if (!meResult.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'Failed to identify bot' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const botUserId = meResult.result.id;

    // Step 3: Check if bot is admin in the channel
    const memberResponse = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(channel_id)}&user_id=${botUserId}`);
    const memberResult = await memberResponse.json();

    let isAdmin = false;
    let canPostMessages = false;
    if (memberResult.ok) {
      const status = memberResult.result.status;
      isAdmin = status === 'administrator' || status === 'creator';
      canPostMessages = memberResult.result.can_post_messages === true || status === 'creator';
    }

    // Step 4: Get member count
    const countResponse = await fetch(`https://api.telegram.org/bot${botToken}/getChatMemberCount?chat_id=${encodeURIComponent(channel_id)}`);
    const countResult = await countResponse.json();
    const memberCount = countResult.ok ? countResult.result : 0;

    const botUsername = meResult.result.username || '';
    console.log(`[verify-channel] Channel verified: ${chat.title} (${channel_id}), bot: @${botUsername}, isAdmin: ${isAdmin}, canPost: ${canPostMessages}`);

    return new Response(JSON.stringify({
      ok: true,
      channel_name: chat.title || 'Unknown',
      channel_type: chat.type,
      channel_id: String(chat.id),
      is_admin: isAdmin,
      can_post_messages: canPostMessages,
      member_count: memberCount,
      bot_username: botUsername,
      resolved_bot_id: resolvedBotId,
      token_source: tokenSource,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[verify-channel] Error:', error);
    return new Response(JSON.stringify({
      ok: false,
      error: 'Network error verifying channel. Please try again.',
      error_code: 'NETWORK_ERROR',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ═══ GENERATE LINK CODE (Secure Handshake) ═══
async function handleGenerateLinkCode(req: Request, supabase: any, supabaseUrl: string): Promise<Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const userId = claimsData.claims.sub as string;

  // Expire any existing unused codes for this user
  await supabase
    .from('channel_link_codes')
    .update({ is_used: true })
    .eq('user_id', userId)
    .eq('is_used', false);

  // Generate new 6-digit code
  const code = generateLinkCode();

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase
    .from('channel_link_codes')
    .insert({
      user_id: userId,
      code,
      channel: 'telegram',
      external_id: 'pending',
      external_username: 'pending',
      chat_id: null,
      expires_at: expiresAt,
    });

  if (insertError) {
    console.error('[generate-link-code] Insert error:', insertError);
    return new Response(JSON.stringify({ ok: false, error: 'Failed to generate code' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  console.log(`[generate-link-code] Code ${code} generated for user ${userId}, expires ${expiresAt}`);

  return new Response(JSON.stringify({
    ok: true,
    code,
    expires_at: expiresAt,
    expires_in_minutes: 10,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// ═══ TEST SIGNAL (Neural Link Connectivity Check) ═══
async function handleTestSignal(req: Request, supabase: any, supabaseUrl: string): Promise<Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const userId = claimsData.claims.sub as string;

  // Look up linked Telegram identity
  const { data: identity } = await supabase
    .from('channel_identities')
    .select('chat_id, external_username')
    .eq('user_id', userId)
    .eq('channel', 'telegram')
    .eq('is_verified', true)
    .maybeSingle();

  if (!identity?.chat_id) {
    return new Response(JSON.stringify({ ok: false, error: 'No linked Telegram account found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Get bot token
  const { data: botSettings } = await supabase
    .from('bot_settings')
    .select('telegram_bot_token')
    .eq('user_id', userId)
    .not('telegram_bot_token', 'is', null)
    .maybeSingle();

  if (!botSettings?.telegram_bot_token) {
    return new Response(JSON.stringify({ ok: false, error: 'No bot token configured' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' MMT';

  await sendTelegramMessage(
    botSettings.telegram_bot_token,
    Number(identity.chat_id),
    `🔔 *Connection Test*\n\nNeural Link is Active and Secure.\nTimestamp: \`${timestamp}\``,
    'Markdown'
  );

  return new Response(JSON.stringify({ ok: true, message: 'Test signal sent' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// ═══ TEST POST (Manual Reality-Check) ═══
async function handleTestPost(req: Request, supabase: any, supabaseUrl: string): Promise<Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const userId = claimsData.claims.sub as string;
  const body = await req.json();
  const { channel_id, message } = body;

  if (!channel_id || !message) {
    return new Response(JSON.stringify({ ok: false, error: 'channel_id and message are required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 3-tier token resolution
  let botToken: string | null = null;
  let channelName = channel_id;

  // Tier 1: Check broadcast_channels for dedicated bot_token
  const { data: channelData } = await supabase
    .from('broadcast_channels')
    .select('bot_token, channel_name')
    .eq('channel_id', channel_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (channelData) {
    channelName = channelData.channel_name || channel_id;
    if (channelData.bot_token) {
      botToken = channelData.bot_token;
      console.log(`[test-post] Using dedicated bot token for channel ${channelName}`);
    }
  }

  // Tier 2: Fallback to bot_settings
  if (!botToken) {
    const { data: botSettings } = await supabase
      .from('bot_settings')
      .select('telegram_bot_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (botSettings?.telegram_bot_token) {
      botToken = botSettings.telegram_bot_token;
      console.log(`[test-post] Using default bot token for channel ${channelName}`);
    }
  }

  if (!botToken) {
    return new Response(JSON.stringify({ ok: false, error: 'No bot token configured. Set up a bot first.', error_code: 0, description: 'No bot token found' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const sendResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: channel_id, text: message, parse_mode: 'Markdown' }),
    });
    const sendResult = await sendResponse.json();

    // ANTI-HALLUCINATION: Only return ok:true if we got a real message_id
    if (sendResult.ok && sendResult.result?.message_id) {
      console.log(`[test-post] ✅ Signal verified. Channel: ${channelName}, Message ID: ${sendResult.result.message_id}`);
      return new Response(JSON.stringify({
        ok: true,
        message_id: sendResult.result.message_id,
        channel_name: channelName,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Failure: passthrough exact Telegram error
    const errorCode = sendResult.error_code || 0;
    const description = sendResult.description || 'Unknown error from Telegram';
    console.error(`[test-post] ❌ Failed. Channel: ${channelName}, Error ${errorCode}: ${description}`);
    return new Response(JSON.stringify({
      ok: false,
      error_code: errorCode,
      description: description,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[test-post] Network error:', error);
    return new Response(JSON.stringify({
      ok: false,
      error_code: 0,
      description: 'Network error sending test post. Please try again.',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ═══ SHARED AUTH HELPER (DRY - eliminates duplicate boilerplate) ═══
async function authenticateRequest(req: Request, supabaseUrl: string): Promise<{ userId: string; body: any } | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const userId = claimsData.claims.sub as string;
  const body = await req.json();
  return { userId, body };
}

// ═══ VALIDATE GROUP TOKEN (getMe for isolated group bot) ═══
async function handleValidateGroupToken(req: Request, supabase: any, supabaseUrl: string): Promise<Response> {
  const auth = await authenticateRequest(req, supabaseUrl);
  if (auth instanceof Response) return auth;
  const { userId, body } = auth;
  const { bot_id, group_bot_token } = body;

  if (!bot_id || !group_bot_token) {
    return new Response(JSON.stringify({ ok: false, error: 'bot_id and group_bot_token are required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Verify ownership
  const { data: botSettings } = await supabase
    .from('bot_settings')
    .select('id')
    .eq('id', bot_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!botSettings) {
    return new Response(JSON.stringify({ ok: false, error: 'Bot not found or access denied' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${group_bot_token}/getMe`);
    const result = await response.json();

    if (result.ok) {
      // Save to bot_settings
      await supabase.from('bot_settings').update({
        group_bot_token: group_bot_token,
        group_bot_username: result.result.username || null,
        group_bot_name: result.result.first_name || null,
        updated_at: new Date().toISOString(),
      }).eq('id', bot_id);

      console.log(`[validate-group-token] Group Bot verified: @${result.result.username} for user ${userId}`);

      return new Response(JSON.stringify({
        ok: true,
        bot_username: result.result.username || null,
        bot_name: result.result.first_name || null,
        can_join_groups: result.result.can_join_groups || false,
        can_read_all_group_messages: result.result.can_read_all_group_messages || false,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      ok: false,
      error: result.description || 'Invalid group bot token.',
      error_code: 'INVALID_TOKEN',
    }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[validate-group-token] Network error:', error);
    return new Response(JSON.stringify({
      ok: false,
      error: 'Network error connecting to Telegram.',
      error_code: 'NETWORK_ERROR',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ═══ VALIDATE GROUP TOKEN (Standalone — no bot_settings needed) ═══
async function handleValidateGroupTokenStandalone(req: Request, supabase: any, supabaseUrl: string): Promise<Response> {
  const auth = await authenticateRequest(req, supabaseUrl);
  if (auth instanceof Response) return auth;
  const { userId, body } = auth;
  const { group_bot_token } = body;

  if (!group_bot_token) {
    return new Response(JSON.stringify({ ok: false, error: 'group_bot_token is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${group_bot_token}/getMe`);
    const result = await response.json();

    if (result.ok) {
      return new Response(JSON.stringify({
        ok: true,
        bot_username: result.result.username || null,
        bot_name: result.result.first_name || null,
        can_join_groups: result.result.can_join_groups || false,
        can_read_all_group_messages: result.result.can_read_all_group_messages || false,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: false, error: result.description || 'Invalid token.', error_code: 'INVALID_TOKEN' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: 'Network error.', error_code: 'NETWORK_ERROR' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ═══ SETUP GROUP WEBHOOK (Multi Group Bot — reads from group_bots table) ═══
async function handleSetupGroupWebhook(req: Request, supabase: any, supabaseUrl: string): Promise<Response> {
  const auth = await authenticateRequest(req, supabaseUrl);
  if (auth instanceof Response) return auth;
  const { userId, body } = auth;
  const groupBotId = body.group_bot_id || body.bot_id;

  if (!groupBotId) {
    return new Response(JSON.stringify({ ok: false, error: 'group_bot_id is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Try group_bots table first, fallback to bot_settings for legacy
  let botToken: string | null = null;
  let sourceTable = 'group_bots';

  const { data: groupBot } = await supabase
    .from('group_bots')
    .select('*')
    .eq('id', groupBotId)
    .eq('user_id', userId)
    .maybeSingle();

  if (groupBot?.bot_token) {
    botToken = groupBot.bot_token;
  } else {
    // Legacy fallback: bot_settings
    const { data: botSettings } = await supabase
      .from('bot_settings')
      .select('*')
      .eq('id', groupBotId)
      .eq('user_id', userId)
      .maybeSingle();
    if (botSettings?.group_bot_token) {
      botToken = botSettings.group_bot_token;
      sourceTable = 'bot_settings';
    }
  }

  if (!botToken) {
    return new Response(JSON.stringify({ ok: false, error: 'Group bot token not configured. Verify your group bot first.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const secretToken = await generateWebhookSecret(botToken);
  const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook?user_id=${userId}&group_bot_id=${groupBotId}&gateway=group`;

  const telegramResponse = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ['message'],
      }),
    }
  );

  const telegramResult = await telegramResponse.json();

  if (!telegramResult.ok) {
    console.error('Telegram setWebhook (group) failed:', telegramResult);
    return new Response(JSON.stringify({
      ok: false,
      error: telegramResult.description || 'Failed to register group webhook'
    }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Update webhook_active in group_bots table
  if (sourceTable === 'group_bots') {
    await supabase.from('group_bots').update({ webhook_active: true, updated_at: new Date().toISOString() }).eq('id', groupBotId);
  }

  console.log(`[setup-group-webhook] Group Bot webhook activated for ${sourceTable}:${groupBotId} by user ${userId}`);

  return new Response(JSON.stringify({
    ok: true,
    webhook_url: webhookUrl,
    message: 'Group Bot webhook activated!'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// ═══ CHECK GROUP WEBHOOK (Multi Group Bot) ═══
async function handleCheckGroupWebhook(req: Request, supabase: any, supabaseUrl: string): Promise<Response> {
  const auth = await authenticateRequest(req, supabaseUrl);
  if (auth instanceof Response) return auth;
  const { userId, body } = auth;
  const groupBotId = body.group_bot_id || body.bot_id;

  if (!groupBotId) {
    return new Response(JSON.stringify({ ok: false, error: 'group_bot_id is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Try group_bots table first, fallback to bot_settings
  let botToken: string | null = null;

  const { data: groupBot } = await supabase
    .from('group_bots')
    .select('bot_token, bot_username')
    .eq('id', groupBotId)
    .eq('user_id', userId)
    .maybeSingle();

  if (groupBot?.bot_token) {
    botToken = groupBot.bot_token;
  } else {
    const { data: botSettings } = await supabase
      .from('bot_settings')
      .select('group_bot_token, group_bot_username')
      .eq('id', groupBotId)
      .eq('user_id', userId)
      .maybeSingle();
    if (botSettings?.group_bot_token) {
      botToken = botSettings.group_bot_token;
    }
  }

  if (!botToken) {
    return new Response(JSON.stringify({ ok: true, webhook_active: false, reason: 'no_token' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const result = await response.json();

    if (result.ok) {
      const hasUrl = !!result.result?.url;
      
      // ═══ FIX 4: Sync webhook_active back to DB ═══
      if (groupBot) {
        await supabase.from('group_bots').update({ webhook_active: hasUrl }).eq('id', groupBotId);
      } else {
        // Legacy bot_settings — no webhook_active column, skip
      }
      
      return new Response(JSON.stringify({
        ok: true,
        webhook_active: hasUrl,
        webhook_url: result.result?.url || null,
        pending_update_count: result.result?.pending_update_count || 0,
        last_error_date: result.result?.last_error_date || null,
        last_error_message: result.result?.last_error_message || null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true, webhook_active: false, reason: 'api_error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[check-group-webhook] Error:', error);
    return new Response(JSON.stringify({ ok: true, webhook_active: false, reason: 'network_error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ═══ MAIN HANDLER ═══
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ═══ CHECK FOR ACTION-BASED REQUESTS ═══
    // These come from the frontend, not from Telegram
    const contentType = req.headers.get('content-type') || '';
    if (req.method === 'POST' && contentType.includes('application/json')) {
      const cloned = req.clone();
      try {
        const peek = await cloned.json();
        if (peek.action === 'setup-webhook') {
          return await handleSetupWebhook(req, supabase, supabaseUrl);
        }
        if (peek.action === 'check-webhook') {
          return await handleCheckWebhook(req, supabase, supabaseUrl);
        }
        if (peek.action === 'validate-token') {
          return await handleValidateToken(req, supabase, supabaseUrl);
        }
        if (peek.action === 'verify-channel') {
          return await handleVerifyChannel(req, supabase, supabaseUrl);
        }
        if (peek.action === 'generate-link-code') {
          return await handleGenerateLinkCode(req, supabase, supabaseUrl);
        }
        if (peek.action === 'test-signal') {
          return await handleTestSignal(req, supabase, supabaseUrl);
        }
        if (peek.action === 'test-post') {
          return await handleTestPost(req, supabase, supabaseUrl);
        }
        if (peek.action === 'validate-group-token') {
          return await handleValidateGroupToken(req, supabase, supabaseUrl);
        }
        if (peek.action === 'validate-group-token-standalone') {
          return await handleValidateGroupTokenStandalone(req, supabase, supabaseUrl);
        }
        if (peek.action === 'setup-group-webhook') {
          return await handleSetupGroupWebhook(req, supabase, supabaseUrl);
        }
        if (peek.action === 'check-group-webhook') {
          return await handleCheckGroupWebhook(req, supabase, supabaseUrl);
        }
      } catch {
        // Not JSON or parsing failed - continue to webhook handling
      }
    }

    // ═══ TELEGRAM WEBHOOK HANDLING (existing logic) ═══
    const url = new URL(req.url);
    const userId = url.searchParams.get('user_id');
    const botId = url.searchParams.get('bot_id');
    const groupBotIdParam = url.searchParams.get('group_bot_id');
    const gatewayParam = url.searchParams.get('gateway'); // 'group' for third gateway

    if (!userId) {
      console.error('No user_id provided in webhook URL');
      return new Response(JSON.stringify({ ok: true }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // ═══ GROUP GATEWAY: Look up from group_bots table first ═══
    let groupBotRecord: any = null;
    if (gatewayParam === 'group' && groupBotIdParam) {
      const { data: gb } = await supabase
        .from('group_bots')
        .select('*')
        .eq('id', groupBotIdParam)
        .eq('user_id', userId)
        .maybeSingle();
      if (gb) groupBotRecord = gb;
    }

    // Fetch bot settings (still needed for main bot + legacy group bots)
    let botSettingsQuery = supabase.from('bot_settings').select('*');
    if (botId) {
      botSettingsQuery = botSettingsQuery.eq('id', botId);
    } else {
      botSettingsQuery = botSettingsQuery.eq('user_id', userId).limit(1);
    }
    
    const { data: botSettings, error: botSettingsError } = await botSettingsQuery.maybeSingle();
    
    // For group gateway with group_bots record, we don't need bot_settings to have group_bot_token
    const isNewGroupBot = !!(gatewayParam === 'group' && groupBotRecord?.bot_token);
    
    if (!isNewGroupBot && (botSettingsError || !botSettings || (!botSettings.telegram_bot_token && gatewayParam !== 'group') || (gatewayParam === 'group' && !botSettings.group_bot_token))) {
      console.error('Bot settings not found:', botId || userId, botSettingsError);
      return new Response(JSON.stringify({ ok: true }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // ═══ TRIPLE-GATE WEBHOOK SECRET VALIDATION ═══
    let activeToken: string;
    let isGroupGateway = false;

    if (gatewayParam === 'group' && groupBotRecord?.bot_token) {
      // New Multi Group Bot Gateway
      const groupSecret = await generateWebhookSecret(groupBotRecord.bot_token);
      if (!validateTelegramWebhook(req, groupSecret)) {
        console.error('Invalid group webhook secret (group_bots)');
        return new Response(JSON.stringify({ ok: true }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      activeToken = groupBotRecord.bot_token;
      isGroupGateway = true;
      console.log(`[TripleGate] Group Bot gateway active for group_bots:${groupBotRecord.id}`);
    } else if (gatewayParam === 'group' && botSettings?.group_bot_token) {
      // Legacy Group Bot Gateway (bot_settings)
      const groupSecret = await generateWebhookSecret(botSettings.group_bot_token);
      if (!validateTelegramWebhook(req, groupSecret)) {
        console.error('Invalid group webhook secret');
        return new Response(JSON.stringify({ ok: true }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      activeToken = botSettings.group_bot_token;
      isGroupGateway = true;
      console.log(`[TripleGate] Group Bot gateway active for bot ${botSettings.id} (legacy)`);
    } else if (botSettings) {
      // Main Gateway: Primary Bot
      const expectedSecret = await generateWebhookSecret(botSettings.telegram_bot_token);
      if (!validateTelegramWebhook(req, expectedSecret)) {
        console.error('Invalid webhook secret');
        return new Response(JSON.stringify({ ok: true }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      activeToken = botSettings.telegram_bot_token;
    } else {
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ═══ FIX 2: Legacy→New Bridge — token-based lookup ═══
    // If group gateway but no groupBotRecord, bridge by matching bot_token + user_id
    if (isGroupGateway && !groupBotRecord && activeToken) {
      const { data: bridged } = await supabase
        .from('group_bots')
        .select('*')
        .eq('bot_token', activeToken)
        .eq('user_id', userId)
        .maybeSingle();
      if (bridged) {
        groupBotRecord = bridged;
        console.log(`[TripleGate] Legacy→New bridge: found group_bots:${bridged.id} by token match`);
      }
    }

    // ═══ FIX 1: Skip is_active check for group gateways ═══
    // The main bot's is_active should NOT kill the group bot — group bots have their own active toggle
    if (!isNewGroupBot && !isGroupGateway && botSettings && !botSettings.is_active) {
      console.log(`Bot ${botSettings.id} is deactivated (main bot kill switch)`);
      return new Response(JSON.stringify({ ok: true }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // For group gateway (legacy or new), check group-specific active flag
    if (isGroupGateway) {
      const groupActive = groupBotRecord
        ? groupBotRecord.is_active
        : botSettings?.group_bot_active;
      if (groupActive === false) {
        console.log(`[GroupBot] Group bot is deactivated (group_bot_active=false)`);
        return new Response(JSON.stringify({ ok: true }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    }

    // ═══ AUTO-HEAL: Bot Username Discovery ═══
    let botUsername: string | null = isGroupGateway
      ? (groupBotRecord?.bot_username || botSettings?.group_bot_username || null)
      : (botSettings?.bot_username || null);

    if (!botUsername) {
      try {
        const getMeRes = await fetch(
          `https://api.telegram.org/bot${activeToken}/getMe`
        );
        const getMeData = await getMeRes.json();
        if (getMeData.ok && getMeData.result?.username) {
          botUsername = getMeData.result.username;
          if (isGroupGateway && groupBotRecord) {
            // Auto-heal into group_bots table for multi group bots
            await supabase.from('group_bots')
              .update({ bot_username: botUsername, bot_name: getMeData.result.first_name || groupBotRecord.bot_name })
              .eq('id', groupBotRecord.id);
            console.log(`[AutoHeal] Group bot username discovered (group_bots): @${botUsername}`);
          } else if (isGroupGateway && botSettings) {
            // Legacy: auto-heal into bot_settings
            await supabase.from('bot_settings')
              .update({ group_bot_username: botUsername, group_bot_name: getMeData.result.first_name || botSettings.group_bot_name })
              .eq('id', botSettings.id);
            console.log(`[AutoHeal] Group bot username discovered (legacy): @${botUsername}`);
          } else if (botSettings) {
            await supabase.from('bot_settings')
              .update({ bot_username: botUsername, name: getMeData.result.first_name || botSettings.name })
              .eq('id', botSettings.id);
            console.log(`[AutoHeal] Bot username discovered: @${botUsername}`);
          }
        }
      } catch (e) {
        console.error('[AutoHeal] getMe failed, continuing without username:', e);
      }
    }

    // Auto-heal group bot username (when on main gateway but group token exists)
    if (!isGroupGateway && !botSettings.group_bot_username && botSettings.group_bot_token) {
      try {
        const grpMe = await fetch(`https://api.telegram.org/bot${botSettings.group_bot_token}/getMe`);
        const grpData = await grpMe.json();
        if (grpData.ok && grpData.result?.username) {
          await supabase.from('bot_settings')
            .update({ group_bot_username: grpData.result.username, group_bot_name: grpData.result.first_name })
            .eq('id', botSettings.id);
          console.log(`[AutoHeal] Group bot username auto-healed: @${grpData.result.username}`);
        }
      } catch { /* non-critical */ }
    }

    // Parse Telegram update
    const update = await req.json();

    // ═══ UPDATE_ID DEDUPLICATION ═══
    const updateId = update.update_id;
    if (updateId != null) {
      // Layer 1: In-memory cache (same warm instance)
      if (recentUpdateIds.has(updateId)) {
        console.log(`[Dedup] update_id=${updateId} already processed (in-memory). Skipping.`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // Layer 2: DB dedup (cross-instance)
      const { error: dedupErr } = await supabase
        .from('telegram_processed_updates')
        .insert({ update_id: updateId });
      if (dedupErr?.code === '23505') {
        console.log(`[Dedup] update_id=${updateId} already processed (DB). Skipping.`);
        recentUpdateIds.add(updateId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // Mark as seen in-memory with FIFO eviction
      recentUpdateIds.add(updateId);
      if (recentUpdateIds.size > 500) {
        const first = recentUpdateIds.values().next().value;
        if (first !== undefined) recentUpdateIds.delete(first);
      }
    }
    const message = update.message;
    
    const hasText = !!message?.text;
    const hasPhoto = !!message?.photo && message.photo.length > 0;

    if (!message || (!hasText && !hasPhoto)) {
      return new Response(JSON.stringify({ ok: true }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const chatId = message.chat?.id;
    const messageText = message.text || message.caption || 'Describe this image';
    const username = message.from?.username || message.from?.first_name || 'User';
    const telegramUserId = message.from?.id?.toString() || 'Unknown';

    if (chatId) {
      console.log(`[ChatTarget] chatId=${chatId}, type=${message.chat?.type}, gateway=${isGroupGateway ? 'group' : 'main'}`);
    }

    if (!chatId) {
      return new Response(JSON.stringify({ ok: true }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // ═══ FORWARDED MESSAGE: Channel ID Extractor ═══
    // ONLY in private DMs — never reply in groups/channels
    const isPrivateChat = message.chat?.type === 'private';
    const forwardedChat = message?.forward_from_chat;
    if (isPrivateChat && forwardedChat && (forwardedChat.type === 'channel' || forwardedChat.type === 'supergroup')) {
      const forwardChatId = forwardedChat.id.toString();
      const forwardTitle = forwardedChat.title || 'Unknown Channel';
      const forwardUsername = forwardedChat.username ? `@${forwardedChat.username}` : null;

      console.log(`[ForwardExtract] Channel detected: ${forwardTitle} (${forwardChatId})`);

      const { data: fwdIdentity } = await supabase
        .from('channel_identities')
        .select('user_id')
        .eq('channel', 'telegram')
        .eq('external_id', telegramUserId)
        .eq('is_verified', true)
        .maybeSingle();

      if (fwdIdentity) {
        const { data: existing } = await supabase
          .from('broadcast_channels')
          .select('id')
          .eq('user_id', fwdIdentity.user_id)
          .eq('channel_id', forwardChatId)
          .maybeSingle();

        if (existing) {
          await sendTelegramMessage(
            activeToken, chatId,
            `✅ Channel "${forwardTitle}" (ID: ${forwardChatId}) is already saved.`,
            null
          );
        } else {
          const { count } = await supabase
            .from('broadcast_channels')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', fwdIdentity.user_id);

          if ((count || 0) >= 20) {
            await sendTelegramMessage(
              activeToken, chatId,
              `⚠️ Maximum channel limit reached (20). Please remove an existing channel before adding new ones.`,
              null
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          await supabase.from('broadcast_channels').insert({
            user_id: fwdIdentity.user_id,
            channel_type: 'telegram',
            channel_name: forwardUsername || forwardTitle,
            channel_id: forwardChatId,
            is_default: (count || 0) === 0,
          });

          await sendTelegramMessage(
            activeToken, chatId,
            `✅ Channel "${forwardTitle}" saved!\nID: ${forwardChatId}\n\nYou can now say: "Post X to ${forwardUsername || forwardTitle}"`,
            null
          );
        }
      } else {
        await sendTelegramMessage(
          activeToken, chatId,
          `📡 Channel: ${forwardTitle}\nID: ${forwardChatId}\n\nLink your account first to auto-save channels.`,
          null
        );
      }

      await supabase.from('bot_chat_logs').insert({
        user_id: botSettings.user_id,
        bot_id: botSettings.id,
        telegram_user_id: telegramUserId,
        telegram_username: username,
        chat_id: chatId.toString(),
        message: `[Forwarded from: ${forwardTitle}]`,
        message_type: 'forward',
        ai_reply: `Channel ID extracted: ${forwardChatId}`,
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ═══ CHAT TYPE DETECTION ═══
    const chatType = message.chat?.type;
    const isGroupChat = chatType === 'group' || chatType === 'supergroup';
    let triggeredBy = 'direct'; // Default for DMs

    // Use correct trigger word source: group_bots record for multi group bots, legacy for others
    const triggerWord = (isGroupGateway && groupBotRecord)
      ? (groupBotRecord.trigger_word || '')
      : (botSettings?.trigger_word || '');

    // ═══ GROUP CHAT ETIQUETTE FILTER ═══
    if (isGroupChat) {
      const lowerText = messageText.toLowerCase();

      // Check 4 conditions - ANY passes = PROCESS
      const isMentioned = botUsername && lowerText.includes(`@${botUsername.toLowerCase()}`);
      const isReplyToBot = message.reply_to_message?.from?.is_bot === true
            && !!botUsername
            && message.reply_to_message?.from?.username?.toLowerCase() === botUsername.toLowerCase();
      const isCommand = messageText.startsWith('/');
      const hasTriggerWord = triggerWord && lowerText.includes(triggerWord.toLowerCase());

      if (!isMentioned && !isReplyToBot && !isCommand && !hasTriggerWord) {
        // ═══ FIX 5: Diagnostic log for etiquette rejection ═══
        console.log(`[Etiquette] REJECTED — text="${lowerText.substring(0, 80)}", trigger="${triggerWord}", bot="${botUsername}", mention=${!!isMentioned}, reply=${!!isReplyToBot}, cmd=${isCommand}`);
        return new Response(JSON.stringify({ ok: true }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      triggeredBy = isMentioned ? 'mention' : isReplyToBot ? 'reply' : isCommand ? 'command' : 'trigger_word';
      console.log(`[Etiquette] Group msg accepted via: ${triggeredBy}`);
    }

    // Clean message: strip @mention and trigger word
    let cleanedMessageText = messageText;
    if (botUsername) {
      cleanedMessageText = cleanedMessageText.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim();
    }
    if (triggerWord) {
      const escapedTrigger = triggerWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleanedMessageText = cleanedMessageText.replace(new RegExp(escapedTrigger, 'gi'), '').trim();
    }
    if (!cleanedMessageText) cleanedMessageText = 'ဘာကူညီရမလဲ?';

    if (cleanedMessageText.length > 4000) {
      cleanedMessageText = cleanedMessageText.substring(0, 4000);
    }

    const replyToMessage = message.reply_to_message;
    if (replyToMessage) {
      const originalText = replyToMessage.text || replyToMessage.caption || '';
      if (originalText) {
        cleanedMessageText = `[Replying to: "${originalText.substring(0, 200)}"]\n\n${cleanedMessageText}`;
      }
    }

    // ═══ GROUP GATEWAY: Skip identity/firewall for group bot ═══
    // IMPORTANT: This entire block returns EARLY. No identity check, no 6-digit handshake,
    // no Security Gate. The group bot is open to ALL group members by design.
    if (isGroupGateway) {
      console.log(`[GroupGateway] ✅ OPEN ACCESS — identity verification SKIPPED for group bot`);
      
      // Resolve group bot config from group_bots table or legacy bot_settings
      const gbActive = groupBotRecord ? groupBotRecord.is_active : (botSettings?.group_bot_active !== false);
      const gbAllowDm = groupBotRecord ? groupBotRecord.allow_dm : (botSettings?.group_bot_allow_dm === true);
      const gbUsername = groupBotRecord ? (groupBotRecord.bot_username || 'GroupBot') : (botSettings?.group_bot_username || botSettings?.bot_username || 'GroupBot');
      const gbCustomInstruction = groupBotRecord ? groupBotRecord.custom_instruction : (botSettings?.group_bot_custom_instruction || null);
      const gbAllowWebSearch = groupBotRecord ? groupBotRecord.allow_web_search : (botSettings?.group_bot_allow_web_search === true);
      const gbOwnerId = groupBotRecord ? groupBotRecord.user_id : botSettings?.user_id;
      const gbBotSettingsId = groupBotRecord ? (groupBotRecord.bot_settings_id || botSettings?.id) : botSettings?.id;

      // ═══ GUARD 1: Group Bot Active/Deactivate check ═══
      if (!gbActive) {
        console.log(`[GroupGateway] Bot deactivated. Silent ignore. user=${telegramUserId}`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ═══ GUARD 2: DM Access Control (private chat on group gateway) ═══
      const isGroupChat = message.chat?.type === 'group' || message.chat?.type === 'supergroup';
      if (!isGroupChat && !gbAllowDm) {
        console.log(`[GroupGateway] DM blocked. Silent ignore. user=${telegramUserId}`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Group Bot serves the group — no owner-only firewall needed
      // Route directly through BeeBot brain with restricted context
      console.log(`[GroupGateway] Processing group message from ${telegramUserId} in ${message.chat?.title || 'Unknown Group'}`);

      // ═══ GROUP /whoami HANDLER (no identity lookup — group is open access) ═══
      if (messageText.trim().toLowerCase() === '/whoami') {
        const senderName = message.from?.username ? `@${message.from.username}` : (message.from?.first_name || `ID: ${telegramUserId}`);
        const groupName = message.chat?.title || 'This group';
        const statusMsg = `👥 Group Member Status\n\nName: ${senderName}\nGroup: ${groupName}\nEnvironment: Group Chat\n\nNo account linking is required for group usage. Just mention me or use a command!`;

        await sendTelegramMessage(activeToken, chatId, statusMsg, null);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      try {
        await fetch(`https://api.telegram.org/bot${activeToken}/sendChatAction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
        });
      } catch (_e) { /* non-critical */ }

      const groupStartTime = Date.now();
      // ═══ THE GREAT PARTITION: Per-group-ID sandbox session ═══
      const groupSessionKey = groupBotRecord?.id || gbBotSettingsId || 'legacy';
      const groupSessionTitle = `[TG-Group:${groupSessionKey}] ${chatId}`;
      let groupSessionId: string;

      const { data: existingGroupSession } = await supabase
        .from('agent_chat_sessions')
        .select('id')
        .eq('user_id', gbOwnerId)
        .eq('title', groupSessionTitle)
        .eq('is_active', true)
        .maybeSingle();

      if (existingGroupSession) {
        groupSessionId = existingGroupSession.id;
      } else {
        const { data: newSession } = await supabase
          .from('agent_chat_sessions')
          .insert({
            user_id: gbOwnerId,
            title: groupSessionTitle,
            metadata: {
              channel: 'telegram',
              gateway: 'group',
              telegram_chat_id: chatId.toString(),
              group_bot_id: groupBotRecord?.id || null,
              bot_settings_id: gbBotSettingsId || null,
              kind: 'subagent-group',
            },
          })
          .select('id')
          .single();
        groupSessionId = newSession!.id;
      }

      // ═══ GROUP IDENTITY: Prepend sender info + admin role so AI knows WHO is talking ═══
      let senderRole = 'member';
      let adminRoster = '';
      try {
        const admins = await fetchGroupAdmins(activeToken, chatId);
        if (admins.length > 0) {
          adminRoster = admins.map(a => `${a.username ? '@' + a.username : a.first_name} (${a.status === 'creator' ? 'creator' : 'admin'})`).join(', ');
          const senderId = message.from?.id;
          const senderAdmin = admins.find(a => a.user_id === senderId);
          if (senderAdmin) {
            senderRole = senderAdmin.status === 'creator' ? 'Creator' : 'Admin';
          }
        }
      } catch (e) {
        console.warn('[AdminAwareness] Failed to fetch group admins:', e);
      }

      const senderLabel = message.from?.username
        ? `@${message.from.username}`
        : (message.from?.first_name || 'Unknown');
      const roleTag = senderRole !== 'member' ? ` (${senderRole})` : '';
      const groupMessageContent = `[From: ${senderLabel}${roleTag}] ${cleanedMessageText}`;

      // ═══ MESSAGE-LEVEL DEDUP: Prevent duplicate processing from webhook retries ═══
      const recentCutoff = new Date(Date.now() - 30_000).toISOString();
      const { data: recentDup } = await supabase
        .from('agent_chat_messages')
        .select('id')
        .eq('session_id', groupSessionId)
        .eq('role', 'user')
        .eq('content', groupMessageContent)
        .gte('created_at', recentCutoff)
        .limit(1);
      
      if (recentDup && recentDup.length > 0) {
        console.log(`[MsgDedup] Duplicate user message in group ${chatId} within 30s — skipping`);
        return new Response(JSON.stringify({ ok: true, dedup: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await supabase.from('agent_chat_messages').insert({
        session_id: groupSessionId,
        user_id: gbOwnerId,
        role: 'user',
        content: groupMessageContent,
        source_channel: 'telegram',
      });

      let attachments: { type: string; base64: string; mime_type: string; file_name: string }[] | undefined;
      if (hasPhoto) {
        const photo = message.photo[message.photo.length - 1];
        const imageData = await downloadTelegramPhoto(activeToken, photo.file_id);
        if (imageData) {
          attachments = [{
            type: 'image',
            base64: imageData.base64,
            mime_type: imageData.mimeType,
            file_name: `telegram_${photo.file_id}.jpg`,
          }];
        }
      }

      // Fetch owner display name for dynamic creator identity
      let creatorName = 'BeeBot User';
      try {
        const { data: ownerProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', gbOwnerId)
          .maybeSingle();
        if (ownerProfile?.full_name) {
          creatorName = ownerProfile.full_name;
        }
      } catch (e) {
        console.warn('[CreatorIdentity] Failed to fetch owner name:', e);
      }

      // Dynamic timezone resolution for group gateway
      let grpTz = 'UTC';
      let grpTzOffset = 0;
      try {
        const { data: uas } = await supabase.from('user_agent_settings').select('timezone').eq('user_id', gbOwnerId).maybeSingle();
        if (uas?.timezone) {
          grpTz = uas.timezone;
          const _now = new Date();
          const _utc = new Date(_now.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
          const _loc = new Date(_now.toLocaleString('en-US', { timeZone: grpTz })).getTime();
          grpTzOffset = -(_loc - _utc) / 60000;
        }
      } catch { /* fallback */ }

      let aiReply = await forwardToAgentChat(
        supabaseUrl, supabaseServiceKey, gbOwnerId, groupSessionId,
        groupMessageContent, attachments,
        {
          is_group: true,
          gateway: 'group_bot',
          group_title: message.chat?.title || 'Unknown Group',
          group_id: chatId.toString(),
          triggered_by: triggeredBy,
          creator_name: creatorName,
          group_bot_username: gbUsername,
          group_bot_custom_instruction: gbCustomInstruction,
          group_bot_allow_web_search: gbAllowWebSearch,
          sender_role: senderRole,
          admin_roster: adminRoster,
        } as any,
        { timezone: grpTz, timezoneOffset: grpTzOffset }
      );

      // ═══ DELIVERY GUARANTEE (Phase 5): Enhanced intercept for group responses ═══
      const GROUP_FALLBACK_RESPONSE = "🐝 ခဏနေ ထပ်မေးပေးပါ ဗျ";
      const AUTONOMOUS_LEAK_PATTERNS = /Autonomous Mode|sub-agents|ခန့်မှန်းချိန်|Auto-switching to Autonomous|autonomous_started|Autonomous Intelligence/i;
      const isTrulyEmpty = !aiReply || aiReply.trim().length === 0;
      const isJunkResponse = aiReply && aiReply.trim().length > 0 && aiReply.trim().length < 2; // single-char junk
      const isSystemError = aiReply && (aiReply.includes('[System Error') || aiReply.includes('EMPTY_STREAM') || aiReply.includes('[System Info'));
      const isAutonomousLeak = aiReply && AUTONOMOUS_LEAK_PATTERNS.test(aiReply);
      const isOnlyThinking = aiReply && /^\s*<thinking>[\s\S]*<\/thinking>\s*$/.test(aiReply.trim()) && !aiReply.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
      let wasIntercepted = false;
      if (isTrulyEmpty || isJunkResponse || isSystemError || isAutonomousLeak || isOnlyThinking) {
        console.warn(`[DeliveryGuarantee] Broken response intercepted for group. Original: ${(aiReply || '').substring(0, 100)}`);
        aiReply = GROUP_FALLBACK_RESPONSE;
        wasIntercepted = true;
      }

      // ═══ PHASE 6: OBSERVABILITY ═══
      const groupResponseTime = Date.now() - groupStartTime;
      console.log(`[GroupBot-Metrics] chatId=${chatId}, responseTime=${groupResponseTime}ms, contentLength=${aiReply.length}, wasIntercepted=${wasIntercepted}`);

      try {
        await sendTelegramMessage(activeToken, chatId, aiReply, 'MarkdownV2', message.message_id);
      } catch {
        try {
          const strippedReply = stripAllMarkdown(aiReply);
          await sendTelegramMessage(activeToken, chatId, strippedReply, null, message.message_id);
        } catch (plainError) {
          console.error(`[DeliveryFail] chatId=${chatId}, token=${activeToken === (groupBotRecord?.bot_token || botSettings?.group_bot_token) ? 'group' : 'main'}, error:`, plainError);
        }
      }

      if (gbBotSettingsId) {
        await updateBotStatus(supabase, gbBotSettingsId, 'success');
      }

      await supabase.from('bot_chat_logs').insert({
        user_id: gbOwnerId,
        bot_id: gbBotSettingsId || null,
        telegram_user_id: telegramUserId,
        telegram_username: username,
        chat_id: chatId.toString(),
        message: cleanedMessageText,
        message_type: hasPhoto ? 'photo' : 'text',
        image_file_id: hasPhoto ? message.photo[message.photo.length - 1].file_id : null,
        ai_reply: aiReply.substring(0, 10000),
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ═══ /whoami COMMAND HANDLER ═══
    if (chatType === 'private' && messageText.trim().toLowerCase() === '/whoami') {
      const { data: whoamiIdentity } = await supabase
        .from('channel_identities')
        .select('user_id, is_verified, external_username, linked_at')
        .eq('channel', 'telegram')
        .eq('external_id', telegramUserId)
        .eq('is_verified', true)
        .maybeSingle();

      if (whoamiIdentity) {
        // Fetch profile and role
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', whoamiIdentity.user_id)
          .maybeSingle();
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', whoamiIdentity.user_id)
          .maybeSingle();

        const linkedDate = whoamiIdentity.linked_at
          ? new Date(whoamiIdentity.linked_at).toISOString().replace('T', ' ').substring(0, 19)
          : 'Unknown';

        try {
          await sendTelegramMessage(
            activeToken, chatId,
            `👤 IDENTITY STATUS: VERIFIED\n\n` +
            `Name: ${profile?.full_name || 'User'}\n` +
            `Telegram: @${whoamiIdentity.external_username || telegramUserId}\n` +
            `Role: ${roleData?.role || 'User'}\n` +
            `Linked: ${linkedDate}\n` +
            `Security: 🛡️ Owner-Only Active\n` +
            `Security Level: 100%`,
            null
          );
        } catch (whoamiErr) {
          console.error('[Whoami] Verified message failed, retrying plain:', whoamiErr);
          await sendTelegramMessage(activeToken, chatId,
            `IDENTITY STATUS: VERIFIED\nName: ${profile?.full_name || 'User'}\nRole: ${roleData?.role || 'User'}`,
            null
          );
        }
      } else {
        try {
          await sendTelegramMessage(
            activeToken, chatId,
            `⚠️ STATUS: UNVERIFIED\n\n` +
            `Your account is not linked.\n` +
            `Please link your account via the Dashboard's Neural Link code.\n\n` +
            `1️⃣ Open BeeBot Dashboard\n` +
            `2️⃣ Go to Telegram Bot Settings → Neural Link\n` +
            `3️⃣ Generate a 6-digit code\n` +
            `4️⃣ Send the code here`,
            null
          );
        } catch (whoamiUnverifiedErr) {
          console.error('[Whoami] Unverified message failed:', whoamiUnverifiedErr);
          await sendTelegramMessage(activeToken, chatId,
            `STATUS: UNVERIFIED. Please link via Dashboard Neural Link code.`,
            null
          );
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ═══ SECURE CODE HANDSHAKE — BEFORE identity lookup so re-linking works ═══
    if (chatType === 'private') {
      const normalizedMsg = messageText.replace(/\s/g, '').toUpperCase();

      if (normalizedMsg.length === 6) {
        const { data: linkCode } = await supabase
          .from('channel_link_codes')
          .select('*')
          .eq('code', normalizedMsg)
          .eq('channel', 'telegram')
          .eq('is_used', false)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (linkCode && linkCode.user_id === botSettings.user_id) {
          const { error: linkError } = await supabase
            .from('channel_identities')
            .upsert({
              user_id: botSettings.user_id,
              channel: 'telegram',
              external_id: telegramUserId,
              external_username: username,
              chat_id: chatId.toString(),
              is_verified: true,
              is_primary: true,
              linked_at: new Date().toISOString(),
            }, {
              onConflict: 'channel,external_id',
            });

          if (!linkError) {
            await supabase
              .from('channel_link_codes')
              .update({ is_used: true })
              .eq('id', linkCode.id);

            console.log(`[SecureLink] ✅ Owner verified via code ${normalizedMsg}: ${telegramUserId} → ${botSettings.user_id}`);

            const { data: ownerProfile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('user_id', botSettings.user_id)
              .maybeSingle();
            const displayName = ownerProfile?.full_name || 'Owner';
            const now = new Date();
            const timestamp = now.toISOString().replace('T', ' ').substring(0, 19) + ' MMT';

            try {
              await sendTelegramMessage(
                activeToken, chatId,
                `✅ IDENTITY VERIFIED\n\n` +
                `Welcome, ${displayName}. Your Telegram account (@${username || telegramUserId}) is now securely linked to your BeeBot Dashboard.\n\n` +
                `🕐 Timestamp: ${timestamp}\n` +
                `🛡️ Security Level: Owner-Only Mode Active\n` +
                `🧠 Full tool-calling enabled\n` +
                `💾 Same brain & memory as web chat\n\n` +
                `Send me any message to get started!`,
                null
              );
            } catch (verifyMsgErr) {
              console.error('[SecureLink] Verification message failed, retrying plain:', verifyMsgErr);
              await sendTelegramMessage(activeToken, chatId,
                `IDENTITY VERIFIED. Welcome, ${displayName}. Your account is now linked.`,
                null
              );
            }

            await supabase.from('bot_chat_logs').insert({
              user_id: botSettings.user_id,
              bot_id: botSettings.id,
              telegram_user_id: telegramUserId,
              telegram_username: username,
              chat_id: chatId.toString(),
              message: `[Secure Link Code: ${normalizedMsg}]`,
              message_type: 'text',
              ai_reply: '[Neural Link: Owner verified via secure code]',
            });

            return new Response(JSON.stringify({ ok: true }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          } else {
            console.error('[SecureLink] Upsert failed:', linkError.message);
          }
        }
      }
    }

    // ═══ MAIN GATEWAY: IDENTITY LOOKUP ═══
    const { data: channelIdentity } = await supabase
      .from('channel_identities')
      .select('user_id, is_verified')
      .eq('channel', 'telegram')
      .eq('external_id', telegramUserId)
      .eq('is_verified', true)
      .maybeSingle();

    if (!channelIdentity) {
      // ═══ SECURITY GATE for unlinked private chat users ═══
      if (chatType === 'private') {
        // ═══ SECURITY AUTO-NOTIFICATION: Alert owner of unauthorized attempt ═══
        try {
          // Rate limit: max 1 notification per unique Telegram user per hour
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { data: recentNotif } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', botSettings.user_id)
            .eq('type', 'security')
            .ilike('message', `%${telegramUserId}%`)
            .gte('created_at', oneHourAgo)
            .maybeSingle();

          if (!recentNotif) {
            await supabase.from('notifications').insert({
              user_id: botSettings.user_id,
              type: 'security',
              title: '🚨 Unauthorized Access Attempt',
              message: `Unverified user @${username || 'unknown'} (ID: ${telegramUserId}) attempted to use your bot.`,
            });
            console.log(`[SecurityAlert] Notification sent for unauthorized user ${telegramUserId}`);
          }
        } catch (notifErr) {
          console.error('[SecurityAlert] Failed to insert notification:', notifErr);
        }

        try {
          await sendTelegramMessage(
            activeToken, chatId,
            `🛡️ BeeBot Security Gate\n\n` +
            `To link your account, you need a 6-digit verification code.\n\n` +
            `1️⃣ Open BeeBot Chat in the web app\n` +
            `2️⃣ Click the 🧠 Brain icon → Neural Link\n` +
            `3️⃣ Click "Generate Secure Linking Code"\n` +
            `4️⃣ Send the code here\n\n` +
            `ဒီ bot ကိုသုံးဖို့ web app ထဲက Neural Link မှာ code ယူပြီး ဒီမှာပို့ပေးပါ။`,
            null
          );
        } catch (gateErr) {
          console.error('[SecurityGate] Message failed, retrying plain:', gateErr);
          await sendTelegramMessage(activeToken, chatId,
            `BeeBot Security Gate: Please get a 6-digit code from the web app Neural Link to verify.`,
            null
          );
        }

        await supabase.from('bot_chat_logs').insert({
          user_id: botSettings.user_id,
          bot_id: botSettings.id,
          telegram_user_id: telegramUserId,
          telegram_username: username,
          chat_id: chatId.toString(),
          message: cleanedMessageText,
          message_type: hasPhoto ? 'photo' : 'text',
          ai_reply: '[Security Gate: Code required]',
        });

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // PERSONAL BOT PATH ONLY: Group chat from unlinked user on the MAIN bot — ignore silently.
      // NOTE: This does NOT affect the Group Bot (gateway=group), which returns early at the GROUP GATEWAY block above.
      return new Response(JSON.stringify({ ok: true }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // ═══ LINKED USER: Route through full BeeBot brain ═══
    const linkedUserId = channelIdentity.user_id;

    // ═══ OWNER-ONLY FIREWALL (First check before ANY processing) ═══
    if (linkedUserId !== botSettings.user_id) {
      console.warn(`[FIREWALL] BLOCKED: Telegram user ${telegramUserId} linked to ${linkedUserId} but bot owner is ${botSettings.user_id}`);
      await sendTelegramMessage(
        activeToken, chatId,
        '🛡️ Access Denied. This bot only serves its owner.',
        null
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Gateway: Telegram user ${telegramUserId} → verified owner ${linkedUserId}`);

    try {
      await fetch(`https://api.telegram.org/bot${activeToken}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
      });
    } catch (_e) { /* non-critical */ }

    // ═══ SESSION MANAGEMENT ═══
    let telegramSessionId: string;

    const { data: existingSession } = await supabase
      .from('agent_chat_sessions')
      .select('id')
      .eq('user_id', linkedUserId)
      .eq('title', '[Telegram] Chat')
      .eq('is_active', true)
      .maybeSingle();

    if (existingSession) {
      telegramSessionId = existingSession.id;
    } else {
      const { data: newSession } = await supabase
        .from('agent_chat_sessions')
        .insert({
          user_id: linkedUserId,
          title: '[Telegram] Chat',
          metadata: { channel: 'telegram', telegram_chat_id: chatId.toString(), kind: 'partner' },
        })
        .select('id')
        .single();
      telegramSessionId = newSession!.id;
    }

    // ═══ PILLAR 4: LEASE-BASED ZOMBIE CLEANUP (Self-Healing) ═══
    const { data: zombieCleared } = await supabase
      .from('agent_chat_sessions')
      .update({ 
        processing_lock: null,
        lease_holder_id: null,
        lease_acquired_at: null,
        lease_expires_at: null,
        global_session_state: { processing_status: "idle", last_activity_at: new Date().toISOString() }
      })
      .eq('id', telegramSessionId)
      .not('lease_expires_at', 'is', null)
      .lt('lease_expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle();

    if (zombieCleared) {
      console.log('[SelfHeal] Expired lease cleared for session:', telegramSessionId);
      await supabase.from('agent_communication_log').insert({
        requester_agent_id: linkedUserId,
        query_type: 'system',
        query_content: '[SelfHeal] Expired session lease cleared (auto-reclaim)',
        target_type: 'system',
        was_successful: true,
      });
    }

    try {
      await supabase.from('agent_chat_messages').insert({
        session_id: telegramSessionId,
        user_id: linkedUserId,
        role: 'user',
        content: cleanedMessageText,
        source_channel: 'telegram',
      });

      let attachments: { type: string; base64: string; mime_type: string; file_name: string }[] | undefined;
      if (hasPhoto) {
        const photo = message.photo[message.photo.length - 1];
        const imageData = await downloadTelegramPhoto(activeToken, photo.file_id);
        if (imageData) {
          attachments = [{
            type: 'image',
            base64: imageData.base64,
            mime_type: imageData.mimeType,
            file_name: `telegram_${photo.file_id}.jpg`,
          }];
        }
      }

      // Dynamic timezone resolution for main gateway
      let mainTz = 'UTC';
      let mainTzOffset = 0;
      try {
        const { data: uas } = await supabase.from('user_agent_settings').select('timezone').eq('user_id', linkedUserId).maybeSingle();
        if (uas?.timezone) {
          mainTz = uas.timezone;
          const _now = new Date();
          const _utc = new Date(_now.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
          const _loc = new Date(_now.toLocaleString('en-US', { timeZone: mainTz })).getTime();
          mainTzOffset = -(_loc - _utc) / 60000;
        }
      } catch { /* fallback */ }

      const aiReply = await forwardToAgentChat(
        supabaseUrl, supabaseServiceKey, linkedUserId, telegramSessionId,
        cleanedMessageText, attachments,
        isGroupChat ? {
          is_group: true,
          group_title: message.chat?.title || 'Unknown Group',
          group_id: chatId.toString(),
          triggered_by: triggeredBy,
        } : undefined,
        { timezone: mainTz, timezoneOffset: mainTzOffset }
      );

      try {
        await sendTelegramMessage(activeToken, chatId, aiReply, 'MarkdownV2', isGroupChat ? message.message_id : undefined);
      } catch {
        try {
          await sendTelegramMessage(activeToken, chatId, aiReply, null, isGroupChat ? message.message_id : undefined);
        } catch (plainError) {
          console.error(`[DeliveryFail] chatId=${chatId}, token=${activeToken === botSettings.group_bot_token ? 'group' : 'main'}, error:`, plainError);
        }
      }

      await updateBotStatus(supabase, botSettings.id, 'success');

      await supabase.from('bot_chat_logs').insert({
        user_id: botSettings.user_id,
        bot_id: botSettings.id,
        telegram_user_id: telegramUserId,
        telegram_username: username,
        chat_id: chatId.toString(),
        message: cleanedMessageText,
        message_type: hasPhoto ? 'photo' : 'text',
        image_file_id: hasPhoto ? message.photo[message.photo.length - 1].file_id : null,
        ai_reply: aiReply.substring(0, 10000),
      });

    } catch (error) {
      console.error('Gateway processing error:', error);
      await updateBotStatus(supabase, botSettings.id, 'error', error instanceof Error ? error.message : 'Gateway error');
      
      await sendTelegramMessage(
        activeToken, chatId,
        '❌ Sorry, I encountered an error. Please try again.',
        null
      );
    }

    return new Response(JSON.stringify({ ok: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ ok: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
