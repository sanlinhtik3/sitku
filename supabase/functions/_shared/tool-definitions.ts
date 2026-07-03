
// ═══ TOOL DEFINITIONS — COMPRESSED v2 ═══

// ═══ PHASE C: Tool Risk Classification (Claude-Inspired) ═══
// LOW = read-only, safe to auto-execute always
// MEDIUM = generates content or modifies non-critical data
// HIGH = financial mutations, deletions, broadcasts — extra guard
export type ToolRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const TOOL_RISK_MAP: Record<string, ToolRiskLevel | Record<string, ToolRiskLevel>> = {
  // ─── READ-ONLY: Always safe ───
  get_user_info: 'LOW',
  search_knowledge_base: 'LOW',
  recall_user_facts: 'LOW',
  recall_episodic_memory: 'LOW',
  recall_session_history: 'LOW',
  export_agentic_data: 'LOW',
  manage_consultant: {
    list_posts: 'LOW', get_post: 'LOW', list_metrics: 'LOW', list_finance: 'LOW',
    dashboard_summary: 'LOW', post_leaderboard: 'LOW', finance_summary: 'LOW',
    create_post: 'MEDIUM', update_post: 'MEDIUM',
    add_metrics: 'MEDIUM', update_metrics: 'MEDIUM',
    add_finance: 'MEDIUM', update_finance: 'MEDIUM',
    delete_post: 'HIGH', delete_metrics: 'HIGH', delete_finance: 'HIGH',
  },
  get_app_navigation: 'LOW',
  check_achievements: 'LOW',
  get_my_config: 'LOW',
  check_my_health: 'LOW',
  audit_ai_usage: 'LOW',
  analyze_my_logs: 'LOW',
  query_agent_network: 'LOW',
  check_agent_messages: 'LOW',
  get_skill_details: 'LOW',
  browser_search: 'LOW',
  browser_scrape: 'LOW',
  browser_map: 'LOW',
  search_web: 'LOW',
  
  // ─── MEDIUM: Content generation, non-destructive writes ───
  generate_ai_content: 'MEDIUM',
  save_verbatim_content: 'MEDIUM',
  remember_user_fact: 'MEDIUM',
  update_agent_settings: 'MEDIUM',
  generate_image: 'MEDIUM',
  generate_file: 'MEDIUM',
  show_widget: 'MEDIUM',
  compose_dashboard: 'MEDIUM',
  self_update_knowledge: 'MEDIUM',
  fetch_external_api: 'MEDIUM',
  share_to_agent_network: 'MEDIUM',
  ask_other_agents: 'MEDIUM',
  respond_to_agent_query: 'MEDIUM',
  spawn_sub_agent: 'MEDIUM',
  
  // ─── HIGH: Financial mutations, deletions, broadcasts ───
  manage_flowstate: {
    get_balance: 'LOW', get_insights: 'LOW', list_recent: 'LOW',
    list_accounts: 'LOW', list_subscriptions: 'LOW',
    add_income: 'MEDIUM', add_expense: 'MEDIUM', create_account: 'MEDIUM',
    set_default_account: 'MEDIUM',
    update_transaction: 'HIGH', delete_transaction: 'HIGH',
  },
  manage_budget: {
    list: 'LOW', status: 'LOW',
    create: 'MEDIUM', update: 'MEDIUM',
    delete: 'HIGH',
  },
  manage_investment: {
    list: 'LOW', portfolio_summary: 'LOW',
    add_holding: 'MEDIUM', update_price: 'MEDIUM',
    remove: 'HIGH',
  },
  financial_report: 'LOW',
  tax_estimate: {
    get_profile: 'LOW', estimate_current_year: 'LOW',
    setup_profile: 'MEDIUM',
  },
  manage_workspace_task: {
    list: 'LOW', get_status: 'LOW', get_leaderboard: 'LOW',
    create: 'MEDIUM', complete: 'MEDIUM', assign: 'MEDIUM', update: 'MEDIUM',
    delete: 'HIGH',
  },
  manage_ai_content: {
    count: 'LOW', list: 'LOW', get: 'LOW',
    delete: 'HIGH',
  },
  manage_notifications: {
    count_unread: 'LOW', list_recent: 'LOW',
    mark_read: 'MEDIUM', mark_all_read: 'MEDIUM',
  },
  broadcast_message: {
    list_channels: 'LOW', preview: 'LOW', verify_channel: 'LOW',
    list_recent_posts: 'LOW', health_check: 'LOW',
    add_channel: 'MEDIUM', remove_channel: 'MEDIUM', set_default: 'MEDIUM',
    post: 'HIGH', edit: 'HIGH', delete: 'HIGH',
    post_to_all: 'CRITICAL', reset: 'CRITICAL',
  },
  schedule_task: {
    list: 'LOW', get: 'LOW',
    create: 'MEDIUM', pause: 'MEDIUM', resume: 'MEDIUM', update: 'MEDIUM', complete: 'MEDIUM',
    delete: 'HIGH',
  },
  manage_scheduled_task_health: 'LOW',
  repair_scheduled_task: {
    add_success_criteria: 'MEDIUM', enforce_freshness: 'MEDIUM', re_run_now: 'MEDIUM',
    deactivate: 'HIGH',
  },
  manage_goal: {
    list: 'LOW', status: 'LOW',
    create: 'MEDIUM', pause: 'MEDIUM', resume: 'MEDIUM',
    cancel: 'HIGH',
  },
  manage_api_key: 'HIGH',
  reset_telegram_config: 'HIGH',
  spawn_autonomous_job: 'MEDIUM',
  self_debug: 'MEDIUM',
  update_my_instructions: 'MEDIUM',
  manage_notion: {
    search: 'LOW', get_page: 'LOW', list_databases: 'LOW', query_database: 'LOW',
    create_page: 'MEDIUM', update_page: 'MEDIUM', append_blocks: 'MEDIUM',
    delete_block: 'HIGH',
  },
};

// Resolve risk level for a tool + action pair
export function getToolRiskLevel(toolName: string, action?: string): ToolRiskLevel {
  const entry = TOOL_RISK_MAP[toolName];
  if (!entry) return 'MEDIUM'; // unknown tools default to MEDIUM
  if (typeof entry === 'string') return entry;
  // Action-based lookup
  if (action && entry[action]) return entry[action];
  return 'MEDIUM'; // unknown action defaults to MEDIUM
}

export const BASE_TOOLS = [
  {
    type: "function",
    function: {
      name: "generate_ai_content",
      description: "Generate AI content (articles, captions, scripts). Returns DRAFT for review. For saving user's own text as-is, use save_verbatim_content instead.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Topic or instruction for content generation" },
          tone: { type: "string", enum: ["casual", "professional", "tough-love", "friendly"] },
          style: { type: "string", enum: ["blog post", "article", "caption", "script", "thread", "informative", "video_script", "facebook_caption", "educational_guide", "news_update"] },
          language: { type: "string", enum: ["burmese", "english"] },
          category: { type: "string", enum: ["general", "crypto", "education", "finance", "technology", "lifestyle"] },
          tags: { type: "array", items: { type: "string" } },
          save_to_my_content: { type: "boolean", description: "Default FALSE. When saving user text, content must be user's EXACT words." },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_ai_content",
      description: "Query, count, list, or delete user's saved AI Content.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["count", "list", "get", "delete"] },
          limit: { type: "number" },
          content_id: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_flowstate",
      description: "Manage personal finances. Only when user EXPLICITLY asks to record/check finances. For add_income/add_expense: ALWAYS confirm first.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["add_income", "add_expense", "get_balance", "get_insights", "list_recent", "update_transaction", "delete_transaction", "list_accounts", "list_subscriptions", "create_account", "set_default_account"] },
          amount: { type: "number" },
          currency: { type: "string", enum: ["MMK", "USD", "THB"] },
          description: { type: "string" },
          category: { type: "string", enum: ["food_drink", "transport", "shopping", "bills", "entertainment", "health", "education", "salary", "business", "gift", "other"] },
          transaction_id: { type: "string" },
          date_range: { type: "string", enum: ["today", "this_week", "this_month", "last_month"] },
          account_name: { type: "string" },
          account_type: { type: "string", enum: ["cash", "bank", "mobile_wallet", "crypto"] },
          account_id: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_budget",
      description: "Plan and track spending budgets per category or overall. Use 'status' for spend-vs-budget snapshot with alerts. Confirm before create/update/delete.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "list", "update", "delete", "status"] },
          budget_id: { type: "string" },
          name: { type: "string", description: "e.g. 'Food monthly cap'" },
          period: { type: "string", enum: ["weekly", "monthly", "yearly"] },
          category: { type: "string", description: "Optional. Omit for overall budget. Names: food_drink, transport, shopping, bills, entertainment, health, education, business, other" },
          amount: { type: "number" },
          currency: { type: "string", enum: ["MMK", "USD", "THB"] },
          alert_threshold_pct: { type: "number", description: "Default 80. Alerts when spending crosses this percentage." },
          is_active: { type: "boolean" },
          notes: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_investment",
      description: "Track investment holdings (crypto, stocks, gold, funds). 'portfolio_summary' returns P&L, allocation, winners/losers. For fresh prices, use web_search then call update_price.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["add_holding", "update_price", "list", "remove", "portfolio_summary"] },
          investment_id: { type: "string" },
          symbol: { type: "string", description: "e.g. BTC, AAPL, GOLD" },
          asset_type: { type: "string", enum: ["crypto", "stock", "gold", "fund", "cash", "real_estate", "bond", "other"] },
          quantity: { type: "number" },
          avg_cost_per_unit: { type: "number" },
          current_price: { type: "number" },
          currency: { type: "string", enum: ["MMK", "USD", "THB"] },
          account_id: { type: "string" },
          notes: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "financial_report",
      description: "Smart financial reports with chart-ready data. 'period' = full P&L for a range. 'category_breakdown' = expense split. 'cashflow_forecast' = projected balances. 'compare_periods' = A vs B.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["period", "category_breakdown", "cashflow_forecast", "compare_periods"] },
          range: { type: "string", enum: ["today", "this_week", "last_week", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "last_year", "last_30_days", "custom"] },
          start_date: { type: "string", description: "YYYY-MM-DD, only for range=custom" },
          end_date: { type: "string", description: "YYYY-MM-DD, only for range=custom" },
          category: { type: "string", description: "Optional filter for category_breakdown" },
          months_ahead: { type: "number", description: "1-12, for cashflow_forecast (default 3)" },
          period_a: { type: "string", enum: ["this_week", "last_week", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "last_year"] },
          period_b: { type: "string", enum: ["this_week", "last_week", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "last_year"] },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tax_estimate",
      description: "Estimate income tax based on user's recorded income & jurisdiction. Default brackets shipped for MM (Myanmar PIT 2024), TH, US. Always include accountant disclaimer.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["setup_profile", "get_profile", "estimate_current_year"] },
          country_code: { type: "string", description: "ISO-2 code: MM, TH, US, etc." },
          tax_year_start_month: { type: "number", description: "1-12. Myanmar=4 (Apr-Mar)." },
          filing_status: { type: "string", description: "individual, married_joint, etc." },
          allowances: { type: "object", description: "{ basic: number, dependents: number, ... }" },
          custom_brackets: { type: "array", description: "Override: [{upTo: number|null, rate: 0..1}, ...]" },
          currency: { type: "string", enum: ["MMK", "USD", "THB"] },
          notes: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  // ═══ 💼 CFO TOOLS — Strategic Finance Suite ═══
  {
    type: "function",
    function: {
      name: "cfo_cashflow_forecast",
      description: "💼 CFO: Project income vs expense for next N months from FlowState data. Returns widget-ready dashboard payload (KPI + line chart). After calling, MUST pass result.widget to show_widget.",
      parameters: { type: "object", properties: {
        months_ahead: { type: "number", description: "1-24 months. Default 6." },
        currency: { type: "string", enum: ["MMK", "USD", "THB"], description: "Default MMK." },
      }, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "cfo_runway_analysis",
      description: "💼 CFO: Compute runway = cash / monthly burn from FlowState data. Returns dashboard with KPIs (Cash, Burn, Runway, Health) + color-coded gantt of remaining months. Pass result.widget to show_widget.",
      parameters: { type: "object", properties: {
        currency: { type: "string", enum: ["MMK", "USD", "THB"] },
      }, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "cfo_unit_economics",
      description: "💼 CFO: Compute unit economics — LTV/CAC ratio and payback period. User supplies CAC and ARPU (and optional gross_margin_pct, churn_pct). Returns scorecard widget. Pass result.widget to show_widget.",
      parameters: { type: "object", properties: {
        cac: { type: "number", description: "Customer acquisition cost" },
        arpu: { type: "number", description: "Average revenue per user (per period)" },
        gross_margin_pct: { type: "number", description: "Default 70" },
        churn_pct: { type: "number", description: "Monthly churn %, default 5" },
        currency: { type: "string", enum: ["MMK", "USD", "THB"] },
      }, required: ["cac", "arpu"] },
    },
  },
  {
    type: "function",
    function: {
      name: "cfo_pnl_summary",
      description: "💼 CFO: Period P&L summary from FlowState — Revenue, Expense, Net, Margin %, plus expense breakdown by category. Returns composite dashboard widget. Pass result.widget to show_widget.",
      parameters: { type: "object", properties: {
        days: { type: "number", description: "Lookback in days (1-365). Default 30." },
        currency: { type: "string", enum: ["MMK", "USD", "THB"] },
      }, required: [] },
    },
  },
  // ═══ 🧭 STRATEGY CONSULTING TOOLS ═══
  {
    type: "function",
    function: {
      name: "strategy_swot_analysis",
      description: "🧭 Strategy: Build a SWOT (Strengths, Weaknesses, Opportunities, Threats). Returns 4-quadrant dashboard widget. Pass result.widget to show_widget.",
      parameters: { type: "object", properties: {
        title: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        weaknesses: { type: "array", items: { type: "string" } },
        opportunities: { type: "array", items: { type: "string" } },
        threats: { type: "array", items: { type: "string" } },
      }, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "strategy_porter_five_forces",
      description: "🧭 Strategy: Score Porter's Five Forces (1=weak, 5=strong) and visualize as network graph + scorecard. Pass result.widget to show_widget.",
      parameters: { type: "object", properties: {
        firm: { type: "string", description: "Firm/business name" },
        rivalry: { type: "number" },
        supplier_power: { type: "number" },
        buyer_power: { type: "number" },
        substitutes: { type: "number" },
        new_entrants: { type: "number" },
      }, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "strategy_okr_tracker",
      description: "🧭 Strategy: Render OKR tracker — objectives + key results with progress %. Returns dashboard with KPI per objective + progress bars per KR. Pass result.widget to show_widget.",
      parameters: { type: "object", properties: {
        title: { type: "string" },
        objectives: { type: "array", description: "[{name, key_results:[{name, progress 0-100}]}]" },
      }, required: ["objectives"] },
    },
  },
  {
    type: "function",
    function: {
      name: "strategy_roadmap",
      description: "🧭 Strategy: Render strategic roadmap as gantt chart. Pass result.widget to show_widget.",
      parameters: { type: "object", properties: {
        title: { type: "string" },
        initiatives: { type: "array", description: "[{label, start:YYYY-MM-DD, end:YYYY-MM-DD, status?:'completed|active|upcoming'}]" },
      }, required: ["initiatives"] },
    },
  },
  {
    type: "function",
    function: {
      name: "strategy_lean_canvas",
      description: "🧭 Strategy: Render a Lean Canvas (9 blocks). Each block accepts an array of bullet strings. Pass result.widget to show_widget.",
      parameters: { type: "object", properties: {
        title: { type: "string" },
        problem: { type: "array", items: { type: "string" } },
        customer_segments: { type: "array", items: { type: "string" } },
        uvp: { type: "array", items: { type: "string" } },
        solution: { type: "array", items: { type: "string" } },
        channels: { type: "array", items: { type: "string" } },
        revenue_streams: { type: "array", items: { type: "string" } },
        cost_structure: { type: "array", items: { type: "string" } },
        key_metrics: { type: "array", items: { type: "string" } },
        unfair_advantage: { type: "array", items: { type: "string" } },
      }, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_workspace_task",
      description: "Manage workspace tasks. Only when user EXPLICITLY asks. Confirm before create/update/delete.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "complete", "list", "get_status", "update", "delete", "assign", "get_leaderboard"] },
          title: { type: "string" },
          description: { type: "string" },
          points: { type: "number" },
          task_id: { type: "string" },
          assignee_email: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          status: { type: "string", enum: ["pending", "in_progress", "completed"] },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_info",
      description: "Get user account info: credits, IU (Intelligence Units), profile, statistics. Use info_type='iu' for IU balance.",
      parameters: {
        type: "object",
        properties: {
          info_type: { type: "string", enum: ["credits", "iu", "statistics", "profile"] },
        },
        required: ["info_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_agent_settings",
      description: "Update bot name/emoji/personality or user's preferred name. Call IMMEDIATELY for name changes. Do NOT use for recall queries.",
      parameters: {
        type: "object",
        properties: {
          new_name: { type: "string" },
          new_emoji: { type: "string" },
          personality_mode: { type: "string", enum: ["friendly", "professional", "casual", "mentor"] },
          personality_level: { type: "string", enum: ["normal", "sassy", "roast"] },
          custom_instructions: { type: "string" },
          preferred_name: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember_user_fact",
      description: "Store a fact about the user for long-term memory. VERBATIM RULE: fact_value must contain user's exact words. After storing, generate a warm confirmation.",
      parameters: {
        type: "object",
        properties: {
          fact_type: { type: "string", enum: ["preference", "goal", "context", "style", "constraint"] },
          fact_key: { type: "string" },
          fact_value: { type: "string" },
          importance: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["fact_type", "fact_key", "fact_value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_user_facts",
      description: "Retrieve previously stored facts about the user.",
      parameters: {
        type: "object",
        properties: {
          fact_type: { type: "string", enum: ["preference", "goal", "context", "style", "constraint", "all"] },
          limit: { type: "number" },
        },
        required: [],
      },
    },
  },
 {
 type: "function",
 function: {
 name: "recall_episodic_memory",
 description: `MANDATORY tool for ANY question about past conversations. You MUST call this BEFORE answering from memory.

WHEN TO USE (ALWAYS before answering):
- "What did we discuss?" / "ဘာတွေပြောခဲ့လဲ" / "မနေ့က ဘာလုပ်ခဲ့လဲ"
- "What did I say/decide/tell you?" / "ဘာပြောခဲ့လဲ"
- "Yesterday/last week we talked about..." / "မနေ့က..."
- ANY reference to past conversations across ALL sessions

QUERY FORMULATION (CRITICAL):
- Transform user questions into keyword-rich queries (e.g., "What did I say yesterday?" → query="conversation topics decisions", time_range="this_week")
- ALWAYS extract keywords. NEVER just copy the raw user question.

FALLBACK: If vector search returns empty, this tool automatically checks session summaries and raw messages. Call it — it will find something if memories exist.
CRITICAL: If this returns empty, tell the user honestly "ရှာကြည့်ပေမယ့် မတွေ့ဘူးဗျ" — NEVER fabricate past conversations.`,
 parameters: {
 type: "object",
 properties: {
 query: { type: "string", description: "What to search for in memory - describe what user is asking about" },
 time_range: {
 type: "string",
 enum: ["today", "this_week", "this_month", "last_month", "all_time"],
 description: "Time range filter. Use 'this_week' for 'yesterday'/'recent', 'today' for today only. Default: all_time"
 },
 limit: { type: "number", description: "Max results to return (1-10). Default: 5" },
 },
 required: ["query"],
 },
 },
 },
 {
  type: "function",
  function: {
   name: "recall_session_history",
   description: `HERMES TWIN — Postgres full-text search across the user's PAST CHAT SESSIONS, grouped by session, with auto-generated 1-2 sentence digest per session.

WHEN TO USE (prefer over recall_episodic_memory when):
- User mentions a RARE keyword, proper noun, exact phrase, date, code identifier, or quoted text
- User asks "which session did we …" / "ဘယ် session မှာ ပြောခဲ့လဲ" / "ရှာပေး"
- You need fast keyword grounding before answering, not a vector concept search

DIFFERENCES from recall_episodic_memory:
- This is keyword/lexical (FTS), not semantic. Best for exact tokens.
- Returns SESSION digests, not raw passages — good for "which conversation".
- Cheaper and faster than vector recall.`,
   parameters: {
    type: "object",
    properties: {
     query: { type: "string", description: "Keywords or short phrase to search for. Will be tokenized into a tsquery." },
     days: { type: "number", description: "How far back to search in days (1-365). Default 90." },
     max_sessions: { type: "number", description: "Max distinct sessions to return (1-10). Default 5." },
     with_digest: { type: "boolean", description: "Generate a 1-2 sentence LLM digest per session. Default true." },
    },
    required: ["query"],
    },
   },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge_base",
      description: "Search Knowledge Base for information (READ-ONLY). Format response naturally, never show raw JSON.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          category: { type: "string", enum: ["general", "crypto", "education", "finance", "technology", "lifestyle"] },
          limit: { type: "number" },
          language: { type: "string", enum: ["burmese", "english", "any"] },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search live internet for current info (prices, news, weather). Write queries in English. Falls back to browser_search if Tavily unavailable.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          search_depth: { type: "string", enum: ["basic", "advanced"] },
          max_results: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_verbatim_content",
      description: "Save user's own text EXACTLY as-is to My AI Content. ZERO AI generation. Use instead of generate_ai_content for save requests.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "User's EXACT text, character-for-character." },
          title: { type: "string" },
          category: { type: "string", enum: ["general", "crypto", "education", "finance", "technology", "lifestyle"] },
          language: { type: "string", enum: ["burmese", "english"] },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_notifications",
      description: "Check or manage user notifications.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["count_unread", "list_recent", "mark_read", "mark_all_read"] },
          notification_id: { type: "string" },
          limit: { type: "number" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_app_navigation",
      description: "Guide users to specific app features/pages.",
      parameters: {
        type: "object",
        properties: {
          feature: { type: "string", enum: ["ai_content", "flowstate", "workspace", "courses", "easy_srt", "telegram_bot", "credits", "profile", "settings", "referrals", "achievements"] },
        },
        required: ["feature"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_achievements",
      description: "Check user's unlocked achievements and badges.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "check_my_health",
      description: "Check BeeBot's own health, speed, performance, and error stats.",
      parameters: {
        type: "object",
        properties: {
          time_range: { type: "string", enum: ["today", "this_week", "this_month"] },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "audit_ai_usage",
      description: "Audit BeeBot AI usage for a task/request: request count, models, providers, token totals, estimated USD/IU cost, duration, and failures. Use when the user asks how much a task cost, which models/API providers were used, or wants business-model usage accounting.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "Optional autonomous task UUID to audit." },
          client_request_id: { type: "string", description: "Optional client request id / idempotency id to audit." },
          time_range: { type: "string", enum: ["today", "24h", "this_week", "this_month"], description: "Fallback window when no task_id/client_request_id is provided." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "broadcast_message",
      description: "Pro-grade Telegram channel publisher. SUPPORTS: text, photo (with caption), media album (2-10 photos), polls, inline buttons, pin, silent send, edit, delete, scheduled posts. WORKFLOW (mandatory for HIGH-risk actions): (1) If channel ambiguous → call action='list_channels' first and quote names verbatim. (2) For media/buttons/poll/pin/post_to_all → call action='preview' first; show user rendered output + chunk count + link target; wait for explicit confirmation. (3) Then call action='post'. (4) ALWAYS cite the returned `message_id` and `permanent_link` verbatim — NEVER fabricate. (5) On error → quote forensic.solution verbatim, do not improvise. ANTI-HALLUCINATION: Never claim posted unless response has `posted:true` AND a real `message_id`. To answer 'did it post?' use action='list_recent_posts'. Markdown is auto-escaped (Myanmar-safe SENTRY pipeline) — write naturally. To schedule, set `schedule_at` (ISO) or `schedule_recurrence` and the tool creates a heartbeat task with the FULL payload preserved.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["post", "post_to_all", "edit", "delete", "preview", "list_channels", "add_channel", "remove_channel", "set_default", "verify_channel", "list_recent_posts", "health_check", "reset"], description: "preview=render without sending; verify_channel=probe bot admin/can_post without posting; list_recent_posts=audit trail; health_check=all channels at once." },
          // Content
          message: { type: "string", description: "Text body or photo caption. Auto-chunked at 4000 chars (text) or 1024 (photo caption). Markdown auto-escaped — use **bold**, _italic_, `code`, [text](url) naturally." },
          // Targeting
          channel_name: { type: "string", description: "Channel username (with or without @) or stored display name. Fuzzy-matched." },
          channel_id: { type: "string", description: "Telegram numeric chat_id (e.g. -1001234567890)." },
          channel_type: { type: "string", enum: ["telegram"] },
          channels: { type: "array", items: { type: "string" }, description: "Multi-channel post. Names/ids. Used by post_to_all." },
          // Rich post types
          post_type: { type: "string", enum: ["text", "photo", "poll", "media_album"], description: "Defaults to 'text'. Use 'photo' with photo_url+message(caption); 'media_album' with photo_urls (2-10); 'poll' with poll_question+poll_options." },
          photo_url: { type: "string", description: "HTTPS URL or Telegram file_id. Validated via HEAD request before send." },
          photo_urls: { type: "array", items: { type: "string" }, description: "For media_album: 2-10 HTTPS URLs / file_ids. First item carries the caption." },
          poll_question: { type: "string", description: "Poll question (max 300 chars)." },
          poll_options: { type: "array", items: { type: "string" }, description: "2-10 options, each max 100 chars." },
          poll_anonymous: { type: "boolean", description: "Default true." },
          poll_multiple: { type: "boolean", description: "Allow multiple answers. Default false." },
          buttons: { type: "array", items: { type: "object", properties: { text: { type: "string" }, url: { type: "string" } }, required: ["text", "url"] }, description: "Inline URL buttons. URLs must be https:// or tg://." },
          // Behavior
          pin: { type: "boolean", description: "Pin after posting. HIGH-risk — confirm first." },
          silent: { type: "boolean", description: "disable_notification — post without sound. Good for FYI updates." },
          disable_link_preview: { type: "boolean", description: "Hide URL previews in text posts." },
          reply_to_message_id: { type: "number", description: "Reply to a specific message in the channel." },
          parse_mode: { type: "string", enum: ["Markdown", "MarkdownV2", "HTML", "auto"], description: "Default 'auto' — SENTRY pipeline picks best mode." },
          // Edit / Delete
          message_id: { type: "number", description: "Required for action='edit' or 'delete'." },
          // Add channel
          bot_token: { type: "string", description: "Optional dedicated bot token when adding a channel." },
          bot_username: { type: "string" },
          // Scheduling shortcut
          schedule_at: { type: "string", description: "ISO 8601 datetime. If set, the tool creates a scheduled_task with full payload (post_type, photo_url, buttons, pin) preserved — does NOT post immediately." },
          schedule_recurrence: { type: "string", enum: ["one_off", "daily", "weekly", "weekdays", "weekends", "hourly", "interval", "monthly", "custom_cron"], description: "Recurring schedule. Pair with at_time + timezone for accuracy." },
          schedule_at_time: { type: "string", description: "HH:MM in user timezone (for daily/weekly/etc)." },
          schedule_timezone: { type: "string", description: "IANA tz (auto-injected if available)." },
          // Preview
          dry_run: { type: "boolean", description: "Render the post + show next steps without sending. Same as action='preview' when set with action='post'." },
          // Recent posts
          limit: { type: "number", description: "For list_recent_posts: max rows (default 10, max 50)." },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_task",
      description: "CRUD + summary for scheduled tasks/reminders/recurring jobs. ACCURACY MANDATE: For 'create', PREFER structured params (recurrence + at_time + timezone). The 'time_desc' fallback handles English/Burmese natural language but is less precise. ALWAYS pass user's IANA timezone — when user says '8am' that means 8am LOCAL TIME, never UTC. WORKFLOW: For ambiguous time intent, FIRST call with dry_run=true to preview the parsed schedule + next 3 fires, then commit with dry_run=false. ANTI-HALLUCINATION: Always query with list/get/summary before reporting status. AGENT REFERENCING: list/get/summary now return `friendly_label`, `schedule_human` (e.g. 'Every day at 8:00 AM'), `next_run_human` (e.g. 'in 3 hours'), `last_run_status_label` (e.g. '✅ delivered (quality 82)') and `health` ('good'|'degraded'|'failing'). QUOTE THESE VERBATIM in chat — never re-parse cron_expression. Use action='summary' for casual 'what's running?' / 'ဘာတွေ schedule လုပ်ထားလဲ' queries (lighter than 'list').",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "list", "summary", "delete", "pause", "resume", "update", "get", "complete"], description: "summary=compact overview of all automations for casual queries; list=full detail rows; get=single task by id." },
          prompt: { type: "string", description: "What the agent should do when the task fires (required for create)" },
          // Structured schedule (Path A — preferred for accuracy)
          recurrence: { type: "string", enum: ["one_off", "daily", "weekly", "weekdays", "weekends", "hourly", "interval", "monthly", "custom_cron"], description: "Schedule kind. Pair with at_time/weekdays/etc." },
          at_time: { type: "string", description: "Time of day in 24h 'HH:MM' format, in user's timezone (e.g. '08:00', '17:30'). Required for daily/weekly/weekdays/weekends/monthly." },
          weekdays: { type: "array", items: { type: "string", enum: ["sun","mon","tue","wed","thu","fri","sat"] }, description: "For recurrence='weekly'. Example: ['mon','wed','fri']" },
          day_of_month: { type: "number", description: "1-31. For recurrence='monthly'." },
          interval_minutes: { type: "number", description: "For recurrence='interval'. Use values that divide 60 (5,10,15,20,30) for accuracy." },
          interval_hours: { type: "number", description: "For recurrence='interval'. Use values that divide 24 (1,2,3,4,6,8,12)." },
          start_at: { type: "string", description: "ISO 8601 datetime (UTC or with offset). For recurrence='one_off'." },
          end_at: { type: "string", description: "ISO 8601 expiration for recurring tasks (optional)." },
          cron_expression: { type: "string", description: "5-field UTC cron (advanced). Format: 'min hour dom mon dow'. Used when recurrence='custom_cron'." },
          // Natural language fallback (Path B)
          time_desc: { type: "string", description: "Natural language fallback: 'every day at 8am', 'in 30 minutes', 'every Monday at 9am', 'tomorrow 9am', 'နေ့တိုင်း ၈နာရီ'. Use only if structured params don't fit." },
          // Common
          timezone: { type: "string", description: "IANA timezone (e.g. 'Asia/Yangon', 'America/New_York'). REQUIRED for accurate local-time scheduling. Auto-injected by runtime if available." },
          delivery_target: { type: "string", enum: ["in_app", "telegram"], description: "Where to deliver the result. Defaults to 'in_app'." },
          delivery_channel_name: { type: "string", description: "Telegram broadcast channel name (when delivery_target='telegram')." },
          success_criteria: { type: "string", description: "Optional. One-sentence definition of what a successful run must include (e.g. 'Must include current BTC price and 24h change'). Used by the automation quality gate." },
          freshness: { type: "string", enum: ["auto", "required", "none"], description: "Optional. 'required' forces web_search/live data each run; 'none' skips external lookups; 'auto' lets the classifier decide based on intent." },
          autonomy_level: { type: "string", enum: ["assisted", "autonomous", "guardian"], description: "Optional agentic execution style. assisted=conservative, autonomous=plan/act/verify, guardian=strict public-channel quality." },
          context_memory: { type: "string", enum: ["light", "deep"], description: "Optional. light=use only immediate task context; deep=use relevant memory, prior runs, and channel history when available." },
          self_heal: { type: "boolean", description: "Optional. When true, the heartbeat runner retries/refires weak outputs and may hold back Telegram posts below quality_floor." },
          quality_floor: { type: "number", description: "Optional 40-95 quality threshold for Telegram delivery holdback and telemetry. Defaults to 70 for agentic tasks." },
          max_refire_attempts: { type: "number", description: "Optional 0-5 cap for one-off self-heal refires after failed quality checks." },
          dry_run: { type: "boolean", description: "If true, parse and return the resolved schedule + next 3 fires WITHOUT saving to DB. Use to confirm intent before committing." },
          task_id: { type: "string", description: "For get/update/delete/pause/resume/complete." },
          priority: { type: "string", enum: ["low", "normal", "high", "critical"] },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_scheduled_task_health",
      description: "Inspect health & quality telemetry for the user's scheduled automations. Read-only. Use when user asks 'did my task run?', 'why didn't I get the message?', 'ပို့ပြီးပြီလား', 'ဘာဖြစ်နေလဲ', or wants a summary of automation quality. Returns quality_score (0-100), intent_class, gate_reasons, gate_flags, retry_count, quality_holdback flag, and last_run_at.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["last_run", "recent_failures", "summary", "fix_suggestions"], description: "last_run=newest run for one task; recent_failures=N latest holdbacks/failures across all tasks; summary=7-day counts + avg quality; fix_suggestions=natural-language remediations for one task based on its gate_reasons." },
          task_id: { type: "string", description: "Required for last_run and fix_suggestions. Heartbeat ID." },
          limit: { type: "number", description: "For recent_failures: max rows (default 5, max 20)." },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "repair_scheduled_task",
      description: "Apply a remediation to a scheduled automation when its quality gate keeps failing. Call AFTER manage_scheduled_task_health has identified the issue. Use when user says 'fix it' / 'ပြင်ပေး' / 'run it again now'.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "Heartbeat ID of the task to repair." },
          fix_type: { type: "string", enum: ["add_success_criteria", "enforce_freshness", "re_run_now", "deactivate"], description: "add_success_criteria=auto-write+attach a tighter success_criteria based on intent_class; enforce_freshness=set freshness='required' so each run pulls live data; re_run_now=trigger one out-of-cycle execution immediately; deactivate=pause the schedule." },
          custom_criteria: { type: "string", description: "Optional override for add_success_criteria. If omitted, an intent-aware default is generated." },
        },
        required: ["task_id", "fix_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_goal",
      description: "Create/manage LONG-RUNNING autonomous goals (hours/days). NOT for immediate searches. Use only when user specifies duration/goal/project.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "list", "status", "pause", "resume", "cancel"] },
          title: { type: "string" },
          description: { type: "string" },
          goal_type: { type: "string", enum: ["research", "monitor", "report", "custom"] },
          config: { type: "object", properties: { max_duration_hours: { type: "number" }, report_interval_hours: { type: "number" }, search_queries: { type: "array", items: { type: "string" } } } },
          goal_id: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reset_telegram_config",
      description: "Wipe ALL Telegram configuration (bot token + channels).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_config",
      description: "Show user's BeeBot config: bot identity, broadcast channels, connection health, session platform.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_api_key",
      description: "Set, check, or validate API keys/auth (Telegram, Google, Anthropic, Tavily, Webhook).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["set", "check", "validate", "delete"] },
          provider: { type: "string", enum: ["telegram_bot", "google", "anthropic", "tavily", "webhook_secret"] },
          api_key: { type: "string" },
        },
        required: ["action", "provider"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Generate ONE image from prompt, or edit a previous image via reference_image_url. Returns inline image URL. Images stored 5 days.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "For new: describe image. For edit: describe ONLY changes." },
          model: { type: "string", enum: ["fast", "quality"], description: "fast=gemini-2.5-flash-image, quality=gemini-3-pro-image-preview" },
          aspect: { type: "string", enum: ["square", "landscape", "portrait"] },
          reference_image_url: { type: "string", description: "URL of previous image to edit" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_notion",
      description: "Manage user's Notion workspace: search, read, create, edit pages and query databases. Only when user EXPLICITLY asks about Notion.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["search", "get_page", "list_databases", "query_database", "create_page", "update_page", "append_blocks", "delete_block"] },
          query: { type: "string", description: "Search query (for search action)" },
          page_id: { type: "string", description: "Notion page or block ID" },
          database_id: { type: "string", description: "Notion database ID" },
          block_id: { type: "string", description: "Block ID (for delete_block)" },
          title: { type: "string", description: "Page title (for create_page)" },
          content: { type: "string", description: "Text content to add" },
          parent_id: { type: "string", description: "Parent page or database ID" },
          parent_type: { type: "string", enum: ["page", "database"], description: "Type of parent" },
          title_property: { type: "string", description: "Title property name in database" },
          properties: { type: "object", description: "Page properties to update" },
          filter: { type: "object", description: "Database query filter" },
          sorts: { type: "array", items: { type: "object" }, description: "Database query sorts" },
          filter_type: { type: "string", enum: ["page", "database"], description: "Filter search results by type" },
          page_size: { type: "number", description: "Max results (1-20)" },
          blocks: { type: "array", items: { type: "object" }, description: "Notion block objects to append" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_consultant",
      description: `AGENT CONSULTANT / AGENTIC ERA — KPI intelligence, strategy, and finance operating tool.
Use this for any request to add/update/list/delete tracked content, channels, metrics, revenue, expenses, ROI/PnL, dashboards, leaderboards, forecasts, and strategic performance insight.
AgentConsultant finance is USDT-only. For add_finance/list_finance/finance_summary/weekly_analysis/dashboard money fields, use USDT and do not ask the user to choose another currency.
The platform is creator-focused but multi-niche adaptable: content creators, e-commerce, SaaS, consultants, traders/investors, local businesses, and custom operators.
Always returns BeeBot widget format ({ widget: { preset, data } }) for read actions so the result renders as KPI cards / charts / tables in chat.`,
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "create_post","update_post","delete_post","list_posts","get_post",
              "add_metrics","update_metrics","delete_metrics","list_metrics",
              "add_daily_snapshot","update_daily_snapshot","list_daily_snapshots",
              "add_finance","update_finance","delete_finance","list_finance",
              "dashboard_summary","post_leaderboard","finance_summary","weekly_analysis","forecast"
            ],
          },
          // posts
          post_id: { type: "string" },
          post_name: { type: "string" },
          post_url: { type: "string" },
          platform: { type: "string", enum: ["facebook","instagram","tiktok","youtube","telegram","x","linkedin","threads","podcast","newsletter","other"] },
          posted_at: { type: "string", description: "YYYY-MM-DD" },
          notes: { type: "string" },
          // metrics
          metrics_id: { type: "string" },
          metric_date: { type: "string", description: "YYYY-MM-DD; defaults to today (Asia/Yangon)" },
          views: { type: "number" }, likes: { type: "number" }, comments: { type: "number" },
          shares: { type: "number" }, saves: { type: "number" }, reach: { type: "number" },
          // daily channel snapshots
          captured_at: { type: "string", description: "YYYY-MM-DD for daily channel KPI snapshots" },
          followers: { type: "number" },
          total_views: { type: "number" },
          posts_count: { type: "number" },
          engagement_rate: { type: "number", description: "Daily engagement rate percentage" },
          impressions: { type: "number" },
          source: { type: "string", enum: ["manual","ocr","api","import"] },
          // finance
          entry_id: { type: "string" },
          entry_date: { type: "string" },
          entry_type: { type: "string", enum: ["expense","income"] },
          category: { type: "string" },
          amount: { type: "number" },
          currency: { type: "string", enum: ["USDT"], description: "AgentConsultant finance is fixed to USDT." },
          related_post_id: { type: "string" },
          description: { type: "string" },
          // insights / list
          from: { type: "string", description: "YYYY-MM-DD" },
          to: { type: "string", description: "YYYY-MM-DD" },
          days: { type: "number", description: "Used when from/to omitted (default 7)" },
          metric: { type: "string", enum: ["views","likes","comments","shares","saves","reach","engagement","followers","revenue"] },
          limit: { type: "number" },
          channel_id: { type: "string", description: "Optional channel UUID for scoped forecasts" },
          horizon_days: { type: "number", description: "Forecast horizon in days, clamped to 7-90" },
          lookback_days: { type: "number", description: "Historical lookback window for forecast; default 60" },
        },
        required: ["action"],
      },
    },
  },
  // ═══ AGENTIC ERA — Autonomy + World Model + Reflection ═══
  {
    type: "function",
    function: {
      name: "manage_proactive_trigger",
      description: "Create/manage autonomous BeeBot triggers. Use when user wants BeeBot to act on a schedule (e.g. 'every Monday 9am check FB metrics') or when an event happens. Trigger fires in background and pushes results.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "list", "toggle", "delete"] },
          name: { type: "string" },
          description: { type: "string" },
          trigger_type: { type: "string", enum: ["schedule", "metric_threshold", "event"] },
          schedule_cron: { type: "string", description: "Standard 5-field cron (UTC). Example: '0 2 * * 1' for Mon 09:00 Yangon" },
          schedule_tz: { type: "string", description: "IANA tz; default Asia/Yangon" },
          condition: { type: "object", description: "For metric_threshold/event triggers" },
          action_prompt: { type: "string", description: "The task BeeBot should run when triggered" },
          trigger_id: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_world_entity",
      description: "Manage BeeBot's persistent world model — the user's people, projects, goals, metrics, assets, channels and how they relate. Use 'upsert' when something important is mentioned, 'link' to record a causal/dependency edge, 'graph' to fetch a neighborhood, 'list' to browse.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["upsert", "link", "list", "graph", "delete"] },
          entity_type: { type: "string", enum: ["person", "project", "goal", "metric", "asset", "channel", "topic", "event"] },
          name: { type: "string" },
          canonical_key: { type: "string", description: "Optional normalized key; auto-derived from name if omitted" },
          description: { type: "string" },
          attrs: { type: "object" },
          importance: { type: "number", description: "0..1" },
          entity_id: { type: "string" },
          from_entity_id: { type: "string" },
          to_entity_id: { type: "string" },
          relation_type: { type: "string", enum: ["works_on", "caused", "depends_on", "owns", "related_to", "leads_to", "part_of", "blocks"] },
          strength: { type: "number" },
          evidence: { type: "object" },
          depth: { type: "number", description: "Graph traversal depth 1..3" },
          limit: { type: "number" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_lesson",
      description: "Manage BeeBot's cross-session lessons (durable learnings about the user, tools, and tasks). 'add' to store a new lesson, 'recall' to vector-search relevant lessons before acting, 'list' to inspect, 'deactivate' to retire a stale lesson.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["add", "recall", "list", "deactivate"] },
          lesson_text: { type: "string" },
          category: { type: "string", enum: ["tool_usage", "user_preference", "failure_pattern", "success_pattern", "domain_knowledge"] },
          confidence: { type: "number" },
          evidence_trajectory_ids: { type: "array", items: { type: "string" } },
          query: { type: "string" },
          limit: { type: "number" },
          min_confidence: { type: "number" },
          lesson_id: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
];
export const AGENT_NETWORK_TOOLS = [
  {
    type: "function",
    function: {
      name: "query_agent_network",
      description: "Query shared knowledge pool of all BeeBot agents. Never shares personal data.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          insight_type: { type: "string", enum: ["market_data", "general_fact", "news", "verified_info", "all"] },
          topic: { type: "string" },
          time_range: { type: "string", enum: ["realtime", "today", "this_week"] },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "share_to_agent_network",
      description: "Share public knowledge to agent network. Never share personal data.",
      parameters: {
        type: "object",
        properties: {
          insight_type: { type: "string", enum: ["market_data", "general_fact", "news", "tool_pattern", "verified_info"] },
          topic: { type: "string" },
          content: { type: "object" },
          summary: { type: "string" },
          is_anonymous: { type: "boolean" },
          confidence: { type: "number" },
          expires_in_hours: { type: "number" },
        },
        required: ["insight_type", "topic", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_other_agents",
      description: "Background broadcast to other agents. User doesn't see this conversation.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          topic: { type: "string" },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
          context: { type: "object" },
        },
        required: ["query", "topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "respond_to_agent_query",
      description: "Respond to a pending query from another agent.",
      parameters: {
        type: "object",
        properties: {
          query_id: { type: "string" },
          response: { type: "string" },
          response_data: { type: "object" },
          confidence: { type: "number" },
          source: { type: "string" },
        },
        required: ["query_id", "response", "confidence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_agent_messages",
      description: "Check messages from other agents (background, agent-internal).",
      parameters: {
        type: "object",
        properties: {
          message_types: { type: "array", items: { type: "string" } },
          unread_only: { type: "boolean" },
          topic_filter: { type: "string" },
          limit: { type: "number" },
        },
        required: [],
      },
    },
  },
];

// On-demand skill details fetcher (Index + On-Demand Read pattern)
export const SKILL_DETAIL_TOOL = {
  type: "function",
  function: {
    name: "get_skill_details",
    description: "Fetch full execution steps for a specific skill before running it. Use this BEFORE execute_skill.",
    parameters: {
      type: "object",
      properties: {
        skill_name: { type: "string", description: "Exact skill name from the Skill Index" },
      },
      required: ["skill_name"],
    },
  },
};

// Advanced agent tools
export const ADVANCED_AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "update_my_instructions",
      description: "Update your own skill instructions. Max 2000 chars, rate limited 3/hour.",
      parameters: {
        type: "object",
        properties: {
          skill_name: { type: "string" },
          new_instructions: { type: "string" },
        },
        required: ["skill_name", "new_instructions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "self_update_knowledge",
      description: "Autonomously scan and learn from app data (KB, insights, features, configs).",
      parameters: {
        type: "object",
        properties: {
          scan_targets: { type: "array", items: { type: "string", enum: ["kb", "insights", "features", "configs", "all"] } },
          depth: { type: "string", enum: ["quick", "standard", "deep"] },
          save_to_memory: { type: "boolean" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_external_api",
      description: "Fetch data from external APIs. HTTPS only, private IPs blocked, 10s timeout, 1MB limit.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          method: { type: "string", enum: ["GET", "POST"] },
          headers: { type: "object" },
          body: { type: "string" },
          parse_as: { type: "string", enum: ["json", "text", "html"] },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "self_debug",
      description: "Diagnose and attempt to fix issues autonomously.",
      parameters: {
        type: "object",
        properties: {
          error_context: { type: "object" },
          attempted_action: { type: "string" },
          allow_alternatives: { type: "boolean" },
          max_retries: { type: "number" },
        },
        required: ["error_context", "attempted_action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_file",
      description: "Generate downloadable file (CSV/DOCX/MD/JSON). Content as rich markdown. For CSV: markdown table. For DOCX: full markdown with tables (|---|---| separators required). When updating, reuse SAME filename for in-place update. Preserve ALL existing data on partial updates.",
      parameters: {
        type: "object",
        properties: {
          file_type: { type: "string", enum: ["csv", "docx", "md", "json"] },
          content: { type: "string" },
          filename: { type: "string" },
        },
        required: ["file_type", "content", "filename"],
      },
    },
  },
  // ═══ SHOW WIDGET — Claude-Style Rich Interactive Widgets ═══
  {
    type: "function",
    function: {
      name: "show_widget",
      description: "CALL CONTRACT: pass {title, preset, data, auto_height:true} OR {title, html}. NEVER call with only {title} — that fails. For multi-section dashboards (≥3 widgets in one view: KPIs + charts + table), use preset='dashboard' with sections[] — NEVER call show_widget multiple times for the same view. Render a rich, theme-aware visual widget inline in chat. STRONGLY PREFER a `preset` over raw HTML — presets are deterministic, render in <50ms, and never break. SHOW-ME RULE: when the user asks 'show me / map out / diagram / visualize / how does X work / break down / explain X visually', ALWAYS reach for a widget instead of prose. DECISION MATRIX → USE when: (a) ≥3 numeric KPIs → 'kpi_dashboard'; (b) trend over ≥4 time points → 'line_chart'; (c) compare ≥3 categories numerically → 'bar_chart' or 'donut_chart'; (d) multi-step status/process → 'progress_bars' or 'progress_tracker'; (e) 4+ column structured rows → 'data_table'; (f) milestones with dates → 'timeline'; (g) month overview with events → 'calendar_view'; (h) project timeline w/ task bars → 'gantt_chart'; (i) plan/tier comparison w/ CTA → 'pricing_cards'; (j) multiple images grid → 'image_gallery'; (k) before/after code → 'code_diff'; (l) hierarchical structure → 'tree_view'; (m) geographic/spatial pins → 'map_pins'; (n) ask user to pick option → 'quiz_card'; (o) collect structured input → 'form_builder'; (p) COMPOSITE multi-widget view (KPIs + charts + table together) → 'dashboard'; (q) processes / decision flows / 'how it works' → 'flowchart'; (r) ideas / taxonomies / brainstorms → 'mindmap'; (s) interactions between actors / API calls → 'sequence_diagram'; (t) hierarchies / teams / reporting lines → 'org_chart'; (u) relationships / dependencies / graphs → 'network_graph'. SKIP when: single number, 1-2 facts, pure prose, or yes/no answer. Set `auto_height:true` to let the server pick optimal height. Dashboards and diagrams are mobile-first responsive. CLICK-TO-EXPLORE: KPI cards, chart bars/segments, tree nodes, and ALL diagram nodes are clickable — they post a follow-up question back into the chat via window.beebot.send(), so the user can explore by tapping. INTERACTIVE WIDGETS (`pricing_cards`, `quiz_card`, `form_builder`) post user action back the same way. Raw HTML only when no preset fits — must use CSS vars (--color-bg-primary, --color-text-primary, --color-accent, --color-success, --color-danger, --color-warning, --color-border, --font-sans), be ≤15KB, no external CDNs. ON ERROR: read `guide`/`action_needed`/`example` fields and RETRY this tool — never fabricate data in prose.",
      parameters: {
        type: "object",
        properties: {
          html: { type: "string", description: "Full HTML with inline <style>. Only when no preset fits. Use CSS variables, ≤15KB, no external CDNs." },
          title: { type: "string", description: "Title for the header bar. If unsure, use a short label like 'KPI Dashboard' or 'Checkout Flow'." },
          height: { type: "number", description: "Widget height hint in pixels. Simple presets cap at 1600; 'dashboard' and diagram presets cap at 4000. Iframe auto-measures, so usually omit and rely on auto_height." },
          auto_height: { type: "boolean", description: "If true, server picks optimal height for the chosen preset+data. Recommended for all preset usage." },
          preset: { type: "string", enum: ["dashboard", "kpi_dashboard", "bar_chart", "line_chart", "donut_chart", "progress_bars", "stat_grid", "data_table", "comparison_table", "timeline", "scorecard", "progress_tracker", "calendar_view", "gantt_chart", "pricing_cards", "image_gallery", "code_diff", "tree_view", "map_pins", "quiz_card", "form_builder", "flowchart", "mindmap", "sequence_diagram", "org_chart", "network_graph"], description: "Built-in preset template. Pick by intent (see decision matrix in description). Use 'dashboard' for COMPOSITE views; 'flowchart'/'mindmap'/'sequence_diagram'/'org_chart'/'network_graph' for diagrams." },
          compose: { type: "boolean", description: "If true, the server runs the Data Composer over `data` to auto-build a multi-section dashboard payload. Use when you have raw structured data (object/array) and aren't sure which chart fits." },
          focus: { type: "string", enum: ["metrics", "trends", "breakdown", "list"], description: "Optional hint for the Data Composer when compose=true. 'metrics'=KPI-heavy, 'trends'=line charts, 'breakdown'=donut/bar, 'list'=table-heavy." },
          density: { type: "string", enum: ["compact", "comfortable", "roomy"], description: "Visual density for dashboards. Default: comfortable." },
          data: { type: "object", description: "REQUIRED when using preset. Must match the preset's data shape. dashboard:{sections:[{preset,data,span?:1-12,id?,title?,note?,hidden?}],title?,density?}. kpi_dashboard:{kpis:[{label,value,delta?,trend?,unit?,sublabel?}],title?}. bar_chart:{labels[],values[],title?,color?,horizontal?,unit?}. line_chart:{labels[],series:[{name,values[],color?}],title?,unit?}. donut_chart:{segments:[{label,value,color?}],title?,centerLabel?}. progress_bars:{items:[{label,value,max?,color?,sublabel?}],title?}. stat_grid:{stats:[{label,value,icon?,color?}],title?,columns?}. data_table:{columns:[{key,label,type?:'text'|'number'|'badge'|'progress'}],rows[],title?,footer?}. comparison_table:{columns[],rows:[{label,values[]}],highlight?}. timeline:{events:[{date,title,description?,status?}]}. scorecard:{metrics:[{label,value,delta?,unit?}],title?}. progress_tracker:{steps:[{label,status?}],current?}. calendar_view:{year?,month?,events:[{date,label?,color?}],title?}. gantt_chart:{tasks:[{label,start,end,color?,status?}],title?}. pricing_cards:{plans:[{name,price,period?,features[],cta?,highlighted?,action?}],title?}. image_gallery:{images:[{url,caption?}],title?,columns?}. code_diff:{lines:[{type:'add'|'remove'|'context',text,lineNumber?}],title?,language?}. tree_view:{nodes:[{label,children?,icon?,meta?}],title?}. map_pins:{pins:[{x,y,label,color?}],title?}. quiz_card:{question,options[],title?}. form_builder:{fields:[{name,label,type?,placeholder?,options?,required?}],submitLabel?,title?}. flowchart:{nodes:[{id,label,type?:'start'|'end'|'decision'|'process'}],edges:[{from,to,label?}],direction?:'TB'|'LR',title?}. mindmap:{root:{label},branches:[{label,children?}],title?}. sequence_diagram:{actors:[name],steps:[{from,to,message}],title?}. org_chart:{root:{label,role?,children?:[...]},title?}. network_graph:{nodes:[{id,label?,group?}],links:[{source,target,weight?}],title?}." },
        },
        required: ["title"],
      },
    },
  },
  // ═══ COMPOSE DASHBOARD — Data Composer alias ═══
  {
    type: "function",
    function: {
      name: "compose_dashboard",
      description: "Take arbitrary structured data (a JSON object, an array of records, a tool result) and auto-compose a mobile-first multi-section dashboard. YOU (the agent) are responsible for choosing section ordering, span allocation, density, and focus — there is NO user-side layout editor. Your first render must be production-quality. Layout rubric: 1 KPI → hero card span:12; 2-4 KPIs → KPI row span:12; KPI+trend → KPI(12) + line(8) + donut(4); tabular only → table(12); ≥3 categories → bar/donut(12) or side-by-side(6/6). Density: ≤6 data points → roomy, 7-20 → comfortable, >20 → compact. Focus: pass focus='<metric_id>' when one KPI dominates the user intent. Returns a rendered dashboard widget exactly like show_widget.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Dashboard title shown at the top." },
          data: { type: "object", description: "Raw structured data. Can be an array of records, an object with numeric fields, or an object containing nested arrays. The composer picks KPI rows / charts / tables automatically." },
          focus: { type: "string", enum: ["metrics", "trends", "breakdown", "list"], description: "Optional hint: 'metrics'=KPI-heavy, 'trends'=line charts, 'breakdown'=donut/bar, 'list'=table-heavy." },
          density: { type: "string", enum: ["compact", "comfortable", "roomy"], description: "Visual density. Default: comfortable." },
        },
        required: ["title", "data"],
      },
    },
  },
];

// Agentic core tools (sub-agent, browser)
export const AGENTIC_CORE_TOOLS = [
  {
    type: "function",
    function: {
      name: "spawn_autonomous_job",
      description: "Spawn a long-running autonomous background job. Returns jobId immediately. Use for tasks that take minutes or hours.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "The full task description for the autonomous job" },
          goal_type: { type: "string", enum: ["research", "coding", "analysis", "report"] },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "spawn_sub_agent",
      description: "Spawn isolated sub-agent for background task. Max 2 per request, no recursion, 30s timeout.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string" },
          tools: { type: "array", items: { type: "string" } },
          max_steps: { type: "number" },
          context: { type: "string" },
        },
        required: ["task"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_scrape",
      description: "Scrape webpage content as markdown, screenshot, or structured data.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          formats: { type: "array", items: { type: "string", enum: ["markdown", "screenshot", "summary", "links", "html"] } },
          only_main_content: { type: "boolean" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_search",
      description: "Search the web with optional content scraping from results.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
          time_filter: { type: "string", enum: ["hour", "day", "week", "month", "year"] },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_map",
      description: "Discover all URLs on a website (sitemap generation).",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          search: { type: "string" },
          limit: { type: "number" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_my_logs",
      description: "Read recent communication logs and task queue for self-diagnosis.",
      parameters: {
        type: "object",
        properties: {
          log_type: { type: "string", enum: ["communication", "tasks", "both"] },
          limit: { type: "number" },
          filter_status: { type: "string", enum: ["failed", "successful", "all"] },
          search_term: { type: "string" },
        },
        required: [],
      },
    },
  },
];

// ═══ SUPER ADMIN TOOLS (merged with CRUD tools) ═══
export const SUPER_ADMIN_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_system_vitals",
      description: "Real-time infrastructure health: API latency, success rates, errors, sessions. Admin only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_system_overview",
      description: "Global system stats: users, content, IU metrics, AI usage. Use stat_type='iu' for IU data. For listing users, use admin_user_lookup.",
      parameters: {
        type: "object",
        properties: {
          stat_type: { type: "string", enum: ["users", "content", "transactions", "credits", "iu", "ai_usage", "all"] },
        },
        required: ["stat_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_user_lookup",
      description: "Look up/list/search users. For active_users/all_users/search: email not required.",
      parameters: {
        type: "object",
        properties: {
          target_user_email: { type: "string" },
          lookup_type: { type: "string", enum: ["profile", "credits", "transactions", "sessions", "active_users", "all_users", "search"] },
          search_term: { type: "string" },
        },
        required: ["lookup_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_view_user_psychology",
      description: "View user psychological profiles, mood trends, behavioral patterns. Admin only.",
      parameters: {
        type: "object",
        properties: {
          target_user_email: { type: "string" },
          view_type: { type: "string", enum: ["mood_trends", "behavioral_patterns", "memory_conflicts", "full_profile"] },
          limit: { type: "number" },
        },
        required: ["view_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_ai_doctor",
      description: "Run AI Doctor health diagnostics. Analyzes errors, generates report, alerts if critical. Admin only.",
      parameters: {
        type: "object",
        properties: {
          trigger_type: { type: "string", enum: ["manual", "threshold"] },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "view_doctor_reports",
      description: "View past AI Doctor diagnostic reports. Admin only.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
          status: { type: "string", enum: ["pending_review", "applied", "dismissed", "all"] },
        },
        required: [],
      },
    },
  },
  // ═══ Merged from SUPER_ADMIN_CRUD_TOOLS ═══
  {
    type: "function",
    function: {
      name: "admin_manage_prompts",
      description: "CRUD on BeeBot system prompts. Admin only.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "get", "create", "update", "delete", "reorder"] },
          file_name: { type: "string" },
          content: { type: "string" },
          display_name: { type: "string" },
          category: { type: "string", enum: ["core", "security", "features", "user", "examples", "custom"] },
          order_index: { type: "number" },
          is_active: { type: "boolean" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_manage_feature_flags",
      description: "Manage app feature toggles. Admin only.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "get", "update"] },
          feature_key: { type: "string" },
          is_enabled: { type: "boolean" },
          status: { type: "string", enum: ["active", "beta", "maintenance", "coming_soon"] },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_manage_knowledge_base",
      description: "CRUD + Sync for Knowledge Base articles. Use 'sync' for embedding vectorization. Admin only.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "get", "create", "update", "delete", "search", "sync", "check_status"] },
          content_id: { type: "string" },
          title: { type: "string" },
          content: { type: "string" },
          category: { type: "string" },
          language: { type: "string", enum: ["burmese", "english"] },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_manage_ai_settings",
      description: "Configure AI model settings and API access rules. Admin only.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["get", "update"] },
          allow_personal_api_key: { type: "boolean" },
          allow_gateway_fallback_content: { type: "boolean" },
          require_personal_key: { type: "boolean" },
          selected_model: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_manage_user_data",
      description: "Advanced user management: roles, credits, bans. All changes logged. Admin only.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["get_user", "update_role", "remove_role", "adjust_credits", "ban_user", "unban_user"] },
          target_email: { type: "string" },
          role: { type: "string", enum: ["admin", "moderator", "creator"] },
          credit_amount: { type: "number" },
          reason: { type: "string" },
        },
        required: ["action", "target_email"],
      },
    },
  },
];

// ═══ SUPER AGENT TOOLS (merged with network + advanced + original) ═══
export const SUPER_AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "super_app_omniscience",
      description: "Full visibility into entire app state: any table, sessions, metrics, security, feedback. Admin only.",
      parameters: {
        type: "object",
        properties: {
          query_type: { type: "string", enum: ["user_activity", "beebot_sessions", "system_health", "feature_metrics", "security_events", "feedback_overview", "knowledge_base_stats", "full_table_query"] },
          target_table: { type: "string" },
          target_user_id: { type: "string" },
          time_range: { type: "string", enum: ["realtime", "today", "this_week", "this_month"] },
          limit: { type: "number" },
        },
        required: ["query_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_analyze_response_feedback",
      description: "Analyze user feedback (👍/👎) to identify improvement patterns.",
      parameters: {
        type: "object",
        properties: {
          time_range: { type: "string", enum: ["today", "this_week", "this_month", "all_time"] },
          focus_area: { type: "string", enum: ["negative_only", "positive_only", "all", "trend_analysis", "tool_correlation"] },
          generate_insights: { type: "boolean" },
        },
        required: ["time_range"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_manage_token_quotas",
      description: "Manage user token quotas and free AI access grants. PROOF-OF-WORK: Report exact tool result after mutations.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list_all", "list_granted_users", "get_user", "grant_free_access", "revoke_free_access", "grant_tokens", "set_limits", "reset_usage", "upgrade_plan", "bulk_grant"] },
          user_email: { type: "string" },
          tokens_amount: { type: "number" },
          gemini_model: { type: "string", enum: ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite", "gemini-3.1-flash-lite-preview", "gemini-3.1-flash-image-preview", "gemini-3-flash-preview", "gemini-3-pro-image-preview", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash-image", "gemini-2.5-pro"] },
          rpm_limit: { type: "number" },
          tpm_limit: { type: "number" },
          rpd_limit: { type: "number" },
          quota_type: { type: "string", enum: ["free", "pro", "enterprise", "custom"] },
          notes: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_ai_analytics",
      description: "AI/IU usage analytics: system overview, per-user breakdown, model distribution, trends, top consumers.",
      parameters: {
        type: "object",
        properties: {
          query_type: { type: "string", enum: ["system_overview", "user_breakdown", "model_distribution", "daily_trends", "top_consumers", "quota_alerts"] },
          time_range: { type: "string", enum: ["today", "this_week", "this_month", "all_time"] },
          limit: { type: "number" },
        },
        required: ["query_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_broadcast_notification",
      description: "Send notifications to users or agents. System announcements, quota alerts.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["send_to_user", "send_to_all", "send_to_agents", "send_quota_alert"] },
          user_email: { type: "string" },
          message: { type: "string" },
          message_type: { type: "string", enum: ["info", "warning", "alert", "quota_low", "quota_exhausted"] },
          include_quota_info: { type: "boolean" },
        },
        required: ["action", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_self_reflect",
      description: "Analyze performance and generate self-improvement insights.",
      parameters: {
        type: "object",
        properties: {
          reflection_type: { type: "string", enum: ["session_review", "response_quality", "tool_optimization", "personality_adjustment", "reasoning_improvement"] },
          session_id: { type: "string" },
          insight: { type: "string" },
          confidence: { type: "number" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["reflection_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_proactive_suggest",
      description: "Generate proactive suggestions for users based on context.",
      parameters: {
        type: "object",
        properties: {
          suggestion_type: { type: "string", enum: ["feature_discovery", "workflow_optimization", "content_recommendation", "learning_path", "security_tip"] },
          context_trigger: { type: "string" },
          suggestion: { type: "string" },
          urgency: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["suggestion_type", "suggestion"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_teach_agents",
      description: "Create educational content for other agents.",
      parameters: {
        type: "object",
        properties: {
          teaching_type: { type: "string", enum: ["best_practice", "correction", "capability_update", "behavior_alignment"] },
          content: { type: "string" },
          title: { type: "string" },
          target: { type: "string", enum: ["all_agents", "new_users", "power_users", "admin_agents"] },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
        },
        required: ["teaching_type", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_analyze_patterns",
      description: "Analyze deep patterns in system usage and user behavior.",
      parameters: {
        type: "object",
        properties: {
          analysis_type: { type: "string", enum: ["user_behavior", "system_performance", "feature_usage", "error_patterns", "security_risks"] },
          time_range: { type: "string", enum: ["today", "this_week", "this_month", "all_time"] },
          user_scope: { type: "string", enum: ["global", "segment", "individual"] },
        },
        required: ["analysis_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_knowledge_synthesize",
      description: "Synthesize fragmented info into coherent knowledge entries.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string" },
          sources: { type: "array", items: { type: "string", enum: ["kb", "insights", "conversations", "external"] } },
          category: { type: "string" },
          language: { type: "string", enum: ["burmese", "english"] },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_optimize_system",
      description: "Propose or apply system-level optimizations.",
      parameters: {
        type: "object",
        properties: {
          optimization_target: { type: "string", enum: ["prompts", "tools", "retrieval", "caching", "model_selection"] },
          optimization_type: { type: "string", enum: ["suggest", "apply"] },
          details: { type: "string" },
        },
        required: ["optimization_target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_emergency_action",
      description: "Emergency protocols: lockdown, rate limit, disable features, alerts. Critical situations only.",
      parameters: {
        type: "object",
        properties: {
          action_type: { type: "string", enum: ["security_lockdown", "rate_limit_user", "disable_feature", "alert_admin", "backup_data"] },
          reason: { type: "string" },
          target_id: { type: "string" },
          severity: { type: "string", enum: ["high", "critical"] },
        },
        required: ["action_type", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_autonomous_decision",
      description: "Make and record autonomous decisions with audit logging.",
      parameters: {
        type: "object",
        properties: {
          decision_type: { type: "string", enum: ["prioritization", "conflict_resolution", "behavior_adjustment", "resource_allocation", "auto_execute"] },
          reasoning: { type: "string" },
          confidence_score: { type: "number" },
          action_details: { type: "object" },
          risk_level: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["decision_type", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_process_feedback",
      description: "Process and act on user feedback items.",
      parameters: {
        type: "object",
        properties: {
          feedback_id: { type: "string" },
          action: { type: "string", enum: ["analyze", "categorize", "respond", "convert_to_ticket", "update_status", "close"] },
          response_text: { type: "string" },
          new_status: { type: "string", enum: ["open", "in_progress", "resolved", "closed"] },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          category: { type: "string" },
        },
        required: ["feedback_id", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_read_all_feedback",
      description: "Read ALL user feedback across the system.",
      parameters: {
        type: "object",
        properties: {
          filter_type: { type: "string", enum: ["bug", "feature", "general", "praise", "complaint", "all"] },
          filter_status: { type: "string", enum: ["open", "in_progress", "resolved", "closed", "all"] },
          filter_severity: { type: "string", enum: ["low", "medium", "high", "critical", "all"] },
          limit: { type: "number" },
          include_discussions: { type: "boolean" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_analyze_feedback",
      description: "Analyze patterns and trends in user feedback.",
      parameters: {
        type: "object",
        properties: {
          analysis_type: { type: "string", enum: ["pattern_detection", "sentiment_analysis", "trend_analysis", "priority_ranking", "impact_assessment"] },
          time_range: { type: "string", enum: ["today", "this_week", "this_month", "all_time"] },
          focus_category: { type: "string" },
        },
        required: ["analysis_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_discuss_with_admin",
      description: "Initiate structured discussion with admin about decisions requiring human judgment.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string" },
          context: { type: "string" },
          proposal: { type: "string" },
          urgency: { type: "string", enum: ["low", "medium", "high", "critical"] },
        },
        required: ["topic", "context"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "configure_group_bot",
      description: "Configure Group Bot's custom instruction, personality, or expertise.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["set_instruction", "get_config", "clear_instruction"] },
          instruction: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "spawn_parallel_swarm",
      description: "Launch multiple sub-agents in parallel for multi-source research. Max 5 agents, 60s timeout.",
      parameters: {
        type: "object",
        properties: {
          tasks: { type: "array", items: { type: "object", properties: { task: { type: "string" }, tools: { type: "array", items: { type: "string" } }, context: { type: "string" } }, required: ["task"] } },
          merge_strategy: { type: "string", enum: ["concatenate", "synthesize", "compare"] },
          max_parallel: { type: "number" },
        },
        required: ["tasks"],
      },
    },
  },
  // ═══ Merged from SUPER_AGENT_NETWORK_TOOLS ═══
  {
    type: "function",
    function: {
      name: "super_monitor_agent_network",
      description: "Full visibility into ALL inter-agent communications. Admin oversight.",
      parameters: {
        type: "object",
        properties: {
          monitor_type: { type: "string", enum: ["recent_queries", "top_topics", "active_agents", "shared_insights", "communication_log", "anomalies", "pending_queries"] },
          time_range: { type: "string", enum: ["realtime", "today", "this_week", "this_month"] },
          focus_agent_id: { type: "string" },
          limit: { type: "number" },
        },
        required: ["monitor_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_create_sync_pipeline",
      description: "Create/manage automatic data sync pipelines between agents.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "list", "update", "disable", "delete"] },
          rule_id: { type: "string" },
          rule_name: { type: "string" },
          topic_pattern: { type: "string" },
          insight_types: { type: "array", items: { type: "string" } },
          sync_frequency: { type: "string", enum: ["realtime", "hourly", "daily"] },
          min_confidence: { type: "number" },
        },
        required: ["action"],
      },
    },
  },
  // ═══ Merged from SUPER_ADVANCED_TOOLS ═══
  {
    type: "function",
    function: {
      name: "super_bulk_train",
      description: "Mass inject knowledge into memory. Auto-chunks and embeds.",
      parameters: {
        type: "object",
        properties: {
          training_data: { type: "string" },
          data_format: { type: "string", enum: ["json", "markdown", "text"] },
          target: { type: "string", enum: ["self", "network"] },
          category: { type: "string" },
          replace_existing: { type: "boolean" },
        },
        required: ["training_data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_execute_code",
      description: "Execute sandboxed JS/TS for complex calculations. No network, 500ms timeout, pure logic.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string" },
          inputs: { type: "object" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "super_plan_and_execute",
      description: "Create multi-step execution plans for complex goals with state preservation.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string" },
          phase: { type: "string", enum: ["plan", "approve", "execute", "verify"] },
          plan_id: { type: "string" },
          feedback: { type: "string" },
        },
        required: ["goal", "phase"],
      },
    },
  },
  // ═══ FACEBOOK PAGE MANAGEMENT ═══
  {
    type: "function",
    function: {
      name: "manage_facebook_page",
      description: "Manage Facebook Pages — post content, reply to comments, view posts/comments, delete posts. Use when user explicitly asks about Facebook page actions.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["post", "reply_comment", "get_posts", "get_comments", "delete_post", "get_page_info", "list_pages", "add_page", "remove_page", "set_default"] },
          message: { type: "string", description: "Content to post or reply" },
          page_name: { type: "string", description: "Target page name (optional, uses default)" },
          page_id: { type: "string", description: "Facebook Page ID" },
          post_id: { type: "string", description: "Post ID for comments/delete" },
          comment_id: { type: "string", description: "Comment ID for replying" },
          page_access_token: { type: "string", description: "Page Access Token (for add_page)" },
          limit: { type: "number", description: "Number of items to fetch (default 10, max 25)" },
        },
        required: ["action"],
      },
    },
  },
  // ═══ MEMORY VAULT MANAGEMENT (memory.md CRUD + import/export) ═══
  {
    type: "function",
    function: {
      name: "export_agentic_data",
      description: "Read-only export bridge for Agentic Era data: portable skills, trajectory JSONL, memory map, and MCP capability manifest. Use for audits, migrations, and research/eval export.",
      parameters: {
        type: "object",
        properties: {
          export_type: { type: "string", enum: ["overview", "skills", "trajectories", "memory_map", "mcp_manifest"] },
          format: { type: "string", enum: ["json", "jsonl"] },
          limit: { type: "number", description: "Maximum rows, default 100, max 500" },
        },
        required: ["export_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_memory",
      description: `Manage the user's long-term Memory Vault (memory.md). Use whenever the user asks to add/update/delete/list/import memories, OR proactively whenever you notice memory needs cleanup, deduping, or pinning of important facts.
In Telegram group mode this tool is automatically constrained to group-scoped public memory only; never write or expose private personal memories from a group.
Actions:
- create: store a new memory (content + category + confidence 0-1)
- update: modify an existing memory by id
- delete: remove a memory by id (always confirm first)
- list: list user's recent memories (optional category filter)
- import_bulk: import an array of memories from another AI (max 200 items)
- dedupe: scan recent memories and merge/delete near-duplicate entries (compares content text)
- archive_stale: deactivate memories older than {days} (default 90) with confidence below {min_confidence} (default 0.4)
- promote_to_core: pin a memory by id so it always appears in core memory.md (boosts confidence to 0.95)
- demote_from_core: unpin a memory by id
After any write, generate a warm 1-line confirmation in the user's language. Never echo raw JSON.`,
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "update", "delete", "list", "import_bulk", "dedupe", "archive_stale", "promote_to_core", "demote_from_core"] },
          memory_id: { type: "string", description: "Required for update/delete/promote_to_core/demote_from_core" },
          content: { type: "string", description: "Memory content for create/update" },
          category: { type: "string", enum: ["preference", "fact", "work", "relationship", "opinion", "life_event", "viz_preferences", "goals", "custom"], description: "Use viz_preferences for chart/report style preferences, goals for KPI/targets, custom for user-specific rules that don't fit elsewhere." },
          confidence: { type: "number", description: "0-1, default 0.7" },
          scope: { type: "string", enum: ["personal", "telegram_group"], description: "Defaults to personal. Backend forces telegram_group inside Telegram group chats." },
          scope_key: { type: "string", description: "Telegram chat id or other scope key. Required for telegram_group outside automatic group context." },
          source_platform: { type: "string", description: "Optional source platform, e.g. telegram." },
          source_actor: { type: "string", description: "Optional public actor label for group-scoped memory." },
          limit: { type: "number", description: "For list, default 20" },
          days: { type: "number", description: "For archive_stale, default 90" },
          min_confidence: { type: "number", description: "For archive_stale, default 0.4" },
          items: {
            type: "array",
            description: "For import_bulk",
            items: {
              type: "object",
              properties: {
                content: { type: "string" },
                category: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["content"],
            },
          },
        },
        required: ["action"],
      },
    },
  },
];

// ═══ Backward-compatible aliases for merged arrays ═══
export const SUPER_ADMIN_CRUD_TOOLS: any[] = [];
export const SUPER_AGENT_NETWORK_TOOLS: any[] = [];
export const SUPER_ADVANCED_TOOLS: any[] = [];
