// ═══ Project Titan: Module 1 - Shared Types & Constants ═══
// All interfaces, constants, and utility functions for the agent chat system.

// Attachment structure for multi-modal messages
export interface MessageAttachment {
  type: 'image' | 'audio' | 'file';
  url?: string;
  base64?: string;
  storage_url?: string;
  mime_type: string;
  file_name?: string;
  size_bytes?: number;
  analysis?: {
    type: 'receipt' | 'chart' | 'document' | 'photo';
    extracted_data?: Record<string, unknown>;
  };
}

// ThinkingBlock: Anthropic native extended thinking block (per content_block_start thinking)
export interface ThinkingBlock {
  index: number;       // content_block index from Anthropic
  step?: number;       // agent loop step number
  text: string;        // accumulated thinking text
  startedAt: number;   // Date.now() when block started
  completedAt?: number;
  complete: boolean;   // true when content_block_stop received
}

// CritiqueState: live transparency for the self-critique pre-output layer
export interface CritiqueState {
  status: "idle" | "auditing" | "revising" | "done";
  changed: boolean;
  issues: string[];
  startedAt?: number;
}

// ThinkingStep interface for persistent thinking display
export interface ThinkingStep {
  id: string;
  title: string;
  detail?: string;
  tool_name?: string;
  status: "loading" | "done" | "error";
  timestamp: string;
  startedAt?: string; // v16.6.3: Creation time preserved for duration calc
}

// Strict tool call entry
export interface ToolCallEntry {
  name: string;
  arguments: Record<string, unknown>;
}

// Strict tool result
export interface ToolResult {
  name: string;
  result: Record<string, unknown>;
  error?: string;
}

export interface SubTask {
  id: string;
  status: 'pending' | 'running' | 'success' | 'error';
  text: string;
}

export interface AgentChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  attachments?: MessageAttachment[] | null;
  tool_calls?: ToolCallEntry[];
  tool_results?: ToolResult[];
  thoughts?: ThinkingStep[] | null;
  is_error: boolean;
  created_at: string;
  source_channel?: string | null;
  response_rating?: 'helpful' | 'not_helpful' | 'neutral' | null;
  feedback_text?: string | null;
  feedback_at?: string | null;
  is_shared?: boolean;
  share_uid?: string | null;
  shared_at?: string | null;
  isResearching?: boolean;
  subTasks?: SubTask[];
  isAutonomous?: boolean;
  jobId?: string;
}

export interface AgentChatSession {
  id: string;
  user_id: string;
  title: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  message_count: number;
  metadata: Record<string, unknown>;
  session_instructions?: string | null;
}

export interface CreditsExhaustedError {
  type: 'credits_exhausted' | 'daily_limit';
  dailyLimit: number;
  creditBalance: number;
  creditsRemaining: number;
  resetsAt: string;
  isPro: boolean;
  hasPersonalKey?: boolean;
}

// Completed tool step interface for persistent display
export interface CompletedToolStep {
  id: string;
  name: string;
  label: string;
  status: "success" | "error";
  summary: string;
  result?: Record<string, unknown>;
  timestamp: Date;
}

// Artifact interface for side panel content
export interface Artifact {
  id: string;
  type: "code" | "document" | "report" | "table";
  title: string;
  content: string;
  language?: string;
  createdAt: string;
  version?: number;
}

// Tool config for display
export const TOOL_LABELS: Record<string, string> = {
  search_knowledge_base: "Knowledge Base",
  generate_ai_content: "AI Content",
  manage_ai_content: "My Content",
  manage_flowstate: "FlowState",
  manage_workspace_task: "Workspace",
  get_user_info: "User Info",
  manage_notifications: "Notifications",
  update_agent_settings: "Settings",
  get_app_navigation: "Navigation",
  admin_system_overview: "System Overview",
  admin_user_lookup: "User Lookup",
  recall_episodic_memory: "Memory",
  remember_user_fact: "Remember",
  save_user_fact: "Remember",
  recall_user_facts: "Recall Facts",
  search_user_memories: "Search Memory",
  super_hive_orchestrate: "Hive Mind",
  super_app_omniscience: "Omniscience",
  search_web: "Web Search",
  browser_search: "Web Search",
  search_web_deep: "Deep Search",
  browser_scrape: "Web Scrape",
  browser_read_page: "Read Page",
  generate_image: "Image Gen",
  spawn_sub_agent: "Sub-Agent",
  send_push_notification: "Notification",
  analyze_my_logs: "Log Analysis",
  update_my_instructions: "Self-Improve",
  executeSelfDebug: "Self-Debug",
};

// Format tool result into human-readable summary
export function formatToolSummary(toolName: string, result: unknown): string {
  if (!result) return "Completed";
  try {
    if (typeof result === "string") {
      return result.length > 80 ? result.slice(0, 80) + "..." : result;
    }
    const obj = result as Record<string, unknown>;

    // ═══ generate_image ═══
    if (toolName === "generate_image") {
      if (obj.skipped) return "Image already generated";
      if (obj.image_url) return `Image generated${obj.model_used ? ` (${obj.model_used})` : ""}`;
      return obj.error ? `Error: ${obj.error}` : "Image processing";
    }
    // ═══ search_knowledge_base ═══
    if (toolName === "search_knowledge_base") {
      const count = Array.isArray(obj?.results) ? (obj.results as unknown[]).length : 0;
      return count > 0 ? `${count} result${count > 1 ? "s" : ""} found` : "No results";
    }
    // ═══ manage_flowstate ═══
    if (toolName === "manage_flowstate") {
      if (obj.balance !== undefined) return `Balance: ${(obj.balance as number)?.toLocaleString()} ${(obj.currency as string) || "MMK"}`;
      return (obj.message as string) || "Transaction recorded";
    }
    // ═══ generate_ai_content ═══
    if (toolName === "generate_ai_content") {
      return obj.saved ? "Content saved" : "Content generated";
    }
    // ═══ manage_ai_content ═══
    if (toolName === "manage_ai_content") {
      const count = Array.isArray(obj?.items) ? (obj.items as unknown[]).length : (obj.count as number) || 0;
      if (obj.deleted) return "Content deleted";
      return count > 0 ? `${count} item${count > 1 ? "s" : ""} found` : (obj.message as string) || "Completed";
    }
    // ═══ search_web / browser_search / search_web_deep ═══
    if (toolName === "search_web" || toolName === "browser_search" || toolName === "search_web_deep") {
      const query = (obj?.query as string) || (obj?.search_query as string) || "";
      const count = Array.isArray(obj?.results) ? (obj.results as unknown[]).length : 0;
      const countLabel = count > 0 ? `${count} results` : "Search completed";
      return query ? `"${query.length > 50 ? query.slice(0, 50) + '…' : query}" — ${countLabel}` : countLabel;
    }
    // ═══ browser_scrape / browser_read_page ═══
    if (toolName === "browser_scrape" || toolName === "browser_read_page") {
      return "Page content retrieved";
    }
    // ═══ manage_workspace_task ═══
    if (toolName === "manage_workspace_task") {
      return (obj.message as string) || "Task updated";
    }
    // ═══ recall_episodic_memory / search_user_memories ═══
    if (toolName === "recall_episodic_memory" || toolName === "search_user_memories") {
      const count = Array.isArray(obj?.memories || obj?.results) ? ((obj.memories || obj.results) as unknown[]).length : 0;
      return count > 0 ? `${count} memor${count > 1 ? "ies" : "y"} found` : "No memories found";
    }
    // ═══ remember_user_fact / save_user_fact ═══
    if (toolName === "remember_user_fact" || toolName === "save_user_fact") {
      return "Fact remembered";
    }
    // ═══ recall_user_facts ═══
    if (toolName === "recall_user_facts") {
      const count = Array.isArray(obj?.facts) ? (obj.facts as unknown[]).length : 0;
      return count > 0 ? `${count} fact${count > 1 ? "s" : ""} recalled` : "No facts found";
    }
    // ═══ spawn_sub_agent ═══
    if (toolName === "spawn_sub_agent") {
      return "Sub-agent task completed";
    }
    // ═══ send_push_notification ═══
    if (toolName === "send_push_notification") {
      return obj.sent ? "Notification sent" : "Notification queued";
    }
    // ═══ manage_notifications ═══
    if (toolName === "manage_notifications") {
      const count = Array.isArray(obj?.notifications) ? (obj.notifications as unknown[]).length : (obj.count as number) || 0;
      return `${count} notification${count !== 1 ? "s" : ""} found`;
    }
    // ═══ super tools ═══
    if (toolName === "super_hive_orchestrate") return "Hive orchestration completed";
    if (toolName === "super_app_omniscience") return "System analysis completed";
    // ═══ admin tools ═══
    if (toolName === "admin_system_overview") return "System overview retrieved";
    if (toolName === "admin_user_lookup") return "User lookup completed";
    // ═══ self tools ═══
    if (toolName === "analyze_my_logs") return "Log analysis completed";
    if (toolName === "update_my_instructions") return "Instructions updated";
    if (toolName === "executeSelfDebug") return "Self-diagnostics completed";

    // ═══ Generic fallback — NEVER raw JSON ═══
    if (obj.success !== undefined) return (obj.message as string) || (obj.success ? "Completed" : "Failed");
    if (obj.message && typeof obj.message === "string") return (obj.message as string).slice(0, 80);
    return "Completed";
  } catch {
    return "Completed";
  }
}

// Telemetry data for Resource Monitor
export interface TelemetryData {
  lastLatencyMs: number | null;
  lastTokenUsage: { input: number; output: number } | null;
  streamStartTime: number | null;
  totalTokens: { input: number; output: number };
  toolExecutionCount: number;
  // Relay Telemetry
  relayRound: number;
  totalRelayRounds: number;
  // Deep Think (Reasoning Effort)
  reasoningEffort: string | null;
  reasoningModel: string | null;
  // Device Telemetry
  platform?: string;
  screenWidth?: number;
  screenHeight?: number;
  onlineStatus?: boolean;
  connectionType?: string;
}

// ToolCall UI state type
export interface ToolCallState {
  name: string;
  callId?: string;   // v16.7: Unique call ID for precise matching
  status: "pending" | "running" | "success" | "error";
  result?: Record<string, unknown>;
  context?: string;  // v16.6.0: Human-readable context from backend
}

// ═══ Agent Role Config — shared source of truth ═══
export const AGENT_ROLE_CONFIG: Record<string, { emoji: string; label: string; description: string }> = {
  researcher: { emoji: '🔍', label: 'Research Agent', description: 'Gathers and verifies data from multiple sources' },
  analyst:    { emoji: '📊', label: 'Analysis Agent', description: 'Synthesizes data into actionable insights' },
  writer:     { emoji: '✍️', label: 'Writing Agent',  description: 'Transforms findings into polished content' },
  coder:      { emoji: '💻', label: 'Code Agent',     description: 'Generates and reviews production-quality code' },
  general:    { emoji: '🐝', label: 'General Agent',  description: 'Executes general-purpose task steps' },
};
