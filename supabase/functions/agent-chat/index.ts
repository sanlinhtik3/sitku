import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


// ═══ PROJECT PHOENIX: Shared module imports ═══
import { detectPromptInjection } from "../_shared/sanitizer.ts";
import { compactContextIfNeeded } from "../_shared/context-compactor.ts";
import { observerAnalyze, fallbackObserverClassify, preScreenClassify } from "../_shared/observer.ts";
import { assembleSystemPrompt, compressOldHistory, quickModuleDetect, fetchSessionContext } from "../_shared/prompt-builder.ts";
import type { AgentSettings, SessionContext, DeviceContext, ExtendedContext, GlobalUserContext, RecentMemoriesContext } from "../_shared/prompt-builder.ts";
import { BASE_TOOLS, AGENTIC_CORE_TOOLS, AGENT_NETWORK_TOOLS, ADVANCED_AGENT_TOOLS, SUPER_ADMIN_TOOLS, SUPER_ADMIN_CRUD_TOOLS, SUPER_AGENT_NETWORK_TOOLS, SUPER_ADVANCED_TOOLS, SUPER_AGENT_TOOLS, SKILL_DETAIL_TOOL } from "../_shared/tool-definitions.ts";
import { generateEmbeddingWithKey, fetchExtendedContext, fetchLivingMemories, finalizeSessionSummary } from "../_shared/executor-helpers.ts";
// ═══ Extracted modules ═══
import { handleMonitoringMode, handleBackgroundObjective } from "../_shared/monitoring-handler.ts";
import { buildGroupBotPrompt, buildCoreProtocols } from "../_shared/prompt-templates.ts";
import { resolveApiConfig } from "../_shared/api-key-resolver.ts";
import { OPENROUTER_ENDPOINT, GEMINI_OPENAI_ENDPOINT, ANTHROPIC_ENDPOINT, XAI_ENDPOINT } from "../_shared/api-endpoints.ts";
// ═══ Extracted modules ═══
import { checkRateLimit, getCachedAdminStatus, setCachedAdminStatus } from "../_shared/auth-and-rate-limit.ts";
import { SessionManager, buildConversationHistory } from "../_shared/session-manager-backend.ts";
import { emitThinking } from "../_shared/streaming-engine.ts";
import { fetchGlobalUserContext, fetchRecentMemoriesForWarmup, fetchCrossSessionRecentMessages, proactiveMemoryRecall } from "../_shared/memory-vault.ts";
import { fetchUserPermissions, fetchStrictMode, isConfirmationMessage, getPendingAction, clearPendingAction } from "../_shared/consent-guard.ts";
// Autonomous Mode removed (2026-04). Replaced by user-controlled Deep Run toggle + Scheduled Tasks (Automations).
import { resolveInternalLLM } from "../_shared/internal-llm-caller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-apex-model, x-telegram-gateway, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Max-Age": "86400",
};

// ═══ PHASE E: Stale-While-Revalidate Settings Cache (Claude-inspired) ═══
// Returns stale data immediately while refreshing in background
// 300s stale tolerance — feature flags don't need sub-second freshness
interface CacheEntry<T> { data: T; expires: number; staleUntil: number; }
const settingsCache = new Map<string, CacheEntry<any>>();
const SETTINGS_CACHE_TTL = 60_000; // 60s — fresh period
const SETTINGS_STALE_TTL = 300_000; // 300s — stale-but-servable period
const SETTINGS_CACHE_MAX_SIZE = 500; // ═══ LRU EVICTION: Prevent unbounded memory growth ═══

function getCached<T>(key: string): T | null {
  const entry = settingsCache.get(key);
  if (!entry) return null;
  
  const now = Date.now();
  // Fresh: return immediately
  if (now < entry.expires) return entry.data as T;
  // Stale but servable: return data (caller should trigger background refresh)
  if (now < entry.staleUntil) return entry.data as T;
  
  // Expired: remove
  settingsCache.delete(key);
  return null;
}

function isCacheStale(key: string): boolean {
  const entry = settingsCache.get(key);
  if (!entry) return true;
  return Date.now() >= entry.expires; // past fresh period
}

function setCache<T>(key: string, data: T): void {
  // ═══ LRU EVICTION: Remove oldest entries when cache exceeds max size ═══
  if (settingsCache.size >= SETTINGS_CACHE_MAX_SIZE) {
    const now = Date.now();
    // First pass: evict expired entries
    for (const [k, v] of settingsCache) {
      if (now >= v.staleUntil) settingsCache.delete(k);
    }
    // If still over limit: evict oldest entries (Map preserves insertion order)
    if (settingsCache.size >= SETTINGS_CACHE_MAX_SIZE) {
      const toEvict = settingsCache.size - Math.floor(SETTINGS_CACHE_MAX_SIZE * 0.8);
      let evicted = 0;
      for (const k of settingsCache.keys()) {
        if (evicted >= toEvict) break;
        settingsCache.delete(k);
        evicted++;
      }
    }
  }

  // Delete and re-set to move to end of Map (LRU: most-recent-last)
  settingsCache.delete(key);
  settingsCache.set(key, {
    data,
    expires: Date.now() + SETTINGS_CACHE_TTL,
    staleUntil: Date.now() + SETTINGS_STALE_TTL,
  });
}



// ═══ PILLAR 2: Interrupt keywords for pending message queue ═══
const INTERRUPT_KEYWORDS = new Set(["stop", "cancel", "ရပ်", "ဖျက်"]);
const INTERRUPT_PRIORITY = 10;

// ═══ Idempotency dedupe: client_request_id → expiresAt epoch ms ═══
// In-memory only (single isolate); 60s TTL is enough to absorb retry storms
// from network blips without persisting to DB. Bounded to 5k keys to cap RAM.
const seenClientRequestIds = new Map<string, number>();
const CLIENT_REQUEST_ID_TTL_MS = 60_000;
const CLIENT_REQUEST_ID_MAX = 5000;
function isDuplicateRequest(id: string): boolean {
  if (!id) return false;
  const now = Date.now();
  // Lazy GC: sweep expired entries on each insert attempt
  if (seenClientRequestIds.size >= CLIENT_REQUEST_ID_MAX) {
    for (const [k, exp] of seenClientRequestIds) {
      if (exp <= now) seenClientRequestIds.delete(k);
    }
    // Hard cap fallback: drop oldest insertion-ordered entries
    if (seenClientRequestIds.size >= CLIENT_REQUEST_ID_MAX) {
      const drop = Math.floor(CLIENT_REQUEST_ID_MAX * 0.2);
      let dropped = 0;
      for (const k of seenClientRequestIds.keys()) {
        if (dropped >= drop) break;
        seenClientRequestIds.delete(k);
        dropped++;
      }
    }
  }
  const existing = seenClientRequestIds.get(id);
  if (existing && existing > now) return true;
  seenClientRequestIds.set(id, now + CLIENT_REQUEST_ID_TTL_MS);
  return false;
}

// ═══ MODULE-LEVEL REGEX CONSTANTS (hoisted from request handler — compiled once) ═══
const AUTONOMOUS_PATTERN = /take\s*your\s*time|background|ကြာလည်းကြာ|အစအဆုံး|autonomous|deep\s*research|deep\s*dive|အကြီးအကျယ်/i;
const COMPLEX_RESEARCH_PATTERN = /(?:(?:research|analyze|audit|compare|report|strategy|ခွဲခြမ်း|သုတေသန|စီစစ်).*(?:deep\s*dive|thorough|complete|full|အပြည့်အစုံ))|(?:(?:deep\s*dive|thorough|complete|full|အပြည့်အစုံ).*(?:research|analyze|audit|compare|report|strategy|ခွဲခြမ်း|သုတေသန|စီစစ်))/i;
const MULTI_STEP_COMPLEX_PATTERN = /\b(audit|architecture|strategy|refactor|redesign)\b.*\b(system|pipeline|app|platform|project)\b/i;
const IMAGE_REQUEST_PATTERN = /ပုံ|ဆွဲ|draw|image|picture|illustrate|photo|generate.*image|ဖန်တီး.*ပုံ|ပုံဆွဲ|ရုပ်ပုံ/i;
const MAX_AGENT_STEPS_DEFAULT = 4; // Maximum number of AI calls in agentic loop (dynamic: 2-10 based on Observer + keyword escalation)

// ═══ MODULE-LEVEL REGEX CONSTANTS Phase 2 (intent detection — compiled once) ═══
const SIMPLE_MESSAGE_PATTERNS = /^(hi|hello|hey|mingalar|မင်္ဂလာ|ဟယ်လို|ဟေး|ok|okay|thanks|ကျေးဇူး|bye|good\s*(morning|night|evening)|ဟုတ်ကဲ့|နေကောင်းလား|👋|😊|🙏|ရပါတယ်|ဟုတ်ပါပြီ|yes|no|ဟုတ်|မဟုတ်)\s*[!?.]*$/i;
const TOOL_TRIGGER_KEYWORDS = /money|expense|income|ငွေ|write|create|generate|ရေး|task|workspace|အလုပ်|remember|recall|မှတ်|deep|research|analyze|audit|compare|image|ပုံ|goal|heartbeat|notification|file|document|သုံးသပ်|အသေးစိတ်|ဈေးကွက်|တုံ့ပြန်|ရှာဖွေ|ရှာပေး|ထပ်ရှာ|စစ်ဆေး|ဈေးနှုန်း|FOMC|reaction|outlook|commentary|market|stock|crypto|bitcoin|sentiment|forecast/i;
const DEEP_AUTONOMOUS_KEYWORDS = /deep\s*(search|ရှာ|analysis|research|dive|report)|autonomous|background|take\s*your\s*time|ကြာလည်းကြာ|အစအဆုံး|audit|architecture|strategy|refactor|redesign|အကြီးအကျယ်|ultra/i;
const BURMESE_QUESTION_PARTICLES = /လဲ|လား|မလဲ|ပါ|နော်|ဘာ|ဘယ်|ဘယ်လို|ဘယ်နှစ်|ဘယ်လောက်|ဘာကြောင့်|ဘာလို့|ဘယ်မှာ|ဘယ်သူ|ဘယ်ခါ|ဘယ်တော့|ဘယ်တုန်း|ဘာတွေ|ရှိလဲ|ပေးပါ|ပြပါ|ရှင်းပြ|ပြောပြ|လုပ်ပေး|ကူညီ|ဖြေ|စစ်|ရှာ/;
const INFORMATIONAL_KEYWORDS = /သတင်း|ဈေး|news|price|update|report|analyze|compare|explain|how|what|why|when|where|who|which|tell|show|find|search|check|list|recommend|suggest|help|ကူညီ|ပြ|ရှာ|စစ်|ပြော|ရေး|create|generate|make|build/i;
const BURMESE_SUBSTANTIVE_MARKERS = /တယ်$|ခဲ့|နေ|မယ်$|ပြီ$|တာ$|ဖို့|အတွက်|ကို|က\s|ကြောင့်|နဲ့|မှာ|ထဲ|ပေါ်|အကြောင်း|သိ|နား|လို|ချင်|ရ|တွေ/;
const SEARCH_WEB_QUERY_PATTERN = /price|ဈေး|crypto|bitcoin|coin|market|news|သတင်း|latest|ဒီနေ့|today|weather|ရာသီဥတု|current|ရှာဖွေ|search|Google/i;
const DEEP_SEARCH_PATTERN = /deep\s*(search|ရှာ|analysis|research|dive|report)/i;
const NEWS_DEEP_PATTERN = /(news|သတင်း|ခွဲခြမ်း).*(deep|detailed|analyze|အသေးစိတ်)/i;
const ULTRA_DEEP_PATTERN = /deep\s*(deep|dive|research|analysis)|ultra\s*(deep|research|analysis)/i;
const MULTI_STEP_KEYWORD_PATTERN = /\b(audit|architecture|strategy|research|refactor|redesign)\b|analyze\s+\w*\s*system|optimize\s+\w*\s*pipeline/i;
const JUST_GREETING_PATTERN = /^(hi+|hey|hello|မင်္ဂလာ|ဟယ်လို)$/i;
const TOOL_DRIVEN_ACTIONS_SET = new Set(['search_web', 'manage_flowstate', 'manage_workspace_task', 'generate_ai_content', 'generate_image', 'manage_ai_content', 'search_knowledge_base']);

// ═══ SAYA GYI TUNING: Imported from Single Core ═══
import { SAYA_GYI_TUNING, DEFAULT_TUNING, resolveUserName, buildAdaptiveRequestBody, getAdaptiveStepBudget } from "../_shared/bee-brain.ts";



// ═══ Extracted modules ═══
import { handleTokenUsageQuery, handlePendingActionConfirmation } from "../_shared/fast-path-handlers.ts";
import { handleMicroPrompt } from "../_shared/micro-prompt.ts";
import { queryActiveMemory } from "../_shared/active-memory-query.ts";
import type { MemoryQueryResult } from "../_shared/active-memory-query.ts";
import { enrichPromptWithAllProtocols } from "../_shared/prompt-enrichment.ts";
import type { PrefetchedEnrichmentData } from "../_shared/prompt-enrichment.ts";
import { saveAndFinalize, saveMessageOnly, runBackgroundPipeline, releaseLeaseAndDrainQueue } from "../_shared/post-loop-handler.ts";
import type { PostLoopContext, PostLoopData } from "../_shared/post-loop-handler.ts";
import { runAgenticLoop } from "../_shared/agentic-loop.ts";
import type { AgenticLoopContext } from "../_shared/agentic-loop.ts";


// Boot diagnostic removed — Phase 3 cache is stable

// ═══ TASK PLAN BUILDER: Removed — dynamic plan now emitted from agentic-loop.ts ═══

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ═══ SMOKE TEST: GET /agent-chat?diag=cache to verify deployment ═══
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("diag") === "cache") {
    const { supportsExplicitCache } = await import("../_shared/explicit-cache.ts");
    const testModels = ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-pro"];
    const results = testModels.map(m => ({ model: m, supported: supportsExplicitCache(m) }));
    return new Response(JSON.stringify({
      status: "Phase 3 Explicit Cache ACTIVE",
      deployed_at: new Date().toISOString(),
      cache_support: results,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const t_absolute = Date.now();
    // T0 removed — always 0ms by definition

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Service-role client for admin-level operations (system API key fetching)
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ═══ GATEWAY AUTH BYPASS: Detect internal service-to-service calls ═══
    const isTelegramGateway = req.headers.get("x-telegram-gateway") === "true";
    let userId: string;
    let peekBody: any = null; // FIX #5: Hoisted for reuse at requestBody parse

    if (isTelegramGateway) {
      // Verify the Bearer token is the service role key (not a random token)
      const token = authHeader.replace("Bearer ", "");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      if (token !== serviceKey) {
        return new Response(JSON.stringify({ error: "Unauthorized gateway call" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Extract userId from the request body (telegram-webhook passes sessionId)
      // FIX #5: Store parsed body to reuse later (avoid double JSON parse)
      peekBody = await req.json();
      const gwSessionId = peekBody.sessionId;
      if (!gwSessionId) {
        return new Response(JSON.stringify({ error: "Missing sessionId for gateway call" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Look up user_id from the session record
      const { data: sessionRecord, error: sessionLookupErr } = await serviceClient
        .from("agent_chat_sessions")
        .select("user_id")
        .eq("id", gwSessionId)
        .single();
      if (sessionLookupErr || !sessionRecord) {
        return new Response(JSON.stringify({ error: "Session not found for gateway" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = sessionRecord.user_id;
      console.log(`[GatewayAuth] Telegram gateway bypass: userId=${userId}, session=${gwSessionId}`);
    } else {
      // LOCAL JWT validation - no network round-trip (saves 500-3000ms vs getUser())
      const token = authHeader.replace("Bearer ", "");
      try {
        const parts = token.split('.');
        if (parts.length !== 3) throw new Error("Invalid JWT format");
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(base64));
        if (!payload.sub) throw new Error("Missing sub claim");
        if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error("Token expired");
        userId = payload.sub;
      } catch (_e) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`[Perf] T0.1 Auth (local JWT): ${Date.now() - t_absolute}ms`);
    }

    // ═══ PILLAR 1: OWNER-BYPASS with Admin Cache ═══
    let isOwnerBypass = false;
    const cachedStatus = getCachedAdminStatus(userId);
    if (cachedStatus !== null) {
      isOwnerBypass = cachedStatus;
    } else {
      try {
        const { data: quickRoleCheck } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();
        isOwnerBypass = !!quickRoleCheck;
        setCachedAdminStatus(userId, isOwnerBypass);
      } catch (_e) { /* fail open to rate limit */ }
    }

    // Background/heartbeat uses separate rate-limit key
    const sourceChannel = req.headers.get("x-source-channel") || "";
    const rateLimitKey = sourceChannel === "heartbeat" ? `bg_${userId}` : userId;

    // Check rate limit - admins bypass entirely
    if (!isOwnerBypass && !checkRateLimit(rateLimitKey)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // FIX #5: Reuse peekBody for telegram gateway, otherwise parse fresh
    const requestBody = isTelegramGateway ? peekBody : await req.json();
    const { sessionId, message, attachments, deviceContext, preferred_model, api_source_preference, action, session_id: actionSessionId, source_channel, groupContext, continuation, trace_id, deep_run, client_request_id, thread_mode, session_kind: bodySessionKind } = requestBody;

    // ═══ RESUMABLE SSE: Last-Event-ID replay ═══
    // Client sends x-resume-mission-id + x-resume-last-event-id headers on retry.
    const resumeMissionId = req.headers.get("x-resume-mission-id") || (requestBody as any).resume_mission_id || null;
    const resumeLastEventId = parseInt(req.headers.get("x-resume-last-event-id") || (requestBody as any).resume_last_event_id || "0", 10) || 0;

    // ═══ MEMORY MODE: Isolated surface ONLY for memory curation ═══
    // Frontend (MemoryAgentChat) sends session_kind="memory". Backend will
    // also re-derive from session metadata after Wave-1 fetch and trust the
    // stricter signal. In memory mode we whitelist a single tool, skip every
    // heavy enrichment, and force a 1-step agentic loop.
    const isMemoryMode = bodySessionKind === "memory";
    if (isMemoryMode) {
      console.log(`[MemoryMode] 🧠 Active for session=${sessionId} — manage_memory only, skipping enrichment/orchestrator`);
    }

    // ═══ Device ↔ Server Time-Drift Detection (Timezone Sovereignty Phase-3) ═══
    // If user device clock differs from server by >5min, agent gets a warning
    // and scheduling tools use serverNow as the authoritative anchor — so a
    // device with a wrong clock can't cause a "in 5 min" task to never fire.
    if (deviceContext?.deviceNowIso) {
      try {
        const deviceNowMs = new Date(deviceContext.deviceNowIso).getTime();
        const serverNowMs = Date.now();
        if (Number.isFinite(deviceNowMs)) {
          const driftMs = serverNowMs - deviceNowMs;
          (deviceContext as any).driftMs = driftMs;
          (deviceContext as any).effectiveNowMs = serverNowMs;
          if (Math.abs(driftMs) > 5 * 60 * 1000) {
            console.warn(`[TimeDrift] user=${(requestBody as any).userId || 'unknown'} drift=${Math.round(driftMs / 1000)}s — agent will warn user`);
            (deviceContext as any).driftWarning = `Device clock differs from server by ${Math.round(driftMs / 60000)} min. Schedules use server time.`;
          }
        }
      } catch (e) {
        console.warn(`[TimeDrift] parse failed:`, (e as Error).message);
      }
    }
    // ═══ THREAD MODE: per-message sub-conversation. Forces lightweight pipeline. ═══
    const isThreadMode = thread_mode === true;
    if (isThreadMode) {
      console.log(`[ThreadMode] 🧵 Active for session=${sessionId} — forcing micro pipeline, skipping memory/orchestrator`);
    }
    // ═══ DISTRIBUTED TRACE ID: Propagated from frontend for end-to-end debugging ═══
    const traceId = trace_id || crypto.randomUUID();
    console.log(`[Trace] traceId=${traceId} sessionId=${sessionId} action=${action || 'chat'}`);

    // ═══ Idempotency gate: only enforce on actual chat sends, not control actions. ═══
    // Returns 409 so the client's existing fetch-error path treats it as benign.
    if (!action && client_request_id && isDuplicateRequest(client_request_id)) {
      console.log(`[Idempotency] Dropping duplicate request_id=${client_request_id} trace=${traceId}`);
      return new Response(JSON.stringify({ code: "DUPLICATE_REQUEST", message: "Duplicate request ignored" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // ═══ ACTION HANDLERS (non-chat operations) ═══
    
    // ═══ v16.5.0: WARMUP HANDLER — Pre-warm Deno isolate on user keystroke ═══
    if (action === "warmup") {
      return new Response(JSON.stringify({ status: "warm", ts: Date.now() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══ SERVER-SIDE CANCEL: Set cancel_requested flag on session ═══
    if (action === "cancel_stream") {
      const cancelSessionId = actionSessionId || sessionId;
      if (!cancelSessionId) {
        return new Response(JSON.stringify({ error: "Missing session_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`[ServerCancel] User ${userId} requested cancel for session ${cancelSessionId}`);
      try {
        // Set cancel flag in global_session_state
        const { data: currentSession } = await supabase
          .from("agent_chat_sessions")
          .select("global_session_state")
          .eq("id", cancelSessionId)
          .single();
        
        const currentState = (currentSession?.global_session_state as Record<string, any>) || {};
        await supabase
          .from("agent_chat_sessions")
          .update({
            global_session_state: {
              ...currentState,
              cancel_requested: true,
              cancel_requested_at: new Date().toISOString(),
              cancel_requested_by: userId,
            }
          })
          .eq("id", cancelSessionId);
        
        return new Response(JSON.stringify({ success: true, cancelled: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (cancelErr: any) {
        console.error("[ServerCancel] Failed:", cancelErr);
        return new Response(JSON.stringify({ error: "Cancel failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (action === "finalize_session_summary") {
      console.log(`[SessionFinalize] Received request for session: ${actionSessionId || sessionId}`);
      const targetSessionId = actionSessionId || sessionId;
      if (!targetSessionId) {
        return new Response(JSON.stringify({ error: "Missing session_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await finalizeSessionSummary(supabase, targetSessionId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate input - basic check first (message can be empty if attachments exist)
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Missing sessionId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Check if we have either a message or attachments
    const hasMessage = message && message.trim().length > 0;
    const hasAttachments = attachments && Array.isArray(attachments) && attachments.length > 0;
    
    if (!hasMessage && !hasAttachments) {
      return new Response(JSON.stringify({ error: "Missing message or attachments" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // NOTE: Early admin check moved to mega batch below for parallelization

    // Input sanitization - remove potential XSS
    const sanitizedMessage = hasMessage ? message.replace(/<[^>]*>/g, '').trim() : "";
    
    // ═══ VALIDATE ATTACHMENTS ═══
    interface RequestAttachment {
      type: 'image' | 'file';
      base64: string;
      mime_type: string;
      file_name?: string;
    }
    let validAttachments: RequestAttachment[] = [];
    if (hasAttachments) {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
      const maxAttachments = 4; // 3 images + 1 PDF
      const maxImageSize = 5 * 1024 * 1024; // 5MB for images
      const maxPdfSize = 10 * 1024 * 1024; // 10MB for PDFs
      
      for (const att of attachments.slice(0, maxAttachments)) {
        if (!att.type || !['image', 'file'].includes(att.type)) continue;
        if (!att.base64 || typeof att.base64 !== 'string') continue;
        if (!att.mime_type || !allowedMimes.includes(att.mime_type)) continue;
        
        const approxSize = Math.ceil((att.base64.length * 3) / 4);
        const maxSize = att.mime_type === 'application/pdf' ? maxPdfSize : maxImageSize;
        if (approxSize > maxSize) {
          console.log(`[Vision] Skipping oversized attachment: ${approxSize} bytes`);
          continue;
        }
        
        validAttachments.push({
          type: att.type === 'file' ? 'file' : 'image',
          base64: att.base64,
          mime_type: att.mime_type,
          file_name: att.file_name || (att.type === 'file' ? 'document' : 'image'),
        });
      }
      
      console.log(`[Vision] Valid attachments: ${validAttachments.length}/${attachments.length}`);
    }

    // Shared encoder for all ReadableStream blocks
    const encoder = new TextEncoder();

    // ═══ FAST-PATH: Token usage questions (bypass AI to prevent rate limit loops) ═══
    const tokenUsageResponse = await handleTokenUsageQuery(supabase, userId, sessionId, sanitizedMessage, encoder, corsHeaders);
    if (tokenUsageResponse) return tokenUsageResponse;

    // ═══ EARLY SIMPLE MESSAGE DETECTION (Intent-based, NOT length-based) ═══
    // Only TRUE greetings/acknowledgments skip deep processing. All substantive messages get full neural pipeline.
    let isSimpleMessage = SIMPLE_MESSAGE_PATTERNS.test(sanitizedMessage.trim());

    // ═══ BURMESE SAFETY GUARD: Force full pipeline for Burmese questions, instructions, approvals ═══
    // Burmese messages that look like instructions/questions MUST NOT enter micro-prompt
    const hasBurmeseChars = /[\u1000-\u109F]/.test(sanitizedMessage);
    const isBurmeseActionOrQuestion = hasBurmeseChars && (
      BURMESE_QUESTION_PARTICLES.test(sanitizedMessage) ||
      BURMESE_SUBSTANTIVE_MARKERS.test(sanitizedMessage) ||
      /ပြင်|လုပ်|ပေး|စစ်|ရှာ|ပြော|ရှင်း|ကူညီ|fix|ပြီ|သွား|ဖြစ်|ရေး|ဖတ်|ဖွင့်|ပိတ်|ထည့်|ဖျက်/.test(sanitizedMessage) ||
      sanitizedMessage.length > 15  // Any Burmese message longer than ~5 words is likely substantive
    );
    if (isSimpleMessage && isBurmeseActionOrQuestion) {
      isSimpleMessage = false;
      console.log(`[FastPath] 🚫 Burmese substantive message detected — forcing full pipeline: "${sanitizedMessage.slice(0, 50)}"`);
    }

    // ═══ QUICK MESSAGE DETECTION: Short factual questions that don't need deep context ═══
    // TIGHTENED: Burmese messages with action/question intent NEVER qualify as quick
    let isQuickMessage = !isSimpleMessage && hasMessage && sanitizedMessage.length < 80
      && !TOOL_TRIGGER_KEYWORDS.test(sanitizedMessage) && !hasAttachments
      && !isBurmeseActionOrQuestion;

    // ═══ GROUP BOT GUARD: Group bots ALWAYS need full pipeline (persona + tools + context) ═══
    const isGroupBotContext = groupContext?.gateway === 'group_bot';
    if (isGroupBotContext && isSimpleMessage) {
      isSimpleMessage = false;
    }
    if (isGroupBotContext && isQuickMessage) {
      isQuickMessage = false;
    }

    // ═══ TURBO MESSAGE DETECTION (Strict — only truly trivial messages) ═══
    // Turbo tier skips: observer LLM, explicit cache, embedding, living memories, prompt enrichment, guard protocols, lease, BrainState.
    // TIGHTENED: Only very short, non-question, non-informational messages qualify.
    // All regex constants hoisted to module level
    const isTurboMessage = !isSimpleMessage && !isQuickMessage && hasMessage
      && sanitizedMessage.length <= 80  // TIGHTENED: was 120, now 80 for stricter turbo
      && !DEEP_AUTONOMOUS_KEYWORDS.test(sanitizedMessage)
      && !BURMESE_QUESTION_PARTICLES.test(sanitizedMessage)
      && !BURMESE_SUBSTANTIVE_MARKERS.test(sanitizedMessage)
      && !INFORMATIONAL_KEYWORDS.test(sanitizedMessage)
      && !sanitizedMessage.includes("?")
      && !hasAttachments
      && !continuation
      && !isBurmeseActionOrQuestion  // ═══ NEW: Burmese action/question messages NEVER use turbo
      && !/[\u1000-\u109F]{4,}/.test(sanitizedMessage) // Block turbo for messages with 4+ Burmese chars (tightened from 8)
      && !isGroupBotContext; // Group bots NEVER use turbo — they need full persona + tools

    // ═══ THREAD MODE OVERRIDE: force lightweight tier regardless of length/Burmese ═══
    // Threads carry their own focused session_instructions; the heavy memory + orchestrator
    // pipeline is overkill and produces off-topic, costly responses (Plan B5).
    if (isThreadMode && hasMessage && !hasAttachments) {
      isSimpleMessage = false;
      isQuickMessage = true; // routes through micro-prompt fast path
      console.log(`[ThreadMode] ⚡ Routed to quick/micro tier (bypassing heavy pipeline)`);
    }
    
    if (isTurboMessage) {
      console.log(`[10xBoost] ⚡ TURBO tier detected (${sanitizedMessage.length} chars) — skipping heavy pipeline`);
    }

    // ═══ INJECTION CHECK (CPU-only, no DB needed) ═══
    const injectionCheck = detectPromptInjection(sanitizedMessage);
    if (injectionCheck.detected) {
      console.warn(`[SECURITY] Potential prompt injection detected from user ${userId}: ${injectionCheck.pattern}`);
      try {
        await supabase.from("security_events").insert({
          user_id: userId,
          event_type: "prompt_injection_attempt",
          event_data: { 
            message_snippet: sanitizedMessage.substring(0, 100),
            pattern_matched: injectionCheck.pattern,
          },
          severity: "medium",
        });
      } catch (e: any) {
        console.error("Failed to log security event:", e);
      }
    }

    // ═══ Autonomous auto-routing REMOVED ═══
    // Per user request (2026-04): no surprise mode-switching. All requests handled
    // inline by the normal agentic loop. For deep multi-step runs, the user
    // explicitly opts in via the Deep Run toggle (deep_run flag in request body)
    // or schedules them via the Automations dialog.
    const isSearchWebQuery = SEARCH_WEB_QUERY_PATTERN.test(sanitizedMessage);

    // ═══ EARLY STREAM RETURN ARCHITECTURE ═══
    // Stream starts IMMEDIATELY. User sees "thinking" within ~10ms.
    // ALL heavy processing (DB queries, AI calls, memory) runs INSIDE the stream.
    const stream = new ReadableStream({
      start(controller) {
        // ═══ FIRST TOKEN: Synchronous enqueue — reaches client IMMEDIATELY ═══
        // CRITICAL: start() must NOT be async. If it returns a Promise,
        // the Web Streams spec blocks ALL data delivery until it resolves.
        //
        // PROXY BUFFER FLUSH: Supabase/Deno reverse proxies buffer small chunks (~1-4KB).
        // We send a 2KB+ padding comment FIRST to force the proxy to flush immediately.
        // This is the same technique used by OpenAI, Anthropic, and Vercel for SSE.
        const FLUSH_PADDING = `: ${"█".repeat(2800)}\n\n`;  // ~8.4KB UTF-8 — exceeds ALL proxy buffer thresholds (Deno/Kong/Cloudflare)
        controller.enqueue(encoder.encode(FLUSH_PADDING));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking_status", step: "🧠 Analyzing your request..." })}\n\n`));
        // ═══ DISTRIBUTED TRACE: Emit traceId to frontend for end-to-end correlation ═══
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "trace_id", trace_id: traceId })}\n\n`));
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        // ═══ RESUMABLE SSE: Emit mission_id so client can use it for Last-Event-ID replay ═══
        // (missionId is declared inside runPipeline; we emit it after stream start is confirmed)

        // ═══ DETACHED ASYNC PIPELINE ═══
        // Heavy processing runs as a fire-and-forget promise.
        // Data is enqueued to the controller as it becomes available.
        const runPipeline = async () => {

        let lockAcquired = false;
        let isTelegramSourceOuter = false;
        const leaseRequestId = crypto.randomUUID();
        const missionId = resumeMissionId || crypto.randomUUID();
        console.log(`[Trace] traceId=${traceId} missionId=${missionId} sessionId=${sessionId}`);

        // Emit mission_id so client can track it for Last-Event-ID reconnect
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: "mission_id", mission_id: missionId })}\n\n`
        ));

        // ═══ RESUMABLE SSE: replay missed events on reconnect ═══
        if (resumeMissionId && resumeLastEventId > 0) {
          try {
            const { replayEventsSince, createResumableTracker } = await import("../_shared/streaming-engine.ts");
            const replayTracker = createResumableTracker(resumeMissionId, supabase);
            await replayEventsSince(replayTracker, resumeLastEventId, controller, encoder);
            console.log(`[ResumableSSE] Replayed events since ${resumeLastEventId} for mission ${resumeMissionId}`);
          } catch (e) {
            console.warn("[ResumableSSE] Replay failed:", e);
          }
        }
        let MAX_AGENT_STEPS = MAX_AGENT_STEPS_DEFAULT;
        const isBurmeseAck = /[\u1000-\u109F]/.test(sanitizedMessage);

        // ═══ SERVER-SIDE CANCEL FLAG ═══
        let cancelRequested = false;

        // Heartbeat every 3s for proxy resilience + lease renewal + cancel check
        const heartbeatInterval = setInterval(async () => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`));
            if (lockAcquired) {
              // Combine lease renewal + cancel check in single query
              const { data: sessionState } = await supabase.from("agent_chat_sessions")
                .update({ lease_expires_at: new Date(Date.now() + 60000).toISOString() })
                .eq("id", sessionId).eq("lease_holder_id", leaseRequestId)
                .select("global_session_state")
                .single();
              
              // Check cancel flag
              const gss = sessionState?.global_session_state as Record<string, any> | null;
              if (gss?.cancel_requested) {
                console.log(`[ServerCancel] Cancel detected in heartbeat for session ${sessionId}`);
                cancelRequested = true;
                // Clear the flag immediately
                const cleanState = { ...gss, cancel_requested: false, cancel_requested_at: null };
                await supabase.from("agent_chat_sessions")
                  .update({ global_session_state: cleanState })
                  .eq("id", sessionId);
              }
            }
          } catch { /* stream closed */ }
        }, 3000);

        // Helper: emit SSE error and close stream (replaces return new Response for in-stream errors)
        const emitErrorAndClose = (code: string, msg: string, extra?: Record<string, any>) => {
          clearInterval(heartbeatInterval);
          try {
            const eType = ["INSUFFICIENT_IU", "MODEL_ACCESS_DENIED"].includes(code) ? "credits_exhausted" : "error";
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: eType, code, message: msg, ...extra })}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch { /* closed */ }
        };

        // Helper: pipe another Response's SSE body through our stream
        const pipeResponseAndClose = async (response: Response) => {
          clearInterval(heartbeatInterval); // FIX #2: Prevent heartbeat leak on early return
          // (heartbeat already cleared above in FIX #2)
          if (response.body) {
            const reader = response.body.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
            } catch { /* ok */ }
          }
          try { controller.close(); } catch { /* closed */ }
        };

        let doneEmitted = false; // FIX #1: Hoisted flag to prevent triple [DONE]
        try {
        // ═══ CLEAN FIRST TOKEN: Only thinking_status, no random content in chat bubble ═══
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking_status", step: isBurmeseAck ? "🔍 Intent ခွဲခြမ်းစိတ်ဖြာနေတယ်..." : "🔍 Classifying intent..." })}\n\n`));

    // ═══ 2-WAVE SUPER-BATCH: Critical queries first, context queries deferred ═══
    const userRequestedModel = preferred_model || null;
    const estimatedTokens = Math.max(100, Math.ceil((sanitizedMessage.length + 500) / 3));
    const earlyIsGroupBot = groupContext?.gateway === 'group_bot';

    console.log(`[Perf] T0.2 Pre-super-batch: ${Date.now() - t_absolute}ms`);

    // Wave 2 (deferred): Fire NOW but don't await — these run in background
    const skipHeavyContext = isSimpleMessage || isQuickMessage || isTurboMessage;
    const skipPrivateMemoryContext = skipHeavyContext || earlyIsGroupBot;
    const isModerateMessage = !skipHeavyContext && !TOOL_TRIGGER_KEYWORDS.test(sanitizedMessage) && sanitizedMessage.length < 200;
    const guardianDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const nowISO = new Date().toISOString();

    const cachedPermissions = isModerateMessage ? getCached<any[]>(`perms_${userId}`) : null;
    const cachedStrictMode = isModerateMessage ? getCached<boolean>(`strict_${userId}`) : null;

    // ═══ 10x BOOST: Turbo uses ultra-minimal deferred wave — only learning context ═══
    const deferredPromise = isTurboMessage ? Promise.all([
      supabase.from("agent_learning_context").select("context_type, context_key, context_value, usage_count, last_used_at")
        .eq("user_id", userId).eq("is_active", true).order("last_used_at", { ascending: false }).limit(5),
      fetchSessionContext(supabase, userId, deviceContext),
      Promise.resolve(undefined as unknown as ExtendedContext),
      Promise.resolve({ totalSessions: 0, totalMessages: 0, mostUsedTools: [], accountAgeInDays: 0, firstInteractionDate: "" } as GlobalUserContext),
      Promise.resolve({ sessionSummaries: [], episodicMemories: [] } as RecentMemoriesContext),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve({ data: null }),
      Promise.resolve({ data: null }),
      Promise.resolve({ data: null }),
    ]) : Promise.all([
      supabase.from("agent_learning_context").select("context_type, context_key, context_value, usage_count, last_used_at")
        .eq("user_id", userId).eq("is_active", true).order("last_used_at", { ascending: false }).limit(15),
      fetchSessionContext(supabase, userId, deviceContext),
      skipPrivateMemoryContext ? Promise.resolve(undefined as unknown as ExtendedContext) : fetchExtendedContext(supabase, userId),
      skipPrivateMemoryContext ? Promise.resolve({ totalSessions: 0, totalMessages: 0, mostUsedTools: [], accountAgeInDays: 0, firstInteractionDate: "" } as GlobalUserContext) : fetchGlobalUserContext(supabase, userId),
      skipPrivateMemoryContext ? Promise.resolve({ sessionSummaries: [], episodicMemories: [] } as RecentMemoriesContext) : fetchRecentMemoriesForWarmup(supabase, userId, sessionId),
      skipPrivateMemoryContext ? Promise.resolve(null) : fetchCrossSessionRecentMessages(supabase, userId, sessionId),
      skipHeavyContext ? Promise.resolve(null) : getPendingAction(supabase, sessionId),
      skipHeavyContext ? Promise.resolve({ data: null }) : supabase.from("agent_self_improvements").select("improvement_type, insight").eq("is_active", true).order("created_at", { ascending: false }).limit(5),
      skipHeavyContext ? Promise.resolve({ data: null }) : supabase.from("agent_goals").select("title, deadline_at, status, progress").eq("user_id", userId).eq("status", "active").lt("deadline_at", guardianDeadline).gt("deadline_at", nowISO).limit(3),
      skipHeavyContext ? Promise.resolve({ data: null }) : supabase.from("agent_learning_context").select("context_key, context_value").eq("user_id", userId).eq("context_type", "sacred_preference").limit(10),
    ]);

    // ═══ 10x BOOST: Turbo Wave-1 is ultra-minimal — only 6 essential queries ═══
    const cachedAdminSettings = (skipHeavyContext || isTurboMessage) ? getCached<any>(`admin_settings`) : null;
    const cachedUserAISettings = (skipHeavyContext || isTurboMessage) ? getCached<any>(`user_ai_${userId}`) : null;
    const cachedAgentSettings = (skipHeavyContext || isTurboMessage) ? getCached<any>(`agent_settings_${userId}`) : null;

    // ═══ PERF: Defer IU deduction for turbo/quick/simple — deduct AFTER response is sent ═══
    const deferIU = isQuickMessage || isSimpleMessage || isTurboMessage;

    const [
      intelligenceCheckRaw,
      agentSettingsResult,
      roleDataResult,
      adminSettingsResult,
      systemKeyCheckResult,
      userAISettingsResult,
      userPermissions,
      userStrictMode,
      history,
      sessionRecordResult,
      extKeysResult,
    ] = await Promise.all([
      deferIU
        ? Promise.resolve({ data: { success: true, tier: 'deferred', tier_display: 'Deferred', priority_level: 0, model: 'gemini-3.5-flash', provider: 'google', iu_cost: 0, iu_remaining: 999 }, error: null })
        : supabase.rpc('check_and_deduct_intelligence', {
            p_user_id: userId,
            p_feature_key: 'beebot',
            p_model_requested: userRequestedModel,
            p_estimated_tokens: estimatedTokens
          }),
      cachedAgentSettings
        ? Promise.resolve({ data: cachedAgentSettings, error: null })
        : supabase.from("user_agent_settings").select("*").eq("user_id", userId).single(),
      cachedStatus !== null
        ? Promise.resolve({ data: cachedStatus ? [{ role: "admin" }] : [] })
        : supabase.from("user_roles").select("role").eq("user_id", userId),
      cachedAdminSettings
        ? Promise.resolve({ data: cachedAdminSettings, error: null })
        : supabase.from("ai_model_settings").select("allow_personal_api_key, allow_gateway_fallback_content, require_personal_key, enable_free_tier, enable_google_provider, enable_anthropic_provider, bypass_iu_for_personal_key").single(),
      serviceClient.from("ai_model_settings").select("google_system_api_key, anthropic_system_api_key").single(),
      cachedUserAISettings
        ? Promise.resolve({ data: cachedUserAISettings, error: null })
        : supabase.from("ai_user_settings").select("gemini_api_key, gemini_model, granted_by, is_paused, personal_anthropic_key, disabled_connectors").eq("user_id", userId).single(),
      (skipHeavyContext || cachedPermissions) ? Promise.resolve(cachedPermissions || []) : fetchUserPermissions(supabase, userId),
      (skipHeavyContext || cachedStrictMode !== null) ? Promise.resolve(cachedStrictMode ?? false) : fetchStrictMode(supabase, userId),
      // ═══ 10x BOOST: Turbo uses minimal history (last 10 messages) ═══
      SessionManager.getContext(supabase, sessionId, isSimpleMessage || isQuickMessage || isTurboMessage, earlyIsGroupBot),
      isTurboMessage
        ? Promise.resolve({ data: null, error: null })
        : supabase.from("agent_chat_sessions").select("session_instructions").eq("id", sessionId).single(),
      // ═══ PERF: OR/xAI auth fetch folded into Wave-1 (saves ~100-200ms sequential wait) ═══
      serviceClient
        .from("user_api_keys")
        .select("api_key_encrypted, provider")
        .eq("user_id", userId)
        .in("provider", ["openrouter", "xai"])
        .eq("is_active", true),
    ]);

    // ═══ PERF: Populate in-memory cache (full admin settings — bypass fetched fresh inline at L815) ═══
    if (adminSettingsResult.data) {
      setCache(`admin_settings`, adminSettingsResult.data);
    }
    if (userAISettingsResult.data) setCache(`user_ai_${userId}`, userAISettingsResult.data);
    if (agentSettingsResult.data) setCache(`agent_settings_${userId}`, agentSettingsResult.data);
    if (!skipHeavyContext && !cachedPermissions) setCache(`perms_${userId}`, userPermissions);
    if (!skipHeavyContext && cachedStrictMode === null) setCache(`strict_${userId}`, userStrictMode);

    console.log(`[Perf] T0.3 Wave-1 (critical) done: ${Date.now() - t_absolute}ms${isModerateMessage ? ' [moderate-optimized]' : ''}`);

    // Content preview removed — status updates go through thinking_status only

    // Await deferred results (likely already complete by now)
    const [
      allLearningContextResult,
      sessionContextResult,
      extendedContext,
      globalContext,
      recentMemories,
      crossSessionMessages,
      pendingActionRaw,
      prefetchedLessonsResult,
      prefetchedGoalsResult,
      prefetchedWhisperResult,
    ] = await deferredPromise;

    // ═══ PERF: Client-side split of learning context (1 query instead of 2, saves ~300ms) ═══
    const allLearningData = allLearningContextResult?.data || [];
    const learnedPreferencesData = allLearningData.filter((c: any) => c.context_type === "learned_preference").slice(0, 5);
    const generalContextData = allLearningData.filter((c: any) => c.context_type !== "learned_preference")
      .sort((a: any, b: any) => (b.usage_count || 0) - (a.usage_count || 0)).slice(0, 8);

    // ═══ Phase A Fix: Atomic increment sessions_since_dream — ONLY on first interaction ═══
    // Gated: was firing on EVERY message, now only first message per session (saves 1 RPC/request)
    const _isFirstInteractionEarly = !history || history.length === 0;
    if (_isFirstInteractionEarly) {
    serviceClient.rpc("increment_sessions_since_dream", { p_user_id: userId })
        .then(({ error }: any) => {
          if (error) console.warn(`[Dream] sessions_since_dream increment failed:`, error);
        });
    }

    console.log(`[Perf] T0.4 Wave-2 (deferred) done: ${Date.now() - t_absolute}ms`);
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking_status", step: isBurmeseAck ? "📋 Context နဲ့ Memory တွေ ပြင်ဆင်နေတယ်..." : "📋 Loading context and memories..." })}\n\n`));

    // ═══ POST-BATCH PROCESSING: Handle results in priority order ═══
    
    // --- 1. Admin check for message length validation ---
    const isAdminEarly = roleDataResult.data?.some((r: any) => r.role === "admin") || false;
    if (!isAdminEarly && hasMessage && message.length > 100000) {
      emitErrorAndClose("MESSAGE_TOO_LONG", "Message too long. Maximum 100,000 characters.");
      return;
    }
    if (isAdminEarly && hasMessage && message.length > 800000) {
      console.log(`[Admin] Large message received: ${message.length} chars from admin ${userId}`);
    }

    // --- 2. Pending action confirmation handling ---
    const pendingAction = pendingActionRaw;
    const pendingResponse = await handlePendingActionConfirmation(
      supabase, userId, sessionId, sanitizedMessage, pendingAction,
      agentSettingsResult.data, encoder, corsHeaders, isAdminEarly, authHeader,
      deviceContext, source_channel, groupContext,
    );
    if (pendingResponse) {
      await pipeResponseAndClose(pendingResponse);
      return;
    }
    
    // If there's a pending action but user sends something unrelated, clear it
    const userIsConfirming = isConfirmationMessage(sanitizedMessage);
    if (pendingAction && !userIsConfirming) {
      const seemsRelated = /\d+|thb|mmk|usd|ကျပ်|သုံး|ငွေ|post|send|broadcast|ပို့|channel|telegram|schedule|remind|task|ကြေငြာ|သတိပေး|admin|grant|token|quota|iu|credit|bonus/i.test(sanitizedMessage);
      if (!seemsRelated) {
        console.log(`[PendingAction] User changed topic, clearing pending action`);
        await clearPendingAction(supabase, sessionId);
      }
    }

    // --- 3. Intelligence Units check ---
    // Early compute: determine if user is on personal key (full governance happens later at L905)
    const earlyAdminSettings = adminSettingsResult.data;
    const earlyUserAISettings = userAISettingsResult.data;
    const earlyExternalKeys = extKeysResult?.data || [];
    const earlyHasExternalModelKey = earlyExternalKeys.some((k: any) => ["openrouter", "xai"].includes(k.provider));
    const earlyHasPersonalKey = !!(earlyUserAISettings?.gemini_api_key || earlyUserAISettings?.personal_anthropic_key || earlyHasExternalModelKey);
    const earlyAllowPersonalKey = earlyAdminSettings?.allow_personal_api_key === true;
    const earlyPreferPersonal = api_source_preference !== 'system';
    const earlyUsePersonalKey = earlyPreferPersonal && earlyHasPersonalKey && earlyAllowPersonalKey;
    const bypassIUForPersonalKey = earlyAdminSettings?.bypass_iu_for_personal_key === true;
    const skipIUForPersonalKey = earlyUsePersonalKey && bypassIUForPersonalKey;
    
    let intelligenceCheck: any = null;

    if (skipIUForPersonalKey) {
      console.log(`[Apex] IU check SKIPPED — personal key user with bypass enabled`);
      intelligenceCheck = {
        success: true,
        tier: 'personal',
        tier_display: 'Personal Key',
        priority_level: 2,
        model: 'gemini-3.5-flash',
        provider: 'google',
        iu_cost: 0,
        iu_remaining: 999,
      };
    } else {
      const { data: iuData, error: iuError } = intelligenceCheckRaw;

      if (iuError) {
        console.error("Intelligence check error:", iuError);
        emitErrorAndClose("USAGE_CHECK_FAILED", "Failed to check usage limits");
        return;
      }

      if (!iuData?.success) {
        const errorCode = iuData?.error_code || "INSUFFICIENT_INTELLIGENCE";
        const isModelDenied = errorCode === "MODEL_ACCESS_DENIED";
        
        const errorMessage = isModelDenied 
          ? "ဤ AI Model ကို သင့် Tier တွင် အသုံးပြုခွင့် မရှိပါ။"
          : "⚠️ AI rate limit ပြည့်သွားပါပြီ။ ခဏစောင့်ပါ။ AI rate limit exceeded.";
        
        console.log(`[Apex] IU check failed for user ${userId}:`, iuData);
        
        const resetsAt = iuData?.resets_at || (() => {
          const tomorrow = new Date();
          tomorrow.setHours(24, 0, 0, 0);
          return tomorrow.toISOString();
        })();
        
        const cooldownSeconds = Math.max(10, Math.ceil((new Date(resetsAt).getTime() - Date.now()) / 1000));
        emitErrorAndClose(errorCode, errorMessage, {
          daily_iu_limit: iuData?.daily_iu_limit || 10,
          daily_iu_remaining: iuData?.iu_remaining || 0,
          iu_bonus: iuData?.iu_bonus || 0,
          iu_balance: iuData?.iu_balance || 0,
          tier_key: iuData?.tier || 'explorer',
          tier_display: iuData?.tier_display || 'Explorer',
          model_granted: iuData?.model || null,
          provider: iuData?.provider || 'google',
          resets_at: resetsAt,
          cooldown_seconds: Math.min(cooldownSeconds, 3600),
        });
        return;
      }

      intelligenceCheck = iuData;
    }

    // --- 4. Extract Apex Intelligence Data ---
    const apexData = {
      tierKey: intelligenceCheck.tier || 'explorer',
      tierDisplay: intelligenceCheck.tier_display || 'Explorer',
      priorityLevel: intelligenceCheck.priority_level || 0,
      modelGranted: intelligenceCheck.model || 'gemini-3.5-flash',
      provider: intelligenceCheck.provider || 'google',
      iuCost: intelligenceCheck.iu_cost || 0,
      dailyIURemaining: intelligenceCheck.iu_remaining || 0,
    };
    
    console.log(`[Apex] User ${userId}: tier=${apexData.tierKey}, model=${apexData.modelGranted}, provider=${apexData.provider}, iu_cost=${apexData.iuCost}, remaining=${apexData.dailyIURemaining}`);

    // --- 5. Agent settings fallback ---
    let agentSettings: AgentSettings | null = agentSettingsResult.data as AgentSettings | null;
    if (!agentSettings) {
      const { data: newSettings } = await supabase
        .from("user_agent_settings")
        .insert({
          user_id: userId,
          bot_name: "BeeBot",
          bot_emoji: "🐝",
          personality_mode: "friendly",
          welcome_shown: false,
        })
        .select()
        .single();
      if (newSettings) {
        agentSettings = newSettings as AgentSettings;
      }
    }

    // --- 6. Destructure remaining results ---
    const roleData = roleDataResult.data;
    const isAdmin = roleData?.some((r: any) => r.role === "admin") || false;

    // ═══ THE GREAT FIREWALL: Group Bot Tool Whitelist ═══
    // v16.6.0: Session metadata check merged into super-batch (sessionContextResult already fetched)
    let isGroupBotGateway = groupContext?.gateway === 'group_bot';
    if (!isGroupBotGateway && sessionId && sessionContextResult) {
      // Use already-fetched session context instead of a separate DB query
      const sessionTitle = (sessionContextResult as any)?.sessionTitle;
      const sessionMeta = (sessionContextResult as any)?.sessionMetadata;
      if (sessionTitle?.startsWith('[TG-Group]') || sessionMeta?.gateway === 'group') {
        isGroupBotGateway = true;
      }
    }
    const GROUP_BOT_ALLOWED_TOOLS = [
      'search_knowledge_base',
      'get_app_navigation',
      // Read-only recall only. Telegram child agents are public-surface
      // assistants and must not mutate BeeBot's Memory Vault.
      'recall_user_facts',
      'recall_episodic_memory',
      'recall_session_history',
    ];
    if (groupContext?.group_bot_allow_web_search === true) {
      GROUP_BOT_ALLOWED_TOOLS.push('search_web');
    }
    
    let TOOLS: any[];
    if (isMemoryMode) {
      // Memory Curator surface: ONLY manage_memory. Hard whitelist — no
      // finance, content, scheduling, web search, or workspace tools can leak in.
      const allAvailableTools = [...BASE_TOOLS, ...AGENTIC_CORE_TOOLS];
      TOOLS = allAvailableTools.filter((t: any) => t.function?.name === 'manage_memory');
    } else if (isGroupBotGateway) {
      // Group Bot: ONLY whitelisted tools — strict isolation
      const allAvailableTools = [...BASE_TOOLS, ...AGENTIC_CORE_TOOLS];
      TOOLS = allAvailableTools.filter((t: any) => GROUP_BOT_ALLOWED_TOOLS.includes(t.function?.name));
    } else if (isAdmin) {
      TOOLS = [...BASE_TOOLS, ...AGENT_NETWORK_TOOLS, ...ADVANCED_AGENT_TOOLS, ...AGENTIC_CORE_TOOLS, ...SUPER_ADMIN_TOOLS, ...SUPER_AGENT_TOOLS, SKILL_DETAIL_TOOL];
    } else {
      TOOLS = [...BASE_TOOLS, ...AGENT_NETWORK_TOOLS, ...ADVANCED_AGENT_TOOLS, ...AGENTIC_CORE_TOOLS, SKILL_DETAIL_TOOL];
    }

    // ═══ 10x BOOST: Suppress generate_image unless user explicitly requests it ═══
    if (!IMAGE_REQUEST_PATTERN.test(sanitizedMessage)) {
      TOOLS = TOOLS.filter((t: any) => t.function?.name !== 'generate_image');
    }

    // Merge learned preferences (priority) + general context, preferences win on key conflicts
    const prefKeys = new Set(learnedPreferencesData.map((c: any) => c.context_key));
    const dedupedGeneral = generalContextData.filter((c: any) => !prefKeys.has(c.context_key));
    const learningContext = [...learnedPreferencesData, ...dedupedGeneral];
    const sessionContext = sessionContextResult;
    const adminSettings = adminSettingsResult.data;
    const systemKeyCheck = systemKeyCheckResult.data;
    const hasSystemGoogleKey = !!systemKeyCheck?.google_system_api_key;
    const hasSystemAnthropicKey = !!systemKeyCheck?.anthropic_system_api_key;
    const userAISettings = userAISettingsResult.data;

    const hasPersonalGeminiKey = !!userAISettings?.gemini_api_key;
    const hasPersonalAnthropicKey = !!userAISettings?.personal_anthropic_key;

    // ═══ OPENROUTER/XAI AUTH (from Wave-1 parallel fetch — zero sequential wait) ═══
    let personalOpenrouterKey: string | null = null;
    let personalXaiKey: string | null = null;
    const disabled = (userAISettings?.disabled_connectors as string[]) ?? [];
    if (!disabled.includes('openrouter') || !disabled.includes('xai')) {
      const extKeys = extKeysResult?.data;
      personalOpenrouterKey = extKeys?.find((k: any) => k.provider === 'openrouter')?.api_key_encrypted || null;
      personalXaiKey = extKeys?.find((k: any) => k.provider === 'xai')?.api_key_encrypted || null;
    }
    const hasOpenrouterKey = !!personalOpenrouterKey && !disabled.includes('openrouter');
    const hasXaiKey = !!personalXaiKey && !disabled.includes('xai');
    const hasPersonalKey = hasPersonalGeminiKey || hasPersonalAnthropicKey || hasOpenrouterKey || hasXaiKey;
    const allowPersonalKey = adminSettings?.allow_personal_api_key === true;
    const requirePersonalKey = adminSettings?.require_personal_key === true;
    
    const enableGoogleProvider = adminSettings?.enable_google_provider !== false;
    const enableAnthropicProvider = adminSettings?.enable_anthropic_provider === true;
    const hasSystemGrant = !!userAISettings?.granted_by && !userAISettings?.is_paused;
    const hasSystemApiKey = hasSystemGoogleKey || hasSystemAnthropicKey;
    
    const enableFreeTier = adminSettings?.enable_free_tier !== false;

    // ═══ HYBRID KEY GOVERNANCE ═══
    const preferPersonal = api_source_preference !== 'system';
    const usePersonalKey = preferPersonal && hasPersonalKey && allowPersonalKey;
    
    const useSystemGrant = !usePersonalKey && hasSystemGrant && hasSystemApiKey;
    const useAutoFreeTier = !usePersonalKey && !useSystemGrant && 
                            hasSystemApiKey && enableFreeTier;
    const useSystemKey = useSystemGrant || useAutoFreeTier;
    
    // ═══ MODEL RESOLUTION: client request → ai_user_settings (now synced by RPC) → default ═══
    const selectedModel = (preferred_model || userAISettings?.gemini_model || "gemini-3.5-flash").replace(/^google\//, '');

    console.log(`🔑 KeyGov: personal=${usePersonalKey} system=${useSystemKey} model=${selectedModel} paused=${!!userAISettings?.is_paused}`);

    if (requirePersonalKey && !hasPersonalKey) {
      emitErrorAndClose("PERSONAL_KEY_REQUIRED", "Personal API Key required. Please add your API key in Connectors settings.");
      return;
    }

    if (!usePersonalKey && !useSystemKey) {
      if (enableFreeTier && !hasSystemApiKey) {
        emitErrorAndClose("SYSTEM_KEY_NOT_CONFIGURED", "System API key not configured. Please contact admin to enable AI features.");
        return;
      }
      
      if (userAISettings?.granted_by && userAISettings?.is_paused) {
        emitErrorAndClose("ACCESS_PAUSED", "Your free AI access has been paused. Please contact admin or add your personal API key.");
        return;
      }
      
      emitErrorAndClose("NO_ACCESS", "AI access required. Please add your API key in Connectors settings.");
      return;
    }

    const apiSourceLabel = usePersonalKey 
      ? (selectedModel.startsWith('claude') ? "Personal Anthropic Key" 
         : selectedModel.includes('/') && !selectedModel.startsWith('google/') ? "Personal OpenRouter Key"
         : selectedModel.startsWith('grok') ? "Personal xAI Key"
         : "Personal Gemini API Key")
      : "System Provided (Free)";

    console.log(`🔑 Agent API Source: ${apiSourceLabel}`);
    console.log(`🤖 Model: ${usePersonalKey ? selectedModel : "gemini-3.5-flash"}`);

    // ═══ PERFORMANCE TIMESTAMP: Request processing start ═══
    const t_start = Date.now();

    // ═══ CHECK IF FIRST INTERACTION (for welcome message) ═══
    const isFirstInteraction = !history || history.length === 0;
    const shouldShowWelcome = isFirstInteraction && agentSettings && !agentSettings.welcome_shown;

    // Augment session context with API source info
    const displayModel = selectedModel;
    
    const enrichedSessionContext: SessionContext = {
      ...sessionContext,
      apiSource: apiSourceLabel,
      sourceChannel: source_channel || 'web',
      modelUsed: displayModel,
      usingPersonalKey: usePersonalKey,
    };

    // ═══ GROUP BOT: Extract sender identity from [From: @username] prefix ═══
    let effectiveMessage = sanitizedMessage;
    if (isGroupBotGateway) {
      const senderMatch = sanitizedMessage.match(/\[From:\s*(@?\S+)\]\s*/);
      if (senderMatch) {
        enrichedSessionContext.userName = senderMatch[1];
        effectiveMessage = sanitizedMessage.replace(senderMatch[0], '').trim() || sanitizedMessage;
      } else {
        enrichedSessionContext.userName = 'Group Member';
      }
    }

    // Merge cross-session messages (depends on recentMemories)
    if (crossSessionMessages) {
      recentMemories.crossSessionMessages = crossSessionMessages;
    }
    
    // ═══ MONITORING MODE CHECK — SKIP for simple/quick/memory messages (saves ~100-200ms) ═══
    if (!isSimpleMessage && !isQuickMessage && !isMemoryMode) {
      const monitoringResponse = await handleMonitoringMode(supabase, sessionId, userId, sanitizedMessage, isSimpleMessage);
      if (monitoringResponse) { await pipeResponseAndClose(monitoringResponse); return; }
    }

    // ═══ v16.5.0: HYPER-PARALLEL CONTEXT LOADING (3-Wave Architecture) ═══
    const personalGeminiKey = hasPersonalGeminiKey ? (userAISettings?.gemini_api_key || null) : null;
    const isContinuation = !!continuation?.context_snapshot;

    // (OpenRouter/xAI keys already fetched above in governance section)

    let proactiveContext: any = null;
    let observerResult: any = null;
    let livingMemories: any[] = [];
    let messageEmbedding: number[] | null = null;
    let activeMemoryResult: MemoryQueryResult | null = null;

    if (!isSimpleMessage && !isQuickMessage && !isTurboMessage && !isContinuation && !isMemoryMode) {
      const recentHistoryForObserver = (history || []).slice(-3).map((m: any) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      }));

      const preScreenResult = preScreenClassify(sanitizedMessage);
      if (preScreenResult) {
        // preScreen match — skip LLM observer
      }

      // ═══ FIX B: Observer Non-Blocking — use preScreen/fallback immediately, fire LLM observer async ═══
      const immediateObserverResult = preScreenResult || fallbackObserverClassify(sanitizedMessage);

      // Fire LLM observer in background (non-blocking) — result used only if available within 50ms grace
      let asyncObserverResult: any = null;
      if (!preScreenResult) {
        // ═══ v18.0: Resolve internal LLM config for Observer (supports OR/xAI users) ═══
        const observerLLMConfig = resolveInternalLLM({
          systemGoogleKey: systemKeyCheck?.google_system_api_key || null,
          personalGeminiKey: personalGeminiKey || null,
          personalOpenrouterKey: personalOpenrouterKey || null,
          mainModel: preferred_model || null,
          taskType: 'observer',
        });
        const observerPromise = observerAnalyze(sanitizedMessage, recentHistoryForObserver, isAdmin, personalGeminiKey || undefined, observerLLMConfig)
          .then(r => { asyncObserverResult = r; })
          .catch(e => console.warn("[Observer] Async LLM observer failed (non-critical):", e));
        // 50ms grace window — if LLM observer returns fast, use it
        await Promise.race([observerPromise, new Promise(r => setTimeout(r, 50))]);
      }

      // ═══ EARLY COMPLEXITY from observer (for embedding/memory gating) ═══
      const earlyComplexity = asyncObserverResult?.complexity || immediateObserverResult?.complexity || 'moderate';
      const complexityTier = earlyComplexity;

      // ═══ PIPELINED: Embedding + non-embedding queries run simultaneously ═══
      const needsEmbedding = (complexityTier === 'moderate' || complexityTier === 'complex');
      const embeddingPromise = needsEmbedding
        ? generateEmbeddingWithKey(sanitizedMessage, personalGeminiKey)
        : Promise.resolve(null);

      // Start non-embedding queries immediately (don't wait for embedding)
      // FIX (10x): agent_user_facts is empty (0 rows) → use user_memories (pinned/high-confidence) as live source.
	      const microFactsPromise = (() => {
	        let q = supabase
	          .from("user_memories")
	          .select("category, content")
	          .eq("user_id", userId)
	          .eq("is_active", true)
	          .order("pinned", { ascending: false })
	          .order("confidence", { ascending: false })
	          .limit(3);
	        if (isGroupBotGateway && groupContext?.group_id) {
	          q = q.eq("scope", "telegram_group").eq("scope_key", String(groupContext.group_id));
	        } else {
	          q = q.eq("scope", "personal").is("scope_key", null);
	        }
	        return q.then((res: any) => ({
	          data: (res.data || []).map((m: any) => ({ fact_key: m.category, fact_value: m.content })),
	        }));
	      })();
	      const livingMemoriesPromise = isGroupBotGateway ? Promise.resolve([]) : fetchLivingMemories(supabase, userId, undefined);

      // Await embedding first (needed by proactiveMemoryRecall)
      messageEmbedding = await embeddingPromise;

      // Now run proactive recall (needs embedding) + await the already-started queries
      const [microFactsResult, proactiveContextResult, livingMemoriesResult] = await Promise.all([
        microFactsPromise,
	        isGroupBotGateway
	          ? Promise.resolve({ additionalMemories: [], knowledgeResults: [], quickFacts: [] })
	          : proactiveMemoryRecall(supabase, userId, sanitizedMessage, recentMemories, messageEmbedding, complexityTier),
        livingMemoriesPromise,
      ]);
      // Use async observer if it resolved in time, otherwise use immediate fallback
      observerResult = asyncObserverResult || immediateObserverResult;
      proactiveContext = proactiveContextResult;
      livingMemories = livingMemoriesResult;

      // microFacts loaded (condition removed — data available via microFactsResult)

      console.log(`⏱️ [Perf] T3 Single-wave parallel done: ${Date.now() - t_start}ms`);

      // ═══ INITIATIVE 2: ACTIVE MEMORY QUERY (Gated) ═══
      // Skip for turbo/greeting/simple tiers — no need to hit 3 DB sources
      activeMemoryResult = null;
	      if (isGroupBotGateway || complexityTier === 'turbo' || complexityTier === 'greeting' || complexityTier === 'simple') {
	        console.log(`[ActiveMemory] SKIPPED (${complexityTier} tier — no DB calls needed)`);
      } else {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking_status", step: isBurmeseAck ? "🧠 သိပြီးသားအရာတွေ စစ်ဆေးနေတယ်..." : "🧠 Checking what I already know..." })}\n\n`));
        try {
          activeMemoryResult = await queryActiveMemory(supabase, userId, sanitizedMessage, messageEmbedding);
          console.log(`[ActiveMemory] Strategy: ${activeMemoryResult.suggested_strategy}, confidence: ${activeMemoryResult.confidence.toFixed(2)}`);
        } catch (memErr: any) {
          console.warn(`[ActiveMemory] Query failed (non-critical):`, memErr.message);
        }
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking_status", step: isBurmeseAck ? "⚡ Context ရပြီ၊ တုံ့ပြန်မှု ပြင်ဆင်နေတယ်..." : "⚡ Context ready, preparing response..." })}\n\n`));
    } else {
      // T3 Context skipped for simple/quick/turbo paths
      // ═══ MICRO-PROMPT KEY RESOLUTION (computed once, reused by simple/quick/turbo paths) ═══
      const _isORModel = selectedModel.includes('/') && !selectedModel.startsWith('google/');
      const _hasORKey = _isORModel && hasOpenrouterKey && !!personalOpenrouterKey;
      const _microApiKey = usePersonalKey
        ? (_hasORKey ? personalOpenrouterKey : userAISettingsResult.data?.gemini_api_key || '')
        : (systemKeyCheckResult.data?.google_system_api_key || '');
      const _microEndpoint = _hasORKey ? OPENROUTER_ENDPOINT : GEMINI_OPENAI_ENDPOINT;
      // If OpenRouter model selected but no OpenRouter key, degrade to Gemini model for micro-prompt
      const _microModel = usePersonalKey
        ? (_hasORKey ? selectedModel : 'gemini-2.5-flash-lite')
        : 'gemini-2.5-flash-lite';
      if ((isSimpleMessage || isQuickMessage) && !isContinuation && !isGroupBotGateway) {
        try {
          // Simple/quick messages get living memories for personality continuity
          const [quickFactsResult, simpleLivingMemories] = await Promise.all([
            // FIX (10x): switched from empty agent_user_facts → user_memories.
            supabase
              .from("user_memories")
              .select("category, content")
              .eq("user_id", userId)
              .eq("is_active", true)
              .eq("scope", "personal")
              .is("scope_key", null)
              .order("pinned", { ascending: false })
              .order("confidence", { ascending: false })
              .limit(5)
              .then((res: any) => ({
                data: (res.data || []).map((m: any) => ({ fact_key: m.category, fact_value: m.content })),
              })),
            fetchLivingMemories(supabase, userId, undefined),
          ]);
          if (quickFactsResult.data?.length) {
            proactiveContext = {
              additionalMemories: [],
              knowledgeResults: [],
              quickFacts: quickFactsResult.data,
            };
            // quickFacts loaded
          }
          if (simpleLivingMemories.length > 0) {
            livingMemories = simpleLivingMemories;
            // living memories loaded
          }

          // ═══ INITIATIVE 3: MICRO-PROMPT FAST PATH for Simple & Quick Messages ═══
          // PRE-CHECK: If preScreen detects tool intent (search_web, price, etc.), skip micro-prompt entirely
          const sqPreScreen = preScreenClassify(sanitizedMessage);
          const sqNeedsTool = sqPreScreen && (sqPreScreen.needs_tools === true || sqPreScreen.primary_action === 'search_web');
          if (sqNeedsTool) {
            console.log(`[MicroPrompt] 🚫 SKIPPED — preScreen detected tool intent: ${sqPreScreen.primary_action}`);
            observerResult = sqPreScreen;
            isQuickMessage = false;
            isSimpleMessage = false;
          } else {
          // ═══ DEFENSE-IN-DEPTH: Hard Burmese substance guard ═══
          const _hasBurmeseSubstance = /[\u1000-\u109F]{2,}/.test(sanitizedMessage) && sanitizedMessage.length > 10;
          if (_hasBurmeseSubstance) {
            console.log(`[MicroPrompt] 🚫 Burmese substance guard — skipping micro-prompt for simple/quick: "${sanitizedMessage.slice(0, 50)}"`);
            isQuickMessage = false;
            isSimpleMessage = false;
          } else {
          // Simple/quick messages are ideal micro-prompt candidates — greetings, acknowledgments, short factual Qs
          console.log(`[MicroPrompt] 🎯 SIMPLE/QUICK PATH ENTERED — type=${isSimpleMessage ? 'simple' : 'quick'}, msg="${sanitizedMessage.slice(0,50)}", len=${sanitizedMessage.length}`);
          const sqUserName = (sessionContextResult as any)?.userName || "User";
          const sqHistory = (history || []).slice(-4).map((m: any) => ({
            role: m.role as string,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          }));
          const sqHandled = await handleMicroPrompt({
            supabase, userId, sessionId, sanitizedMessage,
            agentSettings, userName: sqUserName,
            quickFacts: quickFactsResult.data || [],
            last4History: sqHistory,
            apiKey: _microApiKey,
            apiEndpoint: _microEndpoint,
            model: _microModel,
            encoder, controller,
            isBurmese: /[\u1000-\u109F]/.test(sanitizedMessage),
            source_channel,
            apiSource: usePersonalKey ? 'personal_key' : 'system_key',
            clientRequestId: client_request_id || null,
            traceId,
            systemGoogleKey: systemKeyCheckResult.data?.google_system_api_key || null,
          });

          if (sqHandled) {
            if (deferIU && !skipIUForPersonalKey) {
              Promise.resolve(supabase.rpc('check_and_deduct_intelligence', {
                p_user_id: userId, p_feature_key: 'beebot',
                p_model_requested: _microModel, p_estimated_tokens: 100
              })).catch(() => {});
            }
            clearInterval(heartbeatInterval);
            try { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); } catch {}
            return;
          }
          console.log(`[MicroPrompt] Simple/Quick fell through — continuing with full pipeline`);
          } // end else (Burmese substance check)
          } // end else (no tool intent)
        } catch (e) { /* non-critical */ }
      }
      // 10x Boost: Turbo messages get quick facts + regex observer only (no LLM observer, no embedding, no living memories)
      if (isTurboMessage && !isContinuation && !isGroupBotGateway) {
        try {
          // FIX (10x): switched from empty agent_user_facts → user_memories.
          const { data: turboFactsRaw } = await supabase
            .from("user_memories")
            .select("category, content")
            .eq("user_id", userId)
            .eq("is_active", true)
            .eq("scope", "personal")
            .is("scope_key", null)
            .order("pinned", { ascending: false })
            .order("confidence", { ascending: false })
            .limit(3);
          const turboFacts = (turboFactsRaw || []).map((m: any) => ({ fact_key: m.category, fact_value: m.content }));
          if (turboFacts?.length) {
            proactiveContext = { additionalMemories: [], knowledgeResults: [], quickFacts: turboFacts };
            // turbo quickFacts loaded
          }

          // ═══ DEFENSE-IN-DEPTH: Hard Burmese substance guard for turbo ═══
          const _turboBurmeseSubstance = /[\u1000-\u109F]{2,}/.test(sanitizedMessage) && sanitizedMessage.length > 10;
          if (_turboBurmeseSubstance) {
            console.log(`[MicroPrompt] 🚫 Burmese substance guard — skipping turbo micro-prompt: "${sanitizedMessage.slice(0, 50)}"`);
          } else {
          // ═══ INITIATIVE 3: MICRO-PROMPT FAST PATH ═══
          // For turbo messages, bypass the entire agentic loop with a sub-500 token prompt
          console.log(`[MicroPrompt] 🎯 TURBO PATH ENTERED — msg="${sanitizedMessage.slice(0,50)}", len=${sanitizedMessage.length}`);
          const microUserName = (sessionContextResult as any)?.userName || "User";
          const microHistory = (history || []).slice(-4).map((m: any) => ({
            role: m.role as string,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          }));
          const microHandled = await handleMicroPrompt({
            supabase, userId, sessionId, sanitizedMessage,
            agentSettings, userName: microUserName,
            quickFacts: turboFacts || [],
            last4History: microHistory,
            apiKey: _microApiKey,
            apiEndpoint: _microEndpoint,
            model: _microModel,
            encoder, controller,
            isBurmese: /[\u1000-\u109F]/.test(sanitizedMessage),
            source_channel,
            apiSource: usePersonalKey ? 'personal_key' : 'system_key',
            systemGoogleKey: systemKeyCheckResult.data?.google_system_api_key || null,
          });

          if (microHandled) {
            if (deferIU && !skipIUForPersonalKey) {
              Promise.resolve(supabase.rpc('check_and_deduct_intelligence', {
                p_user_id: userId, p_feature_key: 'beebot',
                p_model_requested: _microModel, p_estimated_tokens: 100
              })).catch(() => {});
            }
            clearInterval(heartbeatInterval);
            try { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); } catch {}
            return;
          }
          console.log(`[MicroPrompt] Fell through — continuing with full pipeline`);
          } // end else (turbo Burmese substance check)
        } catch { /* non-critical */ }
        observerResult = preScreenClassify(sanitizedMessage) || fallbackObserverClassify(sanitizedMessage);
        console.log(`[TurboMsg] ⚡ Using regex-only observer: ${observerResult?.primary_action || 'general'}`);
      }
      // Quick messages still need observer fallback for tool routing
      if (isQuickMessage) {
        observerResult = fallbackObserverClassify(sanitizedMessage);
      }
      // ═══ HYBRID POLICY: Override isQuickMessage if observer detects tool-needed intent ═══
      if (isQuickMessage && observerResult && (observerResult.needs_tools === true || TOOL_DRIVEN_ACTIONS_SET.has(observerResult.primary_action))) {
        console.log(`[HybridOverride] isQuickMessage overridden to false — observer says needs_tools or action=${observerResult.primary_action}`);
        isQuickMessage = false;
      }
    }

    // ═══ OBSERVER FALLBACK ═══
    if (!observerResult) {
      observerResult = fallbackObserverClassify(sanitizedMessage);
    }
    
    // ═══ BACKGROUND OBJECTIVE AUTO-INJECTION — SKIP for simple/quick/turbo messages ═══
    if (!isSimpleMessage && !isQuickMessage && !isTurboMessage) {
      const bgResponse = await handleBackgroundObjective(supabase, sessionId, userId, sanitizedMessage, observerResult);
      if (bgResponse) { await pipeResponseAndClose(bgResponse); return; }
    }

    // ═══ Premium Autonomous Mode REMOVED ═══
    // Observer-based auto-routing to autonomous mode disabled per user request.
    // Heavy multi-step requests now stay in the normal agentic loop and rely on
    // the adaptive step-budget tier (deep / ultra-deep) below. The user can also
    // explicitly opt into a Deep Run via the composer toggle (deep_run flag).

    // ═══ DYNAMIC ROUTING: Adaptive Complexity Scaling (Claude 4.6 Aligned) ═══
    const isDeepQuery = DEEP_SEARCH_PATTERN.test(sanitizedMessage) || NEWS_DEEP_PATTERN.test(sanitizedMessage);
    const hasMultiStepKeywords = MULTI_STEP_KEYWORD_PATTERN.test(sanitizedMessage);
    // Escalate to ultra-deep if: explicit ultra-deep, user-toggled Deep Run, OR (multi-step keywords + deep/complex context)
    const userDeepRun = !!deep_run;
    const isUltraDeep = userDeepRun ||
      ULTRA_DEEP_PATTERN.test(sanitizedMessage) ||
      (hasMultiStepKeywords && (isDeepQuery || observerResult?.complexity === 'complex'));
    if (userDeepRun) console.log('[DeepRun] User-toggled Deep Run — boosting to ultra-deep tier');

    const adaptiveConfig = getAdaptiveStepBudget({
      observerComplexity: observerResult?.complexity || null,
      isSimpleMessage,
      isTurboMessage, // 10x Boost
      isDeepQuery,
      isUltraDeep,
      isContinuation,
      messageText: sanitizedMessage,
    });
    MAX_AGENT_STEPS = isMemoryMode ? 2 : adaptiveConfig.maxSteps;
    console.log(`[DynamicRouting] Tier: ${adaptiveConfig.tier}, MAX_AGENT_STEPS: ${MAX_AGENT_STEPS}${isTurboMessage ? ' ⚡TURBO' : ''}${isMemoryMode ? ' 🧠MEMORY' : ''}`);

    // Attach complexity tier to recentMemories for tier-based daily log caps in prompt-builder
    if (recentMemories) {
      (recentMemories as any)._complexityTier = adaptiveConfig.tier;
    }
    // ═══ PHOENIX: KEYWORD-BASED MODULE FALLBACK ═══
    const observerModules = observerResult?.modules || quickModuleDetect(sanitizedMessage, isAdmin);
    // PERF: For simple/turbo messages, pass minimal modules to skip heavy prompt sections
    const promptModules = (isSimpleMessage || isTurboMessage) ? ["CORE"] : observerModules;
    
    // ═══ GROUP BOT: Memory Isolation & Persona Override ═══
    let systemPrompt: string;
    if (isGroupBotGateway) {
      const groupBotUsername = groupContext?.group_bot_username || 'GroupBot';
      const creatorName = groupContext?.creator_name || 'BeeBot User';
      const customInstruction = groupContext?.group_bot_custom_instruction || null;

      systemPrompt = buildGroupBotPrompt({
        groupBotUsername, creatorName, customInstruction, sessionContext: enrichedSessionContext,
        senderRole: groupContext?.sender_role,
        adminRoster: groupContext?.admin_roster,
      });
      console.log(`[GreatFirewall] Group Bot persona injected for @${groupBotUsername}`);
    } else {
      systemPrompt = await assembleSystemPrompt(supabase, learningContext, agentSettings, isAdmin, enrichedSessionContext, skipHeavyContext ? undefined : extendedContext, skipHeavyContext ? undefined : globalContext, proactiveContext, promptModules, userId, isSimpleMessage || isQuickMessage, livingMemories, groupContext, (adaptiveConfig as any)?.tier || observerResult?.complexity, sanitizedMessage);
    }
    
    // ═══ NIGHTINGALE: Clean tool residue before building history ═══
    const cleanedHistory = SessionManager.cleanToolResidue(history || []);
    let historyMessages = buildConversationHistory(cleanedHistory);
    
    // ═══ GROUP BOT: History isolation + ghost filter + truncation ═══
    if (isGroupBotGateway) {
      // Step 1: Remove TRULY orphaned ghost messages
      // Use raw history (which now includes source_channel) to filter, then apply to converted messages
      const rawHistory = history || [];
      const ghostIds = new Set<number>();
      rawHistory.forEach((raw: any, idx: number) => {
        if (raw.role === 'assistant') {
          const content = typeof raw.content === 'string' ? raw.content.trim() : '';
          const hasSource = !!raw.source_channel;
          // Only remove if BOTH: no source_channel AND empty/very short content
          if (!hasSource && (!content || content.length < 5)) {
            ghostIds.add(idx);
            console.log("[GhostFilter] Removed empty ghost assistant message from group history");
          }
        }
      });
      // Apply ghost filter to converted messages (same index mapping)
      if (ghostIds.size > 0) {
        historyMessages = historyMessages.filter((_: any, idx: number) => !ghostIds.has(idx));
      }
      // Step 2: Tag unattributed user messages so AI doesn't assume single user
      historyMessages = historyMessages.map((msg: any) => {
        if (msg.role === 'user' && typeof msg.content === 'string' && !msg.content.includes('[From:')) {
          return { ...msg, content: `[From: Unknown Member] ${msg.content}` };
        }
        return msg;
      });
      // Step 3: SMART TRUNCATION — Keep last 12 messages for contextual awareness
      // Enough history for the bot to reference previous speakers' points naturally,
      // but not so much that it batch-answers multiple old questions
      const GROUP_HISTORY_MAX = 12;
      if (historyMessages.length > GROUP_HISTORY_MAX) {
        const truncated = historyMessages.length - GROUP_HISTORY_MAX;
        historyMessages = historyMessages.slice(-GROUP_HISTORY_MAX);
        console.log(`[GroupBot] History truncated: removed ${truncated} old messages, keeping last ${GROUP_HISTORY_MAX}`);
      }
    }
    
    // ═══ ROLLING CONTEXT: Fetch stored summary + keyword compression fallback ═══
    // v16.6.0: Use session context_summary from already-fetched sessionContextResult (merged into super-batch)
    let historySummary = "";
    if (!isSimpleMessage) {
      // Try to get context_summary from the session data we already fetched
      const cachedSummary = (sessionContextResult as any)?.contextSummary;
      if (cachedSummary) {
        historySummary = `[📜 PREVIOUS CONTEXT SUMMARY (LLM-generated):\n${cachedSummary}\nThe conversation continues with recent messages below.]`;
      } else {
        historySummary = compressOldHistory(history || []);
      }
    }
    
    // ═══ STABILITY FIX: Warn about long sessions ═══
    const historyLength = history?.length || 0;
    if (historyLength > 40) {
      console.warn(`[Agent] Long session detected: ${historyLength} messages. Consider starting new chat.`);
    }
    
    // ═══ BUILD USER MESSAGE (supports multimodal/vision) ═══
    let userMessageContent: string | any[];
    if (validAttachments.length > 0) {
      // Build multimodal content — ONLY images go as image_url
      // PDFs are handled ENTIRELY by agentic-loop.ts extraction (never as image_url)
      const imageAtts = validAttachments.filter(a => a.type === 'image');
      const pdfAtts = validAttachments.filter(a => a.mime_type === 'application/pdf');
      
      userMessageContent = [
        { type: "text", text: sanitizedMessage || (pdfAtts.length > 0 ? "Please analyze this document." : "Please analyze this image.") },
        // Only images as image_url — Gemini supports this format for vision
        ...imageAtts.map(att => ({
          type: "image_url",
          image_url: {
            url: `data:${att.mime_type};base64,${att.base64}`,
          }
        })),
        // PDF text will be injected by agentic-loop.ts after Gemini native extraction
        // DO NOT add PDF base64 as image_url — Gemini cannot read PDF via image_url format
      ];
      console.log(`[Vision] Built multimodal message with ${imageAtts.length} images, ${pdfAtts.length} PDFs (PDFs extracted in agentic-loop)`);
    } else {
      userMessageContent = sanitizedMessage;
    }
    
    // Build unified system prompt (Gemini requires exactly ONE system message)
    let unifiedSystemPrompt = systemPrompt;

    if (historySummary) {
      unifiedSystemPrompt += "\n\n" + historySummary;
    }

    // ═══ v16.6.0: Core protocol injections — SKIP for group bots (prompt isolation) ═══
    if (isGroupBotGateway) {
      // Group bots use ONLY buildGroupBotPrompt — no core protocols needed (accuracy enforced by PERSONA_RULES + guards)
    } else if (!isSimpleMessage) {
      // 10x P1.4: Lazy-load heavy widget EXAMPLES only when viz intent detected (saves ~6KB on 85% of turns)
      const wantsViz = (promptModules?.includes("VISUALIZATION") || /\b(chart|graph|widget|visualize|visualise|dashboard|kpi|flowchart|mindmap|timeline|diagram)\b|ဇယား|ဂရပ်|ပုံစံ|ပြပေး/i.test(sanitizedMessage));
      unifiedSystemPrompt += buildCoreProtocols(sessionContext?.userName || "User", { includeWidgetExamples: wantsViz });
    }
    // Simple messages: no extra protocols needed (PERSONA_RULES + runtime guards cover accuracy)

    // ═══ SESSION INSTRUCTIONS: Per-session project context (like Claude.ai Projects) ═══
    const sessionInstructions = sessionRecordResult?.data?.session_instructions;
    if (sessionInstructions) {
      unifiedSystemPrompt += `\n\n[SESSION CONTEXT]\n${sessionInstructions}`;
      console.log(`[SessionInstructions] Injecting ${sessionInstructions.length} chars of session context`);
    }

    // ═══ PROMPT ENRICHMENT: All Soul Protocols + Deep Research + Whisper + Telemetry + Pruning ═══
    // Memory mode, group bots, and turbo messages skip enrichment entirely.
    // Memory mode relies SOLELY on session_instructions (Memory Curator mandate)
    // — injecting CORE_MEMORY block here would re-trigger autonomous capture in
    // a surface that already IS the capture surface (infinite loop risk).
    if (isMemoryMode) {
      // Memory mode: enrichment skipped (slim curator-only prompt)
    } else if (isGroupBotGateway) {
      // Group bot: enrichment skipped
    } else if (!isTurboMessage) {
      unifiedSystemPrompt = await enrichPromptWithAllProtocols(
        supabase, userId, sanitizedMessage, isSimpleMessage || isQuickMessage, isDeepQuery, unifiedSystemPrompt, observerResult?.complexity, adaptiveConfig.tier,
        { lessons: prefetchedLessonsResult?.data, guardianGoals: prefetchedGoalsResult?.data, whisperPrefs: prefetchedWhisperResult?.data },
      );
    } else {
      // Turbo: enrichment skipped
    }
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking_status", step: isBurmeseAck ? "🔧 Prompt ပြင်ဆင်ပြီးပြီ၊ Agent Loop စတင်နေတယ်..." : "🔧 Prompt ready, starting agent loop..." })}\n\n`));

    // Welcome logic: only mark for brand-new users (CORE_IDENTITY handles tone)
    if (shouldShowWelcome) {
      await supabase
        .from("user_agent_settings")
        .update({ welcome_shown: true })
        .eq("user_id", userId);
    }
    // No hardcoded greeting injection -- CORE_IDENTITY_OPTIMIZED.md handles continuity

    // Saya Gyi's Pattern-Breaker v2 (Hard Mode) — SKIP for group bot (causes ghost message accumulation)
    let finalHistoryMessages = [...historyMessages];
    if (!isGroupBotGateway) {
      const assistantMsgs = historyMessages.filter(m => m.role === 'assistant');
      if (assistantMsgs.length >= 2) {
        const lastTwo = assistantMsgs.slice(-2).map(m => m.content?.trim());
        if (lastTwo[0] === lastTwo[1]) {
          console.log("[Pattern-Breaker] LOOP DETECTED! Nuking history and injecting nudge.");
          unifiedSystemPrompt += "\n\n[CRITICAL PATTERN BREAK] You were stuck repeating the EXACT same response. ALL previous history has been cleared. Start fresh. DO NOT greet. Just ask what the user needs in a new, unique way. Examples: 'ဟုတ်ကဲ့... ဘာလုပ်ပေးရမလဲ?', 'ပြောပါ Boss...', 'ဒီနေ့ ဘာကူညီရမလဲ?'";
          finalHistoryMessages = []; // Nuclear option: zero history
        }
      }
    }

    // Hi-Keyword Shield: prevent greeting echo for simple greetings
    const trimmedMsg = (typeof userMessageContent === 'string' ? userMessageContent.trim().toLowerCase() : sanitizedMessage?.trim().toLowerCase() || '');
    const isJustGreeting = JUST_GREETING_PATTERN.test(trimmedMsg || '');
    if (isJustGreeting && historyMessages.length > 0) {
      unifiedSystemPrompt += "\n\n[SHORT MESSAGE] The user sent a simple greeting. You have already spoken to them before. Do NOT repeat any previous greeting. Respond with a brief, UNIQUE acknowledgment and ask what they need. Pick something different each time.";
    }

    // ═══ GROUP BOT: Inject isolation marker before user message ═══
    const finalUserContent = isGroupBotGateway
      ? (typeof userMessageContent === 'string'
        ? `[⚡ RESPOND TO THIS MESSAGE ONLY — IGNORE ALL PREVIOUS MESSAGES FROM OTHER USERS]\n${userMessageContent}`
        : userMessageContent)
      : userMessageContent;

    const conversationMessages: any[] = [
      { role: "system", content: unifiedSystemPrompt },
      ...finalHistoryMessages,
      { role: "user", content: finalUserContent },
    ];

    // ═══ SMART CONTEXT COMPACTION: Skip for short conversations (saves ~200ms) ═══
    let finalMessages: any[];
    if (finalHistoryMessages.length < 15) {
      finalMessages = [...conversationMessages];
      // Compaction skipped — below threshold
    } else {
      const compactedMessages = await compactContextIfNeeded(
        conversationMessages,
        selectedModel,
        supabase,
        sessionId,
        personalGeminiKey || undefined
      );
      // Safe copy: avoid same-reference mutation bug when compaction returns the original array
      finalMessages = [...compactedMessages];
    }

    // ═══ APEX DUAL-ENGINE: API Resolution (personal key path vs APEX orchestrator) ═══
    let apiEndpoint = ""; // FIX #4: Initialize to empty to prevent undefined usage
    let apiKey = "";
    let modelToUse: string;
    let currentProvider: 'google' | 'anthropic' | 'openrouter' | 'xai';

    if (usePersonalKey) {
      // Personal key path uses the shared resolver
      const personalConfig = resolveApiConfig({
        userAISettings: { ...userAISettings, personalOpenrouterKey, personalXaiKey },
        adminSettings, systemGoogleKey: systemKeyCheck?.google_system_api_key,
        systemAnthropicKey: systemKeyCheck?.anthropic_system_api_key,
        preferredModel: selectedModel, apiSourcePreference: api_source_preference,
      });
      apiEndpoint = personalConfig.apiEndpoint;
      apiKey = personalConfig.apiKey;
      modelToUse = selectedModel;
      currentProvider = personalConfig.provider;
      console.log(`🔐 Using ${personalConfig.apiSourceLabel} with model: ${modelToUse}`);
    } else {
      // ═══ APEX ORCHESTRATOR: Use tier-granted model from check_and_deduct_intelligence ═══
      modelToUse = apexData.modelGranted;
      currentProvider = apexData.provider as 'google' | 'anthropic' | 'openrouter' | 'xai';
      if (modelToUse.startsWith('grok')) currentProvider = 'xai';
      else if (modelToUse.startsWith('google/')) currentProvider = 'google';
      else if (modelToUse.includes('/')) currentProvider = 'openrouter';
      else if (modelToUse.startsWith('claude')) currentProvider = 'anthropic';
      
      if (currentProvider === 'anthropic') {
        const anthropicKey = systemKeyCheck?.anthropic_system_api_key;
        if (!anthropicKey) {
          console.warn(`⚠️ Claude key unavailable, falling back to Gemini`);
          currentProvider = 'google';
          modelToUse = 'gemini-3.5-flash';
        } else {
          apiEndpoint = ANTHROPIC_ENDPOINT;
          apiKey = anthropicKey;
          console.log(`🧠 Using APEX Claude API with model: ${modelToUse} (Priority: ${apexData.priorityLevel})`);
        }
      }
      
      if (currentProvider === 'openrouter') {
        if (personalOpenrouterKey) {
          apiEndpoint = OPENROUTER_ENDPOINT;
          apiKey = personalOpenrouterKey;
          console.log(`🌐 Using APEX OpenRouter with model: ${modelToUse}`);
        } else {
          console.warn(`⚠️ OpenRouter key unavailable, falling back to Gemini`);
          currentProvider = 'google';
          modelToUse = 'gemini-3.5-flash';
        }
      }

      if (currentProvider === 'xai') {
        if (personalXaiKey) {
          apiEndpoint = XAI_ENDPOINT;
          apiKey = personalXaiKey;
          console.log(`⚡ Using APEX xAI with model: ${modelToUse}`);
        } else {
          console.warn(`⚠️ xAI key unavailable, falling back to Gemini`);
          currentProvider = 'google';
          modelToUse = 'gemini-3.5-flash';
        }
      }

      if (currentProvider === 'google') {
        const googleKey = systemKeyCheck?.google_system_api_key;
        if (!googleKey) throw new Error("No Google API key available. Please configure system key in Admin Panel.");
        apiKey = googleKey;
        apiEndpoint = GEMINI_OPENAI_ENDPOINT;
        console.log(`✨ Using APEX Gemini API with model: ${modelToUse} (Tier: ${apexData.tierDisplay})`);
      }
    }

    // FIX #4: Safety check includes apiEndpoint
    if (!apiKey || !apiEndpoint) {
      emitErrorAndClose("NO_API_KEY", "No API key or endpoint available. Please configure a personal key or contact admin.");
      return;
    }

    // ═══ PERF: Connection pre-warming — overlap TLS handshake with prompt building ═══
    // Fire-and-forget HEAD request to Gemini API to pre-warm the connection
    if (apiEndpoint.includes('generativelanguage.googleapis.com')) {
      fetch(apiEndpoint, { method: 'HEAD', signal: AbortSignal.timeout(3000) }).catch(() => {});
    } else if (apiEndpoint.includes('openrouter.ai')) {
      fetch(apiEndpoint, { method: 'HEAD', signal: AbortSignal.timeout(3000) }).catch(() => {});
    }

    // FIX #3: Start BrainState prefetch — SKIP for turbo (saves ~300ms)
    const brainStatePromise = isTurboMessage
      ? Promise.resolve(null)
      : Promise.resolve(supabase
          .from("agent_self_improvements")
          .select("insight, confidence")
          .eq("improvement_type", "reasoning_cache")
          .eq("is_active", true)
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order("confidence", { ascending: false })
          .limit(3)
          .then(({ data }) => data))
        .catch(() => null);

    // ═══ PILLAR 4: LEASE-BASED SESSION LOCKING (Self-Healing) ═══
    if (!isSimpleMessage && !isQuickMessage && !isTurboMessage) {
      const currentSourceChannel = source_channel || 'web';
      const isTelegramSource = ['telegram', 'queue_drain', 'group'].includes(currentSourceChannel) || isTelegramGateway;
      isTelegramSourceOuter = isTelegramSource;

      if (isTelegramSource) {
        // ═══ HYPER-PARALLEL: Telegram skips lease entirely ═══
        Promise.resolve(serviceClient.from("agent_chat_sessions").update({
          global_session_state: {
            active_surface: currentSourceChannel,
            last_activity_at: new Date().toISOString(),
            processing_status: "thinking",
            current_step: 0,
            max_steps: MAX_AGENT_STEPS,
            active_tool: null,
            active_mission_id: missionId,
          }
        }).eq("id", sessionId)).catch(() => {});

        // audit_mission_start removed — duplicates mission_complete log (saves 1 DB write/telegram msg)

        console.log(`[HYPER] ⚡ Telegram bypass: no lease needed. Mission ${missionId.slice(0,8)}`);
      } else {
        // ═══ WEB PATH: Phase 1.3 / Phase 2 - True Session Lane Queue (pg_advisory_lock) ═══
        try {
          const { data: lockResult, error: lockErr } = await supabase.rpc('acquire_session_lock', {
            session_uuid: sessionId,
            timeout_ms: 2000
          });
          if (!lockResult || lockErr) {
            console.log(`[LANE QUEUE] Lock timeout or error for session ${sessionId}:`, lockErr);
            if (currentSourceChannel === 'web') {
              console.log(`[LANE QUEUE] Bypassing lock for Web user priority...`);
            } else {
              emitErrorAndClose("SESSION_BUSY", "BeeBot is currently processing your previous message. Please wait.");
              return;
            }
          }
          lockAcquired = true;
          await supabase.from("agent_chat_sessions").update({
            global_session_state: {
              active_surface: currentSourceChannel,
              last_activity_at: new Date().toISOString(),
              processing_status: "thinking",
              current_step: 0,
              max_steps: MAX_AGENT_STEPS,
              active_tool: null,
            }
          }).eq("id", sessionId);
        } catch (lockError) {
          console.error("[LANE QUEUE] Lock exception:", lockError);
        }
      }
    } else {
      // Simple/Quick: lease skipped
    }

    // FIX #3: BrainState was already prefetched in parallel with lease (see brainStatePromise above)
    const prefetchedBrainState = await brainStatePromise;

    // ═══ AGENTIC MULTI-STEP LOOP ═══
    controller.enqueue(encoder.encode(
      `data: ${JSON.stringify({ type: "thinking_status", step: isBurmeseAck ? "🤖 AI Model ဆီ ပို့နေတယ်..." : "🤖 Sending to AI model..." })}\n\n`
    ));

    // ═══ TASK PLAN: Dynamic plan now emitted from agentic-loop.ts on every step ═══

          // ═══ SERVER-SIDE CANCEL: Create mutable ref for heartbeat → loop communication ═══
          const isCancelledRef = { get current() { return cancelRequested; } };

          const loopResult = await runAgenticLoop({
            supabase, serviceClient, userId, sessionId, missionId,
            encoder, controller, authHeader, source_channel,
            clientRequestId: client_request_id || null,
            traceId,
            modelToUse, apiEndpoint: apiEndpoint!, apiKey, usePersonalKey,
            userAISettings: { ...userAISettings, personalOpenrouterKey, personalXaiKey },
            systemKeyCheck, hasSystemGoogleKey, hasSystemAnthropicKey,
            agentSettings, TOOLS,
            finalMessages, sanitizedMessage, validAttachments, continuation,
            historyLength: finalMessages.length,
            isAdmin, isDeepQuery, isSimpleMessage, isQuickMessage, isGroupBotGateway,
            observerResult, deviceContext, groupContext,
            userPermissions, userStrictMode,
            MAX_AGENT_STEPS, complexityTier: adaptiveConfig.tier, lockAcquired, leaseRequestId, t_start,
            prefetchedBrainState,
            isCancelledRef,
            activeMemoryResult: activeMemoryResult ?? undefined,
            userMessage: sanitizedMessage,
            sessionUserName: enrichedSessionContext?.userName || sessionContext?.userName || '',
          });

          if (loopResult.earlyExit) {
            clearInterval(heartbeatInterval);
            try { controller.close(); } catch { /* closed */ }
            return;
          }

          const { finalContent, finalIsError, allToolCalls, allToolResults,
                  thinkingSteps, totalTokensInput, totalTokensOutput } = loopResult;
          const loopStartTime = t_start;

          // ═══ POST-LOOP: critical DB save + background pipeline ═══
          const postLoopCtx: PostLoopContext = {
            supabase, serviceClient, userId, sessionId, missionId, sanitizedMessage,
            source_channel, isGroupBotGateway, agentSettings, personalGeminiKey,
            modelToUse, isUsingPersonalKey: usePersonalKey, loopStartTime,
          };
          const postLoopData: PostLoopData = {
            finalContent, finalIsError, allToolCalls, allToolResults,
            thinkingSteps, totalTokensInput, totalTokensOutput,
          };

          const mustPersistBeforeDone = isTelegramGateway || isTelegramSourceOuter || source_channel === 'telegram';
          let savedForTelegram: Awaited<ReturnType<typeof saveMessageOnly>> | null = null;

          if (mustPersistBeforeDone) {
            try {
              savedForTelegram = await saveMessageOnly(postLoopCtx, postLoopData);
              console.log(`[PostLoop] Telegram critical save completed before DONE for session ${sessionId}`);
            } catch (e) {
              console.error("[PostLoop] Telegram critical save failed before DONE:", e);
            }
          }

          // ═══ EMIT USAGE + CLOSE STREAM ═══
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: "usage",
              usage: {
                tokens_input: totalTokensInput,
                tokens_output: totalTokensOutput,
                tokens_total: totalTokensInput + totalTokensOutput,
                model: modelToUse,
                request_duration_ms: Date.now() - loopStartTime,
              }
            })}\n\n`));
          } catch { /* stream closed */ }

          clearInterval(heartbeatInterval);
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            doneEmitted = true;
            controller.close();
          } catch { /* stream already closed by client disconnect */ }

          if (savedForTelegram) {
            runBackgroundPipeline(postLoopCtx, postLoopData, savedForTelegram.sanitizedContent);
          } else if (!mustPersistBeforeDone) {
            // Web clients already received streamed content, so keep DB persistence off the hot response path.
            saveMessageOnly(postLoopCtx, postLoopData)
              .then(({ sanitizedContent }) => {
                runBackgroundPipeline(postLoopCtx, postLoopData, sanitizedContent);
              })
              .catch(e => console.error("[PostLoop] Fire-and-forget save failed:", e));
          }

          // ═══ PERF: Deferred IU deduction — fire-and-forget ═══
          if (deferIU && !skipIUForPersonalKey) {
            Promise.resolve(supabase.rpc('check_and_deduct_intelligence', {
              p_user_id: userId,
              p_feature_key: 'beebot',
              p_model_requested: modelToUse,
              p_estimated_tokens: Math.max(100, totalTokensInput + totalTokensOutput)
            })).then(({ data }: any) => {
              if (data?.success) console.log(`[DeferredIU] Deducted ${data.iu_cost} IU post-loop`);
              else console.warn(`[DeferredIU] Failed:`, data);
            }).catch((e: any) => console.warn(`[DeferredIU] Error:`, e));
          }
        } catch (error: unknown) {
          clearInterval(heartbeatInterval);
          const err = error instanceof Error ? error : new Error(String(error));
          const errMsg = err.message || '';
          console.error("Streaming error:", err);

          // ═══ CLIENT DISCONNECT DETECTION ═══
          // "cannot close or enqueue" = client dropped connection, NOT a real processing failure
          const isClientDisconnect = errMsg.includes("cannot close or enqueue")
            || errMsg.includes("connection closed")
            || errMsg.includes("connection reset");

          if (isClientDisconnect) {
            console.warn(`[Pipeline] Client disconnected mid-stream (mission ${missionId}) — NOT saving error message`);
            // Don't save misleading error — the response may have been partially delivered
            // Still log for audit but mark as disconnect, not failure
            // Client disconnect — console.warn above is sufficient, no DB write needed
            try { controller.close(); } catch { /* already closed */ }
            return; // Exit cleanly — no error message saved
          }

          // ═══ SMART ERROR CLASSIFICATION ═══
          let errorMessage: string;
          let statusCode = 500;

          if (err.name === 'AbortError' || err.name === 'TimeoutError') {
            errorMessage = "AI processing took too long. Please try a shorter message or split into parts.";
            statusCode = 408;
          } else if (errMsg.includes("401") || errMsg.includes("403") || errMsg.includes("API key") || errMsg.includes("PERMISSION_DENIED")) {
            errorMessage = "AI connection issue — please check your API key in Settings.";
            statusCode = 401;
          } else if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("rate limit")) {
            errorMessage = "AI rate limit — model is busy. Please wait a moment and try again.";
            statusCode = 429;
          } else if (errMsg.includes("context") && errMsg.includes("length") || errMsg.includes("token limit")) {
            errorMessage = "Message history is too long. Try starting a new conversation.";
            statusCode = 413;
          } else {
            // Include a hint from the actual error for debugging
            const hint = errMsg.length > 80 ? errMsg.slice(0, 80) + '…' : errMsg;
            errorMessage = `Something went wrong: ${hint}`;
          }

          try {
            const errorPayload: Record<string, unknown> = {
              type: "error",
              message: errorMessage,
              status_code: statusCode,
            };
            if (statusCode === 429) {
              errorPayload.cooldown_seconds = 30;
              errorPayload.source = "personal_key";
              errorPayload.model = preferred_model || "";
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorPayload)}\n\n`));
          } catch { /* stream closed */ }

          try {
            await supabase.from("agent_chat_messages").insert({
              session_id: sessionId,
              user_id: userId,
              role: "assistant",
              content: `⚠️ ${errorMessage}`,
              is_error: true,
            });
          } catch (dbErr) {
            console.error("[ErrorRecovery] Failed to save error message:", dbErr);
          }

          Promise.resolve(serviceClient.from("agent_communication_log").insert({
            requester_agent_id: userId,
            query_type: "audit_mission_failed",
            query_content: `[MISSION ${missionId}] FAILED: ${(err.message || 'Unknown error').substring(0, 200)}`,
            target_type: "system",
            was_successful: false,
            metadata: {
              mission_id: missionId,
              session_id: sessionId,
              source: source_channel || 'web',
              error_message: err.message || 'Unknown',
              error_name: err.name || 'Error',
              stack_preview: (err.stack || '').substring(0, 300),
            },
          })).catch(() => {});

          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            doneEmitted = true;
            controller.close();
          } catch { /* stream closed */ }
        } finally {
          // FIX #1: Only emit [DONE] in finally if not already sent
          if (!doneEmitted) {
            try {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch { /* Already sent */ }
          }
          
          await releaseLeaseAndDrainQueue(
            supabase, serviceClient, userId, sessionId, lockAcquired,
            isTelegramSourceOuter, source_channel, MAX_AGENT_STEPS,
          );
        }
        }; // end runPipeline

        // Fire-and-forget: pipeline runs detached from start()
        runPipeline().catch((fatalErr) => {
          console.error("[FATAL] Pipeline crashed:", fatalErr);
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: fatalErr?.message || "Internal error" })}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch { /* stream already closed */ }
        });
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: any) {
    console.error("Agent chat error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
