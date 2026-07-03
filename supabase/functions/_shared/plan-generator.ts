// ═══ INITIATIVE 1: Persistent Multi-Step Plan Generator ═══
// Generates explicit execution plans for non-simple queries.
// The agentic loop executes the plan step-by-step, updating status in real-time.

import type { MemoryQueryResult } from "./active-memory-query.ts";

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  tool_hint?: string;       // suggested tool name
  depends_on: string[];     // step IDs this step depends on
  status: 'pending' | 'active' | 'done' | 'error' | 'skipped';
  result_summary?: string;  // filled after execution
}

export interface ExecutionPlan {
  steps: PlanStep[];
  goal: string;
  created_at: string;
  memory_strategy?: string; // from MemoryQueryResult
}

// System prompt for plan generation (focused, minimal — ~200 tokens)
const PLAN_SYSTEM_PROMPT = `You are a task planner. Given a user request, output ONLY a JSON execution plan.

Rules:
- Output valid JSON only, no markdown, no explanation
- 2-5 steps maximum
- Each step has: id, title, description, tool_hint (optional tool name), depends_on (array of step IDs)
- Steps should be ordered logically
- Use tool_hint from: search_web, browser_scrape, generate_ai_content, manage_flowstate, manage_workspace_task, search_knowledge_base, generate_image, recall_episodic_memory
- If memory context suggests the answer is known, first step should be "Recall from memory"

Output format:
{"goal":"...","steps":[{"id":"step_1","title":"...","description":"...","tool_hint":"...","depends_on":[]}]}`;

/**
 * Generate an execution plan for a user request using a lightweight LLM call.
 * Returns null if plan generation fails (caller should fall back to reactive mode).
 */
export async function generateExecutionPlan(
  apiEndpoint: string,
  apiKey: string,
  model: string,
  userMessage: string,
  memoryResult: MemoryQueryResult | null,
  observerResult: any,
): Promise<ExecutionPlan | null> {
  const t_start = Date.now();

  // Build context for plan generation
  let planContext = `User request: "${userMessage}"`;

  if (memoryResult) {
    planContext += `\n\nMemory context (confidence: ${memoryResult.confidence.toFixed(2)}, strategy: ${memoryResult.suggested_strategy}):`;
    if (memoryResult.relevant_facts.length > 0) {
      planContext += `\nKnown facts: ${memoryResult.relevant_facts.slice(0, 3).join('; ')}`;
    }
    if (memoryResult.relevant_memories.length > 0) {
      planContext += `\nRelevant memories: ${memoryResult.relevant_memories.slice(0, 2).join('; ')}`;
    }
  }

  if (observerResult) {
    planContext += `\nIntent: ${observerResult.primary_action || 'general'}`;
    planContext += `\nComplexity: ${observerResult.complexity || 'moderate'}`;
    if (observerResult.modules?.length) {
      planContext += `\nModules: ${observerResult.modules.join(', ')}`;
    }
  }

  try {
    // Use flash-lite for plan generation (fast + cheap)
    const isORModel = model.includes('/') && !model.startsWith('google/');
    const planModel = isORModel ? model :
                      model.includes('pro') ? model.replace('pro', 'flash-lite') : 
                      model.includes('flash') && !model.includes('lite') ? model + '-lite' :
                      model;

    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: planModel,
        messages: [
          { role: "system", content: PLAN_SYSTEM_PROMPT },
          { role: "user", content: planContext },
        ],
        max_tokens: 1024,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(8_000), // 8s timeout for plan generation
    });

    if (!response.ok) {
      console.warn(`[PlanGen] LLM returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    // Parse JSON (handle potential markdown code blocks)
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    if (!parsed.goal || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      console.warn(`[PlanGen] Invalid plan structure`);
      return null;
    }

    // Normalize and validate steps
    const plan: ExecutionPlan = {
      goal: parsed.goal,
      created_at: new Date().toISOString(),
      memory_strategy: memoryResult?.suggested_strategy,
      steps: parsed.steps.slice(0, 5).map((step: any, i: number) => ({
        id: step.id || `step_${i + 1}`,
        title: step.title || `Step ${i + 1}`,
        description: step.description || '',
        tool_hint: step.tool_hint || undefined,
        depends_on: Array.isArray(step.depends_on) ? step.depends_on : [],
        status: 'pending' as const,
      })),
    };

    console.log(`[PlanGen] ✅ Generated plan with ${plan.steps.length} steps in ${Date.now() - t_start}ms (goal: "${plan.goal.slice(0, 60)}")`);
    return plan;
  } catch (err: any) {
    console.warn(`[PlanGen] Failed: ${err.message}`);
    return null;
  }
}

/**
 * Update a plan step's status and optionally set a result summary.
 */
export function updatePlanStep(
  plan: ExecutionPlan,
  stepId: string,
  status: PlanStep['status'],
  resultSummary?: string,
): void {
  const step = plan.steps.find(s => s.id === stepId);
  if (step) {
    step.status = status;
    if (resultSummary) step.result_summary = resultSummary;
  }
}

/**
 * Get the next pending step from the plan (respects dependencies).
 */
export function getNextPlanStep(plan: ExecutionPlan): PlanStep | null {
  for (const step of plan.steps) {
    if (step.status !== 'pending') continue;
    // Check if all dependencies are done
    const depsSatisfied = step.depends_on.every(depId => {
      const dep = plan.steps.find(s => s.id === depId);
      return dep && (dep.status === 'done' || dep.status === 'skipped');
    });
    if (depsSatisfied) return step;
  }
  return null;
}

/**
 * Build a plan injection message for the LLM.
 */
export function buildPlanInjection(plan: ExecutionPlan, currentStep: PlanStep | null): string {
  const stepsSummary = plan.steps.map(s => {
    const statusIcon = s.status === 'done' ? '✅' : s.status === 'active' ? '🔄' : s.status === 'error' ? '❌' : s.status === 'skipped' ? '⏭️' : '⏳';
    const result = s.result_summary ? ` → ${s.result_summary}` : '';
    return `${statusIcon} ${s.id}: ${s.title}${result}`;
  }).join('\n');

  let injection = `[EXECUTION PLAN] Goal: ${plan.goal}\n${stepsSummary}`;

  if (currentStep) {
    injection += `\n\n[CURRENT STEP] Execute "${currentStep.title}": ${currentStep.description}`;
    if (currentStep.tool_hint) {
      injection += `\nSuggested tool: ${currentStep.tool_hint}`;
    }
  }

  return injection;
}

/**
 * Convert plan to SSE task_plan format for frontend visualization.
 */
export function planToSSE(plan: ExecutionPlan): any[] {
  const getEmoji = (toolHint?: string) => {
    if (!toolHint) return '⚙️';
    if (toolHint.includes('search')) return '🔍';
    if (toolHint.includes('browser')) return '🌐';
    if (toolHint.includes('flowstate')) return '💰';
    if (toolHint.includes('workspace')) return '📋';
    if (toolHint.includes('generat')) return '✍️';
    if (toolHint.includes('memory') || toolHint.includes('recall')) return '🧠';
    if (toolHint.includes('image')) return '🎨';
    return '⚙️';
  };

  const statusMap: Record<string, string> = {
    'pending': 'pending',
    'active': 'running',
    'done': 'done',
    'error': 'error',
    'skipped': 'done',
  };

  return [
    ...plan.steps.map(s => ({
      id: s.id,
      tool: s.tool_hint || 'general',
      label: s.title,
      emoji: getEmoji(s.tool_hint),
      status: statusMap[s.status] || 'pending',
      context: s.result_summary,
    })),
    {
      id: 'plan_respond',
      tool: 'respond',
      label: 'Composing response',
      emoji: '✅',
      status: plan.steps.every(s => s.status === 'done' || s.status === 'skipped' || s.status === 'error') ? 'running' : 'pending',
    },
  ];
}
