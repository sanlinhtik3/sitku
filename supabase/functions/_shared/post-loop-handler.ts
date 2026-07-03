// ═══ POST-LOOP HANDLER ═══
// Extracted from agent-chat/index.ts — v16.4.14
// Handles: message saving, forensics, session rename, memory pipeline, lease release, queue drain.

import { generateFallbackResponse } from "./tool-executor.ts";
import { sanitizeUserVisibleText } from "./sanitizer.ts";
import { enqueueMemoryTasks, triggerMemoryWorker } from "./memory-queue.ts";

export interface PostLoopContext {
  supabase: any;
  serviceClient: any;
  userId: string;
  sessionId: string;
  missionId: string;
  sanitizedMessage: string;
  source_channel: string | null;
  isGroupBotGateway: boolean;
  agentSettings: any;
  personalGeminiKey: string | null;
  modelToUse: string;
  isUsingPersonalKey: boolean;
  loopStartTime: number;
  complexityTier?: string;
  groupContext?: any;
}

export interface PostLoopData {
  finalContent: string;
  finalIsError: boolean;
  allToolCalls: { name: string; arguments: Record<string, any> }[];
  allToolResults: { name: string; result: any; error?: string }[];
  thinkingSteps: any[];
  totalTokensInput: number;
  totalTokensOutput: number;
}

// ═══ Save assistant message with sanitization and dedup ═══
// ═══ FAST PATH: Save message only (critical for history continuity) ═══
export async function saveMessageOnly(
  ctx: PostLoopContext,
  data: PostLoopData,
): Promise<{ sanitizedContent: string; thinkingSteps: any[] }> {
  const { supabase, sanitizedMessage, sessionId, userId, source_channel } = ctx;
  let { finalContent, finalIsError, allToolCalls, allToolResults, thinkingSteps } = data;

  // ═══ THOUGHT NORMALIZATION ═══
  if (thinkingSteps && thinkingSteps.length > 0) {
    const statusPriority: Record<string, number> = { done: 3, error: 2, loading: 1 };
    const thoughtMap = new Map<string, any>();
    for (const t of thinkingSteps) {
      const key = t.id || (t.tool_name ? `${t.tool_name}_fallback` : `unknown_${thoughtMap.size}`);
      const existing = thoughtMap.get(key);
      if (!existing || (statusPriority[t.status] || 0) > (statusPriority[existing.status] || 0)) {
        thoughtMap.set(key, t);
      }
    }
    thinkingSteps = [...thoughtMap.values()].map(t => {
      if (t.status === "loading") {
        const matchingResult = allToolResults.find(
          tr => t.tool_name && tr.name === t.tool_name && !tr.error
        );
        if (matchingResult) {
          const summary = typeof matchingResult.result === 'object'
            ? JSON.stringify(matchingResult.result).slice(0, 200)
            : String(matchingResult.result).slice(0, 200);
          return { ...t, status: "done", detail: summary };
        }
        return { ...t, status: "error", detail: t.detail || "No result received" };
      }
      return t;
    });
  }

  // ═══ SANITIZE ═══
  let sanitizedFinalContent = sanitizeUserVisibleText(finalContent || "", sanitizedMessage);

  if ((!sanitizedFinalContent || sanitizedFinalContent.trim().length < 3)
      && allToolResults.length > 0 && !finalIsError) {
    console.warn("[Agent] Sanitization wiped content - recovering with structured summary");
    // Build a structured summary from tool results instead of raw dump
    const summaryParts: string[] = [];
    for (const tr of allToolResults) {
      if (!tr.result || tr.error) continue;
      const r = tr.result;
      if (r.answer) summaryParts.push(String(r.answer).slice(0, 500));
      if (r.message && typeof r.message === 'string') summaryParts.push(r.message);
      if (r.results && Array.isArray(r.results)) {
        for (const item of r.results.slice(0, 5)) {
          const title = item.title || '';
          const desc = item.snippet || item.description || '';
          if (title || desc) summaryParts.push(`**${title}** — ${desc.slice(0, 200)}`);
        }
      }
      if (r.markdown) summaryParts.push(String(r.markdown).slice(0, 500));
      if (r.response) summaryParts.push(String(r.response).slice(0, 500));
      if (r.balance !== undefined) summaryParts.push(`Balance: ${Number(r.balance).toLocaleString()} ${r.currency || 'MMK'}`);
      if (r.total_balance !== undefined) summaryParts.push(`Total Balance: ${Number(r.total_balance).toLocaleString()} ${r.currency || 'MMK'}`);
      if (r.income !== undefined) summaryParts.push(`Income: ${Number(r.income).toLocaleString()} ${r.currency || 'MMK'}`);
      if (r.expense !== undefined) summaryParts.push(`Expense: ${Number(r.expense).toLocaleString()} ${r.currency || 'MMK'}`);
      if (Array.isArray(r.recent) && r.recent.length > 0) {
        const lines = r.recent.slice(0, 5).map((e: any) =>
          `• ${e.type || 'tx'}: ${Number(e.amount || 0).toLocaleString()} ${e.currency || r.currency || 'MMK'}${e.description ? ' — ' + e.description : ''}`
        );
        summaryParts.push(lines.join('\n'));
      }
    }
    sanitizedFinalContent = summaryParts.length > 0
      ? summaryParts.join("\n\n")
      : generateFallbackResponse(allToolResults, ctx.agentSettings);
  }

  if (sanitizedFinalContent && (
    /^\[?\s*(Memory stored|Remember|Recall|Settings updated)/i.test(sanitizedFinalContent.trim()) ||
    /["'][a-z_]+["']\s*(?:မှတ်သား|ကို|stored|updated)/i.test(sanitizedFinalContent.trim()) ||
    /\[SYSTEM:/i.test(sanitizedFinalContent.trim())
  )) {
    console.warn("[Agent] Tool-log parroting detected - replacing with structured summary");
    // Re-extract meaningful data from tool results
    const realParts: string[] = [];
    for (const tr of allToolResults) {
      if (!tr.result || tr.error) continue;
      if (tr.result.answer) realParts.push(String(tr.result.answer).slice(0, 500));
      if (tr.result.message && typeof tr.result.message === 'string') realParts.push(tr.result.message);
      if (tr.result.response) realParts.push(String(tr.result.response).slice(0, 500));
    }
    sanitizedFinalContent = realParts.length > 0
      ? realParts.join("\n\n")
      : generateFallbackResponse(allToolResults, ctx.agentSettings);
  }

  const PSEUDO_TOOL_PERSIST_RE = /(?:^|\n)tool_code\s*\n|print\s*\(\s*search_web\s*\(|^search_web\s*\n?\s*\{|^search_web\s*$|^\{\s*"query"\s*:|search_web\s*\(\s*query\s*=|\[Used tools:\s*[^\]]*\]/m;
  if (sanitizedFinalContent && PSEUDO_TOOL_PERSIST_RE.test(sanitizedFinalContent) && allToolResults.length === 0) {
    sanitizedFinalContent = `⚠️ ရှာဖွေမှု ယာယီ မအောင်မြင်ပါ။ ခဏနေ ထပ်ကြိုးစားပေးပါ။\n\n_Search temporarily unavailable. Please try again._`;
  }

  const STATUS_ONLY_RE = /^(\s*(Action completed successfully|လုပ်ဆောင်မှု ပြီးပါပြီ)[.\s]*)+$/i;
  if (sanitizedFinalContent && STATUS_ONLY_RE.test(sanitizedFinalContent.trim()) && allToolResults.length > 0) {
    const realData: string[] = [];
    for (const tr of allToolResults) {
      if (!tr.result || tr.error) continue;
      if (tr.result.answer) realData.push(tr.result.answer.slice(0, 500));
      if (tr.result.results && Array.isArray(tr.result.results)) {
        for (const r of tr.result.results.slice(0, 5)) {
          const title = r.title || '';
          const desc = r.snippet || r.description || '';
          if (title || desc) realData.push(`**${title}** — ${desc.slice(0, 200)}`);
        }
      }
      if (tr.result.markdown) realData.push(tr.result.markdown.slice(0, 500));
      if (tr.result.response) realData.push(String(tr.result.response).slice(0, 500));
    }
    if (realData.length > 0) {
      sanitizedFinalContent = realData.join("\n\n");
    }
  }

  // ═══ SAVE MESSAGE (the only critical DB write) ═══
  if (sanitizedFinalContent || allToolCalls.length > 0 || finalIsError) {
    const { data: lastMsg } = await supabase
      .from("agent_chat_messages")
      .select("id, content")
      .eq("session_id", sessionId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isDuplicate = !ctx.isGroupBotGateway
      && source_channel !== "telegram"
      && lastMsg?.content === (sanitizedFinalContent || "လုပ်ဆောင်မှု ပြီးပါပြီ");
    if (isDuplicate) {
      console.warn("[DedupGuard] Skipped duplicate assistant message save");
    } else {
      await supabase.from("agent_chat_messages").insert({
        session_id: sessionId,
        user_id: userId,
        role: "assistant",
        content: sanitizedFinalContent || "လုပ်ဆောင်မှု ပြီးပါပြီ",
        tool_calls: allToolCalls.length > 0 ? allToolCalls : null,
        tool_results: allToolResults.length > 0 ? allToolResults : null,
        thoughts: thinkingSteps.length > 0 ? thinkingSteps : null,
        is_error: finalIsError,
        ...(source_channel ? { source_channel } : {}),
      });
    }
  }

  return { sanitizedContent: sanitizedFinalContent || "", thinkingSteps };
}

// ═══ BACKGROUND PIPELINE: Non-critical ops (fire-and-forget) ═══
export function runBackgroundPipeline(
  ctx: PostLoopContext,
  data: PostLoopData,
  sanitizedFinalContent: string,
): void {
  const { supabase, serviceClient, userId, sessionId, missionId, sanitizedMessage, source_channel, isGroupBotGateway, personalGeminiKey, loopStartTime } = ctx;
  const { allToolCalls, totalTokensInput, totalTokensOutput, finalIsError } = data;

  // Forensic logging — DECOMMISSIONED for hot path performance.
  // Per memory: agent_communication_log mission-complete writes removed to cut DB bloat.
  // (Audit-only writes retained elsewhere: integrity violations, agent-comm tools, monitoring goal mode.)
  const missionDuration = Date.now() - loopStartTime;
  void missionId; void missionDuration; // kept for potential telemetry hook

  // Auto-rename session
  supabase
    .from("agent_chat_sessions")
    .select("message_count, title")
    .eq("id", sessionId)
    .single()
    .then(({ data: sessionData }: any) => {
      if (sessionData && sessionData.message_count <= 2 && sessionData.title === "New Chat") {
        const title = sanitizedMessage.slice(0, 30) + (sanitizedMessage.length > 30 ? "..." : "");
        supabase.from("agent_chat_sessions").update({ title }).eq("id", sessionId).then(() => {});
      }
    })
    .catch(() => {});

// ═══ P4: ASYNC MEMORY QUEUE — decouple memory ops from main isolate ═══
  const toolNames = allToolCalls.map(tc => tc.name);
  const geminiKey = personalGeminiKey || undefined;

  const tierForArchival = ctx.complexityTier || 'moderate';
  if (isGroupBotGateway) {
    // Telegram group assistant is a BeeBot child-agent with read-only memory.
    // Keep chat/log persistence for auditability, but never enqueue durable
    // memory writes from public group traffic.
    console.log(`[MemoryPipeline] Telegram group child-agent read-only: memory archival skipped for session ${sessionId}`);
  } else {
    // Build memory task list — skip LLM-heavy tasks for personal key users (preserves free-tier RPM quota)
    const isPersonalKeyUser = ctx.isUsingPersonalKey;
    const memoryTaskList: Array<{ user_id: string; session_id: string; task_type: string; payload: any }> = [
      { user_id: userId, session_id: sessionId, task_type: 'profile_learn', payload: { sanitizedMessage } },
      { user_id: userId, session_id: sessionId, task_type: 'episodic_archive', payload: { sanitizedMessage, sanitizedFinalContent, toolNames, geminiKey, complexityTier: tierForArchival } },
    ];
    // Only add LLM-heavy tasks if NOT using personal key (system key has higher RPM limits)
    if (!isPersonalKeyUser) {
      memoryTaskList.push(
        { user_id: userId, session_id: sessionId, task_type: 'rolling_summary', payload: { geminiKey } },
        { user_id: userId, session_id: sessionId, task_type: 'health_check', payload: { geminiKey } },
        { user_id: userId, session_id: sessionId, task_type: 'reflection', payload: { sanitizedMessage, sanitizedFinalContent, toolNames, geminiKey } },
      );
    } else {
      console.log(`[MemoryPipeline] Personal key user — skipping LLM-heavy tasks (rolling_summary, health_check, reflection) to preserve RPM`);
    }
    enqueueMemoryTasks(serviceClient, memoryTaskList as import("./memory-queue.ts").MemoryQueueItem[]).then(() => {
      // Trigger async worker (fire-and-forget)
      triggerMemoryWorker();
    }).catch((err) => {
      // ═══ FIX #6: Surface memory queue insertion failures (was silently swallowed) ═══
      console.error(`[MemoryPipeline] enqueueMemoryTasks FAILED for session ${sessionId}:`, err?.message || err);
    });
  }


  // ═══ Cognitive v2: Reflexive Learning — capture failures as lessons ═══
  if (!isGroupBotGateway) {
    (async () => {
      try {
        const failedTools = ((data as any).allToolResults || []).filter((r: any) => r?.error);
        if (finalIsError || failedTools.length >= 2) {
          const { recordLesson } = await import("./cognitive/reflexive-learning.ts");
          await recordLesson(serviceClient, {
            userId,
            triggerType: finalIsError ? "self_audit" : "tool_failure",
            userMessage: sanitizedMessage,
            whatWentWrong: finalIsError
              ? `Final response flagged as error. Content head: ${sanitizedFinalContent.slice(0, 300)}`
              : `${failedTools.length} tool failures: ${failedTools.map((t: any) => t.name).join(", ")}`,
            evidence: {
              tool_failures: failedTools.slice(0, 5).map((t: any) => ({ name: t.name, error: String(t.error).slice(0, 300) })),
              session_id: sessionId,
            },
            personalEmbedKey: personalGeminiKey,
          });
        }
      } catch (e) {
        console.warn("[Reflexive] post-loop capture failed:", e);
      }
    })();
  }
}

// ═══ LEGACY COMPAT: Original saveAndFinalize (calls both phases) ═══
export async function saveAndFinalize(
  ctx: PostLoopContext,
  data: PostLoopData,
): Promise<string> {
  const { sanitizedContent } = await saveMessageOnly(ctx, data);
  runBackgroundPipeline(ctx, data, sanitizedContent);
  return sanitizedContent;
}

// ═══ PILLAR 4: RELEASE LEASE + QUEUE DRAIN ═══
export async function releaseLeaseAndDrainQueue(
  supabase: any,
  serviceClient: any,
  userId: string,
  sessionId: string,
  lockAcquired: boolean,
  isTelegramSourceOuter: boolean,
  source_channel: string | null,
  MAX_AGENT_STEPS: number
) {
  if (lockAcquired && !isTelegramSourceOuter) {
    try {
      await supabase.rpc('release_session_lock', { session_uuid: sessionId });
      console.log(`[LANE QUEUE] 🔓 Lock released for session ${sessionId}`);
    } catch (e) {
      console.error("[LANE QUEUE] Failed to release lock:", e);
    }
  }


  try {
    await supabase
      .from("agent_chat_sessions")
      .update({
        processing_lock: null,
        lease_holder_id: null,
        lease_acquired_at: null,
        lease_expires_at: null,
        global_session_state: {
          active_surface: source_channel || 'web',
          last_activity_at: new Date().toISOString(),
          processing_status: "idle",
          current_step: 0,
          max_steps: MAX_AGENT_STEPS,
          active_tool: null,
        }
      })
      .eq("id", sessionId);
  } catch (lockErr) {
    console.error("[Lease] Failed to release lease:", lockErr);
  }

  // ═══ POST-LOOP QUEUE DRAIN — web sessions only ═══
  if (isTelegramSourceOuter) return;

  try {
    const { data: pendingQueue } = await serviceClient
      .from("pending_messages")
      .select("id, content, created_at, user_id, source_channel")
      .eq("session_id", sessionId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(3);

    if (!pendingQueue || pendingQueue.length === 0) return;

    for (const msg of pendingQueue) {
      const msgAgeMs = Date.now() - new Date(msg.created_at).getTime();
      const expiryMs = (msg.source_channel === 'telegram' || msg.source_channel === 'group') ? 5 * 60 * 1000 : 2 * 60 * 1000;

      if (msgAgeMs > expiryMs) {
        await serviceClient.from("pending_messages")
          .update({ status: "expired", processed_at: new Date().toISOString() })
          .eq("id", msg.id);
        console.log(`[QueueDrain] Expired stale message ${msg.id} (age: ${Math.round(msgAgeMs / 1000)}s)`);
      } else {
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const msgId = msg.id;

          fetch(`${supabaseUrl}/functions/v1/agent-chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${svcKey}`,
              "x-telegram-gateway": "true",
              "x-source-channel": "queue_drain",
            },
            body: JSON.stringify({
              sessionId: sessionId,
              message: msg.content,
              source_channel: "queue_drain",
            }),
          }).then(async (resp) => {
            if (resp.ok) {
              await serviceClient.from("pending_messages")
                .update({ status: "completed", processed_at: new Date().toISOString() })
                .eq("id", msgId);
              console.log(`[QueueDrain] Re-invoked OK, marked completed: ${msgId}`);
            } else {
              console.error(`[QueueDrain] Re-invoke HTTP ${resp.status} for ${msgId}`);
              await serviceClient.from("pending_messages")
                .update({ status: "pending" })
                .eq("id", msgId);
            }
          }).catch(async (e) => {
            console.error("[QueueDrain] Re-invoke failed:", e);
            await serviceClient.from("pending_messages")
              .update({ status: "pending" })
              .eq("id", msgId);
          });

          console.log(`[QueueDrain] Fired re-invocation for fresh message ${msgId}`);

          Promise.resolve(serviceClient.from("agent_communication_log").insert({
            requester_agent_id: userId,
            query_type: "audit_queue_drain",
            query_content: `[AUDIT] QueueDrain re-invoked message ${msgId} for session ${sessionId}`,
            target_type: "system",
            was_successful: true,
            metadata: { session_id: sessionId, message_id: msgId, source: msg.source_channel, age_ms: msgAgeMs },
          })).catch(() => {});
        } catch (reInvokeErr) {
          console.error("[QueueDrain] Re-invoke error:", reInvokeErr);
        }
      }
    }
  } catch (drainErr) {
    console.error("[QueueDrain] Post-loop drain error:", drainErr);
  }
}
