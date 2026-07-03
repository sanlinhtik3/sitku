// ═══════════════════════════════════════════════════════════════════════════
// PGE Pipeline — Phase 2.6 of docs/AGENTIC_AUDIT.md
//
// Planner → Generator → Evaluator pattern per Anthropic April-2026 reference
// architecture. Triggered ONLY when:
//   • agentSettings.pge_pipeline_enabled === true, AND
//   • complexityTier ∈ {complex, deep, ultra-deep} (or threshold lowered by user)
//
// Pipeline shape:
//   1. Planner produces a JSON plan (3-7 steps + success criteria)
//   2. Plan is injected as a system-prompt addendum for the Generator (the
//      existing runAgenticLoop — NOT replaced, only augmented)
//   3. Evaluator scores the Generator's final output 0-1
//      - score >= 0.7 → accept, attach evaluator artifact to response metadata
//      - score < 0.7  → ONE revise round, then accept with quality_warning
//
// All artifacts written to agent_run_artifacts.
// ═══════════════════════════════════════════════════════════════════════════

import { invokePlanner, invokeEvaluator } from "./subagent-invoker.ts";

export interface PgePreCheckOpts {
  agentSettings: any;
  complexityTier: string | undefined;
}

const TIER_ORDER: Record<string, number> = {
  "greeting": 0,
  "simple": 1,
  "turbo": 2,
  "moderate": 3,
  "complex": 4,
  "deep": 5,
  "ultra-deep": 6,
};

/** Cheap gate — call from runAgenticLoop pre-entry to decide if PGE is in play. */
export function shouldUsePGE(opts: PgePreCheckOpts): boolean {
  if (!opts.agentSettings?.pge_pipeline_enabled) return false;
  const minTier = opts.agentSettings?.pge_min_complexity ?? "complex";
  const current = opts.complexityTier ?? "moderate";
  return (TIER_ORDER[current] ?? 0) >= (TIER_ORDER[minTier] ?? 4);
}

export interface PgePlannerOpts {
  serviceClient: any;
  userId: string;
  sessionId?: string | null;
  messageId?: string | null;
  runId: string;
  userMessage: string;
  providerType: "anthropic" | "google" | "openrouter" | "xai";
  apiKey: string;
  apiEndpoint: string;
  agentSettings: any;
}

export interface PgePlanArtifact {
  goal: string;
  complexity: string;
  steps: Array<{ id: number; action: string; why: string; params_hint?: any }>;
  success_criteria: string[];
  expected_artifacts: string[];
}

export async function runPlannerStage(opts: PgePlannerOpts): Promise<PgePlanArtifact | null> {
  const result = await invokePlanner({ ...opts, userPrompt: opts.userMessage });
  if (!result.ok || !result.artifact) {
    console.warn(`[pge] planner failed: ${result.error ?? "no artifact"}`);
    return null;
  }
  const plan = result.artifact as PgePlanArtifact;
  // Sanity check shape
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    console.warn(`[pge] planner returned malformed plan`);
    return null;
  }
  console.log(`[pge] planner produced ${plan.steps.length}-step plan (${result.durationMs}ms)`);
  return plan;
}

/**
 * Build a system-prompt addendum from a plan. The Generator (main agentic
 * loop) sees this prepended to its system context so it follows the plan.
 */
export function planToSystemAddendum(plan: PgePlanArtifact): string {
  const steps = plan.steps.map((s) => `  ${s.id}. ${s.action} — ${s.why}`).join("\n");
  const criteria = plan.success_criteria.map((c) => `  - ${c}`).join("\n");
  return `\n\n[PGE-PLAN]\nGoal: ${plan.goal}\nPlanned steps:\n${steps}\nSuccess criteria:\n${criteria}\n[/PGE-PLAN]\n`;
}

export interface PgeEvaluatorOpts extends Omit<PgePlannerOpts, "userMessage"> {
  userMessage: string;
  plan: PgePlanArtifact;
  generatorOutput: string;
  generatorToolSummary?: string;
  reviseRound?: number;
}

export interface PgeEvalArtifact {
  score: number;
  matches_goal: boolean;
  issues: string[];
  suggestions: string[];
  recommend: "accept" | "revise";
}

export async function runEvaluatorStage(opts: PgeEvaluatorOpts): Promise<PgeEvalArtifact | null> {
  const userPrompt =
    `## User request\n${opts.userMessage}\n\n` +
    `## Planner's plan\n${JSON.stringify(opts.plan, null, 2)}\n\n` +
    `## Generator's output\n${opts.generatorOutput.slice(0, 6000)}\n\n` +
    (opts.generatorToolSummary ? `## Tool calls used\n${opts.generatorToolSummary.slice(0, 2000)}\n` : "");

  const result = await invokeEvaluator({
    serviceClient: opts.serviceClient,
    userId: opts.userId,
    sessionId: opts.sessionId,
    messageId: opts.messageId,
    runId: opts.runId,
    reviseRound: opts.reviseRound ?? 0,
    userPrompt,
    providerType: opts.providerType,
    apiKey: opts.apiKey,
    apiEndpoint: opts.apiEndpoint,
    agentSettings: opts.agentSettings,
  });

  if (!result.ok || !result.artifact) {
    console.warn(`[pge] evaluator failed: ${result.error ?? "no artifact"}`);
    return null;
  }

  const evalArt = result.artifact as PgeEvalArtifact;
  if (typeof evalArt.score !== "number") {
    console.warn(`[pge] evaluator returned malformed result`);
    return null;
  }
  console.log(`[pge] evaluator score=${evalArt.score.toFixed(2)} recommend=${evalArt.recommend} (${result.durationMs}ms)`);
  return evalArt;
}

/** Hard-capped revise loop helper. Returns true if a single revise should be triggered. */
export function shouldRevise(evalArt: PgeEvalArtifact | null, currentReviseRound: number): boolean {
  if (!evalArt) return false;
  if (currentReviseRound >= 1) return false;       // hard cap
  return evalArt.score < 0.7 && evalArt.recommend === "revise";
}

/** Build a "revise this output" instruction the Generator receives. */
export function buildReviseInstruction(evalArt: PgeEvalArtifact): string {
  const issues = evalArt.issues.map((i) => `  - ${i}`).join("\n");
  const fixes = evalArt.suggestions.map((s) => `  - ${s}`).join("\n");
  return `\n\n[EVALUATOR-FEEDBACK]\nYour previous output scored ${evalArt.score.toFixed(2)}/1.0 and was rejected by an independent evaluator.\n\nIssues to fix:\n${issues}\n\nSuggested fixes:\n${fixes}\n\nProduce a revised final answer addressing every issue. Do not apologize — just deliver the improved version.\n[/EVALUATOR-FEEDBACK]\n`;
}
