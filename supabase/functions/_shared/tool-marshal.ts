// ═══ PROJECT NIGHTINGALE: TOOL MARSHAL MODULE (v2 — Mini-OpenClaw Upgrade) ═══
// Extracted from agent-chat/index.ts for modularity

// Tools always available regardless of Observer classification
export const ALWAYS_AVAILABLE_TOOLS = [
  "search_knowledge_base",
  "recall_user_facts",
  "recall_episodic_memory",
  "recall_session_history",
  "remember_user_fact",
  "get_user_info",
];

// Admin tools always available when user is admin
export const ADMIN_ALWAYS_AVAILABLE_TOOLS = [
  "admin_system_overview",
  "admin_user_lookup",
  "admin_ai_analytics",
  "admin_manage_token_quotas",
  "get_system_vitals",
];

// Cross-category expansion: related tools that should also be considered
export const TOOL_EXPANSION: Record<string, string[]> = {
  "answer_question": ["search_knowledge_base", "recall_episodic_memory", "search_web", "recall_user_facts", "browser_search", "browser_scrape", "execute_skill", "show_widget"],
  "search_info": ["search_web", "recall_user_facts", "recall_episodic_memory", "browser_search", "browser_scrape", "browser_action", "show_widget"],
  "generate_content": ["recall_episodic_memory", "search_web", "search_knowledge_base", "browser_search", "generate_image", "execute_skill", "show_widget"],
  "generate_image": ["search_knowledge_base", "recall_user_facts"],
  "manage_finance": ["search_web", "recall_user_facts", "execute_skill", "show_widget", "compose_dashboard", "manage_flowstate", "manage_budget", "manage_investment", "financial_report", "tax_estimate", "cfo_cashflow_forecast", "cfo_runway_analysis", "cfo_unit_economics", "cfo_pnl_summary", "search_knowledge_base", "manage_consultant"],
  "strategy_advisory": ["show_widget", "compose_dashboard", "search_web", "search_knowledge_base", "browser_search", "strategy_swot_analysis", "strategy_porter_five_forces", "strategy_okr_tracker", "strategy_roadmap", "strategy_lean_canvas", "recall_user_facts", "manage_consultant"],
  "manage_consultant": ["manage_consultant", "show_widget", "compose_dashboard"],
  "search_web": ["recall_episodic_memory", "search_knowledge_base", "browser_search", "browser_scrape", "browser_action", "show_widget"],
  "manage_task": ["recall_user_facts", "spawn_sub_agent", "manage_cron", "show_widget", "compose_dashboard"],
  "recall_memory": ["search_knowledge_base", "show_widget"],
  "check_my_health": ["show_widget"],
  "check_system_vitals": ["get_system_vitals", "show_widget"],
  "check_notifications": ["manage_notifications", "show_widget"],
  "schedule_task": ["recall_user_facts", "manage_cron"],
  "broadcast_message": ["recall_user_facts"],
  "manage_goal": ["recall_user_facts", "search_web", "browser_search", "show_widget"],
  "browse_web": ["browser_scrape", "browser_search", "browser_map", "browser_action", "show_widget"],
  "research": ["browser_search", "browser_scrape", "browser_action", "spawn_sub_agent", "spawn_parallel_swarm", "search_web", "show_widget"],
  "ingest_knowledge": ["ingest_url", "digest_text", "search_knowledge_base", "show_widget"],
  "search_knowledge": ["search_knowledge_base", "recall_episodic_memory", "recall_user_facts", "show_widget"],
  "manage_skill": ["create_skill", "list_my_skills", "get_skill_details", "execute_skill", "update_skill", "delete_skill", "learn_skill_from_url", "forge_skill"],
  "manage_cron": ["manage_cron", "schedule_task"],
  "manage_facebook": ["manage_facebook_page", "search_web", "recall_user_facts", "show_widget", "compose_dashboard"],
  "manage_notion": ["manage_notion", "recall_user_facts", "search_knowledge_base", "show_widget"],
};

// Primary route map
const TOOL_ROUTES: Record<string, string[]> = {
  "save_verbatim": ["save_verbatim_content"],
  "generate_content": ["generate_ai_content", "search_knowledge_base"],
  "generate_image": ["generate_image"],
  "search_info": ["search_knowledge_base", "recall_episodic_memory"],
  "search_web": ["search_web", "search_knowledge_base"],
  "manage_finance": ["manage_flowstate", "cfo_cashflow_forecast", "cfo_runway_analysis", "cfo_unit_economics", "cfo_pnl_summary", "manage_budget", "manage_investment", "financial_report", "show_widget"],
  "strategy_advisory": ["strategy_swot_analysis", "strategy_porter_five_forces", "strategy_okr_tracker", "strategy_roadmap", "strategy_lean_canvas", "show_widget", "compose_dashboard"],
  "manage_task": ["manage_workspace_task"],
  "manage_content": ["manage_ai_content"],
  "remember_fact": ["remember_user_fact", "update_agent_settings"],
  "recall_memory": ["recall_user_facts", "recall_episodic_memory", "recall_session_history"],
  "navigate_app": ["get_app_navigation"],
  "update_settings": ["update_agent_settings"],
  "check_notifications": ["manage_notifications"],
  "get_user_info": ["get_user_info"],
  "manage_api_key": ["manage_api_key"],
  "check_my_health": ["check_my_health"],
  "check_system_vitals": ["get_system_vitals"],
  "broadcast_message": ["broadcast_message"],
  "reset_telegram_config": ["broadcast_message", "reset_telegram_config"],
  "schedule_task": ["schedule_task", "manage_cron"],
  "send_push_notification": ["send_push_notification"],
  "manage_goal": ["manage_goal"],
  "check_config": ["get_my_config"],
  "answer_question": [],
  "ingest_knowledge": ["ingest_url", "digest_text"],
  "search_knowledge": ["search_knowledge_base"],
  "configure_group": ["configure_group_bot"],
  "manage_skill": ["create_skill", "list_my_skills", "get_skill_details", "execute_skill", "update_skill", "delete_skill", "learn_skill_from_url", "forge_skill"],
  "manage_cron": ["manage_cron"],
  "browse_web": ["browser_action", "browser_scrape", "browser_search", "browser_map"],
  "manage_facebook": ["manage_facebook_page"],
  "manage_notion": ["manage_notion"],
};

export const ToolMarshal = {
  /**
   * Enhanced Tool Routing with cross-category expansion and complexity override.
   * v3: Always-available tools + expansion map + complexity bypass + admin expansion
   */
  getFilteredTools(primaryAction: string | undefined, complexity: string | undefined, allTools: any[], isAdmin: boolean = false): any[] | null {
    // Complex queries always get full tool set — maximum flexibility
    if (complexity === "complex") {
      console.log(`[ToolMarshal] Complexity override: "complex" → full tool set`);
      return null;
    }

    if (!primaryAction || primaryAction === "other") {
      return null; // Use full tool set
    }

    const primaryTools = TOOL_ROUTES[primaryAction];
    if (primaryTools === undefined) return null; // Unknown action → full set

    // Get expansion tools for this action
    const expansionTools = TOOL_EXPANSION[primaryAction] || [];

    // Merge: primary + expansion + always-available (deduplicated)
    const baseAllowed = [...primaryTools, ...expansionTools, ...ALWAYS_AVAILABLE_TOOLS];
    
    // Admin expansion: always include core admin tools
    if (isAdmin) {
      baseAllowed.push(...ADMIN_ALWAYS_AVAILABLE_TOOLS);
    }
    
    const allAllowed = [...new Set(baseAllowed)];

    const filtered = allTools.filter((t: any) =>
      allAllowed.includes(t.function?.name)
    );

    // Safety net: if merged set is still too small, fall back to full
    if (filtered.length < 3) {
      console.warn(`[ToolMarshal] Safety net: merged set only ${filtered.length} tools for "${primaryAction}", falling back to full set`);
      return null;
    }

    console.log(`[ToolMarshal v3] Action "${primaryAction}" → ${filtered.length} tools (primary:${primaryTools.length} + expansion:${expansionTools.length} + always:${ALWAYS_AVAILABLE_TOOLS.length}${isAdmin ? ' + admin' : ''}): [${filtered.map((t: any) => t.function?.name).join(",")}]`);
    return filtered;
  },
};
