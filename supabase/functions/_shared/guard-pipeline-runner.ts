// ═══ Guard Pipeline Runner Module — Extracted from agentic-loop.ts ═══
// Parallel Phase 1 guards, sequential Phase 2 guards, terse response guard, interleaved verification.
// P1 Enhancement: Tool Result Verifier for execution-based feedback loop.

import {
  type GuardResult, type GuardName,
  checkDeepResearchGuard, checkAntiGhostGuard, checkHallucinationGuard,
  checkNumericGrounding, checkToolFailureFabrication, buildReflectionPrompt, runQualityGate,
  checkToolPromiseMismatch, checkPersistenceProtocol, checkSourceExhaustion,
  checkConfirmationLoopBreak, getActiveGuards, inlineQualityScore,
  constitutionalSelfCheck, checkToolErrorReplan,
} from "./guard-protocols.ts";
import { verifyToolResults, buildVerificationNudge } from "./tool-result-verifier.ts";
import { emitThinking, trackAIUsage } from "./streaming-engine.ts";

export interface GuardPipelineContext {
  isSimpleMessage: boolean;
  isDeepQuery: boolean;
  isTurboTier: boolean;
  observerResult: any;
  sanitizedMessage: string;
  agentSettings: any;
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
  step: number;
  MAX_AGENT_STEPS: number;
  safeEnqueue: (data: Uint8Array) => boolean;
  // For post-tool guards
  supabase: any;
  userId: string;
  TOOLS: any[];
  complexityTier?: string;
}

export interface MutableGuardState {
  deepResearchRetryAttempted: boolean;
  promiseRetryCount: number;
  hallucinationGuardCount: number;
  postToolGroundingChecked: boolean;
  noResultsRetryAttempted: boolean;
  snippetEscalationAttempted: boolean;
  qualityRequeueAttempted: boolean;
  reflectionAttempted: boolean;
  constitutionalGuardTriggered: boolean;
  forceReplyAttempted: boolean;
  toolReplanAttempts: Map<string, number>;
  antiGhostTriggered: boolean;
  lastTriggeredGuard?: string;
  passedGuards: Set<string>; // Track guards that passed — skip on retry
}

export interface GuardPipelineResult {
  shouldContinue: boolean;
  isGuardRetry: boolean;
  forceToolChoice: boolean;
  shouldBreak: boolean;
  maxStepsOverride?: number;
  updatedToolReplanAttempts?: Map<string, number>;
}

/**
 * Apply a guard result: push messages, emit SSE events.
 */
export function applyGuardResult(
  result: GuardResult,
  currentMessages: any[],
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  step: number,
  MAX_AGENT_STEPS: number,
) {
  if (result.logMessage) console.warn(result.logMessage);
  if (result.assistantEcho) currentMessages.push({ role: "assistant", content: result.assistantEcho });
  if (result.nudgeMessage) currentMessages.push({ role: "user", content: result.nudgeMessage });
  if (result.thinkingLabel) emitThinking(controller, encoder, result.thinkingLabel, step, MAX_AGENT_STEPS);
  if (result.sseEvent) {
    try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(result.sseEvent)}\n\n`)); } catch { /* stream closed */ }
  }
}

/**
 * Run terse response guard: if LLM produced a lazy short summary after tool execution, force elaboration.
 * Returns true if guard triggered (should continue loop).
 */
export function runTerseResponseGuard(
  stepContent: string,
  allToolResults: { name: string; result: any; error?: string }[],
  guardState: MutableGuardState,
  currentMessages: any[],
  agentSettings: any,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  step: number,
  MAX_AGENT_STEPS: number,
): boolean {
  if (allToolResults.length > 0 && stepContent.trim().length < 100 && !guardState.forceReplyAttempted) {
    const hasWriteResult = allToolResults.some(tr => tr.result?.success || tr.result?.new_balance !== undefined);
    if (hasWriteResult) {
      guardState.forceReplyAttempted = true;
      const frBotName = agentSettings?.bot_name || "BeeBot";
      const frBotEmoji = agentSettings?.bot_emoji || "🐝";
      console.log(`[TerseGuard] Post-tool response too short (${stepContent.trim().length} chars) — forcing elaboration`);
      currentMessages.push(
        { role: "assistant", content: stepContent },
        { role: "user", content: `[SYSTEM] Your response is too brief. You are ${frBotName} ${frBotEmoji}. The tool executed successfully — provide a RICH response following this pattern: ✅ Confirm what was done → 📊 Show key data (balance, amounts, dates) → 💡 Suggest next step. Respond in user's language with proper Markdown formatting.` }
      );
      emitThinking(controller, encoder, "Preparing detailed response...", step, MAX_AGENT_STEPS);
      return true;
    }
  }
  return false;
}

/**
 * Run interleaved verification: cross-reference tool data before final answer.
 * Returns true if guard triggered (should continue loop).
 */
export function runInterleavedVerification(
  stepContent: string,
  allToolResults: { name: string; result: any; error?: string }[],
  guardState: MutableGuardState,
  currentMessages: any[],
  step: number,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  MAX_AGENT_STEPS: number,
): boolean {
  if (allToolResults.length > 0 && step > 1) {
    const successfulTools = allToolResults.filter(tr => !tr.error && tr.result);
    const contentLower = stepContent.toLowerCase();
    const unreferencedTools = successfulTools.filter(tr => {
      const toolNameNorm = tr.name.replace(/_/g, ' ').toLowerCase();
      return !contentLower.includes(toolNameNorm) && !contentLower.includes(tr.name.toLowerCase());
    });
    if (unreferencedTools.length > 0 && unreferencedTools.length >= successfulTools.length * 0.5 && !guardState.noResultsRetryAttempted) {
      guardState.noResultsRetryAttempted = true;
      const missedTools = unreferencedTools.map(t => t.name).join(', ');
      currentMessages.push(
        { role: "assistant", content: stepContent },
        { role: "user", content: `[CONSISTENCY_CHECK] Your response does NOT reference data from these tools that returned results: ${missedTools}. RE-READ the tool_results and incorporate ALL relevant data points. Do not ignore fetched data.` },
      );
      emitThinking(controller, encoder, `Verifying data consistency... 🔍`, step, MAX_AGENT_STEPS);
      console.log(`[InterleavedVerification] Forcing re-check — unreferenced tools: ${missedTools}`);
      return true;
    }
  }
  return false;
}

/**
 * Run parallel Phase 1 guards + sequential Phase 2 guards on final answer (no tool calls).
 * Returns GuardPipelineResult indicating whether to continue loop or accept final answer.
 */
export async function runFinalAnswerGuards(
  ctx: GuardPipelineContext,
  stepContent: string,
  allToolCalls: any[],
  allToolResults: any[],
  guardState: MutableGuardState,
  currentMessages: any[],
  planHistory: any[],
  imageGenerationCompleted: boolean,
  lastGeneratedImageUrl: string | null,
): Promise<GuardPipelineResult> {
  const { isSimpleMessage, isDeepQuery, observerResult, controller, encoder, step, MAX_AGENT_STEPS, safeEnqueue, sanitizedMessage, agentSettings } = ctx;
  
  const activeGuards = getActiveGuards(isSimpleMessage, isDeepQuery, observerResult?.complexity);
  let newMaxSteps = MAX_AGENT_STEPS;

  // Constitutional Guard — Self-Audit FIRST
  if (!guardState.constitutionalGuardTriggered && activeGuards.size > 0) {
    const csg = constitutionalSelfCheck(stepContent, sanitizedMessage, allToolResults, agentSettings?.personality_mode);
    if (csg.triggered) {
      guardState.constitutionalGuardTriggered = true;
      applyGuardResult(csg, currentMessages, controller, encoder, step, MAX_AGENT_STEPS);
      console.log(`[ConstitutionalGuard] Self-audit triggered: ${csg.corrections.join(', ')}`);
      return { shouldContinue: true, isGuardRetry: true, forceToolChoice: true, shouldBreak: false };
    }
  }

  // PHASE 1: Parallel Independent Guards — skip guards that already passed
  const parallelGuardChecks: Array<{ name: string; result: GuardResult & Record<string, any> }> = [];
  const guardPromises: Array<Promise<void>> = [];
  
  if (activeGuards.has("deepResearch") && !guardState.passedGuards?.has("deepResearch")) {
    guardPromises.push(Promise.resolve().then(() => {
      const drg = checkDeepResearchGuard(isDeepQuery, allToolResults, guardState.deepResearchRetryAttempted, step, MAX_AGENT_STEPS, stepContent);
      parallelGuardChecks.push({ name: "deepResearch", result: drg });
    }));
  }
  if (activeGuards.has("antiGhost") && !guardState.passedGuards?.has("antiGhost")) {
    guardPromises.push(Promise.resolve().then(() => {
      const agg = checkAntiGhostGuard(stepContent, sanitizedMessage, guardState.promiseRetryCount, step, MAX_AGENT_STEPS, imageGenerationCompleted, lastGeneratedImageUrl, allToolResults);
      parallelGuardChecks.push({ name: "antiGhost", result: agg });
    }));
  }
  // ═══ CASCADE FIX: Skip hallucination & postToolGrounding if AntiGhost already triggered this loop ═══
  if (activeGuards.has("hallucination") && !guardState.antiGhostTriggered && !guardState.passedGuards?.has("hallucination")) {
    guardPromises.push(Promise.resolve().then(() => {
      const hg = checkHallucinationGuard(stepContent, sanitizedMessage, allToolResults, guardState.hallucinationGuardCount, step, MAX_AGENT_STEPS, imageGenerationCompleted);
      parallelGuardChecks.push({ name: "hallucination", result: hg });
    }));
  }
  if (activeGuards.has("postToolGrounding") && !guardState.antiGhostTriggered && !guardState.passedGuards?.has("postToolGrounding")) {
    guardPromises.push(Promise.resolve().then(() => {
      const ptg = checkNumericGrounding(stepContent, allToolResults, guardState.postToolGroundingChecked, step, MAX_AGENT_STEPS, sanitizedMessage);
      parallelGuardChecks.push({ name: "postToolGrounding", result: ptg });
    }));
  }
  if (activeGuards.has("toolFailureFabrication") && !guardState.passedGuards?.has("toolFailureFabrication")) {
    guardPromises.push(Promise.resolve().then(() => {
      const tfg = checkToolFailureFabrication(stepContent, allToolResults, step, MAX_AGENT_STEPS);
      parallelGuardChecks.push({ name: "toolFailureFabrication", result: tfg });
    }));
  }

  await Promise.allSettled(guardPromises);

  // Apply the first triggered guard (priority order)
  const guardPriority = ["deepResearch", "antiGhost", "hallucination", "postToolGrounding", "toolFailureFabrication"];
  
  for (const guardName of guardPriority) {
    const check = parallelGuardChecks.find(c => c.name === guardName);
    if (check?.result.triggered) {
      if (guardName === "deepResearch") guardState.deepResearchRetryAttempted = true;
      if (guardName === "antiGhost") {
        guardState.promiseRetryCount = (check.result as any).newRetryCount;
        guardState.antiGhostTriggered = true;
      }
      guardState.lastTriggeredGuard = guardName;
      if (guardName === "hallucination") guardState.hallucinationGuardCount = (check.result as any).newGuardCount;
      if (guardName === "postToolGrounding") guardState.postToolGroundingChecked = true;
      
      applyGuardResult(check.result, currentMessages, controller, encoder, step, MAX_AGENT_STEPS);
      if (check.result.stepIncrease) {
        newMaxSteps = Math.min(MAX_AGENT_STEPS + check.result.stepIncrease, 10);
        console.log(`[GuardEscalation] Steps increased to ${newMaxSteps} after ${guardName}`);
      }
      console.log(`[ParallelGuard] ${guardName} triggered (evaluated ${parallelGuardChecks.length} guards in parallel)`);
      // Emit guard-retry plan
      if (planHistory.length > 0) {
        const guardLabel = guardName === "antiGhost" ? "Retrying search..." : guardName === "deepResearch" ? "Deepening research..." : `Guard: ${guardName}`;
        const retryPlan = [...planHistory, { id: `plan_guard_${guardName}_${step}`, tool: "guard", label: guardLabel, emoji: "🔄", status: "error" as const, context: `${guardName} triggered retry` }];
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "task_plan", steps: retryPlan })}\n\n`));
      }
      return { shouldContinue: true, isGuardRetry: true, forceToolChoice: true, shouldBreak: false, maxStepsOverride: newMaxSteps };
    }
  }

  // PHASE 2: Sequential Dependent Guards
  if (activeGuards.has("reflection")) {
    const ref = buildReflectionPrompt(isDeepQuery, stepContent, allToolCalls, allToolResults, guardState.reflectionAttempted, step, MAX_AGENT_STEPS);
    if (ref.triggered) {
      guardState.reflectionAttempted = true;
      applyGuardResult(ref, currentMessages, controller, encoder, step, MAX_AGENT_STEPS);
      return { shouldContinue: true, isGuardRetry: true, forceToolChoice: true, shouldBreak: false };
    }
  }

  // Quality Gate
  if (activeGuards.has("qualityGate")) {
    const heuristicScore = inlineQualityScore(stepContent, allToolResults);
    if (heuristicScore >= 70) {
      console.log(`[QualityGate-P3] Inline score: ${heuristicScore}/100. PASS ✓`);
    } else if (!guardState.qualityRequeueAttempted && step < MAX_AGENT_STEPS - 1 && 
               ((guardState.reflectionAttempted && isDeepQuery) || ctx.complexityTier === "complex")) {
      guardState.qualityRequeueAttempted = true;
      const syntheticGuard: GuardResult = {
        triggered: true,
        action: "continue",
        assistantEcho: stepContent,
        nudgeMessage: `[SYSTEM] QUALITY GATE FAILED — Score: ${heuristicScore}/100 (threshold: 70). Your response lacks specific data points. READ all tool_results again. EXTRACT every specific data point you missed. Length = Value.`,
        thinkingLabel: `Quality: ${heuristicScore}/100. Enhancing... 🔍`,
        sseEvent: { type: "agent_step", current: step, max: MAX_AGENT_STEPS, status: "quality_requeue", reason: `Inline score ${heuristicScore}/100 < 70` },
        logMessage: `[QualityGate-P3] Inline score: ${heuristicScore}/100. Re-engaging...`,
      };
      applyGuardResult(syntheticGuard, currentMessages, controller, encoder, step, MAX_AGENT_STEPS);
      return { shouldContinue: true, isGuardRetry: true, forceToolChoice: true, shouldBreak: false };
    }
  }

  // All guards passed — record for skip-on-retry optimization
  if (!guardState.passedGuards) guardState.passedGuards = new Set();
  for (const check of parallelGuardChecks) {
    if (!check.result.triggered) guardState.passedGuards.add(check.name);
  }
  return { shouldContinue: false, isGuardRetry: false, forceToolChoice: false, shouldBreak: false };
}

/**
 * Run post-tool guards (toolPromiseMismatch, persistence, sourceExhaustion, confirmationLoopBreak, replan).
 */
export async function runPostToolGuards(
  ctx: GuardPipelineContext,
  stepContent: string,
  stepToolCalls: any[],
  stepToolResults: { name: string; result: any; error?: string }[],
  guardState: MutableGuardState,
  currentMessages: any[],
  TOOLS: any[],
  disabledToolsSet: Set<string>,
): Promise<GuardPipelineResult> {
  const { isSimpleMessage, isDeepQuery, observerResult, sanitizedMessage, controller, encoder, step, MAX_AGENT_STEPS, supabase, userId } = ctx;
  
  let newMaxSteps = MAX_AGENT_STEPS;
  const hasToolErrors = stepToolResults.some(tr => tr.error || tr.result?.error || tr.result?.success === false);

  // Tool-Promise Mismatch Guard
  const tpm = checkToolPromiseMismatch(sanitizedMessage, stepToolCalls, stepContent, step, MAX_AGENT_STEPS);
  if (tpm.triggered) {
    applyGuardResult(tpm, currentMessages, controller, encoder, step, MAX_AGENT_STEPS);
    if (tpm.stepIncrease) { newMaxSteps = Math.min(MAX_AGENT_STEPS + tpm.stepIncrease, 10); }
    return { shouldContinue: true, isGuardRetry: true, forceToolChoice: true, shouldBreak: false, maxStepsOverride: newMaxSteps };
  }

  // ═══ P1 HARNESS: Tool Result Verifier — execution-based feedback ═══
  const verificationResults = verifyToolResults(sanitizedMessage, stepToolResults);
  const failedVerifications = verificationResults.filter(v => !v.passed);
  if (failedVerifications.length > 0) {
    const nudge = buildVerificationNudge(failedVerifications);
    if (nudge) {
      console.log(`[ToolResultVerifier] ${failedVerifications.length} tool(s) failed verification: ${failedVerifications.map(f => f.toolName).join(', ')}`);
      // Inject verification context as system guidance (not a full retry)
      currentMessages.push({ role: "user", content: nudge });
    }
  }

  // Persistence Protocol
  const pp = checkPersistenceProtocol(stepToolResults, stepContent, guardState.noResultsRetryAttempted, step, MAX_AGENT_STEPS);
  if (pp.triggered) {
    guardState.noResultsRetryAttempted = true;
    applyGuardResult(pp, currentMessages, controller, encoder, step, MAX_AGENT_STEPS);
    return { shouldContinue: true, isGuardRetry: true, forceToolChoice: true, shouldBreak: false };
  }

  // Source Exhaustion Protocol
  const se = await checkSourceExhaustion(stepToolResults, stepContent, guardState.snippetEscalationAttempted, isDeepQuery, step, MAX_AGENT_STEPS, supabase, userId);
  if (se.triggered) {
    guardState.snippetEscalationAttempted = true;
    applyGuardResult(se, currentMessages, controller, encoder, step, MAX_AGENT_STEPS);
    return { shouldContinue: true, isGuardRetry: true, forceToolChoice: true, shouldBreak: false };
  }

  // Confirmation Loop Break
  const clb = checkConfirmationLoopBreak(stepToolResults);
  if (clb.triggered) {
    if (clb.logMessage) console.log(clb.logMessage);
    return { shouldContinue: false, isGuardRetry: false, forceToolChoice: false, shouldBreak: true };
  }

  // Re-plan Guard
  const replanGuards = getActiveGuards(isSimpleMessage, isDeepQuery, observerResult?.complexity);
  if (hasToolErrors && replanGuards.has("replan")) {
    const replanResult = checkToolErrorReplan(stepToolResults, stepToolCalls, guardState.toolReplanAttempts, step, MAX_AGENT_STEPS);
    if (replanResult.triggered) {
      guardState.toolReplanAttempts = replanResult.updatedReplanAttempts;
      applyGuardResult(replanResult, currentMessages, controller, encoder, step, MAX_AGENT_STEPS);
      if (replanResult.stepIncrease) {
        newMaxSteps = Math.min(MAX_AGENT_STEPS + replanResult.stepIncrease, 10);
      }
      console.log(`[ReplanGuard] Triggered, continuing loop...`);
      return { shouldContinue: true, isGuardRetry: true, forceToolChoice: true, shouldBreak: false, maxStepsOverride: newMaxSteps, updatedToolReplanAttempts: replanResult.updatedReplanAttempts };
    }
  }

  return { shouldContinue: false, isGuardRetry: false, forceToolChoice: false, shouldBreak: false };
}
