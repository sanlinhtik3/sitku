// ═══ P1 UPGRADE: Dynamic Plan Revision ═══
// After each tool execution, evaluates whether remaining plan steps are still relevant.
// Allows the orchestrator to skip, modify, or add steps based on intermediate results.

import type { ExecutionPlan, PlanStep } from "./plan-generator.ts";

export interface RevisionDecision {
  action: 'keep' | 'skip' | 'modify' | 'add_step';
  stepId?: string;
  reason: string;
  newDescription?: string;
  newToolHint?: string;
  newStep?: Partial<PlanStep>;
}

/**
 * Evaluate whether remaining plan steps should be revised based on completed step results.
 * Uses rule-based heuristics (no LLM call) for speed.
 */
export function evaluatePlanRevision(
  plan: ExecutionPlan,
  completedStepId: string,
  toolName: string,
  toolResult: any,
  toolError: boolean,
): RevisionDecision[] {
  const decisions: RevisionDecision[] = [];
  const completedStep = plan.steps.find(s => s.id === completedStepId);
  if (!completedStep) return decisions;

  const remainingSteps = plan.steps.filter(s => s.status === 'pending');
  if (remainingSteps.length === 0) return decisions;

  // ═══ RULE 1: Tool failure → skip dependent steps or modify ═══
  if (toolError) {
    for (const step of remainingSteps) {
      if (step.depends_on.includes(completedStepId)) {
        // If a search failed, skip analysis steps that depend on it
        if (step.tool_hint?.includes('analyz') || step.tool_hint?.includes('compile')) {
          decisions.push({
            action: 'skip',
            stepId: step.id,
            reason: `Dependency "${completedStep.title}" failed — skipping analysis step`,
          });
        } else {
          // Try to modify to use alternative approach
          decisions.push({
            action: 'modify',
            stepId: step.id,
            reason: `Dependency "${completedStep.title}" failed — adjusting approach`,
            newDescription: `${step.description} (NOTE: Prior step "${completedStep.title}" failed. Use alternative approach or available data.)`,
          });
        }
      }
    }
  }

  // ═══ RULE 2: Search returned comprehensive results → skip redundant searches ═══
  if (!toolError && (toolName === 'search_web' || toolName === 'browser_search')) {
    const resultCount = toolResult?.results?.length || toolResult?.count || 0;
    const hasRichData = resultCount >= 5 || (typeof toolResult === 'object' && JSON.stringify(toolResult).length > 3000);

    if (hasRichData) {
      for (const step of remainingSteps) {
        // Skip redundant search steps
        if ((step.tool_hint === 'search_web' || step.tool_hint === 'browser_search') &&
            !step.depends_on.includes(completedStepId)) {
          const stepQuery = step.description.toLowerCase();
          const completedQuery = completedStep.description.toLowerCase();
          // Check for query overlap (simple keyword matching)
          const overlapWords = completedQuery.split(/\s+/).filter(w => w.length > 3 && stepQuery.includes(w));
          if (overlapWords.length >= 2) {
            decisions.push({
              action: 'skip',
              stepId: step.id,
              reason: `Previous search returned rich data covering "${step.title}" — skipping redundant search`,
            });
          }
        }
      }
    }
  }

  // ═══ RULE 3: Data-sparse result → add a retry/deepening step ═══
  if (!toolError && toolResult?._dataSparse) {
    const hasDeepSearch = remainingSteps.some(s => 
      s.tool_hint === 'browser_scrape' || s.description.includes('deep') || s.description.includes('detail')
    );
    if (!hasDeepSearch) {
      const newStepId = `step_added_${Date.now().toString(36)}`;
      decisions.push({
        action: 'add_step',
        reason: `Search returned sparse data — adding deeper investigation step`,
        newStep: {
          id: newStepId,
          title: `Deep-dive: ${completedStep.title}`,
          description: `The initial search for "${completedStep.title}" returned sparse results. Try alternative search terms or scrape specific pages for more detail.`,
          tool_hint: 'browser_scrape',
          depends_on: [completedStepId],
          status: 'pending',
        },
      });
    }
  }

  // ═══ RULE 4: Memory recall was sufficient → skip search steps ═══
  if (!toolError && (toolName === 'recall_episodic_memory' || toolName === 'search_knowledge_base')) {
    const hasContent = toolResult?.content || toolResult?.results?.length > 0 || toolResult?.memories?.length > 0;
    if (hasContent) {
      for (const step of remainingSteps) {
        if (step.tool_hint === 'search_web' && !step.description.toLowerCase().includes('latest') && !step.description.toLowerCase().includes('current')) {
          decisions.push({
            action: 'skip',
            stepId: step.id,
            reason: `Memory/knowledge base already has sufficient data for "${step.title}"`,
          });
        }
      }
    }
  }

  // ═══ RULE 5: Image generation done → skip duplicate image steps ═══
  if (!toolError && toolName === 'generate_image' && toolResult?.success) {
    for (const step of remainingSteps) {
      if (step.tool_hint === 'generate_image') {
        decisions.push({
          action: 'skip',
          stepId: step.id,
          reason: 'Image already generated — skipping duplicate',
        });
      }
    }
  }

  return decisions;
}

/**
 * Apply revision decisions to the execution plan.
 */
export function applyPlanRevisions(
  plan: ExecutionPlan,
  decisions: RevisionDecision[],
): { revisedCount: number; addedCount: number; skippedCount: number } {
  let revisedCount = 0;
  let addedCount = 0;
  let skippedCount = 0;

  for (const decision of decisions) {
    switch (decision.action) {
      case 'skip': {
        const step = plan.steps.find(s => s.id === decision.stepId);
        if (step && step.status === 'pending') {
          step.status = 'skipped';
          step.result_summary = `Skipped: ${decision.reason}`;
          skippedCount++;
          console.log(`[PlanRevision] SKIPPED ${step.id}: ${decision.reason}`);
        }
        break;
      }
      case 'modify': {
        const step = plan.steps.find(s => s.id === decision.stepId);
        if (step && step.status === 'pending') {
          if (decision.newDescription) step.description = decision.newDescription;
          if (decision.newToolHint) step.tool_hint = decision.newToolHint;
          revisedCount++;
          console.log(`[PlanRevision] MODIFIED ${step.id}: ${decision.reason}`);
        }
        break;
      }
      case 'add_step': {
        if (decision.newStep) {
          plan.steps.push({
            id: decision.newStep.id || `step_${plan.steps.length + 1}`,
            title: decision.newStep.title || 'Additional step',
            description: decision.newStep.description || '',
            tool_hint: decision.newStep.tool_hint,
            depends_on: decision.newStep.depends_on || [],
            status: 'pending',
          });
          addedCount++;
          console.log(`[PlanRevision] ADDED step: ${decision.newStep.title} — ${decision.reason}`);
        }
        break;
      }
    }
  }

  if (revisedCount + addedCount + skippedCount > 0) {
    console.log(`[PlanRevision] Summary: ${skippedCount} skipped, ${revisedCount} modified, ${addedCount} added`);
  }

  return { revisedCount, addedCount, skippedCount };
}
