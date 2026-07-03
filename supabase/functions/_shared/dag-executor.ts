// ═══ Phase 4: DAG Executor Engine ═══
// Topological sort + parallel execution with dependency resolution.
// Steps declare `depends_on` arrays; executor runs independent steps concurrently.

export interface DAGStep {
  id: string;
  step_index: number;
  title: string;
  description: string;
  tool?: string;
  agent_role: string;
  depends_on: string[];  // step IDs this step depends on
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  result?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
  retries: number;
  metadata: Record<string, unknown>;
}

export interface DAGExecutionConfig {
  maxParallelism: number;      // max concurrent steps (default 3)
  stepTimeoutMs: number;       // per-step timeout (default 45s)
  maxRetries: number;          // per-step retries (default 1)
  skipOnDependencyFailure: boolean;  // skip step if any dep failed
}

export const DEFAULT_DAG_CONFIG: DAGExecutionConfig = {
  maxParallelism: 3,
  stepTimeoutMs: 45_000,
  maxRetries: 2,
  skipOnDependencyFailure: true,
};

// ═══ Topological Sort ═══
// Returns layers of step IDs that can execute in parallel
export function topologicalSort(steps: DAGStep[]): string[][] {
  const stepMap = new Map(steps.map(s => [s.id, s]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>(); // dependency → dependents

  // Initialize
  for (const step of steps) {
    inDegree.set(step.id, 0);
    adjacency.set(step.id, []);
  }

  // Build graph
  for (const step of steps) {
    for (const dep of step.depends_on) {
      if (stepMap.has(dep)) {
        adjacency.get(dep)!.push(step.id);
        inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
      }
    }
  }

  // BFS — Kahn's algorithm, layer by layer
  const layers: string[][] = [];
  let queue = steps.filter(s => inDegree.get(s.id) === 0).map(s => s.id);

  while (queue.length > 0) {
    layers.push([...queue]);
    const nextQueue: string[] = [];

    for (const nodeId of queue) {
      for (const dependent of adjacency.get(nodeId) || []) {
        const newDeg = (inDegree.get(dependent) || 1) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) {
          nextQueue.push(dependent);
        }
      }
    }

    queue = nextQueue;
  }

  // Detect cycles — any remaining non-zero in-degree
  const scheduled = new Set(layers.flat());
  const unscheduled = steps.filter(s => !scheduled.has(s.id));
  if (unscheduled.length > 0) {
    console.warn(`[DAG] Cycle detected in ${unscheduled.length} steps — forcing sequential`);
    layers.push(unscheduled.map(s => s.id));
  }

  return layers;
}

// ═══ Check if a step's dependencies are all satisfied ═══
export function areDependenciesMet(
  step: DAGStep,
  completedSteps: Map<string, DAGStep>,
  config: DAGExecutionConfig,
): { ready: boolean; skip: boolean; reason?: string } {
  if (step.depends_on.length === 0) return { ready: true, skip: false };

  for (const depId of step.depends_on) {
    const dep = completedSteps.get(depId);
    if (!dep) return { ready: false, skip: false };

    if (dep.status === 'error' && config.skipOnDependencyFailure) {
      return { ready: true, skip: true, reason: `Dependency "${dep.title}" failed` };
    }
    if (dep.status === 'skipped') {
      return { ready: true, skip: true, reason: `Dependency "${dep.title}" was skipped` };
    }
    if (dep.status !== 'done') return { ready: false, skip: false };
  }

  return { ready: true, skip: false };
}

// ═══ Gather results from dependencies for context injection ═══
export function gatherDependencyResults(
  step: DAGStep,
  completedSteps: Map<string, DAGStep>,
): string {
  if (step.depends_on.length === 0) return '';

  const results: string[] = [];
  for (const depId of step.depends_on) {
    const dep = completedSteps.get(depId);
    if (dep?.result) {
      results.push(`[${dep.title}]:\n${dep.result.slice(0, 12000)}`);
    }
  }

  if (results.length === 0) return '';

  const combined = results.join('\n---\n');
  const capped = combined.length > 30000 ? combined.slice(0, 30000) + '\n[...dependency context truncated]' : combined;
  return `\nDEPENDENCY RESULTS (from prior steps):\n${capped}`;
}

// ═══ Execute a single DAG layer (parallel within layer, respecting maxParallelism) ═══
export async function executeDAGLayer(
  layerStepIds: string[],
  steps: Map<string, DAGStep>,
  completedSteps: Map<string, DAGStep>,
  config: DAGExecutionConfig,
  executeFn: (step: DAGStep, depContext: string) => Promise<{ result: string } | { error: string }>,
  onStepUpdate: (step: DAGStep) => Promise<void>,
): Promise<void> {
  // Chunk by maxParallelism
  const chunks: string[][] = [];
  for (let i = 0; i < layerStepIds.length; i += config.maxParallelism) {
    chunks.push(layerStepIds.slice(i, i + config.maxParallelism));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (stepId) => {
      const step = steps.get(stepId);
      if (!step || step.status === 'done' || step.status === 'skipped') return;

      // Check dependencies
      const depCheck = areDependenciesMet(step, completedSteps, config);
      if (!depCheck.ready) return; // shouldn't happen in topo-sorted layers

      if (depCheck.skip) {
        step.status = 'skipped';
        step.error = depCheck.reason;
        step.completed_at = new Date().toISOString();
        completedSteps.set(step.id, step);
        await onStepUpdate(step);
        return;
      }

      // Execute with retry
      step.status = 'running';
      step.started_at = new Date().toISOString();
      await onStepUpdate(step);

      const depContext = gatherDependencyResults(step, completedSteps);
      let lastError: string | null = null;

      for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        // Exponential backoff before retries (skip on first attempt)
        if (attempt > 0) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.log(`[DAG] Step "${step.id}" backing off ${backoffMs}ms before retry ${attempt + 1}...`);
          await new Promise(r => setTimeout(r, backoffMs));
        }
        try {
          const result = await executeFn(step, depContext);
          if ('error' in result) {
            lastError = result.error;
            step.retries = attempt + 1;
            if (attempt < config.maxRetries) {
              console.warn(`[DAG] Step "${step.id}" attempt ${attempt + 1} failed: ${result.error}. Retrying...`);
              continue;
            }
          } else {
            step.status = 'done';
            step.result = result.result;
            step.completed_at = new Date().toISOString();
            completedSteps.set(step.id, step);
            await onStepUpdate(step);
            return;
          }
        } catch (err: any) {
          lastError = err.message || String(err);
          step.retries = attempt + 1;
          if (attempt < config.maxRetries) {
            console.warn(`[DAG] Step "${step.id}" threw on attempt ${attempt + 1}: ${lastError}. Retrying...`);
            continue;
          }
        }
      }

      // All attempts failed
      step.status = 'error';
      step.error = lastError || 'Unknown error';
      step.completed_at = new Date().toISOString();
      completedSteps.set(step.id, step);
      await onStepUpdate(step);
    });

    await Promise.allSettled(promises);
  }
}

// ═══ Full DAG Execution with Mid-Execution Replanning ═══
// After each layer, if any steps failed/errored, the optional replanFn callback
// can inject new steps or modify pending ones based on what was learned.
export async function executeDAG(
  steps: DAGStep[],
  config: DAGExecutionConfig,
  executeFn: (step: DAGStep, depContext: string) => Promise<{ result: string } | { error: string }>,
  onStepUpdate: (step: DAGStep) => Promise<void>,
  onLayerComplete?: (layerIndex: number, totalLayers: number) => Promise<void>,
  replanFn?: (completedSteps: Map<string, DAGStep>, remainingStepIds: string[]) => Promise<DAGStep[] | null>,
): Promise<{ completed: Map<string, DAGStep>; successCount: number; totalCount: number }> {
  const stepMap = new Map(steps.map(s => [s.id, s]));
  const completedSteps = new Map<string, DAGStep>();
  let layers = topologicalSort(steps);

  console.log(`[DAG] Execution plan: ${layers.length} layers, ${steps.length} total steps`);
  for (let i = 0; i < layers.length; i++) {
    console.log(`[DAG]   Layer ${i}: [${layers[i].join(', ')}] (${layers[i].length} steps parallel)`);
  }

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    console.log(`[DAG] ═══ Executing Layer ${layerIdx + 1}/${layers.length}: ${layer.length} steps ═══`);

    await executeDAGLayer(layer, stepMap, completedSteps, config, executeFn, onStepUpdate);

    if (onLayerComplete) {
      await onLayerComplete(layerIdx, layers.length);
    }

    // ═══ MID-EXECUTION REPLANNING ═══
    // After each layer, check if replanning is needed (e.g., steps failed, data changed approach)
    if (replanFn) {
      const remainingIds = layers.slice(layerIdx + 1).flat().filter(id => {
        const s = stepMap.get(id);
        return s && s.status === 'pending';
      });

      if (remainingIds.length > 0) {
        try {
          const newSteps = await replanFn(completedSteps, remainingIds);
          if (newSteps && newSteps.length > 0) {
            console.log(`[DAG:Replan] Injecting ${newSteps.length} revised steps after layer ${layerIdx + 1}`);
            // Replace pending steps with new ones
            for (const ns of newSteps) {
              stepMap.set(ns.id, ns);
            }
            // Re-sort remaining steps (including new ones)
            const allSteps = [...stepMap.values()].filter(s => s.status === 'pending');
            const newLayers = topologicalSort(allSteps);
            // Replace remaining layers with re-sorted ones
            layers = [...layers.slice(0, layerIdx + 1), ...newLayers];
            console.log(`[DAG:Replan] New execution plan: ${newLayers.length} remaining layers`);
          }
        } catch (e: any) {
          console.warn(`[DAG:Replan] Replan failed, continuing with original plan:`, e.message);
        }
      }
    }
  }

  let successCount = 0;
  for (const step of completedSteps.values()) {
    if (step.status === 'done') successCount++;
  }

  return { completed: completedSteps, successCount, totalCount: steps.length };
}

// ═══ Utility: Generate DAG plan prompt (instructs AI to output depends_on) ═══
export const DAG_PLAN_SYSTEM_PROMPT = `You are an autonomous AI orchestrator that decomposes complex tasks into a DAG (Directed Acyclic Graph) of executable steps.

CRITICAL RULES:
1. Each step can declare "depends_on" — an array of step IDs it requires before executing.
2. Steps WITHOUT dependencies can run in PARALLEL.
3. Maximize parallelism: independent research/search tasks should NOT depend on each other.
4. Only add a dependency when the step genuinely NEEDS the output of another step.
5. Assign an "agent_role" to each step: "researcher", "analyst", "writer", "coder", "strategist", "editor", "community", or "general".
6. For Telegram channel tasks: include "strategist" FIRST (parallel with research) and "community" LAST (after writer). Include "editor" between analyst and writer for fact-checking.
7. NEVER create steps with tool "broadcast_message" or "post_to_telegram" — delivery is handled automatically.

Output ONLY valid JSON array. Each step:
- "id": unique string (step_1, step_2, ...)
- "title": short descriptive title
- "description": what this step accomplishes
- "tool": primary tool type (search_web, analyze_data, generate_content, deep_research, compile_report, code_generate)
- "agent_role": specialist role for this step
- "depends_on": array of step IDs this step requires (empty array if independent)

EXAMPLE for "Research Bitcoin price and write a summary":
[
  {"id":"step_1","title":"Define content strategy","tool":"analyze_data","agent_role":"strategist","depends_on":[],"description":"Define angle and value proposition"},
  {"id":"step_2","title":"Search current price","tool":"search_web","agent_role":"researcher","depends_on":[],"description":"Find latest BTC price"},
  {"id":"step_3","title":"Search market analysis","tool":"search_web","agent_role":"researcher","depends_on":[],"description":"Find expert analysis"},
  {"id":"step_4","title":"Analyze findings","tool":"analyze_data","agent_role":"analyst","depends_on":["step_2","step_3"],"description":"Compare sources"},
  {"id":"step_5","title":"Fact-check data","tool":"analyze_data","agent_role":"editor","depends_on":["step_4"],"description":"Verify accuracy"},
  {"id":"step_6","title":"Write summary","tool":"compile_report","agent_role":"writer","depends_on":["step_1","step_5"],"description":"Create editorial content"},
  {"id":"step_7","title":"Optimize engagement","tool":"generate_content","agent_role":"community","depends_on":["step_6"],"description":"Add hook and CTA"}
]
Notice: step_1, step_2, step_3 run in PARALLEL. step_4 waits for research. step_5 fact-checks. step_6 writes. step_7 adds engagement.`;
