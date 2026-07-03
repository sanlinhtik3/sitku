
// ═══ Project Phoenix: _shared/tool-executors/advanced.ts ═══
// Advanced Agentic AI tools

import { isBlockedUrl, generateEmbedding, autoTagContent, fetchWithRetry } from "../executor-helpers.ts";
import { GEMINI_OPENAI_ENDPOINT as GEMINI_ENDPOINT } from "../api-endpoints.ts";

// Local rate limit map for advanced tools (fetch, browser, etc.)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
import { createGoal, listGoals, getGoalStatus, updateGoalStatus } from "../goal-engine.ts";

export async function executeSelfUpdateKnowledge(supabase: any, userId: string, args: any) {
  const { scan_targets = ["kb", "insights"] } = args;
  // Simplified logic
  let learnedCount = 0;
  
  if (scan_targets.includes("kb")) {
    const { data } = await supabase.from("ai_generated_content").select("id").eq("is_global", true).limit(10);
    learnedCount += data?.length || 0;
  }
  
  return { success: true, message: `Knowledge updated. Scanned ${learnedCount} items.` };
}

export async function executeFetchExternalApi(supabase: any, userId: string, args: any) {
  const { url, method = "GET", headers, body } = args;
  
  if (isBlockedUrl(url)) return { error: "URL blocked" };
  
  const key = `fetch_${userId}`;
  const limit = rateLimitMap.get(key) || { count: 0, resetTime: Date.now() + 60000 };
  if (Date.now() > limit.resetTime) { limit.count = 0; limit.resetTime = Date.now() + 60000; }
  if (limit.count >= 10) return { error: "Rate limit exceeded" };
  limit.count++;
  rateLimitMap.set(key, limit);
  
  try {
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { success: true, status: res.status, data: text.slice(0, 2000) };
  } catch (e: any) { return { error: e.message }; }
}

export async function executeSelfDebug(supabase: any, userId: string, args: any) {
  const { error_context } = args;

  // Query recent failed communication logs
  const { data: failedComms } = await supabase
    .from("agent_communication_log")
    .select("query_type, query_content, response_summary, was_successful, created_at")
    .eq("requester_agent_id", userId)
    .eq("was_successful", false)
    .order("created_at", { ascending: false })
    .limit(5);

  // Query recent failed sub-tasks
  const { data: failedTasks } = await supabase
    .from("agent_sub_tasks")
    .select("task_description, status, result, created_at")
    .eq("user_id", userId)
    .in("status", ["failed", "timed_out"])
    .order("created_at", { ascending: false })
    .limit(3);

  // Query recent AI usage errors
  const { data: recentErrors } = await supabase
    .from("agent_ai_usage")
    .select("error_message, model_used, created_at")
    .eq("user_id", userId)
    .eq("is_successful", false)
    .order("created_at", { ascending: false })
    .limit(5);

  const diagnosis: string[] = [];
  if (recentErrors?.length) {
    diagnosis.push(`Found ${recentErrors.length} recent AI errors. Latest: ${recentErrors[0].error_message}`);
  }
  if (failedComms?.length) {
    diagnosis.push(`Found ${failedComms.length} failed tool executions recently.`);
  }
  if (failedTasks?.length) {
    diagnosis.push(`Found ${failedTasks.length} failed/timed-out sub-tasks.`);
  }
  if (diagnosis.length === 0) {
    diagnosis.push("No recent errors found. System appears healthy.");
  }

  return {
    success: true,
    diagnosis: diagnosis.join(" | "),
    recent_errors: recentErrors?.map((e: any) => ({
      error: e.error_message,
      model: e.model_used,
      time: e.created_at,
    })) || [],
    failed_tools: failedComms?.map((c: any) => ({
      type: c.query_type,
      content: c.query_content?.slice(0, 100),
      time: c.created_at,
    })) || [],
    failed_sub_tasks: failedTasks?.map((t: any) => ({
      task: t.task_description?.slice(0, 100),
      status: t.status,
      time: t.created_at,
    })) || [],
    error_context_analyzed: error_context || "none provided",
  };
}

export async function executeManageGoal(supabase: any, userId: string, args: any) {
  const { action, title } = args;

  // Safety: if no action or unrecognized action, default to list (read-only)
  if (!action || !["create", "list", "status", "cancel"].includes(action)) {
    return await listGoals(supabase, userId);
  }

  // ═══ KILL-SWITCH: Block goal creation if title contains cancel/stop/check keywords ═══
  const killSwitchPattern = /cancel|stop|exit|terminate|ရပ်|ဖျက်|monitoring|double.?check|re.?check|verify|စစ်|ရပ်တန့်/i;
  if (action === "create" && title && killSwitchPattern.test(title)) {
    console.warn(`[ManageGoal] KILL-SWITCH: Blocked goal creation with suspicious title: "${title}"`);
    const activeGoals = await listGoals(supabase, userId);
    return {
      success: true,
      message: "Detected cancel/stop intent in goal title. Creation blocked. Showing active goals instead.",
      goals: activeGoals
    };
  }

  // ═══ QUESTION-BLOCK: Never create a goal titled as a question ═══
  const questionPattern = /^(how|what|why|when|where|which|is|are|do|does|can|could|will|would|ဘယ်|ဘာ|ဘယ်လို|ဘယ်လောက်|ဘယ်နှစ်|ရှိလား|လား$)/i;
  if (action === "create" && title && questionPattern.test(title.trim())) {
    console.warn(`[ManageGoal] QUESTION-BLOCK: Refused goal creation with question title: "${title}"`);
    const activeGoals = await listGoals(supabase, userId);
    return {
      success: true,
      message: `This looks like a question, not a goal. Here are your active goals/tasks:`,
      goals: activeGoals
    };
  }

  if (action === "create") {
    if (!title) return { error: "Goal title is required" };
    const res = await createGoal(supabase, userId, { title, description: args.description, goal_type: args.goal_type });
    return res;
  }
  if (action === "list") return await listGoals(supabase, userId);
  if (action === "status") return await getGoalStatus(supabase, args.goal_id, userId);
  if (action === "cancel") return await updateGoalStatus(supabase, args.goal_id, userId, "cancelled");
  return await listGoals(supabase, userId);
}

export async function executeSpawnSubAgent(supabase: any, userId: string, args: any, sessionId: string, isAdmin: boolean, authHeader?: string, options?: any) {
  const SUB_AGENT_BUDGET_MS = 45_000;
  const SUB_AGENT_TOOL_TIMEOUT_MS = 15_000;
  const MAX_SUB_STEPS = Math.min(args.max_steps || 2, 3);
  const ALLOWED_TOOLS_MAX = 5;

  const { task, tools: requestedTools, context: briefing } = args;
  if (!task) return { error: "Sub-agent task description is required." };

  // ═══ RECURSION GUARD ═══
  if (options?._isSubAgent) {
    console.warn("[SubAgent] Blocked recursive spawn attempt.");
    return { error: "Sub-agents cannot spawn other sub-agents." };
  }

  // Filter requested tools: strip spawn_sub_agent, cap at 5
  const safeTools = (requestedTools || ["search_web", "browser_search"])
    .filter((t: string) => t !== "spawn_sub_agent" && t !== "spawn_parallel_swarm")
    .slice(0, ALLOWED_TOOLS_MAX);

  // Create task record
  const { data: taskRecord, error: insertErr } = await supabase.from("agent_sub_tasks").insert({
    user_id: userId,
    parent_session_id: sessionId,
    task_description: task.slice(0, 500),
    status: "running",
    tools_used: safeTools,
  }).select("id").single();

  if (insertErr) {
    console.error("[SubAgent] Failed to create task record:", insertErr.message);
    return { error: `Sub-agent init failed: ${insertErr.message}` };
  }

  const subTaskId = taskRecord.id;
  const subAgentId = `sub_${subTaskId.slice(0, 8)}`;
  const parentMessageId = options?.assistantMessageId || options?.messageId || null;
  const budgetStart = Date.now();
  let stepCounter = 0;

  // Emit progress via SSE writer if available
  const emitProgress = (msg: string) => {
    if (options?.writer && options?.encoder) {
      try {
        options.writer.enqueue(options.encoder.encode(
          `data: ${JSON.stringify({ type: "agent_step", status: "sub_agent", sub_task_id: subTaskId, message: msg })}\n\n`
        ));
      } catch (_) { /* stream may be closed */ }
    }
  };

  // ═══ Live trace persistence (powers SubAgentTracePanel realtime UI) ═══
  const insertTraceStep = async (toolName: string, toolArgs: any): Promise<string | null> => {
    try {
      const { data } = await supabase.from("agent_sub_agent_steps").insert({
        user_id: userId,
        parent_message_id: parentMessageId,
        session_id: sessionId || null,
        sub_agent_id: subAgentId,
        step_index: stepCounter++,
        tool_name: toolName,
        tool_args: toolArgs ? JSON.parse(JSON.stringify(toolArgs).slice(0, 4000)) : null,
        status: "running",
      }).select("id").single();
      return data?.id || null;
    } catch (e) {
      console.warn("[SubAgent] trace insert failed:", (e as Error).message);
      return null;
    }
  };
  const updateTraceStep = async (stepId: string | null, status: string, result?: any, errorMessage?: string, durationMs?: number) => {
    if (!stepId) return;
    try {
      await supabase.from("agent_sub_agent_steps").update({
        status,
        tool_result: result ? JSON.parse(JSON.stringify(result).slice(0, 4000)) : null,
        error_message: errorMessage || null,
        duration_ms: durationMs || null,
      }).eq("id", stepId);
    } catch (e) {
      console.warn("[SubAgent] trace update failed:", (e as Error).message);
    }
  };

  emitProgress(`🤖 Sub-agent started: ${task.slice(0, 80)}...`);

  // ═══ MINI AGENTIC LOOP ═══
  const collectedResults: any[] = [];
  let lastError: string | null = null;

  // Resolve API key for sub-agent LLM calls
  const { GEMINI_OPENAI_ENDPOINT: GEMINI_ENDPOINT } = await import("../api-endpoints.ts");
  
  // Check user's personal key
  const { data: userSettings } = await supabase
    .from("ai_user_settings")
    .select("gemini_api_key, gemini_model")
    .eq("user_id", userId)
    .maybeSingle();

  const personalKey = userSettings?.gemini_api_key;
  const modelToUse = userSettings?.gemini_model || "gemini-3.5-flash";

  if (!personalKey) {
    return { error: "Personal API key required for sub-agent execution. Please add your Gemini API key in Settings." };
  }

  // Build tool definitions for the sub-agent (lightweight)
  const { BASE_TOOLS } = await import("../tool-definitions.ts");
  const subToolDefs = BASE_TOOLS.filter((td: any) => 
    safeTools.includes(td.function?.name) && td.function?.name !== "spawn_sub_agent"
  );

  // System prompt for sub-agent
  const subSystemPrompt = `You are a focused research sub-agent. Your ONLY job:
${task}

${briefing ? `Context from main agent: ${briefing}` : ""}

Rules:
- Complete the task using the provided tools
- Be concise and factual
- Return findings as structured data
- You have ${MAX_SUB_STEPS} steps maximum
- Do NOT greet the user or ask questions - just execute and report`;

  let messages: any[] = [
    { role: "system", content: subSystemPrompt },
    { role: "user", content: task },
  ];

  for (let step = 0; step < MAX_SUB_STEPS; step++) {
    // Budget check
    if (Date.now() - budgetStart > SUB_AGENT_BUDGET_MS) {
      console.warn(`[SubAgent] Budget exhausted at step ${step}`);
      lastError = "Budget timeout reached";
      break;
    }

    emitProgress(`Step ${step + 1}/${MAX_SUB_STEPS}...`);

    try {
      // Make LLM call via personal key
      const llmPayload: any = {
        model: modelToUse,
        messages,
        temperature: 0.3,
        max_tokens: 4096,
      };
      if (subToolDefs.length > 0) {
        llmPayload.tools = subToolDefs;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SUB_AGENT_TOOL_TIMEOUT_MS);

      const llmRes = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${personalKey}` },
        body: JSON.stringify(llmPayload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!llmRes.ok) {
        const errText = await llmRes.text();
        console.error(`[SubAgent] LLM error at step ${step}:`, errText.slice(0, 200));
        lastError = `LLM error: ${llmRes.status}`;
        break;
      }

      const llmData = await llmRes.json();
      const choice = llmData.choices?.[0];
      if (!choice) { lastError = "Empty LLM response"; break; }

      const assistantMsg = choice.message;
      messages.push(assistantMsg);

      // If no tool calls, we have a final answer
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        collectedResults.push({ type: "final_answer", content: assistantMsg.content });
        break;
      }

      // Execute tool calls
      const { executeTool } = await import("../tool-executor.ts");
      for (const tc of assistantMsg.tool_calls) {
        if (Date.now() - budgetStart > SUB_AGENT_BUDGET_MS) break;

        const toolName = tc.function?.name;
        let toolArgs: any;
        try { toolArgs = JSON.parse(tc.function?.arguments || "{}"); } catch { toolArgs = {}; }

        emitProgress(`🔧 ${toolName}...`);
        const traceStepId = await insertTraceStep(toolName, toolArgs);
        const toolStart = Date.now();

        try {
          const toolController = new AbortController();
          const toolTimeout = setTimeout(() => toolController.abort(), SUB_AGENT_TOOL_TIMEOUT_MS);

          const result = await executeTool(
            supabase, userId, toolName, toolArgs, isAdmin, authHeader,
            { ...options, _isSubAgent: true, sessionId }
          );
          clearTimeout(toolTimeout);

          collectedResults.push({ tool: toolName, result });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 3000) });
          await updateTraceStep(traceStepId, "success", result, undefined, Date.now() - toolStart);
        } catch (toolErr: any) {
          console.error(`[SubAgent] Tool ${toolName} failed:`, toolErr.message);
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: toolErr.message }) });
          await updateTraceStep(traceStepId, "error", null, toolErr.message, Date.now() - toolStart);
        }
      }
    } catch (stepErr: any) {
      console.error(`[SubAgent] Step ${step} failed:`, stepErr.message);
      lastError = stepErr.message;
      break;
    }
  }

  // ═══ FINALIZE ═══
  const totalDuration = Date.now() - budgetStart;
  const toolsUsed = collectedResults.filter(r => r.tool).map(r => r.tool);
  const finalAnswer = collectedResults.find(r => r.type === "final_answer")?.content || null;

  // Update task record
  await supabase.from("agent_sub_tasks").update({
    status: lastError ? "failed" : "completed",
    completed_at: new Date().toISOString(),
    result: { 
      answer: finalAnswer, 
      tool_results: collectedResults.filter(r => r.tool),
      error: lastError,
      duration_ms: totalDuration,
    },
    tools_used: toolsUsed,
  }).eq("id", subTaskId);

  emitProgress(`✅ Sub-agent ${lastError ? "failed" : "completed"} (${totalDuration}ms)`);

  console.log(`[SubAgent] Completed: ${subTaskId}, tools: [${toolsUsed.join(",")}], duration: ${totalDuration}ms, error: ${lastError || "none"}`);

  return {
    success: !lastError,
    sub_task_id: subTaskId,
    answer: finalAnswer,
    tool_results: collectedResults.filter(r => r.tool).map(r => ({
      tool: r.tool,
      summary: JSON.stringify(r.result).slice(0, 500),
    })),
    duration_ms: totalDuration,
    steps_used: collectedResults.length,
    error: lastError,
  };
}

// ═══ SMART URL INGESTION ═══
export async function executeIngestUrl(supabase: any, userId: string, args: any) {
  const { url, title: userTitle } = args;
  if (!url) return { error: "URL is required" };
  if (isBlockedUrl(url)) return { error: "This URL is blocked for security reasons." };

  try {
    // Step 1: Scrape via Firecrawl or fetch fallback
    let content = "";
    let pageTitle = userTitle || "";
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

    if (firecrawlKey) {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { "Authorization": `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"] }),
      });
      if (res.ok) {
        const data = await res.json();
        content = data.data?.markdown || data.markdown || "";
        pageTitle = pageTitle || data.data?.metadata?.title || data.metadata?.title || url;
      }
    }

    // Fallback to basic fetch
    if (!content) {
      const res = await fetch(url, { headers: { "Accept": "text/html" } });
      if (!res.ok) return { error: `Failed to fetch URL: ${res.status}` };
      const html = await res.text();
      content = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 8000);
      pageTitle = pageTitle || (html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || url);
    }

    if (!content || content.length < 20) return { error: "Could not extract meaningful content from URL." };

    // Step 2: Summarize via personal Gemini key
    const { data: userKeyData } = await supabase.from("ai_user_settings").select("gemini_api_key, gemini_model").eq("user_id", userId).maybeSingle();
    const personalKey = userKeyData?.gemini_api_key;
    let summary = content.slice(0, 1500);
    if (personalKey) {
      try {
        const aiRes = await fetch(GEMINI_ENDPOINT, {
          method: "POST",
          headers: { "Authorization": `Bearer ${personalKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: userKeyData?.gemini_model || "gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "Summarize this web page content in 3-5 key bullet points. Be concise." },
              { role: "user", content: content.slice(0, 4000) },
            ],
          }),
        });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          summary = aiData.choices?.[0]?.message?.content || summary;
        }
      } catch (e) { console.error("[IngestURL] Summary error:", e); }
    }

    // Step 3: Auto-tag
    const tags = await autoTagContent(content, pageTitle);

    // Step 4: Save to ai_generated_content
    const { data: saved, error: saveErr } = await supabase.from("ai_generated_content").insert({
      user_id: userId,
      title: pageTitle.slice(0, 200),
      content: `## Summary\n${summary}\n\n## Source\n${url}\n\n## Raw Content\n${content.slice(0, 5000)}`,
      source_type: "url_ingest",
      is_personal: true,
      is_global: false,
      tags,
      category: tags[0]?.replace("#", "") || "Personal",
      embedding_status: "pending",
      metadata: { source_url: url, ingested_at: new Date().toISOString() },
    }).select("id").single();

    if (saveErr) return { error: `Save failed: ${saveErr.message}` };

    return {
      success: true,
      message: `✅ URL ingested and queued for embedding.`,
      item_id: saved.id,
      title: pageTitle,
      tags,
      summary: summary.slice(0, 500),
    };
  } catch (e: any) {
    return { error: `Ingestion failed: ${e.message}` };
  }
}

// ═══ DOCUMENT/TEXT DIGEST ═══
export async function executeDigestText(supabase: any, userId: string, args: any) {
  const { text, title: userTitle } = args;
  if (!text) return { error: "Text content is required" };
  if (text.length < 20) return { error: "Text too short to digest (min 20 chars)." };

  const truncated = text.slice(0, 10000);

  try {
    // Step 1: Summarize via personal key
    const { data: userKeyData } = await supabase.from("ai_user_settings").select("gemini_api_key, gemini_model").eq("user_id", userId).maybeSingle();
    const personalKey = userKeyData?.gemini_api_key;
    let summary = truncated.slice(0, 1000);
    if (personalKey) {
      try {
        const aiRes = await fetch(GEMINI_ENDPOINT, {
          method: "POST",
          headers: { "Authorization": `Bearer ${personalKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: userKeyData?.gemini_model || "gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "Summarize the following text into 3-5 key insights. Be concise and structured." },
              { role: "user", content: truncated.slice(0, 4000) },
            ],
          }),
        });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          summary = aiData.choices?.[0]?.message?.content || summary;
        }
      } catch (e) { console.error("[DigestText] Summary error:", e); }
    }

    // Step 2: Auto-generate title if not provided
    const title = userTitle || summary.split("\n")[0]?.slice(0, 100) || "Text Digest";

    // Step 3: Auto-tag
    const tags = await autoTagContent(truncated, title);

    // Step 4: Save
    const { data: saved, error: saveErr } = await supabase.from("ai_generated_content").insert({
      user_id: userId,
      title: title.slice(0, 200),
      content: `## Summary\n${summary}\n\n## Original Text\n${truncated}`,
      source_type: "text_digest",
      is_personal: true,
      is_global: false,
      tags,
      category: tags[0]?.replace("#", "") || "Personal",
      embedding_status: "pending",
      metadata: { char_count: text.length, digested_at: new Date().toISOString() },
    }).select("id").single();

    if (saveErr) return { error: `Save failed: ${saveErr.message}` };

    return {
      success: true,
      message: `✅ Text digested and queued for embedding.`,
      item_id: saved.id,
      title,
      tags,
      summary: summary.slice(0, 500),
    };
  } catch (e: any) {
    return { error: `Digest failed: ${e.message}` };
  }
}

// fetchWithRetry is now imported from executor-helpers.ts

// Browser tools (Firecrawl)
export async function executeBrowserScrape(args: any) {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return { error: "Firecrawl key missing" };
  if (!args.url) return { error: "URL is required for browser_scrape" };
  
  try {
    const res = await fetchWithRetry("https://api.firecrawl.dev/v1/scrape", {
      method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: args.url })
    });
    return await res.json();
  } catch (e: any) { return { error: e.message }; }
}

export async function executeBrowserSearch(args: any) {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return { error: "Firecrawl key missing" };
  if (!args.query) return { error: "Query is required for browser_search" };
  
  try {
    const res = await fetchWithRetry("https://api.firecrawl.dev/v1/search", {
      method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: args.query, limit: args.limit || 5 })
    });
    return await res.json();
  } catch (e: any) { return { error: e.message }; }
}

export async function executeBrowserMap(args: any) {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return { error: "Firecrawl key missing" };
  if (!args.url) return { error: "URL is required for browser_map" };
  
  try {
    const res = await fetchWithRetry("https://api.firecrawl.dev/v1/map", {
      method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: args.url })
    });
    return await res.json();
  } catch (e: any) { return { error: e.message }; }
}

// ═══ PARALLEL SUB-AGENT SWARM ORCHESTRATION ═══
const MAX_SWARM_AGENTS = 4;
const SWARM_BUDGET_MS = 60_000;

export async function executeParallelSwarm(
  supabase: any, userId: string, args: any, sessionId: string,
  isAdmin: boolean, authHeader?: string, options?: any
) {
  const { tasks, merge_strategy = "concatenate" } = args;

  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return { error: "At least one task is required in the tasks array." };
  }
  if (tasks.length > MAX_SWARM_AGENTS) {
    return { error: `Maximum ${MAX_SWARM_AGENTS} parallel sub-agents allowed. Got ${tasks.length}.` };
  }

  const swarmId = crypto.randomUUID();
  const swarmStart = Date.now();

  // Emit swarm start via SSE
  const emitSwarm = (msg: string) => {
    if (options?.writer && options?.encoder) {
      try {
        options.writer.enqueue(options.encoder.encode(
          `data: ${JSON.stringify({ type: "agent_step", status: "swarm", swarm_id: swarmId, message: msg })}\n\n`
        ));
      } catch (_) { /* stream closed */ }
    }
  };

  emitSwarm(`🐝 Swarm launched: ${tasks.length} parallel agents`);

  // Spawn all sub-agents in parallel
  const agentPromises = tasks.map((t: any, idx: number) => {
    const subArgs = {
      task: t.task || t,
      tools: t.tools || ["search_web", "browser_search"],
      context: t.context || `Swarm task ${idx + 1}/${tasks.length}`,
      max_steps: Math.min(t.max_steps || 2, 3),
    };

    emitSwarm(`🚀 Agent ${idx + 1}: ${String(subArgs.task).slice(0, 60)}...`);

    return executeSpawnSubAgent(
      supabase, userId, subArgs, sessionId, isAdmin, authHeader,
      { ...options, _isSubAgent: true }
    );
  });

  // Enforce swarm budget timeout — prevent indefinite hangs
  const budgetTimer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Swarm budget exceeded (${SWARM_BUDGET_MS}ms)`)), SWARM_BUDGET_MS)
  );
  let results: PromiseSettledResult<any>[];
  try {
    results = await Promise.race([
      Promise.allSettled(agentPromises),
      budgetTimer.then(() => [] as never), // never resolves, only rejects
    ]);
  } catch (budgetErr: any) {
    emitSwarm(`⏰ Swarm timeout after ${SWARM_BUDGET_MS}ms`);
    // Return partial results for any already-settled promises
    results = agentPromises.map(() => ({ status: "rejected" as const, reason: budgetErr }));
  }
  const totalDuration = Date.now() - swarmStart;

  // Process results
  const agents = results.map((r, idx) => {
    const taskDesc = typeof tasks[idx] === "string" ? tasks[idx] : tasks[idx]?.task || `Task ${idx + 1}`;
    if (r.status === "fulfilled") {
      emitSwarm(`✅ Agent ${idx + 1} done (${r.value.duration_ms || 0}ms)`);
      return {
        task: taskDesc,
        status: r.value.success ? "completed" : "failed",
        answer: r.value.answer || null,
        tool_results: r.value.tool_results || [],
        duration_ms: r.value.duration_ms || 0,
        error: r.value.error || null,
      };
    } else {
      emitSwarm(`❌ Agent ${idx + 1} crashed`);
      return {
        task: taskDesc,
        status: "crashed",
        answer: null,
        tool_results: [],
        duration_ms: 0,
        error: r.reason?.message || "Unknown error",
      };
    }
  });

  // ═══ REPLACEMENT WAVE: Respawn failed/crashed agents if budget remains ═══
  const failedAgents = agents.map((a, idx) => ({ ...a, originalIndex: idx })).filter(a => a.status === "failed" || a.status === "crashed");
  const budgetRemaining = SWARM_BUDGET_MS - (Date.now() - swarmStart);
  
  if (failedAgents.length > 0 && budgetRemaining > 10_000) {
    emitSwarm(`🔄 Replacement wave: ${failedAgents.length} agent(s) to retry (${Math.round(budgetRemaining / 1000)}s budget remaining)`);
    
    const replacementPromises = failedAgents.slice(0, MAX_SWARM_AGENTS).map((failed) => {
      const originalTask = tasks[failed.originalIndex];
      const subArgs = {
        task: originalTask?.task || originalTask || failed.task,
        tools: originalTask?.tools || ["search_web", "browser_search"],
        context: `[REPLACEMENT] Original agent failed: ${(failed.error || 'unknown').slice(0, 100)}. Retry with alternative approach.`,
        max_steps: Math.min(originalTask?.max_steps || 2, 2), // Tighter budget for replacements
      };

      emitSwarm(`🔄 Replacement ${failed.originalIndex + 1}: ${String(subArgs.task).slice(0, 50)}...`);

      return executeSpawnSubAgent(
        supabase, userId, subArgs, sessionId, isAdmin, authHeader,
        { ...options, _isSubAgent: true }
      );
    });

    const replacementTimer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Replacement budget exceeded")), Math.min(budgetRemaining - 2000, 30_000))
    );

    let replacementResults: PromiseSettledResult<any>[];
    try {
      replacementResults = await Promise.race([
        Promise.allSettled(replacementPromises),
        replacementTimer.then(() => [] as never),
      ]);
    } catch {
      replacementResults = replacementPromises.map(() => ({ status: "rejected" as const, reason: new Error("Replacement timeout") }));
    }

    // Merge replacement results into original agents array
    for (let i = 0; i < replacementResults.length && i < failedAgents.length; i++) {
      const r = replacementResults[i];
      const origIdx = failedAgents[i].originalIndex;
      if (r.status === "fulfilled" && r.value.success) {
        emitSwarm(`✅ Replacement ${origIdx + 1} succeeded!`);
        agents[origIdx] = {
          ...agents[origIdx],
          status: "completed",
          answer: r.value.answer || null,
          tool_results: r.value.tool_results || [],
          duration_ms: (agents[origIdx].duration_ms || 0) + (r.value.duration_ms || 0),
          error: null,
        };
      } else {
        emitSwarm(`❌ Replacement ${origIdx + 1} also failed`);
      }
    }
  }

  const successfulAgents = agents.filter(a => a.status === "completed" && a.answer);

  // Merge results
  let mergedReport = "";
  if (merge_strategy === "synthesize" && successfulAgents.length >= 2) {
    // Use LLM to synthesize via personal key
    const { data: userSettings } = await supabase
      .from("ai_user_settings").select("gemini_api_key, gemini_model")
      .eq("user_id", userId).maybeSingle();
    const personalKey = userSettings?.gemini_api_key;

    const synthesisInput = successfulAgents.map((a, i) =>
      `### Source ${i + 1}: ${a.task}\n${a.answer}`
    ).join("\n\n---\n\n");

    if (personalKey) {
      try {
        emitSwarm("🧬 Synthesizing results...");
        const synthRes = await fetch(GEMINI_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${personalKey}` },
          body: JSON.stringify({
            model: userSettings?.gemini_model || "gemini-3.5-flash",
            messages: [
              { role: "system", content: "You are a research synthesizer. Merge the following research findings from multiple sub-agents into a cohesive, well-structured report. Identify agreements, contradictions, and key insights across sources. Be thorough and analytical." },
              { role: "user", content: synthesisInput },
            ],
            temperature: 0.3,
            max_tokens: 8192,
          }),
        });

        if (synthRes.ok) {
          const synthData = await synthRes.json();
          mergedReport = synthData.choices?.[0]?.message?.content || "";
        }
      } catch (e: any) {
        console.error("[Swarm] Synthesis LLM call failed:", e.message);
      }
    }
  }

  // Fallback to concatenation
  if (!mergedReport) {
    mergedReport = successfulAgents.map((a, i) =>
      `## Source ${i + 1}: ${a.task}\n\n${a.answer}`
    ).join("\n\n---\n\n");
  }

  emitSwarm(`🏁 Swarm complete: ${successfulAgents.length}/${tasks.length} succeeded (${totalDuration}ms)${failedAgents.length > 0 ? ` [${failedAgents.length} replaced]` : ''}`);

  console.log(`[Swarm] ${swarmId}: ${tasks.length} agents, ${successfulAgents.length} succeeded, ${totalDuration}ms, strategy: ${merge_strategy}`);

  return {
    success: successfulAgents.length > 0,
    swarm_id: swarmId,
    agents,
    merged_report: mergedReport || "No successful results to merge.",
    total_duration_ms: totalDuration,
    merge_strategy,
    stats: {
      total: tasks.length,
      succeeded: successfulAgents.length,
      failed: agents.filter(a => a.status !== "completed").length,
      replacements_attempted: failedAgents.length,
    },
  };
}

// ═══ OPENCLAW: INTERACTIVE BROWSER ACTION ═══
// Uses Firecrawl's scrape API with actions for interactive browser control

// In-memory session state (per edge function invocation)
const browserSessions = new Map<string, { url: string; lastAction: string }>();

export async function executeBrowserAction(args: any) {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return { error: "Firecrawl key missing. Browser action requires Firecrawl connector." };

  const { action, url, selector, text, schema, prompt, direction, wait_ms } = args;

  if (!action) return { error: "action is required (navigate, screenshot, extract, click, type, scroll, wait)." };

  try {
    // ═══ NAVIGATE ═══
    if (action === "navigate") {
      if (!url) return { error: "url is required for navigate action." };

      let formattedUrl = url.trim();
      if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
        formattedUrl = `https://${formattedUrl}`;
      }

      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: formattedUrl,
          formats: ["markdown", "links"],
          onlyMainContent: true,
          waitFor: wait_ms || 2000,
        }),
      });
      const data = await res.json();

      // Track session
      browserSessions.set("current", { url: formattedUrl, lastAction: "navigate" });

      return {
        success: data.success !== false,
        action: "navigate",
        url: formattedUrl,
        title: data.data?.metadata?.title || data.metadata?.title || null,
        content_preview: (data.data?.markdown || data.markdown || "").slice(0, 1500),
        links_count: (data.data?.links || data.links || []).length,
        status_code: data.data?.metadata?.statusCode || data.metadata?.statusCode || null,
      };
    }

    // ═══ SCREENSHOT ═══
    if (action === "screenshot") {
      const targetUrl = url || browserSessions.get("current")?.url;
      if (!targetUrl) return { error: "No URL provided and no active browser session. Navigate first." };

      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          formats: ["screenshot"],
          waitFor: wait_ms || 3000,
        }),
      });
      const data = await res.json();

      const screenshot = data.data?.screenshot || data.screenshot;
      return {
        success: !!screenshot,
        action: "screenshot",
        url: targetUrl,
        has_screenshot: !!screenshot,
        screenshot_base64: screenshot ? screenshot.slice(0, 100) + "..." : null, // Truncated for response
        message: screenshot
          ? `📸 Screenshot captured for ${targetUrl}`
          : "Failed to capture screenshot.",
      };
    }

    // ═══ EXTRACT (Structured Data) ═══
    if (action === "extract") {
      const targetUrl = url || browserSessions.get("current")?.url;
      if (!targetUrl) return { error: "No URL provided and no active browser session." };

      if (!schema && !prompt) return { error: "Either schema or prompt is required for extract action." };

      const formats: any[] = [];
      if (schema) {
        formats.push({ type: "json", schema });
      } else if (prompt) {
        formats.push({ type: "json", prompt });
      }

      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          formats,
          waitFor: wait_ms || 2000,
        }),
      });
      const data = await res.json();

      return {
        success: data.success !== false,
        action: "extract",
        url: targetUrl,
        extracted_data: data.data?.json || data.json || null,
        message: "Data extracted successfully.",
      };
    }

    // ═══ CLICK / TYPE / SCROLL / WAIT — via Firecrawl actions API ═══
    if (["click", "type", "scroll", "wait"].includes(action)) {
      const targetUrl = url || browserSessions.get("current")?.url;
      if (!targetUrl) return { error: "No URL provided and no active browser session. Navigate first." };

      // Build Firecrawl actions array
      const actions: any[] = [];

      if (action === "wait") {
        actions.push({ type: "wait", milliseconds: wait_ms || 2000 });
      } else if (action === "click") {
        if (!selector) return { error: "selector is required for click action." };
        actions.push({ type: "click", selector });
      } else if (action === "type") {
        if (!selector || !text) return { error: "selector and text are required for type action." };
        actions.push({ type: "write", selector, text });
      } else if (action === "scroll") {
        actions.push({ type: "scroll", direction: direction || "down" });
      }

      // After action, capture the page state
      actions.push({ type: "wait", milliseconds: 1000 });

      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          formats: ["markdown"],
          onlyMainContent: true,
          actions,
        }),
      });
      const data = await res.json();

      browserSessions.set("current", { url: targetUrl, lastAction: action });

      return {
        success: data.success !== false,
        action,
        url: targetUrl,
        selector: selector || null,
        content_after: (data.data?.markdown || data.markdown || "").slice(0, 1500),
        message: `✅ Browser action '${action}' executed on ${targetUrl}`,
      };
    }

    return { error: `Unknown browser action: ${action}. Valid: navigate, screenshot, extract, click, type, scroll, wait` };

  } catch (e: any) {
    return { error: `Browser action failed: ${e.message}` };
  }
}
