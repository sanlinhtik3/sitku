// ═══ P2: Local Response Templates ═══
// Skip LLM synthesis for predictable tool results
// v17.3.0: Expanded with rich write-action templates

export interface TemplateResult {
  matched: boolean;
  response: string;
}

/**
 * Attempts to generate a response from a local template.
 * Returns {matched: true, response} if template handled it,
 * or {matched: false, response: ""} to fall through to LLM.
 */
export function tryLocalTemplate(
  toolName: string,
  toolResult: any,
  botName: string,
  botEmoji: string,
): TemplateResult {
  const noMatch: TemplateResult = { matched: false, response: "" };
  
  if (!toolResult || toolResult.error) return noMatch;

  try {
    switch (toolName) {
      case "get_user_info":
        return templateGetUserInfo(toolResult, botName, botEmoji);
      case "get_my_config":
        return templateGetMyConfig(toolResult, botName, botEmoji);
      case "check_my_health":
        return templateCheckMyHealth(toolResult, botName, botEmoji);
      case "manage_flowstate":
        return templateManageFlowstate(toolResult, botName, botEmoji);
      case "manage_workspace_task":
        return templateManageWorkspaceTask(toolResult, botName, botEmoji);
      case "schedule_task":
        return templateScheduleTask(toolResult, botName, botEmoji);
      default:
        return noMatch;
    }
  } catch (e) {
    console.warn(`[LocalTemplate] Error in template for ${toolName}:`, e);
    return noMatch;
  }
}

// ═══ Helper: format date nicely ═══
function fmtDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

function fmtAmount(amount: any, currency?: string): string {
  const cur = currency || "MMK";
  return `${Number(amount || 0).toLocaleString()} ${cur}`;
}

// ═══ MANAGE FLOWSTATE — All Actions ═══
function templateManageFlowstate(result: any, botName: string, emoji: string): TemplateResult {
  const action = result.action;

  // GET BALANCE
  if (action === "get_balance" || (result.balance !== undefined && !action)) {
    return templateGetBalance(result, botName, emoji);
  }

  // ADD INCOME
  if (action === "add_income" && result.success) {
    const amount = fmtAmount(result.amount || result.recorded_amount, result.currency || result.account_currency);
    const desc = result.description || "ဝင်ငွေ";
    const balance = result.new_balance !== undefined ? fmtAmount(result.new_balance, result.account_currency || result.currency) : null;
    let r = `✅ **${desc}** ${amount} ကို ဝင်ငွေ အဖြစ် မှတ်တမ်းတင်ပြီးပါပြီ ${emoji}\n\n`;
    if (balance) r += `💰 **လက်ကျန်:** ${balance}\n`;
    if (result.category) r += `📂 **အမျိုးအစား:** ${result.category}\n`;
    if (result.date || result.created_at) r += `📅 **ရက်စွဲ:** ${fmtDate(result.date || result.created_at)}\n`;
    r += `\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?`;
    return { matched: true, response: r };
  }

  // ADD EXPENSE
  if (action === "add_expense" && result.success) {
    const amount = fmtAmount(result.amount || result.recorded_amount, result.currency || result.account_currency);
    const desc = result.description || "အသုံးစရိတ်";
    const balance = result.new_balance !== undefined ? fmtAmount(result.new_balance, result.account_currency || result.currency) : null;
    let r = `✅ **${desc}** ${amount} ကို အသုံးစရိတ် အဖြစ် မှတ်တမ်းတင်ပြီးပါပြီ ${emoji}\n\n`;
    if (balance) r += `💰 **လက်ကျန်:** ${balance}\n`;
    if (result.category) r += `📂 **အမျိုးအစား:** ${result.category}\n`;
    if (result.date || result.created_at) r += `📅 **ရက်စွဲ:** ${fmtDate(result.date || result.created_at)}\n`;
    r += `\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?`;
    return { matched: true, response: r };
  }

  // DELETE
  if (action === "delete" && result.success) {
    let r = `🗑️ Transaction ကို ဖျက်ပြီးပါပြီ ${emoji}\n\n`;
    if (result.new_balance !== undefined) r += `💰 **လက်ကျန်:** ${fmtAmount(result.new_balance, result.account_currency)}\n`;
    r += `\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?`;
    return { matched: true, response: r };
  }

  // UPDATE
  if (action === "update" && result.success) {
    let r = `✏️ Transaction ကို ပြင်ဆင်ပြီးပါပြီ ${emoji}\n\n`;
    if (result.updated_fields) r += `📝 **ပြင်ဆင်ချက်:** ${Array.isArray(result.updated_fields) ? result.updated_fields.join(', ') : result.updated_fields}\n`;
    if (result.new_balance !== undefined) r += `💰 **လက်ကျန်:** ${fmtAmount(result.new_balance, result.account_currency)}\n`;
    r += `\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?`;
    return { matched: true, response: r };
  }

  // GET INSIGHTS — pass through to LLM for richer analysis
  if (action === "get_insights") return { matched: false, response: "" };

  // LIST RECENT — pass through to LLM for formatting flexibility
  if (action === "list_recent" || action === "list_subscriptions") return { matched: false, response: "" };

  // Generic success fallback
  if (result.success && result.message) {
    return { matched: true, response: `✅ ${result.message} ${emoji}\n\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?` };
  }

  return { matched: false, response: "" };
}

// ═══ MANAGE WORKSPACE TASK ═══
function templateManageWorkspaceTask(result: any, botName: string, emoji: string): TemplateResult {
  const action = result.action;

  // CREATE
  if (action === "create" && result.success) {
    const title = result.title || result.task_title || "Task";
    let r = `✅ **"${title}"** task ကို create လုပ်ပြီးပါပြီ ${emoji}\n\n`;
    if (result.priority) r += `🎯 **Priority:** ${result.priority}\n`;
    if (result.points) r += `⭐ **Points:** ${result.points}\n`;
    if (result.assignee || result.assigned_to) r += `👤 **Assignee:** ${result.assignee || result.assigned_to}\n`;
    if (result.workspace_name) r += `📁 **Workspace:** ${result.workspace_name}\n`;
    r += `\n💡 နောက်ထပ် task ထပ်ထည့်မလား?`;
    return { matched: true, response: r };
  }

  // COMPLETE
  if (action === "complete" && result.success) {
    const title = result.title || result.task_title || "Task";
    const points = result.points_earned || result.points || 0;
    let r = `🎉 **"${title}"** task complete ဖြစ်ပါပြီ! ${emoji}\n\n`;
    if (points > 0) r += `⭐ **+${points} points** earned!\n`;
    if (result.total_points !== undefined) r += `🏆 **Total Points:** ${result.total_points}\n`;
    r += `\n💪 ကောင်းပါတယ်! နောက်ထပ် ဘာလုပ်မလဲ?`;
    return { matched: true, response: r };
  }

  // DELETE
  if (action === "delete" && result.success) {
    const title = result.title || result.task_title || "Task";
    return { matched: true, response: `🗑️ **"${title}"** task ကို ဖျက်ပြီးပါပြီ ${emoji}\n\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?` };
  }

  // UPDATE
  if (action === "update" && result.success) {
    const title = result.title || result.task_title || "Task";
    let r = `✏️ **"${title}"** task ကို update လုပ်ပြီးပါပြီ ${emoji}\n\n`;
    if (result.updated_fields) r += `📝 **Changes:** ${Array.isArray(result.updated_fields) ? result.updated_fields.join(', ') : result.updated_fields}\n`;
    r += `\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?`;
    return { matched: true, response: r };
  }

  // ASSIGN
  if (action === "assign" && result.success) {
    const title = result.title || result.task_title || "Task";
    const assignee = result.assignee || result.assigned_to || "user";
    return { matched: true, response: `✅ **"${title}"** ကို **${assignee}** ဆီ assign လုပ်ပြီးပါပြီ ${emoji}\n\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?` };
  }

  // LIST / GET_STATUS / GET_LEADERBOARD — pass to LLM for rich formatting
  if (action === "list" || action === "get_status" || action === "get_leaderboard") {
    return { matched: false, response: "" };
  }

  // Generic success
  if (result.success && result.message) {
    return { matched: true, response: `✅ ${result.message} ${emoji}\n\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?` };
  }

  return { matched: false, response: "" };
}

// ═══ SCHEDULE TASK ═══
function templateScheduleTask(result: any, botName: string, emoji: string): TemplateResult {
  const action = result.action;

  // CREATE
  if (action === "create" && result.success) {
    const name = result.display_name || result.name || "Scheduled Task";
    let r = `✅ **"${name}"** ကို schedule လုပ်ပြီးပါပြီ ${emoji}\n\n`;
    if (result.next_run_at) r += `⏰ **Next Run:** ${fmtDate(result.next_run_at)}\n`;
    if (result.cron_expression) r += `🔄 **Schedule:** \`${result.cron_expression}\`\n`;
    if (result.task_type) r += `📋 **Type:** ${result.task_type}\n`;
    r += `\n💡 နောက်ထပ် schedule ထပ်ထည့်မလား?`;
    return { matched: true, response: r };
  }

  // PAUSE
  if (action === "pause" && (result.success || result.verified)) {
    const name = result.display_name || result.name || result.message || "Task";
    return { matched: true, response: `⏸️ **"${name}"** ကို pause လုပ်ပြီးပါပြီ ${emoji}\n\n▶️ ပြန်ဖွင့်ချင်ရင် ပြောပါနော်!` };
  }

  // RESUME
  if (action === "resume" && (result.success || result.verified)) {
    const name = result.display_name || result.name || result.message || "Task";
    let r = `▶️ **"${name}"** ကို resume လုပ်ပြီးပါပြီ ${emoji}\n\n`;
    if (result.next_run_at) r += `⏰ **Next Run:** ${fmtDate(result.next_run_at)}\n`;
    return { matched: true, response: r };
  }

  // DELETE
  if (action === "delete" && (result.success || result.verified)) {
    const name = result.deleted_prompt || result.display_name || result.name || "Task";
    let r = `🗑️ **"${name}"** ကို ဖျက်ပြီးပါပြီ ${emoji}\n\n`;
    if (result.deleted_at) r += `🕐 **Deleted at:** ${fmtDate(result.deleted_at)}\n`;
    if (result.verified) r += `🔍 **Verified:** DB မှာ မရှိတော့ပါ\n`;
    return { matched: true, response: r };
  }

  // COMPLETE
  if (action === "complete" && (result.success || result.verified)) {
    return { matched: true, response: `✅ Scheduled task ကို complete & deactivate လုပ်ပြီးပါပြီ ${emoji}\n\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?` };
  }

  // UPDATE
  if (action === "update" && (result.success || result.verified)) {
    let r = `✏️ Scheduled task ကို update လုပ်ပြီးပါပြီ ${emoji}\n\n`;
    if (result.updated_fields) r += `📝 **Changes:** ${Array.isArray(result.updated_fields) ? result.updated_fields.join(', ') : result.updated_fields}\n`;
    return { matched: true, response: r };
  }

  // LIST — pass to LLM
  if (action === "list") return { matched: false, response: "" };

  // Generic
  if (result.success && result.message) {
    return { matched: true, response: `✅ ${result.message} ${emoji}\n\n💡 နောက်ထပ် ဘာကူညီပေးရမလဲ?` };
  }

  return { matched: false, response: "" };
}

// ═══ GET USER INFO ═══
function templateGetUserInfo(result: any, botName: string, emoji: string): TemplateResult {
  if (result.credits === undefined && result.credit_balance === undefined) {
    return { matched: false, response: "" };
  }

  const credits = result.credits ?? result.credit_balance ?? 0;
  const name = result.name || result.full_name || "မိတ်ဆွေ";
  const totalGen = result.total_generations ?? "";
  
  let response = `${emoji} **${name}** ရဲ့ Profile Info:\n\n`;
  response += `💎 **Credits:** ${credits}\n`;
  if (totalGen !== "") response += `📊 **Total Generations:** ${totalGen}\n`;
  if (result.joined_at || result.created_at) {
    const joinDate = fmtDate(result.joined_at || result.created_at);
    response += `📅 **Member Since:** ${joinDate}\n`;
  }

  return { matched: true, response };
}

// ═══ GET MY CONFIG ═══
function templateGetMyConfig(result: any, botName: string, emoji: string): TemplateResult {
  if (typeof result !== 'object') return { matched: false, response: "" };

  let response = `${emoji} **${botName} Configuration:**\n\n`;
  
  if (result.bot_name) response += `🏷️ **Bot Name:** ${result.bot_name}\n`;
  if (result.bot_emoji) response += `😊 **Emoji:** ${result.bot_emoji}\n`;
  if (result.personality_mode) response += `🎭 **Personality:** ${result.personality_mode}\n`;
  if (result.api_status || result.api_source) response += `🔑 **API:** ${result.api_status || result.api_source}\n`;
  if (result.model) response += `🤖 **Model:** ${result.model}\n`;
  if (result.telegram_connected !== undefined) response += `📱 **Telegram:** ${result.telegram_connected ? '✅ Connected' : '❌ Not connected'}\n`;
  if (result.channels) response += `📢 **Channels:** ${result.channels}\n`;

  return { matched: true, response };
}

// ═══ CHECK MY HEALTH ═══
function templateCheckMyHealth(result: any, botName: string, emoji: string): TemplateResult {
  if (typeof result !== 'object') return { matched: false, response: "" };

  const status = result.status || result.health || 'unknown';
  const statusEmoji = status === 'healthy' || status === 'ok' || status === 'good' ? '💚' : '🟡';
  
  let response = `${emoji} **${botName} Health Report:**\n\n`;
  response += `${statusEmoji} **Status:** ${status}\n`;
  if (result.response_time_ms) response += `⚡ **Response Time:** ${result.response_time_ms}ms\n`;
  if (result.uptime) response += `⏱️ **Uptime:** ${result.uptime}\n`;
  if (result.errors_24h !== undefined) response += `🛡️ **Errors (24h):** ${result.errors_24h}\n`;
  if (result.messages_24h !== undefined) response += `💬 **Messages (24h):** ${result.messages_24h}\n`;

  return { matched: true, response };
}

// ═══ GET BALANCE ═══
function templateGetBalance(result: any, botName: string, emoji: string): TemplateResult {
  const balance = result.balance ?? result.net_balance;
  if (balance === undefined) return { matched: false, response: "" };

  const currency = result.currency || "MMK";
  const income = result.total_income ?? result.income;
  const expense = result.total_expense ?? result.expense;

  let response = `${emoji} **FlowState Balance:**\n\n`;
  response += `💰 **Balance:** ${Number(balance).toLocaleString()} ${currency}\n`;
  if (income !== undefined) response += `📈 **Total Income:** ${Number(income).toLocaleString()} ${currency}\n`;
  if (expense !== undefined) response += `📉 **Total Expense:** ${Number(expense).toLocaleString()} ${currency}\n`;

  return { matched: true, response };
}
