
// ═══ Project Phoenix: _shared/tool-executors/skills.ts ═══
// OpenClaw-Inspired Self-Hackable Skills System
// Skills are "structured action chains" — JSON arrays of predefined safe actions
// mapped to existing BeeBot tools. Now includes sandboxed code execution!

// Allowed actions that map to existing BeeBot tools
const ALLOWED_STEP_ACTIONS = [
  "search_web", "search_knowledge_base", "browser_search", "browser_scrape",
  "generate_ai_content", "manage_flowstate", "manage_workspace_task",
  "recall_user_facts", "remember_user_fact", "recall_episodic_memory",
  "get_user_info", "manage_notifications", "fetch_external_api",
  "format_response", "conditional", "set_variable",
  "run_code", // Sandboxed JavaScript execution
];

const MAX_STEPS = 10;
const MAX_SKILLS_PER_USER = 50;
export const MAX_CODE_LENGTH = 4000;
const MAX_OUTPUT_LENGTH = 5000;
const CODE_TIMEOUT_MS = 500;

function buildPortableManifest(input: {
  skill_name: string;
  description?: string;
  trigger_keywords?: string[];
  steps: any[];
  input_schema?: Record<string, any>;
  output_format?: any;
  source_url?: string | null;
}) {
  return {
    schema: "beebot.skill.v1",
    name: input.skill_name,
    description: input.description || `Custom skill: ${input.skill_name}`,
    triggers: input.trigger_keywords || [],
    input_schema: input.input_schema || {},
    steps: input.steps,
    output_format: input.output_format || null,
    source_url: input.source_url || null,
  };
}

// ═══ TEMPLATE VARIABLE RESOLVER ═══
function resolveTemplate(template: string, context: Record<string, any>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const parts = path.split(".");
    let val: any = context;
    for (const p of parts) {
      val = val?.[p];
      if (val === undefined) return `{{${path}}}`;
    }
    return String(val);
  });
}

function resolveParams(params: Record<string, any>, context: Record<string, any>): Record<string, any> {
  const resolved: Record<string, any> = {};
  for (const [key, val] of Object.entries(params)) {
    if (typeof val === "string") {
      resolved[key] = resolveTemplate(val, context);
    } else {
      resolved[key] = val;
    }
  }
  return resolved;
}

// ═══ GET SKILL DETAILS (On-Demand Read) ═══
export async function executeGetSkillDetails(supabase: any, userId: string, args: any) {
  const { skill_name } = args;
  if (!skill_name) return { error: "skill_name is required." };

  const { data, error } = await supabase
    .from("agent_custom_skills")
    .select("id, skill_name, description, trigger_keywords, execution_steps, input_schema, output_format, use_count, version")
    .eq("user_id", userId)
    .eq("skill_name", skill_name)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    return { error: `Skill "${skill_name}" not found.`, available: "Use list_my_skills to see your skills." };
  }

  return {
    success: true,
    skill_name: data.skill_name,
    description: data.description,
    steps: data.execution_steps,
    input_schema: data.input_schema,
    output_format: data.output_format,
    version: data.version,
    use_count: data.use_count,
  };
}

// ═══ CREATE SKILL ═══
export async function executeCreateSkill(supabase: any, userId: string, args: any) {
  const { skill_name, description, trigger_keywords, steps, input_schema, source_url } = args;

  if (!skill_name || !steps) {
    return { error: "skill_name and steps are required." };
  }

  if (!Array.isArray(steps) || steps.length === 0) {
    return { error: "steps must be a non-empty array of action objects." };
  }

  if (steps.length > MAX_STEPS) {
    return { error: `Maximum ${MAX_STEPS} steps per skill. Got ${steps.length}.` };
  }

  // Validate each step
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step.action) {
      return { error: `Step ${i + 1} missing 'action' field.` };
    }
    if (!ALLOWED_STEP_ACTIONS.includes(step.action)) {
      return { error: `Step ${i + 1}: action "${step.action}" is not allowed. Allowed: ${ALLOWED_STEP_ACTIONS.join(", ")}` };
    }
  }

  // Check user skill limit
  const { count } = await supabase
    .from("agent_custom_skills")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count || 0) >= MAX_SKILLS_PER_USER) {
    return { error: `Skill limit reached (${MAX_SKILLS_PER_USER}). Delete unused skills first.` };
  }

  // Check for duplicate name
  const { data: existing } = await supabase
    .from("agent_custom_skills")
    .select("id")
    .eq("user_id", userId)
    .eq("skill_name", skill_name)
    .maybeSingle();

  if (existing) {
    return { error: `Skill "${skill_name}" already exists. Use update_skill or choose a different name.` };
  }

  const { data, error } = await supabase
    .from("agent_custom_skills")
    .insert({
      user_id: userId,
      skill_name: skill_name.trim(),
      description: description || `Custom skill: ${skill_name}`,
      trigger_keywords: trigger_keywords || [],
      execution_steps: steps,
      input_schema: input_schema || {},
      standard_format: "beebot.skill.v1",
      source_url: source_url || null,
      portable_manifest: buildPortableManifest({ skill_name: skill_name.trim(), description, trigger_keywords, steps, input_schema, source_url }),
      created_by_agent: true,
    })
    .select("id, skill_name, description")
    .single();

  if (error) return { error: error.message };

  return {
    success: true,
    skill: data,
    message: `🛠️ Skill "${skill_name}" created with ${steps.length} steps! Use "execute_skill" to run it.`,
    steps_count: steps.length,
    actions_used: steps.map((s: any) => s.action),
  };
}

// ═══ LIST SKILLS ═══
export async function executeListSkills(supabase: any, userId: string, args: any) {
  const { include_inactive = false } = args || {};

  let query = supabase
    .from("agent_custom_skills")
    .select("id, skill_name, description, trigger_keywords, is_active, use_count, last_used_at, version, created_at")
    .eq("user_id", userId)
    .order("use_count", { ascending: false });

  if (!include_inactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query.limit(50);
  if (error) return { error: error.message };

  return {
    success: true,
    skills: data || [],
    total: data?.length || 0,
    message: data?.length
      ? `Found ${data.length} custom skill(s).`
      : "No custom skills yet. Use create_skill to build one!",
  };
}

// ═══ EXECUTE SKILL ═══
export async function executeExecuteSkill(
  supabase: any, userId: string, args: any,
  toolExecutor: (toolName: string, toolArgs: any) => Promise<any>
) {
  const { skill_name, input } = args;

  if (!skill_name) return { error: "skill_name is required." };

  const { data: skill, error } = await supabase
    .from("agent_custom_skills")
    .select("*")
    .eq("user_id", userId)
    .eq("skill_name", skill_name)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!skill) return { error: `Skill "${skill_name}" not found or inactive.` };

  const steps = skill.execution_steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    return { error: "Skill has no execution steps defined." };
  }

  // Build execution context
  const context: Record<string, any> = {
    input: input || {},
    results: {} as Record<string, any>,
  };

  const stepResults: any[] = [];
  const startTime = Date.now();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepKey = `step_${i + 1}`;

    try {
      // Handle special actions
      if (step.action === "format_response") {
        const template = step.params?.template || "";
        const formatted = resolveTemplate(template, context);
        context.results[stepKey] = { success: true, formatted };
        stepResults.push({ step: i + 1, action: "format_response", success: true });
        continue;
      }

      if (step.action === "set_variable") {
        const varName = step.params?.name;
        const varValue = resolveTemplate(String(step.params?.value || ""), context);
        if (varName) context[varName] = varValue;
        stepResults.push({ step: i + 1, action: "set_variable", success: true });
        continue;
      }

      if (step.action === "conditional") {
        const condition = resolveTemplate(String(step.params?.condition || ""), context);
        const shouldRun = condition && condition !== "false" && condition !== "" && condition !== "undefined";
        if (!shouldRun) {
          const skipCount = Math.max(0, Math.min(Number(step.params?.skip_steps) || 0, steps.length - i - 1));
          stepResults.push({ step: i + 1, action: "conditional", skipped: true, steps_skipped: skipCount });
          // Skip subsequent dependent steps
          for (let s = 0; s < skipCount; s++) {
            i++;
            const skippedKey = `step_${i + 1}`;
            context.results[skippedKey] = { skipped: true, reason: "conditional" };
            stepResults.push({ step: i + 1, action: steps[i]?.action, skipped: true, reason: "conditional_skip" });
          }
          continue;
        }
      }

      // ═══ SANDBOXED CODE EXECUTION ═══
      if (step.action === "run_code") {
        const code = resolveTemplate(String(step.params?.code || ""), context);
        const timeoutMs = step.params?.timeout_ms || CODE_TIMEOUT_MS;

        // Security: Validate code length
        if (code.length > MAX_CODE_LENGTH) {
          throw new Error(`Code exceeds max length (${MAX_CODE_LENGTH} chars)`);
        }

        // Security: Block dangerous patterns
        const blockedPatterns = [
          /\bfetch\s*\(/i,
          /\bDeno\b/i,
          /\beval\s*\(/i,
          /\bFunction\s*\(/i,
          /\bimport\s*\(/i,
          /\brequire\s*\(/i,
          /\bglobalThis\b/i,
          /\bwindow\b/i,
          /\bprocess\b/i,
        ];
        for (const pattern of blockedPatterns) {
          if (pattern.test(code)) {
            throw new Error(`Blocked: code contains forbidden pattern "${pattern}"`);
          }
        }

        // Execute in sandboxed Function with restricted scope
        try {
          const sandboxedFn = new Function(
            "input", "results", "JSON", "Math", "Date", "String", "Array", "Object", "Number", "Boolean", "console",
            `"use strict";
            const fetch = undefined;
            const Deno = undefined;
            const eval = undefined;
            const Function = undefined;
            const globalThis = undefined;
            const window = undefined;
            const process = undefined;
            const require = undefined;
            const import_ = undefined;
            ${code}`
          );

          // Execute with timeout
          const execPromise = new Promise((resolve, reject) => {
            try {
              const capturedLogs: string[] = [];
              const mockConsole = {
                log: (...args: any[]) => capturedLogs.push(args.map(a => JSON.stringify(a)).join(" ")),
                warn: (...args: any[]) => capturedLogs.push("[WARN] " + args.map(a => JSON.stringify(a)).join(" ")),
                error: (...args: any[]) => capturedLogs.push("[ERROR] " + args.map(a => JSON.stringify(a)).join(" ")),
              };
              const result = sandboxedFn(
                context.input,
                context.results,
                JSON, Math, Date, String, Array, Object, Number, Boolean,
                mockConsole
              );
              resolve({ result, logs: capturedLogs });
            } catch (e: any) {
              reject(e);
            }
          });

          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Code execution timeout (${timeoutMs}ms)`)), timeoutMs);
          });

          const { result: codeResult, logs } = await Promise.race([execPromise, timeoutPromise]) as any;

          // Serialize and limit output
          let serialized: any;
          try {
            serialized = JSON.parse(JSON.stringify(codeResult));
          } catch {
            serialized = String(codeResult);
          }
          const outputStr = JSON.stringify(serialized);
          if (outputStr.length > MAX_OUTPUT_LENGTH) {
            throw new Error(`Output exceeds max length (${MAX_OUTPUT_LENGTH} chars)`);
          }

          context.results[stepKey] = { success: true, data: serialized, logs };
          stepResults.push({ step: i + 1, action: "run_code", success: true, logs_count: logs?.length || 0 });

        } catch (codeErr: any) {
          throw new Error(`run_code failed: ${codeErr.message}`);
        }
        continue;
      }

      // Resolve params with template variables
      const resolvedParams = resolveParams(step.params || {}, context);

      // Execute via existing tool
      const result = await toolExecutor(step.action, resolvedParams);
      context.results[stepKey] = result;
      stepResults.push({
        step: i + 1,
        action: step.action,
        success: !result?.error,
        summary: result?.error || result?.message || result?.success ? "OK" : "Unknown",
      });

    } catch (e: any) {
      context.results[stepKey] = { error: e.message };
      stepResults.push({ step: i + 1, action: step.action, success: false, error: e.message });
      // Continue to next step — don't abort entire skill
    }
  }

  const duration = Date.now() - startTime;

  // Update usage stats
  Promise.resolve(
    supabase.from("agent_custom_skills")
      .update({
        use_count: (skill.use_count || 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", skill.id)
  ).catch(() => {});

  // Build final output
  const lastResult = context.results[`step_${steps.length}`];
  const finalOutput = lastResult?.formatted || lastResult?.message || lastResult?.merged_report || lastResult?.data || lastResult;

  return {
    success: true,
    skill_name: skill.skill_name,
    steps_executed: stepResults.length,
    step_results: stepResults,
    final_output: finalOutput,
    duration_ms: duration,
    message: `✅ Skill "${skill.skill_name}" executed (${stepResults.length} steps, ${duration}ms)`,
  };
}

// ═══ UPDATE SKILL ═══
export async function executeUpdateSkill(supabase: any, userId: string, args: any) {
  const { skill_name, new_name, description, trigger_keywords, steps, is_active } = args;

  if (!skill_name) return { error: "skill_name is required." };

  const { data: existing } = await supabase
    .from("agent_custom_skills")
    .select("id, version, description, trigger_keywords, execution_steps, input_schema, source_url")
    .eq("user_id", userId)
    .eq("skill_name", skill_name)
    .maybeSingle();

  if (!existing) return { error: `Skill "${skill_name}" not found.` };

  // Validate steps if provided
  if (steps) {
    if (!Array.isArray(steps) || steps.length === 0) {
      return { error: "steps must be a non-empty array." };
    }
    if (steps.length > MAX_STEPS) {
      return { error: `Maximum ${MAX_STEPS} steps. Got ${steps.length}.` };
    }
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].action || !ALLOWED_STEP_ACTIONS.includes(steps[i].action)) {
        return { error: `Step ${i + 1}: invalid action "${steps[i].action}".` };
      }
    }
  }

  const updates: any = { updated_at: new Date().toISOString() };
  if (new_name) updates.skill_name = new_name.trim();
  if (description !== undefined) updates.description = description;
  if (trigger_keywords) updates.trigger_keywords = trigger_keywords;
  if (steps) {
    updates.execution_steps = steps;
    updates.version = (existing.version || 1) + 1;
    updates.standard_format = "beebot.skill.v1";
  }
  if (steps || description !== undefined || trigger_keywords) {
    const manifestName = new_name?.trim() || skill_name;
    updates.portable_manifest = buildPortableManifest({
      skill_name: manifestName,
      description: description ?? existing.description,
      trigger_keywords: trigger_keywords || existing.trigger_keywords || [],
      steps: steps || existing.execution_steps || [],
      input_schema: existing.input_schema || {},
      source_url: existing.source_url || null,
    });
  }
  if (is_active !== undefined) updates.is_active = is_active;

  const { error } = await supabase
    .from("agent_custom_skills")
    .update(updates)
    .eq("id", existing.id);

  if (error) return { error: error.message };

  return {
    success: true,
    message: `✅ Skill "${skill_name}" updated.${steps ? ` Now v${updates.version} with ${steps.length} steps.` : ""}`,
    updated_fields: Object.keys(updates).filter(k => k !== "updated_at"),
  };
}

// ═══ DELETE SKILL ═══
export async function executeDeleteSkill(supabase: any, userId: string, args: any) {
  const { skill_name } = args;
  if (!skill_name) return { error: "skill_name is required." };

  const { data: existing } = await supabase
    .from("agent_custom_skills")
    .select("id, skill_name, use_count")
    .eq("user_id", userId)
    .eq("skill_name", skill_name)
    .maybeSingle();

  if (!existing) return { error: `Skill "${skill_name}" not found.` };

  const { error } = await supabase
    .from("agent_custom_skills")
    .delete()
    .eq("id", existing.id);

  if (error) return { error: error.message };

  return {
    success: true,
    message: `🗑️ Skill "${skill_name}" deleted. (Was used ${existing.use_count || 0} times)`,
  };
}
