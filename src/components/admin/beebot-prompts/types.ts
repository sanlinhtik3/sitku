export interface PromptFile {
  id: string;
  file_name: string;
  display_name: string;
  content: string;
  file_type: 'static' | 'dynamic';
  category: 'core' | 'security' | 'features' | 'user' | 'examples' | 'custom';
  is_active: boolean;
  is_required: boolean;
  order_index: number;
  variables: string[];
  description: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  module_tags: string[];
}

export interface PromptHistory {
  id: string;
  prompt_file_id: string;
  file_name: string;
  content: string;
  version: number;
  changed_by: string | null;
  changed_at: string;
  change_reason: string | null;
}

export interface PromptVariable {
  name: string;
  description: string;
  source: string;
  example?: string;
}

export const PROMPT_VARIABLES: PromptVariable[] = [
  // Core Identity
  { name: 'bot_name', description: "Bot's customized name", source: 'user_agent_settings', example: 'BeeBot' },
  { name: 'bot_emoji', description: "Bot's emoji", source: 'user_agent_settings', example: '🐝' },
  { name: 'bot_username', description: "Bot's Telegram username (auto-healed from getMe)", source: 'bot_settings', example: '@MyBeeBot' },
  { name: 'personality', description: 'Personality mode', source: 'user_agent_settings', example: 'friendly' },
  { name: 'personality_style', description: 'Personality style description', source: 'Runtime', example: 'Be warm and encouraging...' },
  { name: 'personality_emoji_rule', description: 'Emoji usage rule', source: 'Runtime', example: 'Use emojis sparingly' },
  
  // User Context
  { name: 'user_name', description: "User's display name", source: 'profiles', example: 'John' },
  { name: 'credit_balance', description: 'Current credit balance', source: 'user_credits', example: '50' },
  { name: 'current_date', description: 'Current date', source: 'Runtime', example: '2026-02-02' },
  { name: 'current_time', description: 'Current time (telemetry-anchored)', source: 'Runtime', example: '14:30' },
  { name: 'is_admin', description: 'Admin status (for conditional blocks)', source: 'user_roles', example: 'true' },
  
  // Telemetry Variables (Browser Device Context)
  { name: 'user_timezone', description: 'User timezone from browser telemetry', source: 'DeviceContext', example: 'Asia/Bangkok' },
  { name: 'user_local_time', description: 'User local time from browser', source: 'DeviceContext', example: '2:35 PM' },
  { name: 'user_timezone_offset', description: 'UTC offset in minutes', source: 'DeviceContext', example: '-420' },
  { name: 'user_locale', description: 'Browser locale string', source: 'DeviceContext', example: 'en-US' },
  { name: 'time_source', description: 'How timezone was determined', source: 'Runtime', example: 'browser_telemetry' },
  { name: 'timezone_source', description: 'Provenance label for prompt display', source: 'Runtime', example: '✅ Browser Telemetry' },
  
  // Trust System
  { name: 'trust_level', description: "User's trust level (1-4)", source: 'Runtime', example: '2' },
  { name: 'trust_label', description: 'Trust level label', source: 'Runtime', example: 'Regular User' },
  { name: 'trust_level_num', description: 'Trust level number', source: 'Runtime', example: '2' },
  { name: 'trust_permissions', description: 'Trust permissions list', source: 'Runtime', example: '✅ Can skip...' },
  
  // Learning Context
  { name: 'memories', description: 'Stored user facts', source: 'agent_learning_context', example: 'User is a freelancer' },
  { name: 'skills', description: "User's unlocked skills", source: 'agent_skills', example: 'Financial Analyst Level 3' },
  
  // App State
  { name: 'app_state', description: 'App usage context', source: 'Runtime', example: 'Workspaces: 2' },
  { name: 'most_active_feature', description: 'Most used feature', source: 'Runtime', example: 'FlowState' },
  { name: 'workspaces', description: 'Workspace count', source: 'Runtime', example: '2' },
  { name: 'enrolled_courses', description: 'Enrolled course count', source: 'Runtime', example: '3' },
  { name: 'ai_content_count', description: 'AI content count', source: 'Runtime', example: '15' },
  { name: 'recent_transactions', description: 'Recent transaction count', source: 'Runtime', example: '5' },
  
  // API Status
  { name: 'api_source', description: 'API source used', source: 'Runtime', example: 'personal_key' },
  { name: 'model_used', description: 'AI model being used', source: 'Runtime', example: 'gemini-3.5-flash' },
  { name: 'using_personal_key', description: 'Using personal API key', source: 'Runtime', example: 'true' },
  
  // Dynamic Section Variables (pre-built sections)
  { name: 'session_context_section', description: 'Full session context block', source: 'Runtime (assembled)', example: '📅 Current Date: 2026-02-02...' },
  { name: 'memories_section', description: 'Full memories block', source: 'Runtime (assembled)', example: '## MY MEMORIES ABOUT YOU...' },
  { name: 'skills_section', description: 'Full skills block', source: 'Runtime (assembled)', example: '## YOUR UNLOCKED SKILLS...' },
  { name: 'trust_section', description: 'Full trust level block', source: 'Runtime (assembled)', example: '## TRUST LEVEL...' },
  { name: 'app_state_section', description: 'Full app journey block', source: 'Runtime (assembled)', example: '## YOUR APP JOURNEY...' },
  
  // Super Agent Variables
  { name: 'self_improvement_count', description: 'Number of stored self-improvements', source: 'agent_self_improvements', example: '15' },
  { name: 'recent_learnings', description: 'Recent AI learnings summary', source: 'agent_self_improvements', example: 'Response quality improvement...' },
  { name: 'current_confidence', description: 'Current decision confidence', source: 'Runtime', example: '0.85' },
  { name: 'proactive_suggestions', description: 'Pending proactive suggestions', source: 'agent_proactive_suggestions', example: '2 suggestions pending' },
  { name: 'teaching_pending', description: 'Pending teachings count', source: 'agent_teachings', example: '3' },
  { name: 'system_health_status', description: 'Overall system health', source: 'Runtime', example: 'Healthy ✅' },
];

export const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  core: { label: 'Core', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: '🧠' },
  security: { label: 'Security', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: '🔒' },
  features: { label: 'Features', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: '⚡' },
  user: { label: 'User', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: '👤' },
  examples: { label: 'Examples', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: '📝' },
  custom: { label: 'Custom', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: '⚙️' },
};
