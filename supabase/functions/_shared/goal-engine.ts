// ═══ AUTONOMY ENGINE: Goal & Task Architecture ═══
// Shared module for goal lifecycle management
// Used by: agent-chat (manage_goal tool), agent-heartbeat-worker (Phase 2)

interface GoalParams {
  title: string;
  description?: string;
  goal_type?: string;
  config?: Record<string, any>;
  priority?: number;
}

interface DecomposedTask {
  task_type: string;
  payload: Record<string, any>;
  priority: number;
  scheduled_for?: string;
}

// ═══ NATURAL LANGUAGE PARSER ═══
export function parseNaturalLanguageGoal(message: string): {
  title: string;
  goalType: string;
  config: Record<string, any>;
} | null {
  const lower = message.toLowerCase();

  // Duration patterns (English + Myanmar)
  const durationPatterns = [
    /(?:for|next)\s+(\d+)\s*(day|hour|hr|week)s?/i,
    /(\d+)\s*(day|hour|hr|week)s?\s*(?:for|long|duration)/i,
    /(\d+)\s*ရက်/,       // X days (Myanmar)
    /(\d+)\s*နာရီ/,      // X hours (Myanmar)
    /(\d+)\s*အပတ်/,     // X weeks (Myanmar)
  ];

  // Report interval patterns
  const reportPatterns = [
    /report\s+every\s+(\d+)\s*(hour|hr|minute|min)s?/i,
    /every\s+(\d+)\s*(hour|hr)s?\s*report/i,
    /(\d+)\s*နာရီ\s*တစ်ခါ/,  // every X hours (Myanmar)
  ];

  // Goal type detection
  let goalType = "research";
  if (/watch|monitor|track|စောင့်ကြည့်|သတိထား/i.test(lower)) {
    goalType = "monitor";
  } else if (/report|summarize|အစီရင်ခံ|အနှစ်ချုပ်/i.test(lower)) {
    goalType = "report";
  } else if (/research|find|investigate|study|explore|လေ့လာ|ရှာ|သုတေသန/i.test(lower)) {
    goalType = "research";
  }

  // Extract duration
  let maxDurationHours = 24; // default 1 day
  for (const pat of durationPatterns) {
    const m = message.match(pat);
    if (m) {
      const num = parseInt(m[1]);
      const unit = m[2]?.toLowerCase();
      if (unit?.startsWith("week") || /အပတ်/.test(m[0])) {
        maxDurationHours = num * 24 * 7;
      } else if (unit?.startsWith("day") || /ရက်/.test(m[0])) {
        maxDurationHours = num * 24;
      } else {
        maxDurationHours = num;
      }
      break;
    }
  }

  // Extract report interval
  let reportIntervalHours: number | undefined;
  for (const pat of reportPatterns) {
    const m = message.match(pat);
    if (m) {
      const num = parseInt(m[1]);
      const unit = m[2]?.toLowerCase();
      if (unit?.startsWith("min")) {
        reportIntervalHours = num / 60;
      } else {
        reportIntervalHours = num;
      }
      break;
    }
  }

  // Extract search queries from quoted strings
  const quotedQueries = [...message.matchAll(/"([^"]+)"/g)].map(m => m[1]);

  // Build title: strip meta-info, keep the core topic
  let title = message
    .replace(/(?:for|next)\s+\d+\s*(?:day|hour|hr|week)s?/gi, "")
    .replace(/\d+\s*(?:ရက်|နာရီ|အပတ်)/g, "")
    .replace(/report\s+every\s+\d+\s*(?:hour|hr|minute|min)s?/gi, "")
    .replace(/every\s+\d+\s*(?:hour|hr)s?\s*report/gi, "")
    .replace(/\d+\s*နာရီ\s*တစ်ခါ/g, "")
    .replace(/^(go\s+)?(?:research|watch|monitor|track|find|investigate)\s+/i, "")
    .replace(/\s+and\s*$/i, "")
    .trim();

  if (!title || title.length < 3) {
    title = message.substring(0, 60).trim();
  }

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  const config: Record<string, any> = {
    max_duration_hours: maxDurationHours,
  };
  if (reportIntervalHours) config.report_interval_hours = reportIntervalHours;
  if (quotedQueries.length > 0) config.search_queries = quotedQueries;

  return { title, goalType, config };
}

// ═══ TASK DECOMPOSITION (with Fan-out Parallel Priorities) ═══
export function decomposeGoalIntoTasks(
  title: string,
  description: string | undefined,
  goalType: string,
  config: Record<string, any>
): DecomposedTask[] {
  const tasks: DecomposedTask[] = [];
  const queries = config.search_queries || [title];
  const now = new Date();
  const durationHours = config.max_duration_hours || 24;
  const reportInterval = config.report_interval_hours || Math.min(durationHours, 6);

  if (goalType === "research") {
    // Phase 1: Search tasks — ALL share priority=1 for FAN-OUT parallel execution
    const SEARCH_PRIORITY = 1;
    for (const q of queries) {
      tasks.push({
        task_type: "search",
        payload: { query: q, search_round: 1, context: description || title },
        priority: SEARCH_PRIORITY,
      });
      tasks.push({
        task_type: "search",
        payload: { query: `${q} latest developments`, search_round: 2, context: description || title },
        priority: SEARCH_PRIORITY,
      });
    }

    // Phase 2: Analyze findings (sequential, depends on searches)
    let seqPriority = 2;
    tasks.push({
      task_type: "analyze",
      payload: { instruction: `Analyze and cross-reference findings for: ${title}` },
      priority: seqPriority++,
    });

    // Phase 3: Synthesize
    tasks.push({
      task_type: "synthesize",
      payload: { instruction: `Create comprehensive synthesis of research on: ${title}` },
      priority: seqPriority++,
    });

    // Phase 4: Periodic reports
    const numReports = Math.max(1, Math.floor(durationHours / reportInterval));
    for (let i = 0; i < numReports; i++) {
      const reportTime = new Date(now.getTime() + (i + 1) * reportInterval * 60 * 60 * 1000);
      tasks.push({
        task_type: "report",
        payload: {
          report_number: i + 1,
          total_reports: numReports,
          instruction: `Compile progress report #${i + 1} for goal: ${title}`,
        },
        priority: seqPriority++,
        scheduled_for: reportTime.toISOString(),
      });
    }
  } else if (goalType === "monitor") {
    // Periodic check tasks spread across duration
    const checkInterval = Math.max(1, reportInterval);
    const numChecks = Math.max(1, Math.floor(durationHours / checkInterval));
    let priority = 1;

    for (let i = 0; i < numChecks; i++) {
      const checkTime = new Date(now.getTime() + i * checkInterval * 60 * 60 * 1000);
      tasks.push({
        task_type: "search",
        payload: {
          query: title,
          check_number: i + 1,
          instruction: `Monitor check #${i + 1}: Search for updates on "${title}"`,
        },
        priority: priority++,
        scheduled_for: checkTime.toISOString(),
      });

      // Comparison task after each search
      if (i > 0) {
        tasks.push({
          task_type: "analyze",
          payload: {
            instruction: `Compare check #${i + 1} results with previous findings for "${title}"`,
            check_number: i + 1,
          },
          priority: priority++,
          scheduled_for: checkTime.toISOString(),
        });
      }
    }

    // Final summary
    const endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
    tasks.push({
      task_type: "report",
      payload: { instruction: `Final monitoring summary for: ${title}`, is_final: true },
      priority: priority++,
      scheduled_for: endTime.toISOString(),
    });
  } else if (goalType === "report") {
    tasks.push(
      { task_type: "synthesize", payload: { instruction: `Gather data for report: ${title}` }, priority: 1 },
      { task_type: "report", payload: { instruction: `Generate formatted report: ${title}` }, priority: 2 }
    );
  } else {
    // Custom: single search + analyze + report
    tasks.push(
      { task_type: "search", payload: { query: title, context: description }, priority: 1 },
      { task_type: "analyze", payload: { instruction: `Analyze findings for: ${title}` }, priority: 2 },
      { task_type: "report", payload: { instruction: `Report on: ${title}` }, priority: 3 }
    );
  }

  return tasks;
}

// ═══ GOAL LIFECYCLE FUNCTIONS ═══

export async function createGoal(
  supabase: any,
  userId: string,
  params: GoalParams
): Promise<{ success: boolean; goal?: any; tasks_created?: number; error?: string }> {
  try {
    const goalType = params.goal_type || "research";
    const config = params.config || {};
    const durationHours = config.max_duration_hours || 24;
    const deadline = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    // Create the goal
    const { data: goal, error: goalError } = await supabase
      .from("agent_goals")
      .insert({
        user_id: userId,
        title: params.title,
        description: params.description || null,
        status: "active",
        priority: params.priority || 3,
        goal_type: goalType,
        config,
        progress: { steps_completed: 0, total_steps: 0, findings: [] },
        started_at: new Date().toISOString(),
        deadline_at: deadline.toISOString(),
      })
      .select()
      .single();

    if (goalError) throw goalError;

    // Decompose into tasks
    const tasks = decomposeGoalIntoTasks(params.title, params.description, goalType, config);

    // Insert tasks
    const taskRows = tasks.map(t => ({
      goal_id: goal.id,
      user_id: userId,
      task_type: t.task_type,
      payload: t.payload,
      priority: t.priority,
      scheduled_for: t.scheduled_for || new Date().toISOString(),
    }));

    const { error: taskError } = await supabase
      .from("agent_task_queue")
      .insert(taskRows);

    if (taskError) throw taskError;

    // Update goal progress
    await supabase
      .from("agent_goals")
      .update({ progress: { steps_completed: 0, total_steps: tasks.length, findings: [] } })
      .eq("id", goal.id);

    // Auto-create dedicated heartbeat for this goal
    const heartbeatName = `goal_${goal.id.substring(0, 8)}`;
    await supabase
      .from("agent_heartbeats")
      .insert({
        user_id: userId,
        name: heartbeatName,
        display_name: `🎯 Goal: ${params.title.substring(0, 40)}`,
        cron_expression: "*/5 * * * *",
        task_type: "goal_step",
        task_config: { goal_id: goal.id },
        is_active: true,
        next_run_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });

    return { success: true, goal, tasks_created: tasks.length };
  } catch (error: any) {
    console.error("[GoalEngine] createGoal error:", error);
    return { success: false, error: error.message };
  }
}

export async function listGoals(
  supabase: any,
  userId: string,
  statusFilter?: string
): Promise<{ success: boolean; goals?: any[]; error?: string }> {
  try {
    let query = supabase
      .from("agent_goals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (statusFilter) query = query.eq("status", statusFilter);

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, goals: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getGoalStatus(
  supabase: any,
  goalId: string,
  userId: string
): Promise<{ success: boolean; goal?: any; tasks?: any[]; error?: string }> {
  try {
    const { data: goal, error: gErr } = await supabase
      .from("agent_goals")
      .select("*")
      .eq("id", goalId)
      .eq("user_id", userId)
      .single();

    if (gErr) throw gErr;

    const { data: tasks } = await supabase
      .from("agent_task_queue")
      .select("id, task_type, status, priority, scheduled_for, completed_at")
      .eq("goal_id", goalId)
      .order("priority", { ascending: true });

    return { success: true, goal, tasks: tasks || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateGoalStatus(
  supabase: any,
  goalId: string,
  userId: string,
  newStatus: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const updates: Record<string, any> = { status: newStatus };
    if (newStatus === "completed" || newStatus === "cancelled" || newStatus === "failed") {
      updates.completed_at = new Date().toISOString();

      // Deactivate associated heartbeat
      await supabase
        .from("agent_heartbeats")
        .update({ is_active: false })
        .eq("user_id", userId)
        .eq("task_type", "goal_step")
        .filter("task_config->>goal_id", "eq", goalId);
    }

    const { error } = await supabase
      .from("agent_goals")
      .update(updates)
      .eq("id", goalId)
      .eq("user_id", userId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ═══ CONCURRENCY-SAFE TASK PICKUP (Phase 2 will use this) ═══
export async function getNextTask(
  supabase: any,
  goalId: string
): Promise<any | null> {
  // Atomic pickup: UPDATE ... WHERE status = 'queued' ... LIMIT 1 RETURNING
  // Deno Supabase client doesn't support FOR UPDATE SKIP LOCKED directly,
  // so we use an RPC or a two-step atomic update pattern
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("agent_task_queue")
    .update({ status: "running", started_at: now, attempt_count: 1 })
    .eq("goal_id", goalId)
    .eq("status", "queued")
    .lte("scheduled_for", now)
    .order("priority", { ascending: true })
    .limit(1)
    .select()
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[GoalEngine] getNextTask error:", error);
  }

  return data || null;
}

export async function completeTask(
  supabase: any,
  taskId: string,
  result: Record<string, any>
): Promise<void> {
  await supabase
    .from("agent_task_queue")
    .update({
      status: "completed",
      result,
      completed_at: new Date().toISOString(),
    })
    .eq("id", taskId);
}

export async function checkpointTask(
  supabase: any,
  taskId: string,
  checkpointState: Record<string, any>
): Promise<void> {
  await supabase
    .from("agent_task_queue")
    .update({
      status: "running",
      checkpoint_state: {
        ...checkpointState,
        checkpoint_at: new Date().toISOString(),
      },
    })
    .eq("id", taskId);
}

// ═══ FAN-OUT: ATOMIC BATCH TASK PICKUP via RPC (FOR UPDATE SKIP LOCKED) ═══
export async function getNextTaskBatch(
  supabase: any,
  goalId: string,
  maxBatchSize: number = 5
): Promise<any[]> {
  const { data, error } = await supabase
    .rpc("pick_goal_tasks", { p_goal_id: goalId, p_max_batch: maxBatchSize });

  if (error) {
    console.error("[GoalEngine] pick_goal_tasks RPC error:", error);
    return [];
  }
  return data || [];
}

export async function updateGoalProgress(
  supabase: any,
  goalId: string
): Promise<{ isComplete: boolean; progress: Record<string, any> }> {
  const { data: tasks } = await supabase
    .from("agent_task_queue")
    .select("status")
    .eq("goal_id", goalId);

  const total = tasks?.length || 0;
  const completed = tasks?.filter((t: any) => t.status === "completed").length || 0;
  const failed = tasks?.filter((t: any) => t.status === "failed").length || 0;
  const isComplete = total > 0 && (completed + failed) === total;

  const progress = { steps_completed: completed, total_steps: total, failed_steps: failed };

  const updates: Record<string, any> = { progress };
  if (isComplete) {
    updates.status = failed > 0 ? "failed" : "completed";
    updates.completed_at = new Date().toISOString();

    // Deactivate heartbeat
    const { data: goal } = await supabase
      .from("agent_goals")
      .select("user_id")
      .eq("id", goalId)
      .single();

    if (goal) {
      await supabase
        .from("agent_heartbeats")
        .update({ is_active: false })
        .eq("user_id", goal.user_id)
        .eq("task_type", "goal_step")
        .filter("task_config->>goal_id", "eq", goalId);
    }
  }

  await supabase.from("agent_goals").update(updates).eq("id", goalId);

  return { isComplete, progress };
}

// ═══ GET ALL TASK RESULTS (for synthesis reporting) ═══
export async function getAllTaskResults(
  supabase: any,
  goalId: string
): Promise<{ tasks: any[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("agent_task_queue")
      .select("id, task_type, status, payload, result, priority, completed_at")
      .eq("goal_id", goalId)
      .order("priority", { ascending: true });

    if (error) throw error;
    return { tasks: data || [] };
  } catch (error: any) {
    console.error("[GoalEngine] getAllTaskResults error:", error);
    return { tasks: [], error: error.message };
  }
}
