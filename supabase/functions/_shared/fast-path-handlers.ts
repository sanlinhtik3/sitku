// ═══ FAST-PATH HANDLERS ═══
// Extracted from agent-chat/index.ts — v16.4.14
// Self-contained early-return blocks that bypass the agentic loop.

import { executeTool } from "./tool-executor.ts";
import { isConfirmationMessage, clearPendingAction } from "./consent-guard.ts";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

// ═══ FAST-PATH: Token usage questions (bypass AI to prevent rate limit loops) ═══
export async function handleTokenUsageQuery(
  supabase: any,
  userId: string,
  sessionId: string,
  sanitizedMessage: string,
  encoder: TextEncoder,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const tokenUsagePatterns = [
    /token.*usage|usage.*token/i,
    /input.*output.*token|output.*input.*token/i,
    /gemini.*token|token.*gemini/i,
    /token.*အရေအတွက်|အရေအတွက်.*token/i,
    /ဒီနေ့.*token|token.*ဒီနေ့/i,
    /today.*token|token.*today/i,
    /tpm|rpd|tokens.*per/i,
    /ဘယ်လောက်.*သုံး.*token|token.*ဘယ်လောက်/i,
  ];

  if (!tokenUsagePatterns.some(p => p.test(sanitizedMessage))) return null;

  console.log(`[FastPath] Token usage question detected, querying database directly...`);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: usageData } = await supabase
    .from("agent_ai_usage")
    .select("tokens_input, tokens_output, api_source, model_used, created_at")
    .eq("user_id", userId)
    .gte("created_at", todayStart.toISOString())
    .eq("is_successful", true);

  const totals = (usageData || []).reduce((acc: any, row: any) => ({
    input: acc.input + (row.tokens_input || 0),
    output: acc.output + (row.tokens_output || 0),
    requests: acc.requests + 1,
  }), { input: 0, output: 0, requests: 0 });

  const bySource: Record<string, { input: number; output: number; count: number }> = {};
  for (const row of (usageData || [])) {
    const source = row.api_source || "unknown";
    if (!bySource[source]) bySource[source] = { input: 0, output: 0, count: 0 };
    bySource[source].input += row.tokens_input || 0;
    bySource[source].output += row.tokens_output || 0;
    bySource[source].count += 1;
  }

  const botEmoji = "🐝";

  let responseContent = `📊 **ဒီနေ့ Gemini AI Token အသုံးပြုမှု** (${new Date().toLocaleDateString('en-US', { timeZone: 'UTC' })})\n\n`;
  responseContent += `| Metric | Value |\n|--------|-------|\n`;
  responseContent += `| Total Requests | ${totals.requests.toLocaleString()} |\n`;
  responseContent += `| Input Tokens | ${totals.input.toLocaleString()} |\n`;
  responseContent += `| Output Tokens | ${totals.output.toLocaleString()} |\n`;
  responseContent += `| **Total Tokens** | **${(totals.input + totals.output).toLocaleString()}** |\n\n`;

  if (Object.keys(bySource).length > 1) {
    responseContent += `**By API Source:**\n`;
    for (const [source, stats] of Object.entries(bySource)) {
      const sourceName = source === "personal_key" ? "🔑 Personal Key" : "☁️ Gateway";
      responseContent += `- ${sourceName}: ${stats.count} requests, ${(stats.input + stats.output).toLocaleString()} tokens\n`;
    }
    responseContent += `\n`;
  }

  responseContent += `_ဒီအချက်အလက်များကို database မှ တိုက်ရိုက် ရယူထားပါတယ်_ ${botEmoji}`;

  const fastPathStream = new ReadableStream({
    async start(controller) {
      const chunks = responseContent.match(/.{1,50}/g) || [responseContent];
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
      }
      await supabase.from("agent_chat_messages").insert({
        session_id: sessionId, user_id: userId, role: "assistant",
        content: responseContent, is_error: false,
      });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });

  return new Response(fastPathStream, { headers: { ...corsHeaders, ...SSE_HEADERS } });
}

// ═══ FAST-PATH: Pending action confirmation ═══
export async function handlePendingActionConfirmation(
  supabase: any,
  userId: string,
  sessionId: string,
  sanitizedMessage: string,
  pendingAction: any,
  agentSettings: any,
  encoder: TextEncoder,
  corsHeaders: Record<string, string>,
  isAdmin: boolean,
  authHeader: string,
  deviceContext: any,
  source_channel: string | null,
  groupContext: any,
): Promise<Response | null> {
  if (!pendingAction) return null;

  const userIsConfirming = isConfirmationMessage(sanitizedMessage);
  if (!userIsConfirming) return null;

  console.log(`[PendingAction] User confirming: tool=${pendingAction.tool}, action=${pendingAction.action}`);

  const result = await executeTool(supabase, userId, pendingAction.tool, pendingAction.args, isAdmin, authHeader, {
    timezone: deviceContext?.timezone, sessionId, sourceChannel: source_channel || 'web', groupContext, writer: undefined, encoder
  });
  await clearPendingAction(supabase, sessionId);

  const botEmoji = agentSettings?.bot_emoji || "🐝";

  let responseContent: string;
  if (result.error) {
    responseContent = `⚠️ ${result.error} ${botEmoji}`;
  } else if (pendingAction.tool === "manage_flowstate") {
    const amount = pendingAction.args.amount?.toLocaleString() || "0";
    const currency = pendingAction.args.currency || "MMK";
    const desc = pendingAction.args.description || (pendingAction.args.action === "add_income" ? "ဝင်ငွေ" : "အသုံးစရိတ်");
    const actionType = pendingAction.args.action === "add_income" ? "ဝင်ငွေ" : "အသုံးစရိတ်";
    const newBalance = result.new_balance?.toLocaleString() || "";
    responseContent = `✅ **${desc}** ${amount} ${currency} ကို FlowState မှာ ${actionType} အဖြစ် မှတ်တမ်းတင်ပြီးပါပြီ ${botEmoji}\n`;
    if (newBalance) {
      responseContent += `\n💰 **လက်ကျန်:** ${newBalance} ${result.account_currency || currency}`;
    }
    if (result.category) responseContent += `\n📂 **အမျိုးအစား:** ${result.category}`;
    const txDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    responseContent += `\n📅 **ရက်စွဲ:** ${txDate}`;
    responseContent += `\n\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?`;
  } else if (pendingAction.tool === "manage_workspace_task") {
    const title = pendingAction.args.title || "task";
    const txDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    if (pendingAction.args.action === "create") {
      responseContent = `✅ **"${title}"** task ကို create လုပ်ပြီးပါပြီ ${botEmoji}\n`;
      if (pendingAction.args.priority) responseContent += `\n🎯 **Priority:** ${pendingAction.args.priority}`;
      if (pendingAction.args.points) responseContent += `\n⭐ **Points:** ${pendingAction.args.points}`;
      responseContent += `\n📅 **Created:** ${txDate}`;
      responseContent += `\n\n💡 နောက်ထပ် task ထပ်ထည့်မလား?`;
    } else if (pendingAction.args.action === "complete") {
      const points = result.points_earned || 0;
      responseContent = `🎉 **"${title}"** task complete ဖြစ်ပါပြီ! ${botEmoji}\n`;
      if (points > 0) responseContent += `\n⭐ **+${points} points** earned!`;
      if (result.total_points !== undefined) responseContent += `\n🏆 **Total Points:** ${result.total_points}`;
      responseContent += `\n\n💪 ကောင်းပါတယ်! နောက်ထပ် ဘာလုပ်မလဲ?`;
    } else if (pendingAction.args.action === "delete") {
      responseContent = `🗑️ **"${title}"** task ကို ဖျက်ပြီးပါပြီ ${botEmoji}\n\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?`;
    } else {
      responseContent = `✅ **"${title}"** task ကို ${pendingAction.args.action} လုပ်ပြီးပါပြီ ${botEmoji}\n\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?`;
    }
  } else if (pendingAction.tool === "broadcast_message") {
    if (result.posted && result.message_id) {
      responseContent = `✅ **"${result.channel_name}"** ကို ${result.bot_identity || 'bot'} နဲ့ ပို့ပြီးပါပြီ ${botEmoji}\n\n📨 **Message ID:** ${result.message_id}`;
      if (result.permanent_link) responseContent += `\n🔗 **Link:** ${result.permanent_link}`;
      responseContent += `\n📅 **Timestamp:** ${result.timestamp || new Date().toISOString()}`;
    } else if (result.posted) {
      responseContent = `⚠️ **"${result.channel_name}"** ကို ပို့ပေမယ့် message ID ပြန်မရပါ။ Channel ကို manually စစ်ပေးပါ ${botEmoji}`;
    } else if (result.error) {
      responseContent = `❌ **Failed:** ${result.error}`;
      if (result.forensic) {
        responseContent += `\n\n🔍 **Diagnosis:**\n- **Point of Failure:** ${result.forensic.point_of_failure}\n- **Cause:** ${result.forensic.cause}\n- **Solution:** ${result.forensic.solution}`;
      }
    } else {
      responseContent = `✅ Broadcast ${pendingAction.args.action} ပြီးပါပြီ ${botEmoji}`;
    }
  } else if (pendingAction.tool === "schedule_task") {
    if (result.not_found) {
      responseContent = `⚠️ Task မတွေ့ပါ။ Task ID စစ်ဆေးပေးပါ ${botEmoji}`;
    } else if (pendingAction.args.action === "delete" && result.verified && result.success) {
      responseContent = `🗑️ **"${result.deleted_prompt || 'task'}"** ကို ဖျက်ပြီးပါပြီ ${botEmoji}\n\n🔍 **Verified:** DB မှာ မရှိတော့ပါ\n🕐 **Deleted at:** ${result.deleted_at || new Date().toISOString()}`;
    } else if (pendingAction.args.action === "pause" && result.verified) {
      responseContent = `⏸️ **"${result.message || 'task'}"** ကို pause လုပ်ပြီးပါပြီ ${botEmoji}\n\n▶️ ပြန်ဖွင့်ချင်ရင် ပြောပါနော်!`;
    } else if (pendingAction.args.action === "resume" && result.verified) {
      responseContent = `▶️ **"${result.message || 'task'}"** ကို resume လုပ်ပြီးပါပြီ ${botEmoji}`;
      if (result.next_run_at) responseContent += `\n\n⏰ **Next Run:** ${result.next_run_at}`;
    } else if (pendingAction.args.action === "complete" && result.verified) {
      responseContent = `✅ Scheduled task ကို complete & deactivate လုပ်ပြီးပါပြီ ${botEmoji}\n\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?`;
    } else if (pendingAction.args.action === "update" && result.verified) {
      responseContent = `✏️ Scheduled task ကို update လုပ်ပြီးပါပြီ ${botEmoji}\n\n📝 **Changes:** ${result.updated_fields?.join(', ') || 'fields'}`;
    } else if (result.success) {
      responseContent = `✅ ${result.message || 'Task operation completed'} ${botEmoji}\n\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?`;
    } else {
      responseContent = `⚠️ ${result.message || result.error || 'Operation could not be verified'} ${botEmoji}`;
    }
  } else if (pendingAction.tool === "admin_manage_token_quotas") {
    if (result.error) {
      responseContent = `❌ Admin action failed: ${result.error} ${botEmoji}`;
    } else {
      const action = pendingAction.args.action || "action";
      const count = result.updated_count || result.affected_count || "N/A";
      const amount = pendingAction.args.tokens_amount || "";
      responseContent = `✅ Admin ${action} completed ${botEmoji}\n\n📊 Proof-of-Work:\n- Updated users: ${count}\n- Amount: ${amount} IU\n- Result: ${JSON.stringify(result)}`;
    }
  } else {
    responseContent = `✅ လုပ်ဆောင်မှု ပြီးပါပြီ ${botEmoji}`;
  }

  // Save user message
  await supabase.from("agent_chat_messages").insert({
    session_id: sessionId, user_id: userId, role: "user",
    content: sanitizedMessage,
    ...(source_channel ? { source_channel } : {}),
  });

  // Stream response
  const pendingStream = new ReadableStream({
    async start(controller) {
      const chunks = responseContent.match(/.{1,50}/g) || [responseContent];
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
      }
      await supabase.from("agent_chat_messages").insert({
        session_id: sessionId, user_id: userId, role: "assistant",
        content: responseContent, is_error: false,
        tool_calls: [{ name: pendingAction.tool, arguments: pendingAction.args }],
        tool_results: [{ name: pendingAction.tool, result: result }],
      });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });

  return new Response(pendingStream, { headers: { ...corsHeaders, ...SSE_HEADERS } });
}
