import { 
  Zap, Wallet, FileText, MessageSquare, Bot, User, Navigation, Search, Bell, 
  Settings, Brain, BookOpen, Sparkles, Network, Code, Database, Shield, Cog, Send, 
  Globe, Video, Award, FolderTree, Users, Eye, Activity, Lightbulb, ListTodo, Compass,
  Cpu, DollarSign, HeartPulse, Clock, FileDown, Image, LucideIcon
} from "lucide-react";

/**
 * Unified TOOL_CONFIG - Single source of truth for all BeeBot tool icons, labels, and colors.
 * Used by ToolExecutionCard, AgentToolStep, and ThinkingAccordion.
 */
export const TOOL_CONFIG: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  // Content & Knowledge Tools
  generate_ai_content: { icon: Sparkles, label: "AI Content", color: "text-purple-400" },
  manage_ai_content: { icon: FileText, label: "My AI Content", color: "text-purple-400" },
  search_knowledge_base: { icon: Search, label: "Knowledge Base", color: "text-amber-500" },
  search_web: { icon: Globe, label: "Web Search", color: "text-emerald-400" },
  
  // Finance Tools
  manage_flowstate: { icon: Wallet, label: "FlowState", color: "text-green-500" },
  
  // Task & Workspace Tools
  manage_workspace_task: { icon: ListTodo, label: "Workspace Task", color: "text-blue-500" },
  
  // App Feature Tools
  manage_easy_srt: { icon: Video, label: "Easy SRT", color: "text-orange-500" },
  manage_telegram_bot: { icon: Bot, label: "Telegram Bot", color: "text-cyan-500" },
  broadcast_message: { icon: Send, label: "Broadcast", color: "text-cyan-500" },
  schedule_task: { icon: Clock, label: "Scheduler", color: "text-amber-400" },
  
  // User & Navigation Tools
  get_user_info: { icon: User, label: "User Info", color: "text-pink-500" },
  get_app_navigation: { icon: Compass, label: "Navigation", color: "text-indigo-500" },
  manage_notifications: { icon: Bell, label: "Notifications", color: "text-sky-500" },
  update_agent_settings: { icon: Settings, label: "Settings", color: "text-violet-500" },
  get_my_config: { icon: Settings, label: "My Config", color: "text-gray-400" },
  
  // Memory & Learning Tools
  recall_episodic_memory: { icon: Brain, label: "Memory Recall", color: "text-cyan-500" },
  recall_user_facts: { icon: BookOpen, label: "User Memory", color: "text-emerald-500" },
  remember_user_fact: { icon: Lightbulb, label: "Remember", color: "text-yellow-500" },
  self_update_knowledge: { icon: Sparkles, label: "Self-Learning", color: "text-yellow-400" },
  
  // Planning Tools
  super_plan_and_execute: { icon: Code, label: "Vibe Coding", color: "text-blue-500" },
  
  // Admin/Super Agent Tools
  admin_system_overview: { icon: Activity, label: "System Stats", color: "text-rose-500" },
  admin_user_lookup: { icon: Users, label: "User Lookup", color: "text-rose-500" },
  admin_manage_prompts: { icon: FileText, label: "Prompt Studio", color: "text-amber-500" },
  admin_manage_feature_flags: { icon: Cog, label: "Feature Flags", color: "text-violet-500" },
  admin_manage_knowledge_base: { icon: Database, label: "Knowledge Base", color: "text-emerald-500" },
  admin_manage_ai_settings: { icon: Sparkles, label: "AI Settings", color: "text-purple-500" },
  admin_manage_user_data: { icon: Users, label: "User Data", color: "text-pink-500" },
  
  // Inter-Agent Communication
  ask_other_agents: { icon: Send, label: "Ask Network", color: "text-cyan-500" },
  respond_to_agent_query: { icon: MessageSquare, label: "Agent Reply", color: "text-blue-500" },
  check_agent_messages: { icon: Bell, label: "Agent Inbox", color: "text-indigo-500" },
  super_monitor_agent_network: { icon: Eye, label: "Network Monitor", color: "text-orange-500" },
  super_broadcast_notification: { icon: Globe, label: "Broadcast", color: "text-red-500" },
  
  // Super Agent Cognitive Tools
  super_analyze_patterns: { icon: Activity, label: "Pattern Analysis", color: "text-purple-500" },
  super_synthesize_knowledge: { icon: Database, label: "Knowledge Sync", color: "text-emerald-500" },
  super_create_teaching: { icon: BookOpen, label: "Create Teaching", color: "text-blue-500" },
  super_make_decision: { icon: Shield, label: "Decision", color: "text-amber-500" },
  super_read_all_feedback: { icon: MessageSquare, label: "Feedback", color: "text-pink-500" },
  super_app_omniscience: { icon: Eye, label: "App Insight", color: "text-cyan-500" },
  
  // Achievement & Gamification
  check_achievements: { icon: Award, label: "Achievements", color: "text-yellow-500" },
  
  // Course & Learning
  manage_courses: { icon: FolderTree, label: "Courses", color: "text-indigo-500" },
  manage_api_key: { icon: Settings, label: "API Key Manager", color: "text-amber-400" },
  
  // Self-Awareness & God Mode
  check_my_health: { icon: HeartPulse, label: "Health Check", color: "text-rose-400" },
  get_system_vitals: { icon: Activity, label: "System Vitals", color: "text-emerald-400" },
  
  // Agentic Core: Sub-Agent & Browser
  spawn_sub_agent: { icon: Network, label: "Sub-Agent", color: "text-orange-500" },
  browser_scrape: { icon: Globe, label: "Browse Page", color: "text-emerald-400" },
  browser_search: { icon: Search, label: "Web Search", color: "text-blue-400" },
  browser_map: { icon: Compass, label: "Site Map", color: "text-violet-500" },
  
  // File Generation
  generate_file: { icon: FileDown, label: "File Export", color: "text-teal-500" },
  
  // Image Generation
  generate_image: { icon: Image, label: "Image Generation", color: "text-pink-500" },
  
  // Context & Internal Tools
  context_compaction: { icon: Database, label: "Context Optimization", color: "text-amber-500" },
  
  // Guard & Internal Tools (for ThinkingAccordion display)
  deep_research_guard: { icon: Search, label: "Deep Research", color: "text-amber-500" },
  anti_ghost: { icon: Zap, label: "Anti-Ghost", color: "text-orange-400" },
  hallucination_guard: { icon: Shield, label: "Fact Check", color: "text-red-400" },
  quality_gate: { icon: Award, label: "Quality Gate", color: "text-yellow-500" },
  persistence: { icon: Activity, label: "Persistence", color: "text-blue-400" },
  reflection: { icon: Eye, label: "Reflection", color: "text-violet-400" },
  source_exhaustion: { icon: FileText, label: "Source Analysis", color: "text-teal-400" },
};

/** Default config for unknown tools */
export const DEFAULT_TOOL_CONFIG = { icon: Zap, label: "Tool", color: "text-muted-foreground" };

/** Get tool config with fallback */
export function getToolConfig(name: string) {
  return TOOL_CONFIG[name] || { ...DEFAULT_TOOL_CONFIG, label: name.replace(/_/g, " ") };
}

/** Get icon for a tool name (used by ThinkingAccordion) */
export function getToolIcon(toolName?: string): LucideIcon {
  if (!toolName) return Brain;
  return TOOL_CONFIG[toolName]?.icon || Brain;
}

/**
 * Format tool result into human-readable summary.
 * Unified version merging ToolExecutionCard's formatResultSummary and AgentToolStep's formatToolSummary.
 */
export function formatToolSummary(name: string, result: any): string {
  if (!result) return "";
  if (typeof result === "string") return result.length > 100 ? result.slice(0, 100) + "..." : result;
  
  // Handle confirmation pending
  if (result.needs_confirmation) return result.message || "Awaiting confirmation...";
  
  switch (name) {
    case "search_knowledge_base": {
      if (result.empty || result.results?.length === 0) return "No results found";
      if (result.results?.length > 0) return `Found ${result.results.length} articles`;
      return "Search completed";
    }
    case "search_web":
    case "browser_search":
    case "search_web_deep": {
      if (result.needs_api_key) return "API Key required";
      if (result.error) return typeof result.error === "string" ? result.error.slice(0, 60) : "Error";
      const count = Array.isArray(result.results) ? result.results.length : (result.source_count || 0);
      return `${count} source${count !== 1 ? 's' : ''} found`;
    }
    case "generate_ai_content": {
      if (result.is_fallback) return "Draft ready (basic)";
      if (result.saved) return "Generated & saved ✓";
      if (result.draft_mode) return "Draft ready ✓";
      if (result.success) return "Generated ✓";
      break;
    }
    case "manage_flowstate": {
      if (result.new_balance !== undefined) {
        return `Balance: ${result.new_balance.toLocaleString()} ${result.account_currency || "MMK"}`;
      }
      if (result.balance !== undefined) {
        return `Balance: ${result.balance?.toLocaleString()} ${result.currency || "MMK"}`;
      }
      if (result.accounts) return `${result.accounts.length} accounts`;
      if (result.transactions) return `${result.transactions.length} transactions`;
      if (result.monthly_expense !== undefined) {
        return `Expense: ${result.monthly_expense.toLocaleString()}`;
      }
      break;
    }
    case "manage_workspace_task": {
      if (result.task_id) return "Task created ✓";
      if (result.task?.title) return `Task: ${result.task.title}`;
      if (result.tasks) return `${result.tasks.length} tasks`;
      if (result.points_earned) return `+${result.points_earned} points`;
      if (result.pending !== undefined) return `${result.pending} pending, ${result.completed || 0} done`;
      break;
    }
    case "manage_ai_content": {
      if (result.count !== undefined) return `${result.count} items`;
      if (result.items) return `${result.items.length} items`;
      break;
    }
    case "get_user_info": {
      if (result.balance !== undefined) return `Credits: ${result.balance}`;
      if (result.full_name) return result.full_name;
      if (result.name || result.email) return result.name || result.email;
      break;
    }
    case "manage_notifications": {
      if (result.unread_count !== undefined) {
        return result.unread_count > 0 ? `${result.unread_count} unread` : "No new notifications";
      }
      if (result.notifications) return `${result.notifications.length} notifications`;
      break;
    }
    case "get_app_navigation": {
      if (result.name) return result.name;
      break;
    }
    case "update_agent_settings": {
      if (result.message) return result.message;
      if (result.new_name) return `Name: ${result.new_name}`;
      break;
    }
    case "check_my_health": {
      if (result.verdict === "no_data") return "No recent data";
      if (result.verdict) return `${result.verdict === "healthy" ? "✅" : result.verdict === "degraded" ? "⚠️" : "🔴"} ${result.verdict} (${result.success_rate}% success)`;
      return "Health checked";
    }
    case "get_system_vitals": {
      if (result.system_verdict) return `${result.system_verdict} | Errors: ${result.total_unresolved || 0}`;
      return "Vitals retrieved";
    }
    case "manage_api_key": {
      if (result.exists === true) return `${result.provider} key active`;
      if (result.exists === false) return `No ${result.provider} key`;
      if (result.deleted) return `${result.provider} key deleted`;
      if (result.masked_key) return `${result.provider} key set`;
      return "Key managed";
    }
    case "broadcast_message": {
      if (result.posted) return `Posted to ${result.channel_name}`;
      if (result.channels) return `${result.channels.length} channels`;
      if (result.added) return `Channel added: ${result.channel_name}`;
      if (result.removed) return `Channel removed: ${result.channel_name}`;
      break;
    }
    case "schedule_task": {
      if (result.scheduled) return `Scheduled for ${result.display_time}`;
      if (result.tasks) return `${result.tasks.length} scheduled tasks`;
      if (result.deleted) return "Task cancelled";
      break;
    }
    case "get_my_config": {
      const tg = result.telegram_bot?.configured ? "Telegram: ✅" : "Telegram: ❌";
      const ch = result.broadcast_channels?.length || 0;
      return `${tg}, ${ch} channels`;
    }
    case "spawn_sub_agent": {
      if (result.result?.summary) return `Sub-agent done ✓`;
      if (result.error) return typeof result.error === "string" ? result.error.slice(0, 60) : "Sub-agent failed";
      return "Sub-agent working...";
    }
    case "browser_scrape": {
      if (result.title) return `Scraped: ${result.title.slice(0, 40)}`;
      if (result.success) return "Page scraped ✓";
      if (result.needs_setup) return "Firecrawl setup needed";
      break;
    }
    case "browser_search": {
      if (result.source_count !== undefined) return `${result.source_count} results found`;
      if (result.needs_setup) return "Firecrawl setup needed";
      break;
    }
    case "browser_map": {
      if (result.total_urls !== undefined) return `${result.total_urls} URLs discovered`;
      if (result.needs_setup) return "Firecrawl setup needed";
      break;
    }
    case "generate_file": {
      if (result.filename) return `📄 ${result.filename}.${result.file_type || "file"} ready`;
      return "File generated ✓";
    }
    case "generate_image": {
      if (result.success && result.image_url) return `Image generated (${result.model_used || "AI"})`;
      if (result.skipped) return "Image already generated";
      if (result.error) return typeof result.error === "string" ? result.error.slice(0, 60) : "Generation failed";
      return "Generating image...";
    }
  }
  
  // Fallback summaries
  if (result.success) return result.message || "Success ✓";
  if (result.error) return typeof result.error === "string" ? result.error : "Error occurred";
  return "Done";
}
