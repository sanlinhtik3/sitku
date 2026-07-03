// ═══ MONITORING HANDLER: Background Objective & Monitoring Mode ═══
// Extracted from agent-chat/index.ts — eliminates 3 duplicated ReadableStream patterns

import { getMonitoringGoalId, clearMonitoringGoal, saveMonitoringGoal } from "./consent-guard.ts";
import { getGoalStatus, parseNaturalLanguageGoal, createGoal } from "./goal-engine.ts";
import { isQuestionMessage } from "./observer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-apex-model, x-telegram-gateway, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Max-Age": "86400",
};

/** Helper: Creates an SSE response from a single message */
function createSSEResponse(messages: Array<{ type: string; [key: string]: any }>): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const msg of messages) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
      }
      controller.close();
    }
  });
  return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
}

/**
 * Checks if the session is in monitoring mode and handles progress/exit/completion.
 * Returns a Response if monitoring intercepts, null to continue normal chat flow.
 */
export async function handleMonitoringMode(
  supabase: any,
  sessionId: string,
  userId: string,
  sanitizedMessage: string,
  isSimpleMessage: boolean,
): Promise<Response | null> {
  const monitoringGoalId = isSimpleMessage ? null : await getMonitoringGoalId(supabase, sessionId);
  if (!monitoringGoalId) return null;

  const goalStatus = await getGoalStatus(supabase, monitoringGoalId, userId);
  if (!goalStatus.success || !goalStatus.goal) return null;

  const g = goalStatus.goal;
  const tasks = goalStatus.tasks || [];
  const completed = tasks.filter((t: any) => t.status === "completed").length;
  const failed = tasks.filter((t: any) => t.status === "failed").length;
  const total = tasks.length;

  // Get latest activity
  const { data: lastActivity } = await supabase
    .from("agent_communication_log")
    .select("created_at, query_type, response_summary")
    .eq("target_type", "goal_execution")
    .filter("metadata->>goal_id", "eq", monitoringGoalId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastTimestamp = lastActivity?.created_at
    ? new Date(lastActivity.created_at).toLocaleString("en-US", { timeZone: "UTC" })
    : "N/A";

  // Goal completed or failed — clear monitoring and stream final status
  if (g.status === "completed" || g.status === "failed" || g.status === "cancelled") {
    await clearMonitoringGoal(supabase, sessionId);
    const finalMsg = g.status === "completed"
      ? `✅ **Background Objective ပြီးဆုံးပါပြီ!**\n\n🎯 **${g.title}**\n📊 ${completed}/${total} tasks completed\n⏱️ Duration: ${g.started_at ? Math.round((Date.now() - new Date(g.started_at).getTime()) / 60000) + " minutes" : "N/A"}\n\n📋 Full report ကို notification မှာ ကြည့်ပါ။ Normal chat mode ပြန်ရောက်ပါပြီ 🐝`
      : `⚠️ **Background Objective ${g.status}**\n\n🎯 **${g.title}**\n📊 ${completed}/${total} tasks (${failed} failed)\n\nNormal chat mode ပြန်ရောက်ပါပြီ။`;

    await supabase.from("agent_chat_messages").insert({
      session_id: sessionId, user_id: userId, role: "assistant", content: finalMsg,
    });
    return createSSEResponse([
      { type: "content", content: finalMsg },
      { type: "done" },
    ]);
  }

  // Check if user wants to exit monitoring
  const exitPatterns = /exit\s*monitor|stop\s*monitor|normal\s*chat|ပြန်|cancel\s*monitor/i;
  if (exitPatterns.test(sanitizedMessage)) {
    await clearMonitoringGoal(supabase, sessionId);
    const exitMsg = `✅ Monitoring mode ထွက်ပါပြီ။ Normal chat mode ပြန်ရောက်ပါပြီ 🐝\n\nGoal "${g.title}" ကတော့ background မှာ ဆက်လုပ်နေပါတယ်။`;
    await supabase.from("agent_chat_messages").insert({
      session_id: sessionId, user_id: userId, role: "assistant", content: exitMsg,
    });
    return createSSEResponse([
      { type: "content", content: exitMsg },
      { type: "done" },
    ]);
  }

  // Still active — stream progress
  const progressMsg = `🎯 **Background Objective Active**\n\n**${g.title}**\n📊 Progress: ${completed}/${total} tasks completed${failed > 0 ? ` (${failed} failed)` : ""}\n🔄 Status: ${g.status}\n⏱️ Last activity: ${lastTimestamp}\n${lastActivity?.query_type ? `📝 Last step: ${lastActivity.query_type}` : ""}\n\n_Background worker သည် ${5} minutes တိုင်း ဆက်လက် execute လုပ်နေပါတယ်..._\n\n💬 Normal chat ဆက်သွားချင်ရင် "exit monitoring" လို့ ရိုက်ပါ။`;

  await supabase.from("agent_chat_messages").insert({
    session_id: sessionId, user_id: userId, role: "assistant", content: progressMsg,
  });
  return createSSEResponse([
    { type: "content", content: progressMsg },
    { type: "done" },
  ]);
}

/**
 * Handles background objective auto-injection when Observer detects background_objective intent.
 * Returns a Response if a goal was created (enters monitoring mode), null to continue.
 */
export async function handleBackgroundObjective(
  supabase: any,
  sessionId: string,
  userId: string,
  sanitizedMessage: string,
  observerResult: any,
): Promise<Response | null> {
  if (observerResult?.primary_action !== "background_objective" &&
      !(observerResult?.primary_action === "manage_goal" && observerResult?.complexity === "complex")) {
    return null;
  }

  const bgKeywords = /background|while\s*i'?m\s*away|go\s*research|investigate\s*and\s*report|ရှာပေးပြီး\s*report|go\s*deep\s*on|look\s*into\s*this|ရက်ရှည်|စောင့်ကြည့်ပေး/i;
  const isQuestion = isQuestionMessage(sanitizedMessage);
  const isBackgroundRequest = !isQuestion && (observerResult?.primary_action === "background_objective" || bgKeywords.test(sanitizedMessage));

  if (!isBackgroundRequest) return null;

  console.log(`[BackgroundObjective] Auto-injecting goal for: "${sanitizedMessage.slice(0, 100)}"`);

  const parsed = parseNaturalLanguageGoal(sanitizedMessage);
  if (!parsed) return null;

  const goalResult = await createGoal(supabase, userId, {
    title: parsed.title,
    description: sanitizedMessage,
    goal_type: parsed.goalType,
    config: parsed.config,
  });

  if (!goalResult.success || !goalResult.goal) return null;

  // Save monitoring mode
  await saveMonitoringGoal(supabase, sessionId, goalResult.goal.id);

  // Log to communication_log
  await supabase.from("agent_communication_log").insert({
    requester_agent_id: userId,
    target_type: "goal_execution",
    query_type: "thought",
    query_content: `🧠 "${parsed.title}" အတွက် Background Execution Mode စတင်ပါပြီ... Task ${goalResult.tasks_created} ခု ဖန်တီးပြီး queue ထဲ ထည့်ပြီးပါပြီ။`,
    response_summary: `Goal created: ${goalResult.goal.id}, Tasks: ${goalResult.tasks_created}`,
    was_successful: true,
    metadata: { goal_id: goalResult.goal.id, tasks_created: goalResult.tasks_created },
  });

  const ackMsg = `🎯 **Objective Locked. Background Execution Mode စတင်ပါပြီ...**\n\n📋 **Goal:** ${parsed.title}\n🔧 **Type:** ${parsed.goalType}\n📊 **Tasks Created:** ${goalResult.tasks_created}\n⏱️ **Execution:** Every 5 minutes via heartbeat worker\n\n_Saya Gyi က background မှာ ရှာဖွေ၊ ခွဲခြမ်းစိတ်ဖြာ၊ report လုပ်ပေးနေပါမယ်..._\n_ပြီးရင် Chat + Notification + Telegram + Push ကနေ report ပို့ပေးပါမယ်_ 🐝\n\n💬 Progress ကြည့်ချင်ရင် ဒီ chat မှာ message ရိုက်ပါ။\n"exit monitoring" လို့ ရိုက်ရင် normal chat ပြန်ရောက်ပါမယ်။`;

  await supabase.from("agent_chat_messages").insert({
    session_id: sessionId, user_id: userId, role: "assistant", content: ackMsg,
  });

  return createSSEResponse([
    { type: "thinking", status: { id: "bg-goal", title: "Background Objective Created", status: "done", timestamp: new Date().toISOString() } },
    { type: "content", content: ackMsg },
    { type: "done" },
  ]);
}
