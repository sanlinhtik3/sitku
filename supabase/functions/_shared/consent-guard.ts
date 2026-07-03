// ═══ CONSENT GUARD MODULE ═══
// Extracted from agent-chat/index.ts — Phase 2A
// Handles: tool tiers, permissions, confirmations, pending actions, monitoring mode

// ═══ INTERFACES ═══
export interface RequestContext {
  lastUserMessage: string;
}

export interface PendingAction {
  tool: string;
  action: string;
  args: Record<string, any>;
  asked_at: string;
  confirmation_prompt?: string;
}

export interface ToolPermission {
  pattern: string;
  permission: "allow" | "deny";
}

// ═══ WRITE COMMAND KEYWORDS ═══
export const WRITE_COMMAND_KEYWORDS = {
  record: ["မှတ်ပေး", "record", "add expense", "add income", "ထည့်ပေး", "သိမ်းပေး", "save", "မှတ်တမ်းတင်"],
  create: ["ဖန်တီးပေး", "create", "လုပ်ပေး", "တည်ဆောက်", "အသစ်"],
  update: ["ပြင်ပေး", "update", "edit", "ပြောင်းပေး", "modify", "change"],
  delete: ["ဖျက်ပေး", "delete", "remove", "ဖယ်ရှား"],
  confirm: ["ဟုတ်ပါပြီ", "ဟုတ်ကဲ့", "အင်း", "yes", "ok", "confirm", "sure", "ရပါတယ်", "လုပ်ပါ", "မှတ်တမ်းတင်ပေးပါ", "တင်ပေးပါ", "ပို့ပေး", "ပို့", "post it", "send it", "broadcast", "ပြီး", "execute", "လုပ်ပေး", "လုပ်ပေးပါ", "go ahead", "proceed", "do it"],
};

// ═══ WRITE PROTECTED ACTIONS ═══
export const WRITE_PROTECTED_ACTIONS: Record<string, string[]> = {
  manage_flowstate: ["add_income", "add_expense", "update_transaction", "delete_transaction"],
  manage_workspace_task: ["create", "update", "delete", "assign", "complete"],
  manage_ai_content: ["delete"],
  update_agent_settings: [],
  manage_goal: ["create", "pause", "resume", "cancel"],
};

// ═══ THREE-TIER TOOL CLASSIFICATION ═══
export const TOOL_TIERS: Record<string, Record<string, 1 | 2 | 3>> = {
  get_user_info: { "*": 1 },
  search_knowledge_base: { "*": 1 },
  recall_user_facts: { "*": 1 },
  recall_episodic_memory: { "*": 1 },
  get_app_navigation: { "*": 1 },
  manage_notifications: { count_unread: 1, list_recent: 1, mark_read: 2, mark_all_read: 2 },
  manage_ai_content: { count: 1, list: 1, get: 1, delete: 3 },
  manage_flowstate: {
    get_balance: 1, get_insights: 1, list_recent: 1, list_accounts: 1, list_subscriptions: 1,
    add_income: 2, add_expense: 2, create_account: 2,
    update_transaction: 2, delete_transaction: 3, set_default_account: 2,
  },
  manage_workspace_task: {
    list: 1, get_status: 1, get_leaderboard: 1,
    create: 2, complete: 2, assign: 2, update: 2,
    delete: 3,
  },
  remember_user_fact: { "*": 2 },
  manage_memory: {
    list: 1,
    create: 2, update: 2, import_bulk: 2,
    dedupe: 2, archive_stale: 2, promote_to_core: 2, demote_from_core: 2,
    delete: 3,
  },
  save_verbatim_content: { "*": 2 },
  generate_ai_content: { "*": 2 },
  update_agent_settings: { "*": 2 },
  check_achievements: { "*": 1 },
  get_my_config: { "*": 1 },
  self_update_knowledge: { "*": 2 },
  broadcast_message: {
    list_channels: 1, add_channel: 2, remove_channel: 2, set_default: 2,
    post: 3,
  },
  schedule_task: {
    list: 1,
    get: 1,
    create: 2,
    pause: 2,
    resume: 2,
    update: 2,
    complete: 2,
    delete: 3,
  },
  send_push_notification: { "*": 2 },
  manage_goal: {
    list: 1, status: 1,
    create: 2, pause: 2, resume: 2,
    cancel: 3,
  },
  generate_file: { "*": 2 },
  generate_image: { "*": 2 },
  search_web: { "*": 1 },
  browser_search: { "*": 1 },
  browser_scrape: { "*": 1 },
  show_widget: { "*": 1 },
  // ═══ OpenClaw: Self-Hackable Skills ═══
  create_skill: { "*": 2 },
  get_skill_details: { "*": 1 },
  list_my_skills: { "*": 1 },
  execute_skill: { "*": 2 },
  update_skill: { "*": 2 },
  delete_skill: { "*": 3 },
  // ═══ OpenClaw: Cron Manager ═══
  manage_cron: {
    list: 1, status: 1,
    create: 2, update: 2, pause: 2, resume: 2, run_now: 2,
    delete: 3,
  },
  manage_facebook_page: {
    list_pages: 1, get_posts: 1, get_comments: 1, get_page_info: 1,
    add_page: 2, remove_page: 2, set_default: 2,
    post: 3, reply_comment: 3, delete_post: 3,
  },
  // ═══ OpenClaw: Browser Action ═══
  browser_action: {
    navigate: 2, screenshot: 1, extract: 1,
    click: 2, type: 2, scroll: 1, wait: 1,
  },
  // ═══ ADMIN TOOLS: Explicit tier entries (no blanket Tier 3) ═══
  // Read-only admin tools → Tier 1
  admin_system_overview: { "*": 1 },
  admin_user_lookup: { "*": 1 },
  admin_ai_analytics: { "*": 1 },
  admin_view_user_psychology: { "*": 1 },
  run_ai_doctor: { "*": 1 },
  view_doctor_reports: { "*": 1 },
  get_system_vitals: { "*": 1 },
  admin_manage_prompts: { list: 1, get: 1, create: 2, update: 2, delete: 3, reorder: 2 },
  admin_manage_feature_flags: { list: 1, get: 1, update: 2 },
  admin_manage_knowledge_base: { list: 1, get: 1, search: 1, check_status: 1, create: 2, update: 2, sync: 2, delete: 3 },
  admin_manage_ai_settings: { get: 1, update: 2 },
  admin_manage_user_data: { get_user: 1, update_role: 2, remove_role: 3, adjust_credits: 2, ban_user: 3, unban_user: 2 },
  admin_manage_token_quotas: {
    list_all: 1, list_granted_users: 1, get_user: 1,
    grant_tokens: 2, grant_free_access: 2, set_limits: 2, reset_usage: 2, upgrade_plan: 2,
    revoke_free_access: 3, bulk_grant: 3,
  },
  // Super Agent tools
  super_app_omniscience: { "*": 1 },
  super_monitor_agent_network: { "*": 1 },
  super_analyze_response_feedback: { "*": 1 },
  super_analyze_patterns: { "*": 1 },
  super_self_reflect: { "*": 2 },
  super_proactive_suggest: { "*": 2 },
  super_teach_agents: { "*": 2 },
  super_create_sync_pipeline: { create: 2, list: 1, update: 2, disable: 2, delete: 3 },
  super_broadcast_notification: { "*": 2 },
  super_bulk_train: { "*": 2 },
  super_execute_code: { "*": 2 },
  super_plan_and_execute: { "*": 2 },
};

// Admin tools: explicit tier entries instead of blanket Tier 3
// Read-only admin tools = Tier 1, non-destructive writes = Tier 2, destructive = Tier 3
export const ADMIN_TOOL_PREFIXES = ["admin_", "super_"];

export function getToolTier(toolName: string, action?: string, strictMode = false): 1 | 2 | 3 {
  // Check explicit TOOL_TIERS first (even for admin/super tools)
  const toolTiers = TOOL_TIERS[toolName];
  if (toolTiers) {
    const tier = (action && toolTiers[action]) || toolTiers["*"] || 2;
    if (strictMode && tier < 3) return 3;
    return tier;
  }
  
  // Unknown admin/super tools default to Tier 3
  if (ADMIN_TOOL_PREFIXES.some(p => toolName.startsWith(p))) return 3;
  
  // Unknown tools default to Tier 2
  const fallback = 2;
  if (strictMode && fallback < 3) return 3;
  return fallback;
}

// ═══ ALLOWLIST CHECK ═══
export function checkAllowlist(permissions: ToolPermission[], toolName: string, action: string): "allow" | "deny" | null {
  const exact = `${toolName}.${action}`;
  const exactMatch = permissions.find(p => p.pattern === exact);
  if (exactMatch) return exactMatch.permission;
  
  const glob = `${toolName}.*`;
  const globMatch = permissions.find(p => p.pattern === glob);
  if (globMatch) return globMatch.permission;
  
  const toolMatch = permissions.find(p => p.pattern === toolName);
  if (toolMatch) return toolMatch.permission;
  
  return null;
}

// ═══ DB HELPERS ═══
export async function fetchUserPermissions(supabase: any, userId: string): Promise<ToolPermission[]> {
  const { data } = await supabase
    .from("agent_tool_permissions")
    .select("pattern, permission")
    .eq("user_id", userId);
  return (data || []) as ToolPermission[];
}

export async function fetchStrictMode(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_agent_settings")
    .select("strict_mode")
    .eq("user_id", userId)
    .single();
  return data?.strict_mode ?? false;
}

// ═══ CONFIRMATION DETECTION ═══
export function isConfirmationMessage(message: string): boolean {
  if (!message) return false;
  const trimmed = message.trim().toLowerCase();
  
  const shortConfirmPatterns = [
    /^(yes|ok|sure|confirm|yep|yeah|yup|aye)\.?$/i,
    /^(ဟုတ်ကဲ့|အင်း|ဟုတ်ပါပြီ|ရပါတယ်|လုပ်ပါ|ကောင်းပါပြီ|ဟုတ်တယ်|မှန်ပါတယ်)\.?$/i,
    /^(မှတ်ပေး|မှတ်တမ်းတင်ပေး|မှတ်တမ်းတင်ပေးပါ|မှတ်ပေးပါ|သိမ်းပေး|သိမ်းပေးပါ)\.?$/i,
    /^(do it|go ahead|proceed|execute|record it|save it)\.?$/i,
    /^(တင်ပေး|တင်ပေးပါ|လုပ်ပေး|လုပ်ပေးပါ)\.?$/i,
  ];
  
  for (const pattern of shortConfirmPatterns) {
    if (pattern.test(trimmed)) return true;
  }
  
  if (trimmed.length < 30) {
    return WRITE_COMMAND_KEYWORDS.confirm.some(kw => trimmed.includes(kw.toLowerCase()));
  }
  
  return false;
}

// ═══ SMART AUTO-EXECUTE ═══
export const AUTO_EXECUTE_PATTERNS: Record<string, RegExp[]> = {
  record: [
    /record\s*(လုပ်|ပေး|it|this|ပါ)?/i,
    /မှတ်(ပေး|တမ်းတင်|ထား)/i,
    /သိမ်း(ပေး|ထား)?/i,
    /add\s*(this\s*)?(expense|income|ငွေ)/i,
    /save\s*(it|this)?/i,
    /ထည့်(ပေး|ထား)?/i,
    /log\s*(it|this)?/i,
    /တင်ပေး/i,
    /မှတ်တမ်းတင်/i,
  ],
  broadcast: [
    /ပို့(ပေး|ပါ|လိုက်)?/i,
    /post\s*(it|this|now)?/i,
    /send\s*(it|this|now|to)?/i,
    /broadcast\s*(it|this|now|to)?/i,
    /ကြေငြာ(ပေး|ပါ)?/i,
    /ထပ်ပို့/i,
    /ပြန်ပို့/i,
  ],
};

export function shouldAutoExecute(userMessage: string, toolName: string, args: any): boolean {
  if (!userMessage) return false;

  // Auto-execute all Tier 1 tools (read-only, zero risk)
  const tier = getToolTier(toolName, args?.action);
  if (tier === 1) {
    console.log(`[SmartConfirm] Auto-executing Tier 1 tool: ${toolName}`);
    return true;
  }

  // Auto-execute content generation (user explicitly asked to create content)
  if (toolName === "generate_ai_content") {
    console.log(`[SmartConfirm] Auto-executing content generation: ${toolName}`);
    return true;
  }

  // Auto-execute image generation
  if (toolName === "generate_image") {
    console.log(`[SmartConfirm] Auto-executing image generation: ${toolName}`);
    return true;
  }

  // Auto-execute non-destructive agent settings updates when user explicitly asked
  if (toolName === "update_agent_settings") {
    const settingsRE = /change|ပြောင်း|set|update|call you|call me|rename|နာမည်|name/i;
    if (settingsRE.test(userMessage)) {
      console.log(`[SmartConfirm] Auto-executing agent settings update`);
      return true;
    }
  }

  // Auto-execute send_push_notification when user explicitly said "ပို့"
  if (toolName === "send_push_notification") {
    const sendRE = /ပို့|send|notify|အကြောင်းကြား/i;
    if (sendRE.test(userMessage)) {
      console.log(`[SmartConfirm] Auto-executing push notification`);
      return true;
    }
  }

  // Auto-execute workspace task creation when user explicitly asked
  if (toolName === "manage_workspace_task" && args?.action === "create") {
    const createRE = /create|ဖန်တီး|လုပ်ပေး|add.*task|task.*add|တည်ဆောက်/i;
    if (createRE.test(userMessage)) {
      console.log(`[SmartConfirm] Auto-executing workspace task creation`);
      return true;
    }
  }

  if (toolName === "manage_flowstate" && (args.action === "add_expense" || args.action === "add_income")) {
    const hasAmount = typeof args.amount === "number" && args.amount > 0;
    const hasExplicitRecordCommand = AUTO_EXECUTE_PATTERNS.record.some(pattern => 
      pattern.test(userMessage)
    );
    if (hasAmount && hasExplicitRecordCommand) {
      console.log(`[SmartConfirm] Auto-executing FlowState: amount=${args.amount}, pattern matched`);
      return true;
    }
  }

  if (toolName === "broadcast_message" && (args.action === "post" || (!args.action && args.message))) {
    const hasBroadcastCommand = AUTO_EXECUTE_PATTERNS.broadcast.some(pattern =>
      pattern.test(userMessage)
    );
    if (hasBroadcastCommand && args.message) {
      console.log(`[SmartConfirm] Auto-executing Broadcast: channel=${args.channel_name}`);
      return true;
    }
  }
  
  return false;
}

// ═══ PENDING ACTION HELPERS ═══
export async function getPendingAction(supabase: any, sessionId: string): Promise<PendingAction | null> {
  const { data: session } = await supabase
    .from("agent_chat_sessions")
    .select("metadata")
    .eq("id", sessionId)
    .single();
  
  return session?.metadata?.pending_action || null;
}

export async function savePendingAction(supabase: any, sessionId: string, pendingAction: PendingAction): Promise<void> {
  const { data: session } = await supabase
    .from("agent_chat_sessions")
    .select("metadata")
    .eq("id", sessionId)
    .single();
  
  const existingMetadata = session?.metadata || {};
  
  await supabase
    .from("agent_chat_sessions")
    .update({
      metadata: {
        ...existingMetadata,
        pending_action: pendingAction,
      }
    })
    .eq("id", sessionId);
  
  console.log(`[PendingAction] Saved: tool=${pendingAction.tool}, action=${pendingAction.action}`);
}

export async function clearPendingAction(supabase: any, sessionId: string): Promise<void> {
  const { data: session } = await supabase
    .from("agent_chat_sessions")
    .select("metadata")
    .eq("id", sessionId)
    .single();
  
  const existingMetadata = session?.metadata || {};
  delete existingMetadata.pending_action;
  
  await supabase
    .from("agent_chat_sessions")
    .update({ metadata: existingMetadata })
    .eq("id", sessionId);
  
  console.log(`[PendingAction] Cleared for session ${sessionId}`);
}

// ═══ CONFIRMATION PROMPT GENERATOR ═══
export function generateConfirmationPrompt(toolName: string, args: any, botEmoji: string = "🐝"): string {
  if (toolName === "manage_flowstate") {
    const amount = args.amount?.toLocaleString() || "?";
    const currency = args.currency || "MMK";
    const desc = args.description || (args.action === "add_income" ? "ဝင်ငွေ" : "အသုံးစရိတ်");
    const actionType = args.action === "add_income" ? "ဝင်ငွေ" : "အသုံးစရိတ်";
    return `${desc} ${amount} ${currency} ကို FlowState မှာ ${actionType} အဖြစ် မှတ်တမ်းတင်ပေးရမလား? ${botEmoji}`;
  }
  
  if (toolName === "manage_workspace_task") {
    const title = args.title || "task";
    if (args.action === "create") return `"${title}" task ကို Workspace မှာ create လုပ်ပေးရမလား? ${botEmoji}`;
    if (args.action === "complete") return `"${title}" task ကို complete လုပ်ပေးရမလား? ${botEmoji}`;
    return `ဒီ task ကို ${args.action} လုပ်ပေးရမလား? ${botEmoji}`;
  }
  
  if (toolName === "update_agent_settings") {
    const changes: string[] = [];
    if (args.new_name) changes.push(`နာမည်ကို "${args.new_name}"`);
    if (args.new_emoji) changes.push(`emoji ကို ${args.new_emoji}`);
    if (args.personality_mode) changes.push(`personality ကို ${args.personality_mode}`);
    return `Settings ကို ပြောင်းပေးရမလား? (${changes.join(", ")}) ${botEmoji}`;
  }

  if (toolName === "broadcast_message") {
    return `"${args.channel_name || 'default channel'}" ကို message ပို့ပေးရမလား? ${botEmoji}`;
  }

  if (toolName === "schedule_task") {
    if (args.action === "delete") return `ဒီ scheduled task ကို ဖျက်ပေးရမလား? ${botEmoji}`;
    return `"${args.prompt || 'task'}" ကို ${args.time_desc || 'later'} မှာ schedule လုပ်ပေးရမလား? ${botEmoji}`;
  }
  
  return `ဒီလုပ်ဆောင်ချက်ကို execute လုပ်ပေးရမလား? ${botEmoji}`;
}

export function hasExplicitCommand(userMessage: string, toolName: string, action?: string): boolean {
  if (!userMessage) return false;
  const lowerMessage = userMessage.toLowerCase();
  
  if (WRITE_COMMAND_KEYWORDS.confirm.some(kw => lowerMessage.includes(kw.toLowerCase()))) return true;
  
  if (action) {
    if (action.includes("add") || action.includes("income") || action.includes("expense")) {
      return WRITE_COMMAND_KEYWORDS.record.some(kw => lowerMessage.includes(kw.toLowerCase()));
    }
    if (action === "create") return WRITE_COMMAND_KEYWORDS.create.some(kw => lowerMessage.includes(kw.toLowerCase()));
    if (action === "update") return WRITE_COMMAND_KEYWORDS.update.some(kw => lowerMessage.includes(kw.toLowerCase()));
    if (action === "delete") return WRITE_COMMAND_KEYWORDS.delete.some(kw => lowerMessage.includes(kw.toLowerCase()));
    if (action === "post") {
      const postKeywords = ["ပို့", "post", "send", "broadcast", "ကြေငြာ", "ထပ်ပို့", "ပြန်ပို့"];
      return postKeywords.some(kw => lowerMessage.includes(kw.toLowerCase()));
    }
  }
  
  if (toolName === "update_agent_settings") {
    const settingsKeywords = ["change", "ပြောင်း", "set", "update", "call you", "call me", "rename", "နာမည်ပြောင်း", "my name is", "name is"];
    return settingsKeywords.some(kw => lowerMessage.includes(kw.toLowerCase()));
  }
  
  return Object.values(WRITE_COMMAND_KEYWORDS)
    .flat()
    .some(kw => lowerMessage.includes(kw.toLowerCase()));
}

export function isWriteAction(toolName: string, action?: string): boolean {
  const protectedActions = WRITE_PROTECTED_ACTIONS[toolName];
  if (!protectedActions) return false;
  if (protectedActions.length === 0) return true;
  return action ? protectedActions.includes(action) : false;
}

// ═══ MONITORING MODE HELPERS ═══
export async function saveMonitoringGoal(supabase: any, sessionId: string, goalId: string): Promise<void> {
  await supabase.rpc("toggle_monitoring_goal", { p_session_id: sessionId, p_goal_id: goalId });
  console.log(`[MonitoringMode] Set goal ${goalId} on session ${sessionId}`);
}

export async function clearMonitoringGoal(supabase: any, sessionId: string): Promise<void> {
  await supabase.rpc("toggle_monitoring_goal", { p_session_id: sessionId, p_goal_id: null });
  console.log(`[MonitoringMode] Cleared for session ${sessionId}`);
}

export async function getMonitoringGoalId(supabase: any, sessionId: string): Promise<string | null> {
  const { data: session } = await supabase
    .from("agent_chat_sessions")
    .select("metadata")
    .eq("id", sessionId)
    .single();
  return session?.metadata?.monitoring_goal_id || null;
}
