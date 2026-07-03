
// ═══ Project Phoenix: _shared/tool-executor.ts ═══
// Main Router for Tool Execution
// Routes requests to specialized executor modules

import type { AgentSettings } from "./prompt-builder.ts";
import { 
  logAdminToolAction, logAgentCommunication, 
  validateToolArgs, getRecoverySuggestion 
} from "./executor-helpers.ts";

// Import all executor modules
import * as CoreExec from "./tool-executors/core.ts";
import * as AdminExec from "./tool-executors/admin.ts";
import * as SuperExec from "./tool-executors/super.ts";
import * as NetworkExec from "./tool-executors/network.ts";
import * as SystemExec from "./tool-executors/system.ts";
import * as AdvancedExec from "./tool-executors/advanced.ts";
import * as SkillsExec from "./tool-executors/skills.ts";
import * as SkillLearnerExec from "./tool-executors/skill-learner.ts";
import * as SkillForgeExec from "./tool-executors/skill-forge.ts";
import * as AgenticExportExec from "./tool-executors/agentic-export.ts";
import * as NotionExec from "./tool-executors/notion.ts";
import * as FinanceExec from "./tool-executors/finance.ts";
import * as CfoStrategyExec from "./tool-executors/cfo-strategy.ts";
import * as FtsRecallExec from "./tool-executors/fts-recall.ts";
import { executeManageConsultant } from "./tool-executors/consultant.ts";
import {
  executeManageProactiveTrigger,
  executeManageWorldEntity,
  executeManageLesson,
} from "./tool-executors/agentic-era.ts";


export { 
  formatToolName, formatToolResult, formatToolResultForUser, 
  generateFallbackResponse,
  updateLearningContext, upsertLearningContext 
} from "./executor-helpers.ts";

export { validateToolArgs } from "./executor-helpers.ts";

// ═══ BOOT-TIME REGISTRY DIAGNOSTIC (Bug #1 — orphan tool detection) ═══
// Reports executor cases that have no corresponding tool definition.
// Diagnostic only — no removal. Logs once at module load.
let __registryDiagRan = false;
export async function runRegistryDiagnostic(): Promise<void> {
  if (__registryDiagRan) return;
  __registryDiagRan = true;
  try {
    const defsModule: any = await import("./tool-definitions.ts");
    const defs: any[] = defsModule.TOOL_DEFINITIONS || defsModule.default || [];
    const definedNames = new Set<string>(
      defs.map((d: any) => d?.function?.name || d?.name).filter(Boolean)
    );
    // The executor case names live in this file's source — declared inline below
    // for known-orphan static checking. We can't reflect on `switch` AST at runtime.
    // KNOWN_EXECUTOR_CASES must be kept in sync when adding/removing tool routing.
    const KNOWN_EXECUTOR_CASES: string[] = (globalThis as any).__BEEBOT_TOOL_CASES__ || [];
    if (KNOWN_EXECUTOR_CASES.length === 0) {
      // First-pass: nothing registered yet — skip silently
      return;
    }
    const orphans = KNOWN_EXECUTOR_CASES.filter(c => !definedNames.has(c));
    const undefinedDefs = [...definedNames].filter(n => !KNOWN_EXECUTOR_CASES.includes(n));
    if (orphans.length || undefinedDefs.length) {
      console.warn(
        `[ToolRegistryDiag] defined=${definedNames.size} cases=${KNOWN_EXECUTOR_CASES.length} ` +
        `orphan_cases=${orphans.length} unbacked_defs=${undefinedDefs.length}`
      );
      if (orphans.length) console.warn(`[ToolRegistryDiag] Orphan executor cases (DEAD): ${orphans.join(', ')}`);
      if (undefinedDefs.length) console.warn(`[ToolRegistryDiag] Defined-but-no-executor: ${undefinedDefs.join(', ')}`);
    } else {
      console.log(`[ToolRegistryDiag] OK — ${definedNames.size} tools fully reconciled`);
    }
  } catch (e: any) {
    console.warn('[ToolRegistryDiag] skipped:', e?.message);
  }
}
// Fire once at boot (non-blocking)
runRegistryDiagnostic().catch(() => {});

// ═══ TOOL EXECUTION WITH VALIDATION & RETRY ═══
const MAX_TOOL_RETRIES = 2;

export async function executeTool(
  supabase: any, 
  userId: string, 
  toolName: string, 
  args: any,
  isAdmin: boolean = false,
  authHeader?: string,
  options?: { timezone?: string; effectiveNowMs?: number; driftMs?: number; sessionId?: string; messageId?: string; sourceChannel?: string; groupContext?: { is_group: boolean; group_title: string; triggered_by: string }; _isSubAgent?: boolean; writer?: any; encoder?: any; isUsingPersonalKey?: boolean; userAISettings?: any; agentSettings?: any; serviceClient?: any }
): Promise<any> {
  // Validate arguments first
  const validation = validateToolArgs(toolName, args);
  if (!validation.valid) {
    return {
      error: validation.error,
      missing_params: true,
      suggestion: validation.suggestion,
      ask_user: true
    };
  }

  // Execute with retry logic
  let lastError: any = null;
  for (let attempt = 0; attempt <= MAX_TOOL_RETRIES; attempt++) {
    try {
      const result = await executeToolInternal(supabase, userId, toolName, args, isAdmin, authHeader, options);
      return result;
    } catch (error: any) {
      lastError = error;
      console.error(`[Tool Retry ${attempt + 1}/${MAX_TOOL_RETRIES + 1}] ${toolName} failed:`, error.message);
      
      if (attempt < MAX_TOOL_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  // All retries failed
  return {
    error: lastError?.message || "Tool execution failed",
    tool: toolName,
    recovery_suggestion: getRecoverySuggestion(toolName, lastError)
  };
}

async function executeToolInternal(
  supabase: any, 
  userId: string, 
  toolName: string, 
  args: any,
  isAdmin: boolean = false,
  authHeader?: string,
  options?: { timezone?: string; effectiveNowMs?: number; driftMs?: number; sessionId?: string; sourceChannel?: string; groupContext?: { is_group: boolean; group_title: string; triggered_by: string }; _isSubAgent?: boolean; writer?: any; encoder?: any; isUsingPersonalKey?: boolean; userAISettings?: any }
): Promise<any> {
  // ═══ SHARED AI CALLER FACTORY (Provider-Aware) ═══
  function buildAiCaller(temperature: number, maxTokens: number) {
    return async (prompt: string, systemPrompt: string): Promise<string> => {
      const { resolveInternalLLM } = await import("./internal-llm-caller.ts");
      const { GEMINI_OPENAI_ENDPOINT } = await import("./api-endpoints.ts");
      
      // Try personal Gemini key first, then OpenRouter key
      const personalKey = options?.userAISettings?.gemini_api_key;
      const openrouterKey = options?.userAISettings?.personalOpenrouterKey;
      
      let endpoint = GEMINI_OPENAI_ENDPOINT;
      let key = personalKey;
      let model = (options?.userAISettings?.gemini_model || "gemini-3.5-flash").replace(/^google\//, "");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      
      if (personalKey) {
        key = personalKey;
        headers["Authorization"] = `Bearer ${personalKey}`;
      } else if (openrouterKey) {
        const { OPENROUTER_ENDPOINT, OPENROUTER_HEADERS } = await import("./api-endpoints.ts");
        key = openrouterKey;
        endpoint = OPENROUTER_ENDPOINT;
        model = options?.userAISettings?.gemini_model?.startsWith("google/")
          ? options.userAISettings.gemini_model
          : "google/gemini-3.5-flash";
        headers["Authorization"] = `Bearer ${openrouterKey}`;
        Object.assign(headers, OPENROUTER_HEADERS);
      } else {
        throw new Error("Personal API key required for AI calls");
      }
      
      const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`AI call failed [${resp.status}]: ${errText}`);
      }
      const data = await resp.json();
      return data.choices?.[0]?.message?.content || "";
    };
  }

  // ═══ SOUL PROTECTION: Hard block soul-modifying tools from group context ═══
  const SOUL_TOOLS = ['update_agent_settings', 'update_my_instructions'];
  if (SOUL_TOOLS.includes(toolName) && options?.groupContext?.is_group) {
    console.warn(`[SoulGuard] BLOCKED: ${toolName} attempted from group context`);
    return {
      error: "⛔ Soul modification blocked: group context has read-only access to BeeBot's identity.",
      blocked_by: "soul_protection_protocol",
      tool: toolName,
    };
  }

  // ═══ GROUP CHAT SAFETY LOCK ═══
  if (options?.groupContext?.is_group) {
    const BLOCKED_IN_GROUP = [
      // Admin tools
      'admin_system_overview', 'admin_user_lookup', 'admin_manage_prompts',
      'admin_manage_feature_flags', 'admin_manage_knowledge_base',
      'admin_manage_ai_settings', 'admin_manage_user_data',
      'admin_manage_token_quotas', 'admin_ai_analytics',
      'admin_view_user_psychology', 'run_ai_doctor', 'view_doctor_reports',
      'add_to_brain',
      // Super agent tools
      'super_self_reflect', 'super_proactive_suggest', 'super_teach_agents',
      'super_analyze_patterns', 'super_knowledge_synthesize', 'super_optimize_system',
      'super_emergency_action', 'super_autonomous_decision', 'super_read_all_feedback',
      'super_analyze_feedback', 'super_process_feedback', 'super_discuss_with_admin',
      'super_app_omniscience', 'super_analyze_response_feedback',
      'super_monitor_agent_network', 'super_create_sync_pipeline',
      'super_bulk_train', 'super_execute_code', 'super_plan_and_execute',
      'super_broadcast_notification',
      // Sensitive system tools
      'manage_api_key', 'reset_telegram_config', 'update_agent_settings',
      'update_my_instructions', 'broadcast_message',
      // Sensitive core tools
      'manage_flowstate', 'manage_budget', 'manage_investment', 'financial_report', 'tax_estimate',
      'configure_group_bot',
      'spawn_parallel_swarm',
    ];

    if (BLOCKED_IN_GROUP.includes(toolName)) {
      return {
        error: "⚠️ Security: This tool is disabled in Group Chats. Please DM me for system actions.",
        blocked_by: "group_safety_lock",
        tool: toolName,
      };
    }
  }

  switch (toolName) {
    // ═══ CORE TOOLS (User Facing) ═══
    case "generate_ai_content": return await CoreExec.executeAIContent(supabase, userId, args, authHeader, options);
    case "spawn_autonomous_job": return await CoreExec.executeSpawnAutonomousJob(supabase, userId, args, authHeader);
    case "manage_ai_content": return await CoreExec.executeManageAIContent(supabase, userId, args);
    case "manage_flowstate": return await CoreExec.executeFlowState(supabase, userId, args);
    case "manage_budget": return await FinanceExec.executeManageBudget(supabase, userId, args);
    case "manage_investment": return await FinanceExec.executeManageInvestment(supabase, userId, args);
    case "financial_report": return await FinanceExec.executeFinancialReport(supabase, userId, args);
    case "tax_estimate": return await FinanceExec.executeTaxEstimate(supabase, userId, args);
    // ═══ 💼 CFO TOOLS ═══
    case "cfo_cashflow_forecast": return await CfoStrategyExec.executeCfoCashflowForecast(supabase, userId, args);
    case "cfo_runway_analysis": return await CfoStrategyExec.executeCfoRunwayAnalysis(supabase, userId, args);
    case "cfo_unit_economics": return CfoStrategyExec.executeCfoUnitEconomics(supabase, userId, args);
    case "cfo_pnl_summary": return await CfoStrategyExec.executeCfoPnlSummary(supabase, userId, args);
    // ═══ 🧭 STRATEGY TOOLS ═══
    case "strategy_swot_analysis": return CfoStrategyExec.executeStrategySwot(supabase, userId, args);
    case "strategy_porter_five_forces": return CfoStrategyExec.executeStrategyPorter(supabase, userId, args);
    case "strategy_okr_tracker": return CfoStrategyExec.executeStrategyOkr(supabase, userId, args);
    case "strategy_roadmap": return CfoStrategyExec.executeStrategyRoadmap(supabase, userId, args);
    case "strategy_lean_canvas": return CfoStrategyExec.executeStrategyLeanCanvas(supabase, userId, args);
    case "manage_workspace_task": return await CoreExec.executeWorkspaceTask(supabase, userId, args);
    case "get_user_info": return await CoreExec.executeGetUserInfo(supabase, userId, args);
    case "update_agent_settings": return await CoreExec.executeUpdateAgentSettings(supabase, userId, args);
    case "search_knowledge_base": return await CoreExec.executeSearchKnowledgeBase(supabase, userId, args, { agentSettings: options?.agentSettings, serviceClient: options?.serviceClient });
    case "search_web": return await CoreExec.executeSearchWeb(supabase, userId, args);
    case "manage_notifications": return await CoreExec.executeManageNotifications(supabase, userId, args);
    case "get_app_navigation": return await CoreExec.executeGetAppNavigation(args);
    case "recall_episodic_memory": return await CoreExec.executeRecallEpisodicMemory(supabase, userId, args, options);
    case "recall_session_history": return await FtsRecallExec.executeRecallSessionHistory(supabase, userId, args, options);
    case "manage_consultant": return await executeManageConsultant(supabase, userId, args);
    case "remember_user_fact": return await CoreExec.executeRememberUserFact(supabase, userId, args);
    case "recall_user_facts": return await CoreExec.executeRecallUserFacts(supabase, userId, args, options);
    case "manage_memory": return await CoreExec.executeManageMemory(supabase, userId, args, options);
    case "check_achievements": return await CoreExec.executeCheckAchievements(supabase, userId);
    case "generate_image": return await CoreExec.executeGenerateImage(supabase, userId, args, options);

    // ═══ AGENTIC ERA (Autonomy + World Model + Reflection) ═══
    case "manage_proactive_trigger": return await executeManageProactiveTrigger(supabase, userId, args);
    case "manage_world_entity": return await executeManageWorldEntity(supabase, userId, args);
    case "manage_lesson": return await executeManageLesson(supabase, userId, args);
    case "export_agentic_data": return await AgenticExportExec.executeExportAgenticData(supabase, userId, args);

    // ═══ FILE GENERATION (Client-Side Rendering) ═══
    case "generate_file": {
      // No server-side processing needed - just validate and pass through
      const { file_type, content, filename } = args;
      if (!file_type || !content || !filename) {
        return { error: "Missing required parameters: file_type, content, filename" };
      }
      return { 
        success: true, 
        file_type, 
        content, 
        filename: `${filename}`,
        message: `📄 ${filename}.${file_type} ဖိုင် ဖန်တီးပြီးပါပြီ။ Download button ကိုနှိပ်ပြီး ဒေါင်းလုဒ်ယူပါ။`
      };
    }

    // ═══ SHOW WIDGET (Client-Side Rendering + Presets) — FORGIVING EXECUTOR ═══
    case "show_widget":
    case "compose_dashboard": {
      const widgetArgs = args && typeof args === "object" ? args : {};
      const isComposeDashboard = toolName === "compose_dashboard";
      let { html, title, height, preset, data, auto_height, compose, focus, density } = widgetArgs as any;

      // compose_dashboard alias → run the data-composer over `data` and render as dashboard
      if (isComposeDashboard) compose = true;

      // 1) Auto-infer preset from data shape when missing
      const inferPreset = (d: any): string | null => {
        if (!d || typeof d !== "object") return null;
        if (Array.isArray(d)) return "kpi_dashboard"; // bare array → kpis
        if (d.sections) return "dashboard";
        if (d.kpis) return "kpi_dashboard";
        if (d.segments) return "donut_chart";
        if (d.series) return "line_chart";
        if (d.values && d.labels) return "bar_chart";
        if (d.stats) return "stat_grid";
        if (d.items) return "progress_bars";
        if (d.rows && d.columns) return "data_table";
        if (d.steps && d.actors) return "sequence_diagram";
        if (d.steps) return "progress_tracker";
        if (d.tasks) return "gantt_chart";
        if (d.plans) return "pricing_cards";
        if (d.images) return "image_gallery";
        if (d.nodes && d.edges) return "flowchart";
        if (d.nodes && d.links) return "network_graph";
        if (d.root && d.branches) return "mindmap";
        if (d.root && d.children !== undefined) return "org_chart";
        if (d.root && (d.root.children || d.root.role)) return "org_chart";
        if (d.nodes) return "tree_view";
        if (d.pins) return "map_pins";
        if (d.fields) return "form_builder";
        if (d.question && d.options) return "quiz_card";
        if (d.events) return d.month != null ? "calendar_view" : "timeline";
        if (d.metrics) return "scorecard";
        if (d.lines && (d.language || d.lines[0]?.type)) return "code_diff";
        return null;
      };

      // Data-composer path: turn arbitrary data into a dashboard payload
      if (compose && data) {
        try {
          const { composeDashboard } = await import("./data-composer.ts");
          const composed = composeDashboard(data, { title, focus, density });
          data = composed;
          preset = "dashboard";
        } catch (e) {
          return {
            error: `compose failed: ${e instanceof Error ? e.message : String(e)}`,
            guide: "Pass real structured data (object or array). For pre-built dashboards, set compose:false and supply data.sections[].",
            action_needed: "RETRY with valid `data` (array of records, object map, or {sections}).",
          };
        }
      }

      if (!preset && data) preset = inferPreset(data);

      // 2) Auto-wrap loose data (bare array → preset-appropriate key)
      if (preset && Array.isArray(data)) {
        const keyMap: Record<string, string> = {
          kpi_dashboard: "kpis", stat_grid: "stats", bar_chart: "values",
          donut_chart: "segments", progress_bars: "items", timeline: "events",
          pricing_cards: "plans", image_gallery: "images", tree_view: "nodes",
        };
        const k = keyMap[preset];
        if (k) data = { [k]: data };
      }

      // Apply density override on dashboards
      if (preset === "dashboard" && density && data && typeof data === "object" && !data.density) {
        data = { ...data, density };
      }

      // 3) Auto-fill title from preset
      if (!title) {
        const titleMap: Record<string, string> = {
          dashboard: "Dashboard",
          kpi_dashboard: "KPI Dashboard", bar_chart: "Bar Chart", line_chart: "Line Chart",
          donut_chart: "Donut Chart", progress_bars: "Progress", stat_grid: "Stats",
          data_table: "Data Table", comparison_table: "Comparison", timeline: "Timeline",
          scorecard: "Scorecard", progress_tracker: "Progress", calendar_view: "Calendar",
          gantt_chart: "Gantt Chart", pricing_cards: "Pricing", image_gallery: "Gallery",
          code_diff: "Code Diff", tree_view: "Tree", map_pins: "Map", quiz_card: "Quiz",
          form_builder: "Form",
          flowchart: "Flowchart", mindmap: "Mind Map", sequence_diagram: "Sequence Diagram",
          org_chart: "Org Chart", network_graph: "Network Graph",
        };
        title = (preset && titleMap[preset]) || (data?.title) || "Widget";
      }

      let finalHtml = html;
      let resolvedHeight = height;
      if (preset && data) {
        try {
          // ═══ Per-preset data validation (non-dashboard presets) ═══
          if (preset !== "dashboard") {
            const { validateWidgetData } = await import("./widget-validators.ts");
            const vr = validateWidgetData(preset, data);
            if (!vr.ok) {
              return {
                error: `Widget data validation failed for preset "${preset}"`,
                validation_errors: vr.errors,
                guide: `Fix the listed validation errors and retry show_widget. The data shape must match the "${preset}" preset requirements.`,
                action_needed: "RETRY show_widget with corrected `data` that satisfies all validation_errors.",
              };
            }
          }
          const { generatePresetHtml, suggestPresetHeight, validateDashboard } = await import("./widget-presets.ts");
          if (preset === "dashboard") {
            const v = validateDashboard(data);
            if (!v.ok) {
              return {
                error: "dashboard validation failed",
                section_errors: v.errors,
                guide: "Each section needs {preset, data}. Optional: {span 1-12, title, note, hidden}. Don't nest 'dashboard' inside a section.",
                action_needed: "RETRY show_widget with corrected sections[]. Per-section errors are listed in `section_errors`.",
              };
            }
          }
          finalHtml = generatePresetHtml(preset, data);
          if (auto_height || !height) {
            resolvedHeight = suggestPresetHeight(preset, data);
          }
        } catch (e) {
          return {
            error: `Widget preset render failed: ${e instanceof Error ? e.message : String(e)}`,
            guide: "Check that `data` matches the preset's expected shape (see show_widget tool description).",
            action_needed: "RETRY show_widget with corrected `data` shape. DO NOT write the data as prose — that breaks user trust.",
          };
        }
      }
      if (!finalHtml) {
        return {
          error: "show_widget needs either `preset`+`data` OR `html` (or `compose:true`+raw data)",
          guide: "Pick a preset (kpi_dashboard, bar_chart, line_chart, donut_chart, stat_grid, data_table, dashboard, etc.) and pass matching `data`. For arbitrary structured data, use compose_dashboard or show_widget with compose:true.",
          action_needed: "RETRY show_widget this turn with corrected arguments. NEVER fabricate data in prose — if you have no real data, ask the user or call a data-fetching tool first.",
          example: {
            title: "Page Growth",
            preset: "kpi_dashboard",
            auto_height: true,
            data: { kpis: [
              { label: "Followers", value: "15,420", delta: "+12.5%", trend: "up" },
              { label: "Engagement", value: "4.8%", delta: "+5.2%", trend: "up" },
            ]},
          },
        };
      }
      // Fluid ceiling: composite + diagram presets get 4000px, simple presets 1600px.
      const composite = ["dashboard","flowchart","mindmap","sequence_diagram","org_chart","network_graph"].includes(preset || "");
      const ceiling = composite ? 4000 : 1600;
      const result: Record<string, any> = {
        success: true,
        html: finalHtml,
        title,
        height: Math.min(Math.max(resolvedHeight || 400, 100), ceiling),
        preset: preset || null,
        // Echo the (possibly composed) data back so the Layout Builder UI can edit dashboards in place.
        data: data ?? null,
      };
      // Fire-and-forget persist to widget_snapshots
      if (userId && options?.sessionId) {
        supabase.from("widget_snapshots").insert({
          user_id: userId,
          session_id: options.sessionId,
          message_id: (options as any).messageId || "unknown",
          title,
          html: finalHtml,
          height: result.height,
          preset: preset || null,
        }).then(() => {}).catch(() => {});
      }
      return result;
    }

    // ═══ ADMIN TOOLS ═══
    case "admin_system_overview": if (!isAdmin) return { error: "Admin required" }; return await AdminExec.executeAdminSystemOverview(supabase, args);
    case "admin_user_lookup": if (!isAdmin) return { error: "Admin required" }; return await AdminExec.executeAdminUserLookup(supabase, args);
    case "admin_manage_prompts": if (!isAdmin) return { error: "Admin required" }; return await AdminExec.executeAdminManagePrompts(supabase, userId, args);
    case "admin_manage_feature_flags": if (!isAdmin) return { error: "Admin required" }; return await AdminExec.executeAdminManageFeatureFlags(supabase, userId, args);
    case "admin_manage_knowledge_base": if (!isAdmin) return { error: "Admin required" }; return await AdminExec.executeAdminManageKnowledgeBase(supabase, userId, args);
    case "admin_manage_ai_settings": if (!isAdmin) return { error: "Admin required" }; return await AdminExec.executeAdminManageAISettings(supabase, userId, args);
    case "admin_manage_user_data": if (!isAdmin) return { error: "Admin required" }; return await AdminExec.executeAdminManageUserData(supabase, userId, args);
    case "save_verbatim_content": return await AdminExec.executeSaveVerbatimContent(supabase, userId, args); // Also user tool
    case "add_to_brain": if (!isAdmin) return { error: "Admin required" }; return await AdminExec.executeAddToBrain(supabase, userId, args);
    case "admin_view_user_psychology": if (!isAdmin) return { error: "Admin required" }; return await AdminExec.executeAdminViewUserPsychology(supabase, args);
    case "run_ai_doctor": if (!isAdmin) return { error: "Admin required" }; return await AdminExec.executeRunAiDoctor(supabase);
    case "view_doctor_reports": if (!isAdmin) return { error: "Admin required" }; return await AdminExec.executeViewDoctorReports(supabase, args);
    case "admin_manage_token_quotas": if (!isAdmin) return { error: "Admin required" }; return await AdminExec.executeAdminManageTokenQuotas(supabase, userId, args);
    case "admin_ai_analytics": if (!isAdmin) return { error: "Admin required" }; return await AdminExec.executeAdminAIAnalytics(supabase, userId, args);

    // ═══ SUPER AGENT TOOLS ═══
    case "super_self_reflect": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperSelfReflect(supabase, userId, args);
    case "super_proactive_suggest": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperProactiveSuggest(supabase, userId, args);
    case "super_teach_agents": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperTeachAgents(supabase, userId, args);
    case "super_analyze_patterns": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperAnalyzePatterns(supabase, userId, args);
    case "super_knowledge_synthesize": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperKnowledgeSynthesize(supabase, userId, args);
    case "super_optimize_system": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperOptimizeSystem(supabase, userId, args);
    case "super_emergency_action": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperEmergencyAction(supabase, userId, args);
    case "super_autonomous_decision": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperAutonomousDecision(supabase, userId, args);
    case "super_read_all_feedback": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperReadAllFeedback(supabase, userId, args);
    case "super_analyze_feedback": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperAnalyzeFeedback(supabase, userId, args);
    case "super_process_feedback": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperProcessFeedback(supabase, userId, args);
    case "super_discuss_with_admin": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperDiscussWithAdmin(supabase, userId, args);
    case "super_app_omniscience": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperAppOmniscience(supabase, userId, args);
    case "super_analyze_response_feedback": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperAnalyzeResponseFeedback(supabase, userId, args);
    case "super_monitor_agent_network": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperMonitorAgentNetwork(supabase, userId, args);
    case "super_create_sync_pipeline": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperCreateSyncPipeline(supabase, userId, args);
    case "super_bulk_train": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperBulkTrain(supabase, userId, args);
    case "super_execute_code": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperExecuteCode(supabase, userId, args);
    case "super_plan_and_execute": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperPlanAndExecute(supabase, userId, args);
    case "super_broadcast_notification": if (!isAdmin) return { error: "Super Agent required" }; return await SuperExec.executeSuperBroadcastNotification(supabase, userId, args);

    // ═══ NETWORK TOOLS ═══
    case "query_agent_network": return await NetworkExec.executeQueryAgentNetwork(supabase, userId, args);
    case "share_to_agent_network": return await NetworkExec.executeShareToAgentNetwork(supabase, userId, args);
    case "ask_other_agents": return await NetworkExec.executeAskOtherAgents(supabase, userId, args);
    case "respond_to_agent_query": return await NetworkExec.executeRespondToAgentQuery(supabase, userId, args);
    case "check_agent_messages": return await NetworkExec.executeCheckAgentMessages(supabase, userId, args);

    // ═══ SYSTEM TOOLS ═══
    case "check_my_health": return await SystemExec.executeCheckMyHealth(supabase, userId, args);
    case "audit_ai_usage": return await SystemExec.executeAuditAIUsage(supabase, userId, args);
    case "get_system_vitals": if (!isAdmin) return { error: "Admin required" }; return await SystemExec.executeGetSystemVitals(supabase, args);
    case "manage_api_key": return await SystemExec.executeManageApiKey(supabase, userId, args);
    case "broadcast_message": return await SystemExec.executeBroadcastMessage(supabase, userId, args);
    case "reset_telegram_config": return await SystemExec.executeBroadcastMessage(supabase, userId, { action: "reset" });
    case "get_my_config": return await SystemExec.executeGetMyConfig(supabase, userId, options?.sourceChannel);
    case "schedule_task": return await SystemExec.executeScheduleTask(supabase, userId, args, options?.timezone, { effectiveNowMs: options?.effectiveNowMs, driftMs: options?.driftMs });
    case "manage_scheduled_task_health": return await SystemExec.executeScheduledTaskHealth(supabase, userId, args);
    case "repair_scheduled_task": return await SystemExec.executeRepairScheduledTask(supabase, userId, args, options?.timezone);
    case "send_push_notification": return await SystemExec.executeSendPushNotification(supabase, userId, args);
    case "analyze_my_logs": return await SystemExec.executeAnalyzeMyLogs(supabase, userId, args);
    case "update_my_instructions": return await SystemExec.executeUpdateMyInstructions(supabase, userId, args);
    case "configure_group_bot": return await SystemExec.executeConfigureGroupBot(supabase, userId, args);
    case "manage_facebook_page": return await SystemExec.executeFacebookPage(supabase, userId, args, authHeader);

    // ═══ ADVANCED TOOLS ═══
    case "self_update_knowledge": return await AdvancedExec.executeSelfUpdateKnowledge(supabase, userId, args);
    case "fetch_external_api": return await AdvancedExec.executeFetchExternalApi(supabase, userId, args);
    case "self_debug": return await AdvancedExec.executeSelfDebug(supabase, userId, args);
    case "manage_goal": return await AdvancedExec.executeManageGoal(supabase, userId, args);
    case "ingest_url": return await AdvancedExec.executeIngestUrl(supabase, userId, args);
    case "digest_text": return await AdvancedExec.executeDigestText(supabase, userId, args);
    case "spawn_sub_agent": return await AdvancedExec.executeSpawnSubAgent(supabase, userId, args, options?.sessionId || "", isAdmin, authHeader, options);
    case "spawn_parallel_swarm": return await AdvancedExec.executeParallelSwarm(supabase, userId, args, options?.sessionId || "", isAdmin, authHeader, options);
    case "browser_scrape": return await AdvancedExec.executeBrowserScrape(args);
    case "browser_search": return await AdvancedExec.executeBrowserSearch(args);
    case "browser_map": return await AdvancedExec.executeBrowserMap(args);

    // ═══ OPENCLAW: SELF-HACKABLE SKILLS ═══
    case "get_skill_details": return await SkillsExec.executeGetSkillDetails(supabase, userId, args);
    case "create_skill": return await SkillsExec.executeCreateSkill(supabase, userId, args);
    case "list_my_skills": return await SkillsExec.executeListSkills(supabase, userId, args);
    case "execute_skill": {
      // Build a tool executor callback that routes back through executeToolInternal
      const toolRunner = async (toolName: string, toolArgs: any) => {
        return await executeToolInternal(supabase, userId, toolName, toolArgs, isAdmin, authHeader, options);
      };
      return await SkillsExec.executeExecuteSkill(supabase, userId, args, toolRunner);
    }
    case "update_skill": return await SkillsExec.executeUpdateSkill(supabase, userId, args);
    case "delete_skill": return await SkillsExec.executeDeleteSkill(supabase, userId, args);
    case "learn_skill_from_url": {
      const toolRunner = async (tName: string, tArgs: any) => {
        return await executeToolInternal(supabase, userId, tName, tArgs, isAdmin, authHeader, options);
      };
      return await SkillLearnerExec.executeLearnSkillFromUrl(supabase, userId, args, toolRunner, buildAiCaller(0.1, 2000));
    }
    case "forge_skill": {
      const toolRunner = async (tName: string, tArgs: any) => {
        return await executeToolInternal(supabase, userId, tName, tArgs, isAdmin, authHeader, options);
      };
      return await SkillForgeExec.executeForgeSkill(supabase, userId, args, toolRunner, buildAiCaller(0.2, 4000));
    }

    // ═══ OPENCLAW: CRON MANAGER ═══
    case "manage_cron": return await SystemExec.executeCronManager(supabase, userId, args, options?.timezone);

    // ═══ OPENCLAW: BROWSER ACTION (Interactive) ═══
    case "browser_action": return await AdvancedExec.executeBrowserAction(args);

    // ═══ NOTION INTEGRATION ═══
    case "manage_notion": return await NotionExec.executeManageNotion(supabase, userId, args);

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
