// ═══ BeeBot Autonomous Orchestrator (V6 — DAG + Real Tool Execution) ═══
// V6: Two-phase specialist execution: real tool → LLM synthesis.
//     DAG execution with topological parallelism, specialist agent routing,
//     inter-agent delegation, granular step tracking in autonomous_task_steps.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { executeTool } from "../_shared/tool-executor.ts";
import {
  ProviderCircuitBreaker, buildProviderChain, getNextProvider,
  classifyProviderError, isNonRecoverableError,
} from "../_shared/provider-failover.ts";
import {
  type DAGStep, type DAGExecutionConfig, DEFAULT_DAG_CONFIG,
  DAG_PLAN_SYSTEM_PROMPT,
} from "../_shared/dag-executor.ts";
import {
  routeToSpecialist, getAgentRolesUsed, createPeerChannel,
} from "../_shared/specialist-agents.ts";
import { writeScratchpad, buildScratchpadSynthesisPrompt, type ScratchpadEntry } from "../_shared/scratchpad.ts";
import { runCoordinatorLoop, type CoordinatorConfig } from "../_shared/coordinator-loop.ts";
import { checkGrounding } from "../_shared/grounding-guard.ts";
import { sanitizeForChannel } from "../_shared/content-sanitizer.ts";
import { callGeminiDirect, callAnthropicDirect, callOpenAIDirect } from "../_shared/ai-call-helpers.ts";
import { trackAIUsage } from "../_shared/streaming-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STEP_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 1;
const MODEL_DEFAULT = "gemini-3.5-flash";

// Grounding guard and entity extraction now imported from _shared/grounding-guard.ts

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let taskId: string | null = null;
  let supabase: any = null;
  let sessionId: string | null = null;
  let userId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const prompt = body.prompt;
    sessionId = body.sessionId;
    userId = body.userId;
    const existingTaskId = body.taskId;
    const apiSourcePreference = body.api_source_preference === "system" ? "system" : "personal";
    const preferredModelFromClient = typeof body.preferred_model === "string" && body.preferred_model.trim().length > 0
      ? body.preferred_model
      : null;

    if (!prompt || !sessionId || !userId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══ IDEMPOTENCY GUARD ═══
    if (existingTaskId) {
      const { data: existingTask } = await supabase
        .from("autonomous_tasks").select("status").eq("id", existingTaskId).maybeSingle();
      if (existingTask && (existingTask.status === "completed" || existingTask.status === "failed")) {
        return new Response(JSON.stringify({ success: true, taskId: existingTaskId, skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ═══ 1. Create or reuse task row ═══
    taskId = existingTaskId;
    if (!taskId) {
      const { data: task, error: taskError } = await supabase
        .from("autonomous_tasks")
        .insert({
          user_id: userId, session_id: sessionId, original_prompt: prompt,
          status: "planning", plan: [], current_step: 0, total_steps: 0, progress_pct: 0,
          execution_mode: "dag", max_parallelism: DEFAULT_DAG_CONFIG.maxParallelism,
        })
        .select("id").single();
      if (taskError) throw taskError;
      taskId = task.id;
    }

    const updateTask = async (updates: Record<string, unknown>) => {
      await supabase.from("autonomous_tasks")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", taskId);
    };

    // ═══ 1.5 IU/BILLING CHECK (respects personal-key bypass) ═══
    const [{ data: earlyAdminSettings }, { data: earlyUserKeyData }, { data: earlyExtKeys }, { data: earlyAutomateOverride }] = await Promise.all([
      supabase
        .from("ai_model_settings")
        .select("allow_personal_api_key, bypass_iu_for_personal_key")
        .maybeSingle(),
      supabase
        .from("ai_user_settings")
        .select("gemini_api_key, gemini_model, personal_anthropic_key")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_api_keys")
        .select("provider")
        .eq("user_id", userId)
        .in("provider", ["openrouter", "xai"])
        .eq("is_active", true),
      supabase
        .from("ai_subsystem_overrides")
        .select("provider, api_key, enabled")
        .eq("user_id", userId)
        .eq("subsystem", "automate")
        .maybeSingle(),
    ]);

    const hasAutomateOwnKey = !!(earlyAutomateOverride?.enabled && earlyAutomateOverride?.api_key);
    const hasPersonalKey = !!(earlyUserKeyData?.gemini_api_key || earlyUserKeyData?.personal_anthropic_key || (earlyExtKeys || []).length > 0 || hasAutomateOwnKey);
    const allowPersonalKey = earlyAdminSettings?.allow_personal_api_key === true;
    const bypassIUForPersonalKey = earlyAdminSettings?.bypass_iu_for_personal_key === true;
    const preferPersonal = apiSourcePreference !== "system";
    const shouldBypassIU = preferPersonal && hasPersonalKey && allowPersonalKey && bypassIUForPersonalKey;

    if (shouldBypassIU) {
      console.log("[Orchestrator] IU check skipped — personal key + bypass enabled");
    } else {
      try {
        const { data: iuCheck } = await supabase.rpc('check_and_deduct_intelligence', {
          p_user_id: userId,
          p_feature_key: 'beebot_autonomous',
          p_model_requested: null,
          p_estimated_tokens: 5000,
        });
        if (iuCheck && !iuCheck.success) {
          const errMsg = iuCheck.error_code === 'MODEL_ACCESS_DENIED'
            ? 'Model access denied for your tier.'
            : 'Intelligence Units ကုန်ဆုံးသွားပါပြီ။';
          await updateTask({ status: "failed", error: errMsg, completed_at: new Date().toISOString(), metadata: { phase: "failed", error_type: "insufficient_credits", message: errMsg } });
          await supabase.from("agent_chat_messages").insert({
            session_id: sessionId, user_id: userId, role: "assistant", content: `⚠️ ${errMsg}`, is_error: true, source_channel: "autonomous",
          });
          return new Response(JSON.stringify({ error: errMsg, taskId }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (iuErr: any) {
        console.warn("[Orchestrator] IU check failed (non-fatal):", iuErr.message);
      }
    }

    // ═══ 2. PLANNING PHASE ═══
    const isBurmesePrompt = /[\u1000-\u109F]/.test(prompt);
    await updateTask({
      status: "planning", progress_pct: 3,
      metadata: { phase: "planning", currentStepTitle: isBurmesePrompt ? "DAG အစီအစဉ် ရေးဆွဲနေတယ်..." : "Generating DAG execution plan...", message: "Analyzing task complexity and dependencies..." },
    });

    // ═══ PROVIDER FAILOVER CHAIN + SOUL/PERSONALITY CONTEXT ═══
    // Fetch OpenRouter/xAI auth in parallel with other data
    const [{ data: userKeyData }, { data: systemKeyData }, { data: soulConfig }, { data: agentSettings }, { data: userFacts }, { data: extKeys }, { data: automateOverride }] = await Promise.all([
      Promise.resolve({ data: earlyUserKeyData }),
      supabase.from("ai_model_settings").select("google_system_api_key, anthropic_system_api_key").maybeSingle(),
      supabase.from("agent_soul_config").select("soul_text").eq("user_id", userId).maybeSingle(),
      supabase.from("user_agent_settings").select("bot_name, bot_emoji, personality_mode, personality_level, custom_instructions").eq("user_id", userId).maybeSingle(),
      supabase.from("agent_user_facts").select("fact_key, fact_value").eq("user_id", userId).order("updated_at", { ascending: false }).limit(5),
      supabase.from("user_api_keys").select("api_key_encrypted, provider").eq("user_id", userId).in("provider", ["openrouter", "xai"]).eq("is_active", true),
      supabase.from("ai_subsystem_overrides").select("provider, model, api_key, enabled").eq("user_id", userId).eq("subsystem", "automate").maybeSingle(),
    ]);

    // Resolve user's preferred model
    // ═══ MODEL RESOLUTION: client request → user_credits (DB) → ai_user_settings → default ═══
    const { data: userCreditsData } = await supabase.from("user_credits").select("preferred_model").eq("user_id", userId).maybeSingle();
    const automateOverrideModel = automateOverride?.enabled && automateOverride?.model ? automateOverride.model : null;
    const resolvedModel = (preferredModelFromClient || automateOverrideModel || userCreditsData?.preferred_model || userKeyData?.gemini_model || MODEL_DEFAULT).replace(/^google\//, '');
    const personalOpenrouterKey = automateOverride?.enabled && automateOverride?.provider === "openrouter" && automateOverride?.api_key
      ? automateOverride.api_key
      : extKeys?.find((k: any) => k.provider === 'openrouter')?.api_key_encrypted || null;
    const personalGeminiKey = automateOverride?.enabled && automateOverride?.provider === "google" && automateOverride?.api_key
      ? automateOverride.api_key
      : userKeyData?.gemini_api_key;
    const personalXaiKey = extKeys?.find((k: any) => k.provider === 'xai')?.api_key_encrypted || null;

    const circuitBreaker = new ProviderCircuitBreaker();
    const providerChain = buildProviderChain({
      personalGeminiKey,
      personalAnthropicKey: userKeyData?.personal_anthropic_key,
      personalOpenrouterKey,
      personalXaiKey,
      systemGoogleKey: systemKeyData?.google_system_api_key,
      systemAnthropicKey: systemKeyData?.anthropic_system_api_key,
      modelToUse: resolvedModel,
      preferPersonal,
      disabledConnectors: [],
    });

    if (providerChain.length === 0) {
      const noKeyMsg = "No API key available for autonomous processing";
      await updateTask({ status: "failed", error: noKeyMsg, completed_at: new Date().toISOString() });
      await supabase.from("agent_chat_messages").insert({
        session_id: sessionId, user_id: userId, role: "assistant", content: `⚠️ ${noKeyMsg}`, is_error: true, source_channel: "autonomous",
      });
      return new Response(JSON.stringify({ error: "No API key" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══ Unified AI call with failover + model fallback ═══
    const attemptedModels = new Set<string>([resolvedModel]);
    let currentModel = resolvedModel;
    const usageTraceId = `orchestrator-${(taskId || sessionId).slice(0, 8)}-${Date.now().toString(36)}`;

    const callAI = async (
      systemPrompt: string, userPrompt: string,
      temperature = 0.5, maxTokens = 4096,
      retryCount = 0, failoverDepth = 0,
    ): Promise<string> => {
      if (failoverDepth >= 3) throw new Error("Provider failover depth exceeded");

      const result = getNextProvider(providerChain, circuitBreaker);
      if (!result) {
        // No cross-provider rescue — user controls model selection
        console.log(`[Orchestrator] All compatible providers exhausted for "${currentModel}" — no auto-switch`);
        throw new Error(`All AI providers exhausted for "${currentModel}". Please check your API key or switch model.`);
      }

      const { provider } = result;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);
      const callStartedAt = Date.now();

      try {
        const isOpenRouterModel = currentModel.includes('/') && !currentModel.startsWith('google/');
        const isXaiModel = provider.provider === 'xai';
        const isClaudeModel = currentModel.startsWith('claude');

        let aiCall: Promise<string>;
        if (isOpenRouterModel || isXaiModel) {
          aiCall = callOpenAIDirect(provider.apiKey, provider.apiEndpoint, systemPrompt, userPrompt, temperature, maxTokens, controller.signal, currentModel);
        } else if (isClaudeModel) {
          aiCall = callAnthropicDirect(provider.apiKey, systemPrompt, userPrompt, temperature, maxTokens, controller.signal, currentModel);
        } else {
          aiCall = callGeminiDirect(provider.apiKey, `${systemPrompt}\n\n${userPrompt}`, temperature, maxTokens, controller.signal, currentModel);
        }
        const output = await aiCall;
        await trackAIUsage(
          supabase,
          userId,
          sessionId,
          provider.isPersonalKey ? "personal_key" : "system_key",
          currentModel,
          {
            tokensInput: Math.ceil(`${systemPrompt}\n\n${userPrompt}`.length / 3.2),
            tokensOutput: Math.ceil(output.length / 3.2),
            durationMs: Date.now() - callStartedAt,
          },
          true,
          undefined,
          "none",
          {
            taskId,
            traceId: usageTraceId,
            callKind: "autonomous_orchestrator",
            provider: provider.provider,
            requestCount: 1,
            metadata: { execution_mode: "dag", provider_depth: failoverDepth, retry_count: retryCount },
          },
        );
        return output;
      } catch (err: any) {
        await trackAIUsage(
          supabase,
          userId,
          sessionId,
          provider.isPersonalKey ? "personal_key" : "system_key",
          currentModel,
          {
            tokensInput: Math.ceil(`${systemPrompt}\n\n${userPrompt}`.length / 3.2),
            tokensOutput: 0,
            durationMs: Date.now() - callStartedAt,
          },
          false,
          err?.message || String(err),
          "none",
          {
            taskId,
            traceId: usageTraceId,
            callKind: "autonomous_orchestrator_error",
            provider: provider.provider,
            requestCount: 1,
            metadata: { execution_mode: "dag", provider_depth: failoverDepth, retry_count: retryCount },
          },
        );
        if (err.name === 'AbortError') {
          circuitBreaker.markBad(provider.apiKey);
          return callAI(systemPrompt, userPrompt, temperature, maxTokens, 0, failoverDepth + 1);
        }
        const errorType = classifyProviderError(err.status || 0, err.message || String(err));
        
        // No auto model fallback — user controls model selection
        // Only failover to next provider with same model (different key)
        if (isNonRecoverableError(errorType)) {
          circuitBreaker.markBad(provider.apiKey);
          return callAI(systemPrompt, userPrompt, temperature, maxTokens, 0, failoverDepth + 1);
        }
        if (retryCount < MAX_RETRIES) {
          return callAI(systemPrompt, userPrompt, temperature, maxTokens, retryCount + 1, failoverDepth);
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    };

    // ═══ 3. Generate DAG plan ═══
    const planUserPrompt = `Break down this user request into 3-7 concrete execution steps with dependency relationships.

User Request: "${prompt}"
${isBurmesePrompt ? '\nIMPORTANT: Use Myanmar language for step titles.' : ''}

Return ONLY the JSON array.`;

    // Intent signals computed BEFORE try/catch so accessible in both fallback AND coordinator ack
    const intentSignals = {
      financial: /(?:ငွေ|လက်ကျန်|ဝင်ငွေ|ထွက်ငွေ|budget|expense|income|finance|money|ပိုက်ဆံ|သုံးစွဲ|transaction|flowstate)/i.test(prompt),
      content: /(?:ရေးပေး|ရေးပါ|write|create|generate|compose|draft|content|article|blog|post|email)/i.test(prompt),
      task: /(?:task|workspace|assign|project|manage|schedule|plan|todo|လုပ်ဆောင်|စီမံ|အစီအစဉ်)/i.test(prompt),
      knowledge: /(?:knowledge|note|memory|remember|recall|သိမ်း|မှတ်|မေး)/i.test(prompt),
    };

    let dagSteps: DAGStep[] = [];
    try {
      const planResponse = await callAI(DAG_PLAN_SYSTEM_PROMPT, planUserPrompt, 0.3, 2048);
      const planText = planResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const rawPlan = JSON.parse(planText);

      dagSteps = rawPlan.map((step: any, idx: number) => ({
        id: step.id || `step_${idx + 1}`,
        step_index: idx,
        title: step.title || `Step ${idx + 1}`,
        description: step.description || '',
        tool: step.tool,
        agent_role: step.agent_role || 'general',
        depends_on: Array.isArray(step.depends_on) ? step.depends_on : [],
        status: 'pending' as const,
        retries: 0,
        metadata: {},
      }));
    } catch (e) {
      console.error("[Orchestrator] DAG plan failed, using intent-aware fallback:", e);

      // ═══ INTENT-AWARE FALLBACK: Select template based on user intent ═══
      // Note: intentSignals is declared above the try block for shared access

      if (intentSignals.financial) {
        dagSteps = [
          { id: "step_1", step_index: 0, title: isBurmesePrompt ? "ဘဏ္ဍာရေး ဒေတာ ရယူခြင်း" : "Fetch Financial Data", description: "Retrieve financial records from flowstate", tool: "manage_flowstate", agent_role: "analyst", depends_on: [], status: "pending", retries: 0, metadata: {} },
          { id: "step_2", step_index: 1, title: isBurmesePrompt ? "ဘဏ္ဍာရေး ခွဲခြမ်းစိတ်ဖြာခြင်း" : "Financial Analysis", description: "Analyze financial data and trends", tool: "analyze_data", agent_role: "analyst", depends_on: ["step_1"], status: "pending", retries: 0, metadata: {} },
          { id: "step_3", step_index: 2, title: isBurmesePrompt ? "အစီရင်ခံစာ ပြုစုခြင်း" : "Financial Report", description: "Compile financial summary", tool: "compile_report", agent_role: "writer", depends_on: ["step_2"], status: "pending", retries: 0, metadata: {} },
        ];
      } else if (intentSignals.content) {
        dagSteps = [
          { id: "step_1", step_index: 0, title: isBurmesePrompt ? "အကြောင်းအရာ သုတေသန" : "Content Research", description: "Research topic for content", tool: "search_web", agent_role: "researcher", depends_on: [], status: "pending", retries: 0, metadata: {} },
          { id: "step_2", step_index: 1, title: isBurmesePrompt ? "အကြောင်းအရာ ဖန်တီးခြင်း" : "Content Generation", description: "Generate the requested content", tool: "generate_ai_content", agent_role: "writer", depends_on: ["step_1"], status: "pending", retries: 0, metadata: {} },
          { id: "step_3", step_index: 2, title: isBurmesePrompt ? "အရည်အသွေး စစ်ဆေးခြင်း" : "Quality Review", description: "Review and polish content", tool: "compile_report", agent_role: "writer", depends_on: ["step_2"], status: "pending", retries: 0, metadata: {} },
        ];
      } else if (intentSignals.task) {
        dagSteps = [
          { id: "step_1", step_index: 0, title: isBurmesePrompt ? "လက်ရှိ Task များ စစ်ဆေးခြင်း" : "Check Current Tasks", description: "Retrieve existing tasks from workspace", tool: "manage_workspace_task", agent_role: "general", depends_on: [], status: "pending", retries: 0, metadata: {} },
          { id: "step_2", step_index: 1, title: isBurmesePrompt ? "Task စီမံခန့်ခွဲခြင်း" : "Task Management", description: "Create, update or organize tasks", tool: "manage_workspace_task", agent_role: "general", depends_on: ["step_1"], status: "pending", retries: 0, metadata: {} },
          { id: "step_3", step_index: 2, title: isBurmesePrompt ? "ရလဒ် အတည်ပြုခြင်း" : "Confirm Results", description: "Verify task operations completed", tool: "compile_report", agent_role: "writer", depends_on: ["step_2"], status: "pending", retries: 0, metadata: {} },
        ];
      } else {
        // Default: research fallback (original behavior)
        dagSteps = [
          { id: "step_1", step_index: 0, title: isBurmesePrompt ? "သတင်းအချက်အလက် ရှာဖွေခြင်း (A)" : "Research Track A", description: "Primary research angle", tool: "search_web", agent_role: "researcher", depends_on: [], status: "pending", retries: 0, metadata: {} },
          { id: "step_2", step_index: 1, title: isBurmesePrompt ? "သတင်းအချက်အလက် ရှာဖွေခြင်း (B)" : "Research Track B", description: "Secondary research angle", tool: "search_web", agent_role: "researcher", depends_on: [], status: "pending", retries: 0, metadata: {} },
          { id: "step_3", step_index: 2, title: isBurmesePrompt ? "ခွဲခြမ်းစိတ်ဖြာခြင်း" : "Analysis & Synthesis", description: "Analyze gathered data", tool: "analyze_data", agent_role: "analyst", depends_on: ["step_1", "step_2"], status: "pending", retries: 0, metadata: {} },
          { id: "step_4", step_index: 3, title: isBurmesePrompt ? "အစီရင်ခံစာ ပြုစုခြင်း" : "Final Report", description: "Compile comprehensive report", tool: "compile_report", agent_role: "writer", depends_on: ["step_3"], status: "pending", retries: 0, metadata: {} },
        ];
      }
      console.log(`[Orchestrator] Intent fallback selected: ${intentSignals.financial ? 'financial' : intentSignals.content ? 'content' : intentSignals.task ? 'task' : 'research'}`);
    }

    // ═══ SAFETY NET: Strip any broadcast/delivery steps from DAG plan ═══
    const BLOCKED_TOOLS = new Set(['broadcast_message', 'post_to_telegram', 'post', 'send_message']);
    const preFilterCount = dagSteps.length;
    dagSteps = dagSteps.filter(s => !BLOCKED_TOOLS.has(s.tool || ''));
    if (dagSteps.length < preFilterCount) {
      console.log(`[Orchestrator] Filtered ${preFilterCount - dagSteps.length} broadcast steps from DAG plan`);
      // Re-index
      dagSteps.forEach((s, i) => s.step_index = i);
    }

    // Persist plan to autonomous_tasks
    const planForTask = dagSteps.map(s => ({
      id: s.id, title: s.title, description: s.description, tool: s.tool,
      agent_role: s.agent_role, depends_on: s.depends_on, status: s.status,
    }));

    await updateTask({
      status: "working", plan: planForTask, total_steps: dagSteps.length, current_step: 0, progress_pct: 5,
      execution_mode: "dag", agent_roles_used: getAgentRolesUsed(dagSteps),
      metadata: {
        phase: "working", estimatedMinutes: Math.max(1, Math.ceil(dagSteps.length * 0.5)),
        dag_layers: "calculating...",
      },
    });

    // Persist steps to autonomous_task_steps table
    const stepRows = dagSteps.map(s => ({
      task_id: taskId, step_index: s.step_index, title: s.title,
      description: s.description, tool: s.tool, agent_role: s.agent_role,
      depends_on: s.depends_on, status: 'pending', metadata: {},
    }));
    await supabase.from("autonomous_task_steps").insert(stepRows);

    // ═══ STEP 3: Coordinator Info Message ═══
    // Insert a visible acknowledgment into chat BEFORE execution starts.
    // This fulfills Step 3 of the Coordinator→Worker agent flow pattern:
    // user sees confirmation of what was understood + what will be done.
    const detectedIntentLabel = intentSignals.financial
      ? (isBurmesePrompt ? 'ငွေကြေးဆိုင်ရာ ခွဲခြမ်းသုံးသပ်မှု' : 'Financial Analysis')
      : intentSignals.content
        ? (isBurmesePrompt ? 'အကြောင်းအရာ ဖန်တီးရေး' : 'Content Creation')
        : intentSignals.task
          ? (isBurmesePrompt ? 'Task စီမံခန့်ခွဲမှု' : 'Task Management')
          : (isBurmesePrompt ? 'သုတေသနနှင့် ခွဲခြမ်းစိတ်ဖြာမှု' : 'Research & Analysis');
    const stepList = dagSteps
      .slice(0, 5)
      .map((s, i) => `${i + 1}. ${s.title}`)
      .join('\n');
    const coordinatorAck = isBurmesePrompt
      ? `✅ **မေးခွန်းကို လက်ခံရရှိပါပြီ** — **${detectedIntentLabel}** လုပ်ငန်းအဖြစ် သတ်မှတ်သည်။\n\n**${dagSteps.length} ဆင့်**ဖြင့် ဆောင်ရွက်ပေးပါမည်:\n${stepList}\n\n⚙️ လုပ်ဆောင်နေသည်... ခဏစောင့်ပေးပါ။`
      : `✅ **Request received** — Identified as **${detectedIntentLabel}** task.\n\nExecuting **${dagSteps.length} steps**:\n${stepList}\n\n⚙️ Working on it, please wait...`;
    await supabase.from("agent_chat_messages").insert({
      session_id: sessionId, user_id: userId, role: "assistant",
      content: coordinatorAck, source_channel: "coordinator_ack",
    });

    // ═══ 4. DAG EXECUTION ═══
    let completedCount = 0;

    const dagConfig: DAGExecutionConfig = {
      ...DEFAULT_DAG_CONFIG,
      stepTimeoutMs: STEP_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    };

    // ═══ TOOL → SPECIALIST MAP (expanded) ═══
    const TOOL_MAP: Record<string, string> = {
      search_web: 'search_web',
      deep_research: 'search_web',
      browser_search: 'browser_search',
      browser_scrape: 'browser_scrape',
      search_knowledge_base: 'search_knowledge_base',
      code_generate: 'generate_ai_content',
      analyze_data: 'search_web',
      compile_report: 'generate_ai_content',
      generate_content: 'generate_ai_content',
      show_widget: 'show_widget',
      compose_dashboard: 'compose_dashboard',
    };

    function buildToolArgs(toolName: string, step: DAGStep, originalPrompt: string): Record<string, any> {
      switch (toolName) {
        case 'search_web':
          return { query: `${step.title}: ${step.description || originalPrompt}`.slice(0, 300) };
        case 'browser_search':
          return { query: `${step.title}: ${step.description || originalPrompt}`.slice(0, 300) };
        case 'browser_scrape':
          return { url: (step.metadata as any)?.url || '', extract_content: true };
        case 'search_knowledge_base':
          return { query: step.description || step.title, category: 'all' };
        case 'generate_ai_content':
          return { prompt: step.description || step.title, type: 'article' };
        case 'show_widget': {
          const md = (step.metadata as any) || {};
          const args: Record<string, any> = {
            title: md.title || step.title || 'Widget',
            auto_height: md.auto_height !== false,
          };
          if (md.preset) args.preset = md.preset;
          if (md.data !== undefined) args.data = md.data;
          if (md.html) args.html = md.html;
          if (md.height) args.height = md.height;
          if (md.density) args.density = md.density;
          if (md.focus) args.focus = md.focus;
          if (md.compose) args.compose = true;
          // Defensive: dashboard preset without sections → let composer build it
          if (md.preset === 'dashboard' && (!md.data || !Array.isArray(md.data?.sections))) {
            args.compose = true;
          }
          return args;
        }
        case 'compose_dashboard': {
          const md = (step.metadata as any) || {};
          const args: Record<string, any> = {
            title: md.title || step.title || 'Dashboard',
            data: md.data ?? {},
            auto_height: true,
          };
          if (md.focus) args.focus = md.focus;
          if (md.density) args.density = md.density;
          return args;
        }
        default:
          return { query: step.description || step.title };
      }
    }

    // ═══ Peer Communication Channel ═══
    const peerChannel = createPeerChannel(taskId as string);

    // NOTE: executeFn is now handled by Coordinator Mode's worker-agent protocol.
    // Tool execution is handled by toolExecuteFn below, LLM synthesis by worker-agent.ts.

    const onStepUpdate = async (step: DAGStep) => {
      // Update step in autonomous_task_steps
      const stepUpdate: Record<string, unknown> = {
        status: step.status,
        started_at: step.started_at,
        completed_at: step.completed_at,
        result: step.result?.slice(0, 50000), // cap storage
        error: step.error,
        retries: step.retries,
        metadata: step.metadata,
      };
      await supabase.from("autonomous_task_steps")
        .update(stepUpdate)
        .eq("task_id", taskId)
        .eq("step_index", step.step_index);

      // Update parent task progress
      if (step.status === 'done' || step.status === 'error' || step.status === 'skipped') {
        completedCount++;
      }

      const progress = Math.min(Math.round(5 + (completedCount / dagSteps.length) * 85), 90);
      const statusEmoji = step.status === 'done' ? '✅' : step.status === 'error' ? '❌' : step.status === 'skipped' ? '⏭️' : '🔄';
      const specialist = routeToSpecialist(step.tool, step.agent_role);

      // Update plan array in parent
      const updatedPlan = dagSteps.map(s => ({
        id: s.id, title: s.title, description: s.description, tool: s.tool,
        agent_role: s.agent_role, depends_on: s.depends_on, status: s.status,
        result: s.result?.slice(0, 200), started_at: s.started_at, completed_at: s.completed_at,
      }));

      await updateTask({
        current_step: completedCount, progress_pct: progress, plan: updatedPlan,
        metadata: {
          phase: "working",
          currentStepTitle: `${statusEmoji} ${specialist.emoji} ${step.title}`,
          currentStepIndex: step.step_index + 1,
          totalSteps: dagSteps.length,
          currentAgent: specialist.label,
          currentAgentRole: specialist.role,
          executionMode: "dag",
          parallelActive: dagSteps.filter(s => s.status === 'running').length,
          message: `${specialist.emoji} ${specialist.label}: ${step.title}`,
        },
      });
    };

    // ═══ COORDINATOR MODE — Active Supervisor with Worker Protocol ═══
    // Tool execution phase — extracts real tool data for each step
    const toolExecuteFn = async (step: DAGStep): Promise<string> => {
      const realTool = TOOL_MAP[step.tool || ''];
      if (!realTool) return '';
      try {
        const toolArgs = buildToolArgs(realTool, step, prompt);
        console.log(`[Coordinator:Tool] Step ${step.id} → ${realTool}`, JSON.stringify(toolArgs).slice(0, 200));
        const toolResult = await executeTool(supabase, userId!, realTool, toolArgs, false, undefined, {
          sessionId: sessionId!, sourceChannel: 'autonomous', userAISettings: userKeyData,
        });
        if (toolResult && !toolResult.error) {
          const toolJson = JSON.stringify(toolResult);
          return `\n\n══ REAL TOOL DATA (from ${realTool}) ══\n${toolJson.slice(0, 8000)}${toolJson.length > 8000 ? '\n[...truncated]' : ''}`;
        } else if (toolResult?.error) {
          return `\n\n══ TOOL NOTE ══\nTool "${realTool}" returned: ${toolResult.error}\nProceed with your own knowledge.`;
        }
      } catch (e: any) {
        return `\n\n══ TOOL NOTE ══\nTool "${realTool}" execution failed. Proceed with your own knowledge.`;
      }
      return '';
    };

    const coordinatorConfig: CoordinatorConfig = {
      dagConfig: dagConfig,
      overallPrompt: prompt,
      isBurmese: isBurmesePrompt,
      supabase,
      swarmId: taskId!,
      userId: userId!,
      sessionId: sessionId!,
      peerChannel,
      callAI,
      toolExecuteFn,
      onStepUpdate,
      onLayerComplete: async (layerIdx, totalLayers) => {
        console.log(`[Orchestrator] DAG Layer ${layerIdx + 1}/${totalLayers} complete`);
      },
      workerTimeoutMs: STEP_TIMEOUT_MS + 5000,
      maxDelegatedSteps: 3,
    };

    const { successCount, totalCount, delegatedStepCount, workerNotifications, completed: coordinatorCompleted } = await runCoordinatorLoop(dagSteps, coordinatorConfig);

    if (delegatedStepCount > 0) {
      console.log(`[Orchestrator] Coordinator delegated ${delegatedStepCount} additional steps`);
    }
    if (workerNotifications.length > 0) {
      const completions = workerNotifications.filter(n => n.type === 'TASK_COMPLETED').length;
      const failures = workerNotifications.filter(n => n.type === 'TASK_FAILED').length;
      console.log(`[Orchestrator] Worker notifications: ${completions} completed, ${failures} failed, ${workerNotifications.length} total`);
    }

    // ═══ Zero-success guard ═══
    if (successCount === 0) {
      const failMsg = isBurmesePrompt
        ? "အဆင့်အားလုံး မအောင်မြင်ပါ။ ထပ်ကြိုးစားပါ သို့မဟုတ် request ကို ပြန်ပြင်ပါ။"
        : "All execution steps failed. Please try again or refine your request.";
      await updateTask({
        status: "failed", error: failMsg, completed_at: new Date().toISOString(), progress_pct: 100,
        metadata: { phase: "failed", error_type: "all_steps_failed", stepsCompleted: 0, totalSteps: totalCount },
      });
      await supabase.from("agent_chat_messages").insert({
        session_id: sessionId, user_id: userId, role: "assistant", content: `⚠️ ${failMsg}`, is_error: true, source_channel: "autonomous",
      });
      return new Response(JSON.stringify({ success: false, taskId, error: failMsg }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══ 5. COMPILATION PHASE ═══
    await updateTask({ status: "compiling", progress_pct: 92, metadata: { phase: "compiling", message: "Multi-agent synthesis in progress..." } });

    // ═══ Phase D: Build synthesis from coordinator's completed Map (includes delegated steps) ═══
    const swarmId = taskId;
    const inMemoryEntries: ScratchpadEntry[] = [];
    const allCompletedSteps = coordinatorCompleted ? [...coordinatorCompleted.values()] : dagSteps;
    for (const step of allCompletedSteps) {
      if (step.result && step.status === 'done') {
        inMemoryEntries.push({
          specialistRole: step.agent_role || 'general',
          stepId: step.id,
          findings: step.result,
          metadata: { title: step.title, tool: step.tool },
        });
      }
    }
    const scratchpadContext = buildScratchpadSynthesisPrompt(inMemoryEntries);

    // Fire-and-forget: persist scratchpad to DB for cross-session reference
    Promise.resolve().then(async () => {
      try {
        for (const entry of inMemoryEntries) {
          await writeScratchpad(supabase, swarmId as string, entry.specialistRole, entry.stepId, entry.findings, entry.metadata);
        }
      } catch (e) { console.warn("[Orchestrator] Scratchpad persist failed (non-fatal):", e); }
    });

    // Gather all successful results
    const stepResults: string[] = [];
    for (const step of allCompletedSteps) {
      if (step.result) {
        const specialist = routeToSpecialist(step.tool, step.agent_role);
        stepResults.push(`[${specialist.emoji} ${specialist.label} — ${step.title}]:\n${step.result}`);
      }
    }

    // Reuse isBurmesePrompt from L222 (no duplicate regex)
    let finalContent: string;

    try {
      // ═══ Build public-channel compilation prompt (NO impersonation) ═══
      const personalityMode = agentSettings?.personality_mode || "friendly";
      const customInstructions = agentSettings?.custom_instructions || "";

      let soulBlock = "";
      if (soulConfig?.soul_text) {
        // Soul as VOICE/STYLE guide only — no identity markers
        soulBlock = `[WRITING VOICE & STYLE]\n${soulConfig.soul_text}\n\n`;
      }

      let styleBlock = `[TONE]\nPersonality style: ${personalityMode}.\n`;
      if (customInstructions) {
        styleBlock += `Tone guidance: ${customInstructions}\n`;
      }
      styleBlock += "\n";

      let userContextBlock = "";
      if (userFacts && userFacts.length > 0) {
        const factsStr = userFacts.map((f: any) => `- ${f.fact_key}: ${f.fact_value}`).join("\n").slice(0, 500);
        userContextBlock = `[USER CONTEXT]\n${factsStr}\n\n`;
      }

      const compileSystem = `${soulBlock}${styleBlock}${userContextBlock}[ROLE] Value-dense editorial writer for PUBLIC Telegram channel.
${isBurmesePrompt ? '[LANG] Myanmar daily speech (နေ့စဉ်သုံး ကြံရင်ကြံသလို).' : '[LANG] Natural conversational English.'}

[RULES]
• NEVER: impersonate owner, use "ကျွန်တော်...လုပ်ပေးလိုက်ပါတယ်", address by name, greetings intro, reference Agents/Research/compilation process, delivery-awareness lines ("စီစဉ်ပေးထားပါတယ်", "ပို့ပေးထားပါတယ်"), meta-commentary about posting
• Collective address only: "မိတ်ဆွေတို့", "ညီကိုတို့"
• FIRST LINE = Hook (pain point / surprising fact / bold claim). No preamble
• Every sentence must deliver NEW value. Zero filler, zero repetition, zero padding
• TARGET: 800-1500 chars. HARD MAX: 2500 chars. Shorter = better if value-dense

[FORMAT] Plain text + emoji headers only. No Markdown (#, *, **, ---). Bullets: "•" or "▸". Line breaks for separation.

[STRUCTURE] Hook → Core insights (3-5 bullets, specific + actionable) → Takeaway (1-2 lines, collective CTA)
Synthesize ALL agent findings into unified narrative — don't list them separately.`;

      const compileUser = `ORIGINAL REQUEST: ${prompt}

SPECIALIST AGENT OUTPUTS (${successCount}/${totalCount} successful):
${stepResults.join('\n\n═══════════════\n\n')}
${scratchpadContext ? `\n${scratchpadContext}` : ''}

Compile into a value-dense editorial post. Synthesize across all agent outputs — don't list them. Target 800-1500 chars, hard max 2500.`;

      finalContent = await callAI(compileSystem, compileUser, 0.6, 4096);

      // ── Length guards ──
      if (finalContent.length < 800 && successCount > 1) {
        try {
          finalContent = await callAI(compileSystem, `Too brief. Expand with more specific insights:\n\n${finalContent}`, 0.7, 4096);
        } catch { /* keep original */ }
      }
      // ── Upper length cap: condense if over 2500 chars ──
      if (finalContent.length > 2500) {
        try {
          finalContent = await callAI(
            `Condense this Telegram post to under 2000 chars. Keep the hook, core insights, and takeaway. Remove all filler. ${isBurmesePrompt ? 'Myanmar language.' : 'English.'}`,
            finalContent,
            0.4, 2048,
          );
        } catch { /* keep original but hard-trim */ }
        if (finalContent.length > 2500) {
          finalContent = finalContent.slice(0, 2450) + '\n\n▸ ...';
        }
      }

      // ── Grounding quality guard ──
      if (successCount > 1) {
        const completedSteps = dagSteps.filter((s): s is typeof s & { result: string } => !!s.result);
        const grounding = checkGrounding(finalContent, completedSteps);
        if (!grounding.grounded && grounding.missingAgents.length > 0) {
          console.log(`[Orchestrator] Grounding check failed — missing agents: ${grounding.missingAgents.join(', ')}`);
          try {
            finalContent = await callAI(
              compileSystem,
              `Missing findings from: ${grounding.missingAgents.join(', ')}. Revise to include. Keep under 2500 chars:\n\n${finalContent}`,
              0.6,
              4096,
            );
          } catch { /* keep original */ }
        }
      }
    } catch (err: any) {
      console.warn("[Orchestrator] Compilation attempt 1 failed, retrying with simpler prompt...", err.message);
      try {
        finalContent = await callAI(
          "You are a report compiler. Synthesize these findings into a clear, well-structured report.",
          stepResults.join('\n---\n'),
          0.5, 4096,
        );
      } catch {
        // True fallback — raw dump
        finalContent = `## 🐝 Multi-Agent Task Results\n\n${stepResults.map((r, i) => `### Agent ${i + 1}\n${r}`).join('\n\n---\n\n')}`;
      }
    }

    // ═══ POST-COMPILATION SANITIZER (shared module) ═══
    finalContent = sanitizeForChannel(finalContent, isBurmesePrompt);

    // ═══ 6. DELIVERY ═══
    await supabase.from("agent_chat_messages").insert({
      session_id: sessionId, user_id: userId, role: "assistant", content: finalContent, source_channel: "autonomous",
    });

    await updateTask({
      status: "completed", progress_pct: 100, result: finalContent, completed_at: new Date().toISOString(),
      agent_roles_used: getAgentRolesUsed(dagSteps),
      metadata: {
        phase: "completed", message: "Multi-agent DAG execution completed",
        stepsCompleted: successCount, totalSteps: totalCount,
        executionMode: "dag",
        agentRolesUsed: getAgentRolesUsed(dagSteps),
      },
    });

    // Update session title
    const { data: session } = await supabase.from("agent_chat_sessions").select("title").eq("id", sessionId).single();
    if (session?.title === "New Chat" || session?.title?.startsWith("New Chat")) {
      await supabase.from("agent_chat_sessions")
        .update({ title: prompt.slice(0, 40).replace(/\n/g, ' '), last_message_at: new Date().toISOString() })
        .eq("id", sessionId);
    }

    console.log(`[Orchestrator] ✅ DAG Task ${taskId} completed: ${successCount}/${totalCount} steps (${getAgentRolesUsed(dagSteps).join(', ')})`);
    return new Response(JSON.stringify({ success: true, taskId, stepsCompleted: successCount, executionMode: "dag" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[Orchestrator] Fatal error:", error);

    if (taskId && supabase) {
      const now = new Date().toISOString();
      try {
        await supabase.from("autonomous_tasks").update({
          status: "failed", error: error.message || "Unknown fatal error",
          completed_at: now, updated_at: now,
          metadata: { phase: "failed", error_type: "fatal", message: error.message || "Unknown fatal error" },
        }).eq("id", taskId);

        if (sessionId && userId) {
          await supabase.from("agent_chat_messages").insert({
            session_id: sessionId, user_id: userId, role: "assistant",
            content: `⚠️ Autonomous task failed: ${error.message || "Unknown error"}. Please try again.`,
            is_error: true, source_channel: "autonomous",
          });
        }
      } catch (updateErr) {
        console.error("[Orchestrator] Could not update task to failed:", updateErr);
      }
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// AI Call Helpers now imported from _shared/ai-call-helpers.ts
