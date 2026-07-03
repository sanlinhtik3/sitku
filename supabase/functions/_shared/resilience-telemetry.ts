// ═══ Resilience Telemetry Module — P0 Foundation ═══
// Structured span tracking, persistent provider health, guard effectiveness scoring.
// All writes are fire-and-forget to avoid impacting response latency.

export type SpanType = 'llm_call' | 'tool_execution' | 'guard_check' | 'plan_generation' | 'provider_failover' | 'relay' | 'full_request';
export type SpanStatus = 'ok' | 'error' | 'timeout' | 'skipped';

export interface TelemetrySpan {
  traceId: string;
  sessionId: string;
  userId: string;
  spanType: SpanType;
  spanName: string;
  startTime: number;
  metadata?: Record<string, any>;
}

export interface SpanResult {
  status: SpanStatus;
  metadata?: Record<string, any>;
}

// ═══ SPAN TRACKER ═══
// Collects spans during request lifecycle, flushes to DB at end.

export class SpanTracker {
  private spans: Array<{
    trace_id: string;
    session_id: string;
    user_id: string;
    span_type: SpanType;
    span_name: string;
    duration_ms: number;
    status: SpanStatus;
    metadata: Record<string, any>;
  }> = [];

  private traceId: string;
  private sessionId: string;
  private userId: string;

  constructor(traceId: string, sessionId: string, userId: string) {
    this.traceId = traceId;
    this.sessionId = sessionId;
    this.userId = userId;
  }

  /** Start a span — returns a finish function */
  startSpan(spanType: SpanType, spanName: string, metadata?: Record<string, any>): (result?: SpanResult) => void {
    const startTime = Date.now();
    return (result?: SpanResult) => {
      const duration = Date.now() - startTime;
      this.spans.push({
        trace_id: this.traceId,
        session_id: this.sessionId,
        user_id: this.userId,
        span_type: spanType,
        span_name: spanName,
        duration_ms: duration,
        status: result?.status || 'ok',
        metadata: { ...metadata, ...result?.metadata },
      });
    };
  }

  /** Record a completed span directly */
  recordSpan(spanType: SpanType, spanName: string, durationMs: number, status: SpanStatus = 'ok', metadata?: Record<string, any>) {
    this.spans.push({
      trace_id: this.traceId,
      session_id: this.sessionId,
      user_id: this.userId,
      span_type: spanType,
      span_name: spanName,
      duration_ms: durationMs,
      status,
      metadata: metadata || {},
    });
  }

  /** Get all collected spans */
  getSpans() {
    return this.spans;
  }

  /** Flush all spans to DB (fire-and-forget) */
  async flush(serviceClient: any): Promise<void> {
    if (this.spans.length === 0) return;
    
    try {
      // Batch insert all spans
      const { error } = await serviceClient
        .from('agent_telemetry_spans')
        .insert(this.spans);
      
      if (error) {
        console.warn(`[Telemetry] Flush failed (${this.spans.length} spans):`, error.message);
      } else {
        console.log(`[Telemetry] Flushed ${this.spans.length} spans for trace ${this.traceId}`);
      }
    } catch (e) {
      console.warn(`[Telemetry] Flush error:`, e instanceof Error ? e.message : e);
    }
  }
}

// ═══ PERSISTENT PROVIDER HEALTH ═══
// Cross-request health scoring with exponential decay.

export async function updateProviderHealth(
  serviceClient: any,
  keyHash: string,
  model: string,
  latencyMs: number,
  success: boolean,
  errorType?: string,
): Promise<void> {
  try {
    // Upsert health record
    const { data: existing } = await serviceClient
      .from('agent_provider_health')
      .select('*')
      .eq('provider_key_hash', keyHash)
      .eq('model', model)
      .maybeSingle();

    if (existing) {
      const totalReqs = existing.total_requests + 1;
      const totalErrs = existing.total_errors + (success ? 0 : 1);
      const totalTimeouts = existing.total_timeouts + (errorType === 'timeout' ? 1 : 0);
      
      // Exponential moving average for latency
      const alpha = 0.3; // weight for new observation
      const newAvgLatency = Math.round(existing.avg_latency_ms * (1 - alpha) + latencyMs * alpha);
      
      // P95 approximation: track max of recent window
      const newP95 = latencyMs > existing.p95_latency_ms ? latencyMs : Math.round(existing.p95_latency_ms * 0.95 + latencyMs * 0.05);
      
      // Health score: starts at 100, decays on errors, recovers on success
      const errorRate = totalErrs / totalReqs;
      const healthScore = Math.max(0, Math.min(100, 100 - (errorRate * 200) - (totalTimeouts * 10)));
      
      // Cooldown: if health < 30 and recent error, cooldown for 30s
      const cooldownUntil = (!success && healthScore < 30)
        ? new Date(Date.now() + 30_000).toISOString()
        : existing.cooldown_until;

      await serviceClient.from('agent_provider_health').update({
        health_score: healthScore,
        total_requests: totalReqs,
        total_errors: totalErrs,
        total_timeouts: totalTimeouts,
        avg_latency_ms: newAvgLatency,
        p95_latency_ms: newP95,
        last_error_type: success ? existing.last_error_type : errorType,
        last_error_at: success ? existing.last_error_at : new Date().toISOString(),
        last_success_at: success ? new Date().toISOString() : existing.last_success_at,
        cooldown_until: cooldownUntil,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await serviceClient.from('agent_provider_health').insert({
        provider_key_hash: keyHash,
        model,
        health_score: success ? 100 : 50,
        total_requests: 1,
        total_errors: success ? 0 : 1,
        total_timeouts: errorType === 'timeout' ? 1 : 0,
        avg_latency_ms: latencyMs,
        p95_latency_ms: latencyMs,
        last_error_type: success ? null : errorType,
        last_error_at: success ? null : new Date().toISOString(),
        last_success_at: success ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn(`[ProviderHealth] Update failed:`, e instanceof Error ? e.message : e);
  }
}

/** Check if a provider+model is in cooldown */
export async function isProviderInCooldown(
  serviceClient: any,
  keyHash: string,
  model: string,
): Promise<boolean> {
  try {
    const { data } = await serviceClient
      .from('agent_provider_health')
      .select('cooldown_until, health_score')
      .eq('provider_key_hash', keyHash)
      .eq('model', model)
      .maybeSingle();

    if (!data) return false;
    if (data.cooldown_until && new Date(data.cooldown_until) > new Date()) return true;
    return false;
  } catch {
    return false;
  }
}

/** Get provider health score (0-100) */
export async function getProviderHealthScore(
  serviceClient: any,
  keyHash: string,
  model: string,
): Promise<number> {
  try {
    const { data } = await serviceClient
      .from('agent_provider_health')
      .select('health_score')
      .eq('provider_key_hash', keyHash)
      .eq('model', model)
      .maybeSingle();

    return data?.health_score ?? 100;
  } catch {
    return 100; // Assume healthy if can't check
  }
}

// ═══ GUARD EFFECTIVENESS TRACKER ═══

export async function trackGuardTrigger(
  serviceClient: any,
  guardName: string,
  wasImprovement: boolean,
  retryLatencyMs: number,
): Promise<void> {
  try {
    const periodStart = new Date();
    periodStart.setUTCHours(0, 0, 0, 0);

    const { data: existing } = await serviceClient
      .from('agent_guard_effectiveness')
      .select('*')
      .eq('guard_name', guardName)
      .eq('period_start', periodStart.toISOString())
      .maybeSingle();

    if (existing) {
      const triggers = existing.trigger_count + 1;
      const improvements = existing.improvement_count + (wasImprovement ? 1 : 0);
      const falsePositives = existing.false_positive_count + (wasImprovement ? 0 : 1);
      const avgLatency = Math.round((existing.avg_retry_latency_ms * existing.trigger_count + retryLatencyMs) / triggers);
      const effectiveness = triggers > 0 ? Math.round((improvements / triggers) * 100 * 100) / 100 : 50;

      await serviceClient.from('agent_guard_effectiveness').update({
        trigger_count: triggers,
        improvement_count: improvements,
        false_positive_count: falsePositives,
        avg_retry_latency_ms: avgLatency,
        effectiveness_score: effectiveness,
        last_triggered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await serviceClient.from('agent_guard_effectiveness').insert({
        guard_name: guardName,
        trigger_count: 1,
        improvement_count: wasImprovement ? 1 : 0,
        false_positive_count: wasImprovement ? 0 : 1,
        avg_retry_latency_ms: retryLatencyMs,
        effectiveness_score: wasImprovement ? 100 : 0,
        last_triggered_at: new Date().toISOString(),
        period_start: periodStart.toISOString(),
      });
    }
  } catch (e) {
    console.warn(`[GuardEffectiveness] Track failed:`, e instanceof Error ? e.message : e);
  }
}

/** Hash a key for storage (first 12 chars) */
export function hashProviderKey(key: string): string {
  return key.slice(0, 12);
}

// ═══ P2: MODEL PERFORMANCE REGISTRY ═══
// Tracks per-model, per-task-type success rates for intelligent routing.

export interface ModelPerformanceRecord {
  model: string;
  taskType: string;
  complexityTier: string;
  latencyMs: number;
  outputLength: number;
  guardRetries: number;
  success: boolean;
}

export async function recordModelPerformance(
  serviceClient: any,
  record: ModelPerformanceRecord,
): Promise<void> {
  try {
    const periodStart = new Date();
    periodStart.setUTCHours(0, 0, 0, 0);

    const { data: existing } = await serviceClient
      .from('agent_model_performance')
      .select('*')
      .eq('model', record.model)
      .eq('task_type', record.taskType)
      .eq('complexity_tier', record.complexityTier)
      .eq('period_start', periodStart.toISOString())
      .maybeSingle();

    if (existing) {
      const total = existing.total_requests + 1;
      const successes = existing.successful_requests + (record.success ? 1 : 0);
      const failures = existing.failed_requests + (record.success ? 0 : 1);
      const alpha = 0.3;
      const avgLatency = Math.round(existing.avg_latency_ms * (1 - alpha) + record.latencyMs * alpha);
      const p95 = record.latencyMs > existing.p95_latency_ms
        ? record.latencyMs
        : Math.round(existing.p95_latency_ms * 0.95 + record.latencyMs * 0.05);
      const avgOutput = Math.round(existing.avg_output_length * (1 - alpha) + record.outputLength * alpha);
      const avgGuards = existing.avg_guard_retries * (1 - alpha) + record.guardRetries * alpha;
      const successRate = total > 0 ? Math.round((successes / total) * 10000) / 100 : 100;
      // Quality = weighted combination: success_rate (40%) + speed (30%) + low guards (30%)
      const speedScore = Math.max(0, 100 - (avgLatency / 500)); // 0-100, lower latency = higher
      const guardScore = Math.max(0, 100 - (avgGuards * 33));   // 0-100, fewer retries = higher
      const quality = Math.round((successRate * 0.4 + speedScore * 0.3 + guardScore * 0.3) * 100) / 100;

      await serviceClient.from('agent_model_performance').update({
        total_requests: total,
        successful_requests: successes,
        failed_requests: failures,
        avg_latency_ms: avgLatency,
        p95_latency_ms: p95,
        avg_output_length: avgOutput,
        avg_guard_retries: Math.round(avgGuards * 100) / 100,
        success_rate: successRate,
        quality_score: quality,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      const speedScore = Math.max(0, 100 - (record.latencyMs / 500));
      const guardScore = Math.max(0, 100 - (record.guardRetries * 33));
      const sr = record.success ? 100 : 0;
      const quality = Math.round((sr * 0.4 + speedScore * 0.3 + guardScore * 0.3) * 100) / 100;

      await serviceClient.from('agent_model_performance').insert({
        model: record.model,
        task_type: record.taskType,
        complexity_tier: record.complexityTier,
        total_requests: 1,
        successful_requests: record.success ? 1 : 0,
        failed_requests: record.success ? 0 : 1,
        avg_latency_ms: record.latencyMs,
        p95_latency_ms: record.latencyMs,
        avg_output_length: record.outputLength,
        avg_guard_retries: record.guardRetries,
        success_rate: sr,
        quality_score: quality,
        last_used_at: new Date().toISOString(),
        period_start: periodStart.toISOString(),
      });
    }
  } catch (e) {
    console.warn(`[ModelPerf] Record failed:`, e instanceof Error ? e.message : e);
  }
}

/** Get the best model for a given task type + complexity tier based on quality score */
export async function getBestModelForTask(
  serviceClient: any,
  taskType: string,
  complexityTier: string,
  candidateModels: string[],
): Promise<string | null> {
  try {
    const { data } = await serviceClient
      .from('agent_model_performance')
      .select('model, quality_score, total_requests')
      .in('model', candidateModels)
      .eq('task_type', taskType)
      .eq('complexity_tier', complexityTier)
      .gte('total_requests', 5) // Minimum sample size
      .order('quality_score', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      console.log(`[ModelPerf] Best model for ${taskType}/${complexityTier}: ${data[0].model} (quality: ${data[0].quality_score}, n=${data[0].total_requests})`);
      return data[0].model;
    }
    return null;
  } catch {
    return null;
  }
}

// ═══ P2: PREDICTIVE HEALTH — Anomaly Detection ═══

export async function detectHealthAnomalies(
  serviceClient: any,
  traceId: string,
  currentMetrics: {
    model: string;
    latencyMs: number;
    guardRetries: number;
    complexityTier: string;
    toolCallCount: number;
  },
): Promise<void> {
  try {
    // Fetch recent baseline for this model+tier
    const { data: baseline } = await serviceClient
      .from('agent_model_performance')
      .select('avg_latency_ms, p95_latency_ms, avg_guard_retries, success_rate')
      .eq('model', currentMetrics.model)
      .eq('complexity_tier', currentMetrics.complexityTier)
      .gte('total_requests', 10)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!baseline) return; // Not enough data for anomaly detection

    const anomalies: Array<{ type: string; severity: string; description: string; value: number; threshold: number }> = [];

    // Latency spike: >2x P95
    if (currentMetrics.latencyMs > baseline.p95_latency_ms * 2) {
      anomalies.push({
        type: 'latency_spike',
        severity: currentMetrics.latencyMs > baseline.p95_latency_ms * 3 ? 'critical' : 'warning',
        description: `Latency ${currentMetrics.latencyMs}ms is ${(currentMetrics.latencyMs / baseline.p95_latency_ms).toFixed(1)}x above P95 baseline`,
        value: currentMetrics.latencyMs,
        threshold: baseline.p95_latency_ms * 2,
      });
    }

    // Guard storm: >3x average retries
    if (currentMetrics.guardRetries > Math.max(baseline.avg_guard_retries * 3, 2)) {
      anomalies.push({
        type: 'guard_storm',
        severity: 'warning',
        description: `Guard retries (${currentMetrics.guardRetries}) are ${(currentMetrics.guardRetries / Math.max(baseline.avg_guard_retries, 0.1)).toFixed(1)}x above average`,
        value: currentMetrics.guardRetries,
        threshold: baseline.avg_guard_retries * 3,
      });
    }

    // Degrading success rate
    if (baseline.success_rate < 80) {
      anomalies.push({
        type: 'success_rate_degradation',
        severity: baseline.success_rate < 60 ? 'critical' : 'warning',
        description: `Model ${currentMetrics.model} success rate degraded to ${baseline.success_rate}%`,
        value: baseline.success_rate,
        threshold: 80,
      });
    }

    if (anomalies.length === 0) return;

    // Batch insert anomalies
    await serviceClient.from('agent_health_anomalies').insert(
      anomalies.map(a => ({
        anomaly_type: a.type,
        severity: a.severity,
        source: `trace:${traceId}`,
        description: a.description,
        metric_value: a.value,
        threshold_value: a.threshold,
        metadata: { model: currentMetrics.model, tier: currentMetrics.complexityTier, toolCalls: currentMetrics.toolCallCount },
      }))
    );

    for (const a of anomalies) {
      console.warn(`[P2-Anomaly] ${a.severity.toUpperCase()}: ${a.description}`);
    }
  } catch (e) {
    console.warn(`[P2-Anomaly] Detection failed:`, e instanceof Error ? e.message : e);
  }
}

// ═══ P1: GUARD IMPROVEMENT DELTA TRACKING ═══
// Captures content quality before/after a guard retry to measure actual improvement.

export interface GuardDeltaCapture {
  guardName: string;
  contentBefore: string;
  contentLengthBefore: number;
  startTime: number;
}

/**
 * Start tracking a guard retry — call before the retry step.
 */
export function startGuardDelta(guardName: string, contentBefore: string): GuardDeltaCapture {
  return {
    guardName,
    contentBefore,
    contentLengthBefore: contentBefore.length,
    startTime: Date.now(),
  };
}

/**
 * Complete guard delta tracking — call after the retry produces new content.
 * Determines if the guard actually improved the output.
 */
export async function completeGuardDelta(
  serviceClient: any,
  capture: GuardDeltaCapture,
  contentAfter: string,
): Promise<void> {
  const retryLatencyMs = Date.now() - capture.startTime;
  const lengthDelta = contentAfter.length - capture.contentLengthBefore;
  
  // Heuristic: improvement if content grew meaningfully or changed significantly
  const wasImprovement = (
    contentAfter !== capture.contentBefore &&
    contentAfter.length >= 10 &&
    (lengthDelta > 50 || contentAfter.length > capture.contentLengthBefore * 1.2)
  );

  await trackGuardTrigger(serviceClient, capture.guardName, wasImprovement, retryLatencyMs);
}

// ═══ P1: PROVIDER HEALTH-AWARE CHAIN ORDERING ═══
// Reorder provider chain based on real health scores from DB.

export async function getHealthSortedProviders(
  serviceClient: any,
  providerKeys: Array<{ keyHash: string; model: string; index: number }>,
): Promise<number[]> {
  try {
    const healthChecks = await Promise.all(
      providerKeys.map(async (pk) => {
        const { data } = await serviceClient
          .from('agent_provider_health')
          .select('health_score, cooldown_until')
          .eq('provider_key_hash', pk.keyHash)
          .eq('model', pk.model)
          .maybeSingle();

        const inCooldown = data?.cooldown_until && new Date(data.cooldown_until) > new Date();
        return {
          index: pk.index,
          score: inCooldown ? -1 : (data?.health_score ?? 100),
        };
      })
    );

    // Sort by health score descending, cooldown providers last
    return healthChecks
      .sort((a, b) => b.score - a.score)
      .map(h => h.index);
  } catch {
    // On failure, return original order
    return providerKeys.map(pk => pk.index);
  }
}
